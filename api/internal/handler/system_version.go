package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// BuildVersion is populated at link time via -ldflags "-X ...BuildVersion=".
// Expected to be a release tag like "v1.0.18" (or "dev" for local runs).
var BuildVersion = ""

// BuildCommit is the 7-char git SHA of the build, injected via -ldflags.
// Displayed as small subtitle in the admin UI so devs can trace the
// exact build without the ugly "sha-" prefix dominating the version line.
var BuildCommit = ""

// BuildTime is an optional UTC RFC3339 string also injected via ldflags.
var BuildTime = ""

// ============================================================
// GET /api/v1/admin/system/version
//
// Returns the running version plus the latest GitHub release, so the
// admin SPA can show a "new version available" badge and changelog.
// Cached for 10 minutes to stay under GitHub's unauthenticated rate
// limit (60/hour/IP).
// ============================================================

type githubRelease struct {
	TagName     string `json:"tag_name"`
	Name        string `json:"name"`
	Body        string `json:"body"`
	HTMLURL     string `json:"html_url"`
	PublishedAt string `json:"published_at"`
	Prerelease  bool   `json:"prerelease"`
	Draft       bool   `json:"draft"`
	// Commit is filled after the Releases API response by a second call
	// to /commits/{tag}. 7-char short form so the UI can render it the
	// same way as current build's commit.
	Commit string `json:"commit,omitempty"`
}

type versionCache struct {
	mu       sync.Mutex
	fetched  time.Time
	release  *githubRelease
	errorMsg string
}

var verCache = &versionCache{}

const (
	// 默认走 utterlog.io 自家代理（构建期生成的静态 JSON），不直接打
	// GitHub API。原因：
	//   1. utterlog.io 用单一 GHA 构建 token 拉一次 → 5000/h 一台机
	//      器够万级用户共享，永远不会爆
	//   2. 用户**不需要**自己配 GitHub Token，开箱即用
	//   3. 国内访问 utterlog.io 通常比 api.github.com 快得多
	// 失败时（utterlog.io 暂时挂掉 / 内网部署不能出公网）自动 fallback
	// 到 GitHub 直连（变量 ghReleasesFallback / ghAllReleasesFallback）。
	defaultVersionURL     = "https://utterlog.io/api/version.json"
	defaultReleasesURL    = "https://utterlog.io/api/releases.json"
	ghReleasesFallback    = "https://api.github.com/repos/utterlog/utterlog/releases/latest"
	ghAllReleasesFallback = "https://api.github.com/repos/utterlog/utterlog/releases?per_page=20"
	cacheTTL              = 10 * time.Minute
)

// versionSourceURL 让用户可以在后台 `version_source_url` 选项里覆盖
// 默认 utterlog.io —— 私有部署 / 自托管 fork 可以指向自己的代理。
// 空 → 用 utterlog.io 默认。
func versionSourceURL() string {
	if v := strings.TrimSpace(model.GetOption("version_source_url")); v != "" {
		return strings.TrimRight(v, "/")
	}
	return ""
}

// Separate cache for the full release list (admin changelog view).
type releasesCache struct {
	mu       sync.Mutex
	fetched  time.Time
	items    []githubRelease
	errorMsg string
}

var relCache = &releasesCache{}

// SystemVersion returns current + latest version info.
func SystemVersion(c *gin.Context) {
	refresh := c.Query("refresh") == "1"

	verCache.mu.Lock()
	stale := refresh || verCache.release == nil || time.Since(verCache.fetched) > cacheTTL
	verCache.mu.Unlock()

	if stale {
		fetchLatestRelease()
	}

	verCache.mu.Lock()
	rel := verCache.release
	errMsg := verCache.errorMsg
	fetchedAt := verCache.fetched
	verCache.mu.Unlock()

	current := currentVersion()
	payload := gin.H{
		"current": current,
		"checked_at": func() string {
			if fetchedAt.IsZero() {
				return ""
			}
			return fetchedAt.UTC().Format(time.RFC3339)
		}(),
	}
	if rel != nil {
		payload["latest"] = gin.H{
			"version":      rel.TagName,
			"name":         rel.Name,
			"body":         rel.Body,
			"url":          rel.HTMLURL,
			"published_at": rel.PublishedAt,
			"prerelease":   rel.Prerelease,
			"commit":       rel.Commit,
		}
		payload["update_available"] = isNewer(current["version"].(string), rel.TagName)
	} else {
		payload["latest"] = nil
		payload["update_available"] = false
	}
	// Surface errMsg on every response (even when a stale `rel` is
	// still cached) so the admin SPA can warn "上次检查失败" instead
	// of silently trusting stale data.
	if errMsg != "" {
		payload["error"] = errMsg
	}
	util.Success(c, payload)
}

func currentVersion() gin.H {
	v := BuildVersion
	if v == "" {
		v = "dev"
	}
	// Legacy images that only have "sha-xxxxxxx" in BuildVersion —
	// split it into a friendlier version + commit pair so the UI
	// can render "dev · 6a60b01" instead of "sha-6a60b01".
	commit := BuildCommit
	if commit == "" && strings.HasPrefix(v, "sha-") {
		commit = strings.TrimPrefix(v, "sha-")
		v = "dev"
	}
	return gin.H{
		"version":    v,
		"commit":     commit,
		"built_at":   BuildTime,
		"go_version": fmt.Sprintf("utterlog-go/%s", v),
	}
}

// isNewer returns true when latest is considered newer than current.
//   - Current == "dev" or starts with "sha-" (untagged build): any tagged
//     semver release counts as newer. This lets dev/local installs see
//     the update badge so the feature is visible while testing.
//   - Both semver: numeric-per-component compare so 1.0.10 > 1.0.9 (the
//     old lexicographic compare flipped those). Pre-release gating is
//     surfaced via the prerelease flag separately.
func isNewer(current, latest string) bool {
	c := strings.TrimPrefix(current, "v")
	l := strings.TrimPrefix(latest, "v")
	if c == "" || l == "" {
		return false
	}
	if c == "dev" || strings.HasPrefix(c, "sha-") {
		return !strings.HasPrefix(l, "sha-")
	}
	return compareSemver(l, c) > 0
}

// compareSemver returns >0 if a > b, <0 if a < b, 0 if equal. Splits
// on "." then parses each segment as int; non-numeric tail (e.g.
// "1.0.0-rc1") is treated as older than a pure numeric version.
func compareSemver(a, b string) int {
	// Strip a pre-release suffix (anything after "-") for the main
	// comparison — "1.0.0-rc1" < "1.0.0" < "1.0.1".
	aMain, aPre := splitPre(a)
	bMain, bPre := splitPre(b)
	ap := strings.Split(aMain, ".")
	bp := strings.Split(bMain, ".")
	n := len(ap)
	if len(bp) > n {
		n = len(bp)
	}
	for i := 0; i < n; i++ {
		var av, bv int
		if i < len(ap) {
			av, _ = strconv.Atoi(ap[i])
		}
		if i < len(bp) {
			bv, _ = strconv.Atoi(bp[i])
		}
		if av != bv {
			if av > bv {
				return 1
			}
			return -1
		}
	}
	// Equal main → a release is newer than a pre-release of the same
	// main ("1.0.0" > "1.0.0-rc1"); two pre-releases fall back to
	// lexicographic.
	if aPre == "" && bPre != "" {
		return 1
	}
	if aPre != "" && bPre == "" {
		return -1
	}
	if aPre > bPre {
		return 1
	}
	if aPre < bPre {
		return -1
	}
	return 0
}

func splitPre(v string) (main, pre string) {
	if i := strings.Index(v, "-"); i >= 0 {
		return v[:i], v[i+1:]
	}
	return v, ""
}

// applyGitHubHeaders sets the standard GitHub API headers on req. When
// admin has saved a `github_access_token` option we add
// Authorization: Bearer ... so the request counts against the user's
// 5000/hour quota instead of the 60/hour anonymous quota (per public
// IP, easily exhausted on shared cloud egress).
func applyGitHubHeaders(req *http.Request) {
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "utterlog-api")
	if auth := githubAuthorizationHeader(); auth != "" {
		req.Header.Set("Authorization", auth)
	}
}

// apiContainerName 探测当前 api 容器的真实名字 —— compose project 名
// 不一定是 "utterlog"（1Panel 默认 "utterlog-pancn"，用户可以叫任何
// 名字），所以容器名也不一定是 "utterlog-api-1"。
//
// 探测顺序：
//  1. UTTERLOG_API_CONTAINER 环境变量（用户显式覆盖）
//  2. os.Hostname() 拿到当前容器的短 ID（docker 默认把 hostname
//     设成短 ID 12 字符），docker inspect 它得到完整 .Name
//  3. 兜底 "utterlog-api-1"
//
// 后面所有 docker inspect / health check / digest 比对都用这里返回
// 的真实名字。
func apiContainerName() string {
	if v := strings.TrimSpace(os.Getenv("UTTERLOG_API_CONTAINER")); v != "" {
		return v
	}
	host, err := os.Hostname()
	if err == nil && host != "" {
		out, err := exec.Command("docker", "inspect",
			"--format", "{{.Name}}", host,
		).Output()
		if err == nil {
			name := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(string(out)), "/"))
			if name != "" {
				return name
			}
		}
	}
	return "utterlog-api-1"
}

// webContainerName 用 api 容器同 compose project + service=web 反查，
// 而不是简单地把 "-api-1" 替换成 "-web-1"。失败兜底用替换法 + 默认值。
func webContainerName(apiName string) string {
	if v := strings.TrimSpace(os.Getenv("UTTERLOG_WEB_CONTAINER")); v != "" {
		return v
	}
	// 用 api 容器的 compose project label 找 web
	if apiName != "" {
		out, err := exec.Command("docker", "inspect",
			"--format", `{{ index .Config.Labels "com.docker.compose.project"}}`,
			apiName,
		).Output()
		if err == nil {
			project := strings.TrimSpace(string(out))
			if project != "" {
				ps, err := exec.Command("docker", "ps", "-a",
					"--filter", "label=com.docker.compose.project="+project,
					"--filter", "label=com.docker.compose.service=web",
					"--format", "{{.Names}}",
				).Output()
				if err == nil {
					name := strings.TrimSpace(strings.Split(string(ps), "\n")[0])
					if name != "" {
						return name
					}
				}
			}
		}
	}
	// 兜底：把 -api-1 / -api 末尾改成 -web-1 / -web
	if strings.HasSuffix(apiName, "-api-1") {
		return strings.TrimSuffix(apiName, "-api-1") + "-web-1"
	}
	if strings.HasSuffix(apiName, "-api") {
		return strings.TrimSuffix(apiName, "-api") + "-web"
	}
	return "utterlog-web-1"
}

// probeComposeWorkingDir 尝试从当前 api 容器的 docker label 里读
// docker-compose.yml 所在的宿主路径。docker compose 起容器时会自动
// 打 `com.docker.compose.project.working_dir` label，无需用户配置。
// 失败返回空字符串，让调用方走兜底路径。
func probeComposeWorkingDir() string {
	out, err := exec.Command("docker", "inspect",
		"--format", "{{ index .Config.Labels \"com.docker.compose.project.working_dir\"}}",
		apiContainerName(),
	).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// probeAPIUploadsMountSource 探测 api 容器里 /app/public/uploads 实际
// 挂载源（host 路径或 docker volume 名）。生产 compose 用 named volume
// 时返回 "<project>_uploads" 之类，dev compose 用 bind mount 时返回
// 宿主路径如 "/opt/utterlog/api/public/uploads"。返回值可以直接拿来
// 当 docker -v 的 source 用，sidecar 挂载后看到的就是 api 看到的同一个
// uploads 目录 —— 升级日志才能写到 api 真正读取的位置。
func probeAPIUploadsMountSource() string {
	// docker inspect 返回 [{Type: "volume"|"bind", Source: "...", Destination: "..."}]
	// 用 Go template 找 Destination=/app/public/uploads 的那一项，输出 Source。
	out, err := exec.Command("docker", "inspect",
		"--format", `{{range .Mounts}}{{if eq .Destination "/app/public/uploads"}}{{.Type}}|{{or .Name .Source}}{{end}}{{end}}`,
		apiContainerName(),
	).Output()
	if err != nil {
		return ""
	}
	s := strings.TrimSpace(string(out))
	if s == "" {
		return ""
	}
	parts := strings.SplitN(s, "|", 2)
	if len(parts) != 2 {
		return ""
	}
	// volume → 用 volume 名（docker -v <name>:<dest> 自动解析）
	// bind   → 用宿主路径
	return parts[1]
}

// formatGitHubError 把 GitHub API 的错误响应翻译成 admin UI 上有用的
// 文案。403 + "rate limit" 是最常见的 —— 共享云出口 IP 60/h 匿名配额
// 一打就爆。明确告诉用户去后台 → 第三方服务里填一个 GitHub Token，
// 不要让他们看着 "github API 403: ..." 一头雾水。
func formatGitHubError(status int, body string) string {
	if status == 403 && strings.Contains(strings.ToLower(body), "rate limit") {
		if githubAPIToken() == "" {
			return "github API 403：匿名配额（60/小时/IP）已用完。请到「后台 → 系统设置 → 第三方服务」填写 GitHub Token，配额会提升到 5000/小时。"
		}
		return "github API 403：已配置的 GitHub Token 配额（5000/小时）也已用完，等几分钟再试。"
	}
	if status == 401 {
		return "github API 401：GitHub Token 无效或已过期，请到「后台 → 系统设置 → 第三方服务」更新。"
	}
	return fmt.Sprintf("github API %d: %s", status, body)
}

// fetchLatestRelease 优先走 utterlog.io 静态 JSON 代理（包含
// commit SHA），失败再 fallback 到 GitHub API 直连。99% 用户不需要
// 配 GitHub Token —— utterlog.io 已经做了集中代理 + 缓存。
func fetchLatestRelease() {
	// 1) Try utterlog.io proxy (or admin-configured override)
	base := versionSourceURL()
	if base == "" {
		if rel, ok := tryFetchProxyVersion(defaultVersionURL); ok {
			verCache.mu.Lock()
			verCache.fetched = time.Now()
			verCache.release = rel
			verCache.errorMsg = ""
			verCache.mu.Unlock()
			return
		}
	} else {
		// 用户自定义代理 URL（私有部署 / fork）—— 假设格式跟 utterlog.io
		// 的 /api/version.json 一致
		if rel, ok := tryFetchProxyVersion(base + "/api/version.json"); ok {
			verCache.mu.Lock()
			verCache.fetched = time.Now()
			verCache.release = rel
			verCache.errorMsg = ""
			verCache.mu.Unlock()
			return
		}
	}

	// 2) Fallback: GitHub API direct
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", ghReleasesFallback, nil)
	applyGitHubHeaders(req)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		verCache.mu.Lock()
		verCache.fetched = time.Now()
		verCache.errorMsg = "version proxy + GitHub fallback both failed: " + err.Error()
		verCache.mu.Unlock()
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 404 {
		verCache.mu.Lock()
		verCache.fetched = time.Now()
		verCache.release = nil
		verCache.errorMsg = ""
		verCache.mu.Unlock()
		return
	}
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		verCache.mu.Lock()
		verCache.fetched = time.Now()
		verCache.errorMsg = formatGitHubError(resp.StatusCode, string(body))
		verCache.mu.Unlock()
		return
	}

	var rel githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		verCache.mu.Lock()
		verCache.fetched = time.Now()
		verCache.errorMsg = "decode: " + err.Error()
		verCache.mu.Unlock()
		return
	}

	// Second call: resolve tag → commit SHA so the admin UI can show
	// the "latest" commit hash alongside the version label.
	rel.Commit = fetchTagCommit(rel.TagName)

	verCache.mu.Lock()
	verCache.fetched = time.Now()
	verCache.release = &rel
	verCache.errorMsg = ""
	verCache.mu.Unlock()
}

// tryFetchProxyVersion 抓 utterlog.io 风格的 version.json：
//
//	{ generated_at, latest: { tag_name, name, body, html_url, ..., commit }, source }
//
// 成功返回 (release, true)；任何 HTTP / decode / 字段缺失错误返回 (nil, false)
// 让调用方走 GitHub fallback。
func tryFetchProxyVersion(url string) (*githubRelease, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	req.Header.Set("User-Agent", "utterlog-api")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, false
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, false
	}
	var payload struct {
		Latest *githubRelease `json:"latest"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, false
	}
	if payload.Latest == nil || payload.Latest.TagName == "" {
		return nil, false
	}
	return payload.Latest, true
}

// tryFetchProxyReleases 抓 utterlog.io 风格的 releases.json：
//
//	{ generated_at, items: [release...], source }
func tryFetchProxyReleases(url string) ([]githubRelease, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	req.Header.Set("User-Agent", "utterlog-api")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, false
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, false
	}
	var payload struct {
		Items []githubRelease `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, false
	}
	if len(payload.Items) == 0 {
		return nil, false
	}
	return payload.Items, true
}

// fetchTagCommit hits GitHub's commits-by-ref endpoint to turn a tag
// name (e.g., "v1.0.18") into the 7-char short SHA of the commit it
// points to. Returns "" on any failure.
func fetchTagCommit(tag string) string {
	if tag == "" {
		return ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	url := "https://api.github.com/repos/utterlog/utterlog/commits/" + tag
	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	applyGitHubHeaders(req)
	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp == nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return ""
	}
	var body struct {
		SHA string `json:"sha"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return ""
	}
	if len(body.SHA) >= 7 {
		return body.SHA[:7]
	}
	return body.SHA
}

// ============================================================
// GET /api/v1/admin/system/releases
//
// Returns the 20 most recent GitHub releases for the admin changelog
// view. Cached 10 min. On error returns an empty list + error field so
// the UI can show a fallback "check GitHub" link.
// ============================================================
func SystemReleases(c *gin.Context) {
	refresh := c.Query("refresh") == "1"

	relCache.mu.Lock()
	stale := refresh || relCache.items == nil || time.Since(relCache.fetched) > cacheTTL
	relCache.mu.Unlock()

	if stale {
		fetchReleases()
	}

	relCache.mu.Lock()
	items := relCache.items
	errMsg := relCache.errorMsg
	fetchedAt := relCache.fetched
	relCache.mu.Unlock()

	util.Success(c, gin.H{
		"releases": items,
		"checked_at": func() string {
			if fetchedAt.IsZero() {
				return ""
			}
			return fetchedAt.UTC().Format(time.RFC3339)
		}(),
		"error": errMsg,
	})
}

func fetchReleases() {
	// 1) 优先 utterlog.io 静态 JSON 代理
	base := versionSourceURL()
	proxyURL := defaultReleasesURL
	if base != "" {
		proxyURL = base + "/api/releases.json"
	}
	if items, ok := tryFetchProxyReleases(proxyURL); ok {
		relCache.mu.Lock()
		relCache.fetched = time.Now()
		relCache.items = items
		relCache.errorMsg = ""
		relCache.mu.Unlock()
		return
	}

	// 2) Fallback: GitHub API direct
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", ghAllReleasesFallback, nil)
	applyGitHubHeaders(req)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		relCache.mu.Lock()
		relCache.fetched = time.Now()
		relCache.errorMsg = "github API: " + err.Error()
		relCache.mu.Unlock()
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		relCache.mu.Lock()
		relCache.fetched = time.Now()
		relCache.errorMsg = formatGitHubError(resp.StatusCode, string(body))
		// keep existing items so UI shows stale data rather than a blank list
		relCache.mu.Unlock()
		return
	}

	var items []githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&items); err != nil {
		relCache.mu.Lock()
		relCache.fetched = time.Now()
		relCache.errorMsg = "decode: " + err.Error()
		relCache.mu.Unlock()
		return
	}

	relCache.mu.Lock()
	relCache.fetched = time.Now()
	relCache.items = items
	relCache.errorMsg = ""
	relCache.mu.Unlock()
}

// ============================================================
// POST /api/v1/admin/system/upgrade
// ============================================================

type upgradeState struct {
	mu        sync.Mutex
	running   bool
	startedAt time.Time
	finished  bool
	success   bool
	message   string
	logPath   string
}

var upgrade = &upgradeState{
	logPath: "./public/uploads/upgrade.log",
}

// SystemUpgrade kicks off an in-place upgrade. Streams logs to a file on
// the bind-mounted uploads volume so the UI can poll for progress and
// so the log survives the api container restart.
func SystemUpgrade(c *gin.Context) {
	upgrade.mu.Lock()
	if upgrade.running {
		upgrade.mu.Unlock()
		util.Error(c, 409, "UPGRADE_IN_PROGRESS", "升级正在进行，请稍候")
		return
	}
	upgrade.running = true
	upgrade.finished = false
	upgrade.success = false
	upgrade.startedAt = time.Now()
	upgrade.message = ""
	upgrade.mu.Unlock()

	// Truncate log file. 时间戳格式跟 sidecar 一致 —— 1Panel 风格本地
	// 时区：2026/05/07 23:30:20
	_ = os.MkdirAll("./public/uploads", 0o755)
	_ = os.WriteFile(upgrade.logPath, []byte(fmt.Sprintf("%s 升级请求 已收到\n", time.Now().Format("2006/01/02 15:04:05"))), 0o644)

	// Detach: run the upgrade in the background so we can return 202
	// before the api container recreates itself.
	go runUpgrade()

	util.Success(c, gin.H{
		"started":  true,
		"log_path": "/uploads/upgrade.log",
		"hint":     "utterlog-api 容器将在 15-30 秒内被 sidecar 重新创建；期间请勿刷新页面",
	})
}

// SystemUpgradeStatus reports whether an upgrade is in progress plus a
// tail of the log. After the api container is recreated by the sidecar
// mid-upgrade, the in-memory upgradeState resets to zero values —
// running and finished both false — so the UI would never observe
// finished=true and would spin forever. Recover the final result by
// parsing the persisted upgrade.log: the sidecar always writes a
// "[TASK-END]" line (prefixed 成功 or 失败) on completion, which is
// robust to any number of restarts.
func SystemUpgradeStatus(c *gin.Context) {
	upgrade.mu.Lock()
	running := upgrade.running
	finished := upgrade.finished
	success := upgrade.success
	msg := upgrade.message
	startedAt := upgrade.startedAt
	logPath := upgrade.logPath
	upgrade.mu.Unlock()

	tail := ""
	if b, err := os.ReadFile(logPath); err == nil {
		if len(b) > 4096 {
			b = b[len(b)-4096:]
		}
		tail = string(b)
	}

	// Restart-recovery: when the api container was recreated by the
	// sidecar mid-upgrade, in-memory state is empty but the log file is
	// the source of truth. Only apply when nothing is live in memory —
	// don't mask a fresh run that hasn't written TASK-END yet.
	if !running && !finished && strings.Contains(tail, "[TASK-END]") {
		finished = true
		success = strings.Contains(tail, "成功 [TASK-END]")
		if !success && msg == "" {
			msg = "升级失败（详见日志）"
		}
	}

	util.Success(c, gin.H{
		"running":    running,
		"finished":   finished,
		"success":    success,
		"message":    msg,
		"started_at": startedAt.UTC().Format(time.RFC3339),
		"log_tail":   tail,
	})
}

func runUpgrade() {
	// Give the HTTP response time to flush before the container restarts.
	time.Sleep(1 * time.Second)

	appendLog := func(line string) {
		f, err := os.OpenFile(upgrade.logPath, os.O_APPEND|os.O_WRONLY, 0o644)
		if err != nil {
			return
		}
		defer f.Close()
		// 跟 sidecar 同款时间格式 —— 本地时区，1Panel 风格
		fmt.Fprintf(f, "%s %s\n", time.Now().Format("2006/01/02 15:04:05"), line)
	}

	// Validate docker socket access — api image must mount /var/run/docker.sock
	if _, err := os.Stat("/var/run/docker.sock"); err != nil {
		appendLog("ERROR /var/run/docker.sock 未挂载，请在 docker-compose 的 api 服务下加 `-v /var/run/docker.sock:/var/run/docker.sock` 才能启用一键升级")
		appendLog("升级应用 [Utterlog] 失败 [TASK-END]")
		upgrade.mu.Lock()
		upgrade.running = false
		upgrade.finished = true
		upgrade.success = false
		upgrade.message = "docker socket not mounted"
		upgrade.mu.Unlock()
		return
	}

	appendLog("启动升级 sidecar 容器（独立运行，不受 api 重建影响）")

	// CRITICAL: we cannot run `docker compose up -d` from within the
	// api container's own process tree. The moment compose recreates
	// the api service it SIGKILLs everything inside — and our shell
	// hasn't finished yet. The old api is gone, the new api container
	// sits in `Created` state without the rest of the `up -d` run to
	// start it. Result: total outage.
	//
	// Fix: spawn an independent sidecar container on the host docker
	// daemon. The sidecar has its own process space, runs `docker
	// compose pull + up -d` to completion, and doesn't care that
	// api-1 gets recreated. Its log tail is written to
	// ./public/uploads/upgrade.log which is bind-mounted so the UI
	// can still read it.
	// 容器名探测：用户的 compose project 名不一定是默认 "utterlog"
	// （1Panel 默认 "utterlog-pancn"，docker compose 在 -p 参数 / 父
	// 目录名也会影响），容器名跟着变成 <project>-<service>-1。所有
	// docker inspect / health check 都得用真实名字才不会 "container
	// not found" 静默失败。
	apiName := apiContainerName()
	webName := webContainerName(apiName)
	appendLog(fmt.Sprintf("检测容器名 api=[%s] web=[%s]", apiName, webName))

	// 安装目录探测优先级（v2.3.9 起调整）：
	//   1. docker inspect 当前 api 容器的 compose label
	//      `com.docker.compose.project.working_dir` —— compose 起容器时
	//      会自动打上，值就是 docker-compose.yml 所在的宿主目录。这个
	//      是 docker compose 自己写的，最权威。
	//   2. UTTERLOG_INSTALL_DIR 环境变量（用户显式覆盖；docker label
	//      探测失败时的兜底）。
	//   3. 兜底 /opt/utterlog。
	//
	// 之前 env 变量优先级最高，但 docker-compose.yml 默认会写
	//   - UTTERLOG_INSTALL_DIR=${UTTERLOG_INSTALL_DIR:-/opt/utterlog}
	// env 永远非空 → label 探测从来没机会跑 → 用户实际装在
	// /opt/utterlog-pancn/ 这种自定义路径时升级永远拿到错的 /opt/utterlog
	// 然后报"未找到 docker-compose 文件"。改成 label 优先即修复。
	installDir := ""
	if probed := probeComposeWorkingDir(); probed != "" {
		installDir = probed
		appendLog(fmt.Sprintf("检测安装目录 [%s]（来自 compose label）", installDir))
	} else if envDir := strings.TrimSpace(os.Getenv("UTTERLOG_INSTALL_DIR")); envDir != "" {
		installDir = envDir
		appendLog(fmt.Sprintf("检测安装目录 [%s]（来自 UTTERLOG_INSTALL_DIR env）", installDir))
	} else {
		installDir = "/opt/utterlog"
		appendLog("检测安装目录 [/opt/utterlog]（兜底默认）")
	}
	// Everything the sidecar prints goes to the shared upgrade.log that
	// the API's SystemUpgradeStatus endpoint reads — so the admin UI
	// sees the real pull / recreate / health-check progress instead of
	// a silent "sidecar launched" line followed by nothing (which is
	// what it looked like before when sidecar stdout went to its own
	// ephemeral docker log).
	sidecarScript := `
set -e
# Write everything to the host-mounted upgrade.log so the api can tail it.
# 优先 API_UPLOADS_DIR（api 启动 sidecar 时把自己 /app/public/uploads
# 的挂载源转挂过来 —— 生产 named volume / dev bind 都兼容），兜底
# $INSTALL_DIR/uploads（老路径）。
LOG_DIR="${API_UPLOADS_DIR:-$INSTALL_DIR/uploads}"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/upgrade.log"
exec >>"$LOG" 2>&1

# 日志格式参照 1Panel：本地时区 + 中文动作 + [对象] + 状态/[标记]
# 例如：2026/05/07 23:30:20 升级应用 [Utterlog] 任务开始 [START]
ts() { date '+%Y/%m/%d %H:%M:%S'; }
log() { echo "$(ts) $*"; }

log "升级应用 [Utterlog] 任务开始 [START]"
log "检测容器名 api=[$API_CONTAINER] web=[$WEB_CONTAINER]"
log "检测安装目录 [$INSTALL_DIR]"

cd "$INSTALL_DIR"

MODE="${UTTERLOG_COMPOSE_MODE:-}"
if [ -z "$MODE" ]; then
  if [ -f docker-compose.prod.yml ] && [ -f docker-compose.pull.yml ]; then
    MODE=overlay
  elif [ -f docker-compose.yml ]; then
    MODE=slim
  else
    log "ERROR 未找到 docker-compose 文件 [$INSTALL_DIR]"
    log "升级应用 [Utterlog] 失败 [TASK-END]"
    exit 1
  fi
fi
log "检测部署模式 [$MODE]"

# Refresh docker-compose.yml from utterlog.io BEFORE the pull so new
# bind mounts / env vars added in recent releases actually apply on
# recreate. Only refresh in slim mode (one file, matches what
# utterlog.io serves); overlay mode assumes the user maintains
# docker-compose.prod.yml themselves.
#
# 双源策略：先 utterlog.io（CDN，国内快），失败自动 fallback 到
# GitHub raw（raw.githubusercontent.com）。两个都不可达才放弃刷新，
# 用本地旧文件继续升级流程（仍然能拿到新镜像 tag）。
try_fetch_compose() {
  local url="$1" label="$2"
  log "刷新 compose 文件 from [$url]"
  if curl -fsSL --max-time 10 "$url" -o docker-compose.yml.new 2>>"$LOG"; then
    if [ -s docker-compose.yml.new ] && head -n1 docker-compose.yml.new | grep -qE '^[a-zA-Z_]+:'; then
      cp docker-compose.yml docker-compose.yml.bak 2>/dev/null || true
      mv docker-compose.yml.new docker-compose.yml
      log "刷新 compose 文件 成功 from $label（备份 [docker-compose.yml.bak]）"
      return 0
    fi
    rm -f docker-compose.yml.new
    log "WARN $label 返回内容非合法 YAML"
    return 1
  fi
  log "WARN $label 网络下载失败"
  return 1
}

if [ "$MODE" = "slim" ]; then
  BASE_URL="${UTTERLOG_BASE_URL:-https://utterlog.io}"
  GH_RAW_URL="https://raw.githubusercontent.com/utterlog/utterlog/main/docker-compose.yml"
  if command -v curl >/dev/null 2>&1; then
    if ! try_fetch_compose "$BASE_URL/docker-compose.yml" "utterlog.io"; then
      if ! try_fetch_compose "$GH_RAW_URL" "GitHub raw"; then
        log "刷新 compose 文件 跳过（utterlog.io + GitHub 均不可达，沿用本地旧文件）"
      fi
    fi
  fi
fi

# 镜像拉取双源策略：先快速探测 registry.utterlog.io 是否真的能读到
# api/web manifest；不可读时直接使用 GHCR，避免 docker compose pull
# 卡在一个坏掉的 registry/proxy 上。必须 export，后面的 up -d 子进程
# 才会读到同一个 prefix。
#
run_timeout() {
  local seconds="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds" "$@"
  else
    "$@"
  fi
}

compose() {
  case "$MODE" in
    overlay) docker compose -f docker-compose.prod.yml -f docker-compose.pull.yml "$@" ;;
    slim)    docker compose "$@" ;;
    *)       log "ERROR 未知部署模式 [$MODE]"; return 2 ;;
  esac
}

persist_env() {
  local key="$1" value="$2"
  if [ -f .env ]; then
    if grep -q "^${key}=" .env 2>/dev/null; then
      sed -i.bak "s|^${key}=.*|${key}=${value}|" .env
    else
      echo "${key}=${value}" >> .env
    fi
    rm -f .env.bak
  fi
}

has_app_manifest() {
  local prefix="$1"
  local tag="${UTTERLOG_IMAGE_TAG:-latest}"
  run_timeout 20 docker manifest inspect "$prefix/utterlog-api:$tag" >/dev/null 2>&1 \
    && run_timeout 20 docker manifest inspect "$prefix/utterlog-web:$tag" >/dev/null 2>&1
}

select_image_source() {
  if [ -n "${UTTERLOG_IMAGE_PREFIX:-}" ]; then
    export UTTERLOG_IMAGE_PREFIX="${UTTERLOG_IMAGE_PREFIX%/}"
    persist_env UTTERLOG_IMAGE_PREFIX "$UTTERLOG_IMAGE_PREFIX"
    log "使用已配置镜像源 [$UTTERLOG_IMAGE_PREFIX]"
    return 0
  fi

  log "探测镜像源 [registry.utterlog.io/utterlog]"
  if has_app_manifest "registry.utterlog.io/utterlog"; then
    export UTTERLOG_IMAGE_PREFIX="registry.utterlog.io/utterlog"
    persist_env UTTERLOG_IMAGE_PREFIX "$UTTERLOG_IMAGE_PREFIX"
    log "选择镜像源 [$UTTERLOG_IMAGE_PREFIX]"
    return 0
  fi

  log "WARN registry.utterlog.io manifest 不可读，切换到 [ghcr.io/utterlog]"
  export UTTERLOG_IMAGE_PREFIX="ghcr.io/utterlog"
  persist_env UTTERLOG_IMAGE_PREFIX "$UTTERLOG_IMAGE_PREFIX"
  if has_app_manifest "$UTTERLOG_IMAGE_PREFIX"; then
    log "选择镜像源 [$UTTERLOG_IMAGE_PREFIX]"
  else
    log "WARN GHCR manifest 探测也失败，继续尝试 docker compose pull 获取真实错误"
  fi
}

log "拉取基础镜像 [postgres/redis]"
if compose pull postgres redis; then
  log "拉取基础镜像 成功"
else
  log "ERROR 拉取基础镜像失败 [postgres/redis]"
  log "升级应用 [Utterlog] 失败 [TASK-END]"
  exit 1
fi

select_image_source

log "拉取应用镜像 [api/web] —— 源 [$UTTERLOG_IMAGE_PREFIX]"
if compose pull api web; then
  log "拉取应用镜像 成功 ($UTTERLOG_IMAGE_PREFIX)"
else
  if [ "$UTTERLOG_IMAGE_PREFIX" != "ghcr.io/utterlog" ]; then
    log "WARN $UTTERLOG_IMAGE_PREFIX 拉取失败，fallback 到 [ghcr.io/utterlog]"
    export UTTERLOG_IMAGE_PREFIX="ghcr.io/utterlog"
    persist_env UTTERLOG_IMAGE_PREFIX "$UTTERLOG_IMAGE_PREFIX"
    if compose pull api web; then
      log "拉取应用镜像 成功 (ghcr.io fallback)"
    else
      log "ERROR 应用镜像拉取失败 [api/web]"
      log "升级应用 [Utterlog] 失败 [TASK-END]"
      exit 1
    fi
  else
    log "ERROR 应用镜像拉取失败 [api/web]"
    log "升级应用 [Utterlog] 失败 [TASK-END]"
    exit 1
  fi
fi

log "重建容器 [$API_CONTAINER, $WEB_CONTAINER]"
compose up -d --remove-orphans
log "重建容器 成功"

log "等待 api 健康检查 [$API_CONTAINER]"
HEALTHY=0
for i in $(seq 1 60); do
  code=$(docker inspect --format='{{.State.Health.Status}}' "$API_CONTAINER" 2>/dev/null || echo unknown)
  if [ "$code" = "healthy" ]; then
    log "api 健康检查 成功 (${i}s)"
    HEALTHY=1
    break
  fi
  sleep 2
done
if [ "$HEALTHY" != "1" ]; then
  log "WARN api 120s 内未进入 healthy 状态 (state=$code)，请检查 [docker logs $API_CONTAINER]"
fi

# Print the running binary's version tag so the admin UI can confirm
# the upgrade actually flipped. Relies on the image label set by GHA.
IMG=$(docker inspect "$API_CONTAINER" --format='{{.Config.Image}}' 2>/dev/null || echo '?')
DIGEST=$(docker inspect "$API_CONTAINER" --format='{{.Image}}' 2>/dev/null | cut -c1-19)
log "当前镜像 [$IMG] digest=[$DIGEST]"

log "升级应用 [Utterlog] 成功 [TASK-END]"
`

	// Name the sidecar so we can find/cleanup stale runs.
	sidecarName := "utterlog-upgrade-" + fmt.Sprintf("%d", time.Now().Unix())
	// Remove any previous sidecar first (ignore error).
	exec.Command("docker", "rm", "-f", "utterlog-upgrade-worker").Run()

	// 关键：api 容器的 /app/public/uploads 在生产里通常挂的是 named
	// volume（docker-compose.prod.yml 用 `uploads:/app/public/uploads`），
	// 不是宿主目录。sidecar 之前往 $INSTALL_DIR/uploads/upgrade.log 写
	// log，api 从 named volume 里读 upgrade.log，**两个完全不是同一个
	// 文件**，admin 看到的 upgrade.log 永远只有 api 自己写的那几行。
	//
	// 修复：api 直接 inspect 自己的 mounts，找出 /app/public/uploads
	// 实际指向的宿主路径（可能是宿主目录、也可能是 docker volume 名），
	// 把它**也**挂给 sidecar，sidecar 写 log 写到同一个目标 → api
	// 读得到完整的升级进度。
	apiUploadsSource := probeAPIUploadsMountSource()
	dockerArgs := []string{
		"run", "--rm", "-d",
		"--name", sidecarName,
		"-v", "/var/run/docker.sock:/var/run/docker.sock",
		"-v", installDir + ":" + installDir,
	}
	if apiUploadsSource != "" {
		// 同名挂法：sidecar 里就用 /app/public/uploads 这个路径；
		// 既兼容宿主目录（"/opt/.../uploads"），也兼容 docker volume
		// （直接传 volume name 给 -v 即可）
		dockerArgs = append(dockerArgs, "-v", apiUploadsSource+":/api-uploads")
		appendLog("检测 uploads 挂载源 [" + apiUploadsSource + "]（与 api 共享）")
	} else {
		appendLog("WARN 无法探测 api 的 uploads 挂载源，sidecar 日志可能跟 api 不同步")
	}
	dockerArgs = append(dockerArgs,
		"-e", "INSTALL_DIR="+installDir,
		"-e", "UTTERLOG_COMPOSE_MODE="+os.Getenv("UTTERLOG_COMPOSE_MODE"),
		"-e", "API_UPLOADS_DIR=/api-uploads",
		// 关键：把动态探测出的 api / web 容器名传给 sidecar，让它的
		// docker inspect / health check 都用真实名字（compose project
		// 名不一定是默认的 "utterlog"，1Panel 用 "utterlog-pancn" 等
		// 自定义名导致容器全叫 utterlog-pancn-api-1）。
		"-e", "API_CONTAINER="+apiName,
		"-e", "WEB_CONTAINER="+webName,
		"-w", installDir,
		// Official Docker CLI image — includes compose v2 plugin.
		// Sourced from our own registry instead of docker.io so installs
		// in mainland China don't hang on Docker Hub (registry-1.docker.io
		// is unroutable from most CN ISPs). registry.utterlog.io is a thin
		// mirror kept in sync nightly by scripts/sync-mirrors.sh — content
		// is byte-identical to `docker:27-cli` on Docker Hub.
		"registry.utterlog.io/utterlog/docker:27-cli",
		"sh", "-c", sidecarScript,
	)
	cmd := exec.Command("docker", dockerArgs...)
	cmd.Stdout, _ = os.OpenFile(upgrade.logPath, os.O_APPEND|os.O_WRONLY, 0o644)
	cmd.Stderr = cmd.Stdout

	if err := cmd.Run(); err != nil {
		appendLog("ERROR 启动 sidecar 容器失败：" + err.Error())
		appendLog("升级应用 [Utterlog] 失败 [TASK-END]")
		upgrade.mu.Lock()
		upgrade.running = false
		upgrade.finished = true
		upgrade.success = false
		upgrade.message = err.Error()
		upgrade.mu.Unlock()
		return
	}

	appendLog(fmt.Sprintf("sidecar 容器 [%s] 启动 成功", sidecarName))
	appendLog(fmt.Sprintf("api 容器 [%s] 即将被 sidecar 重建（正常现象，sidecar 独立运行）", apiName))

	// Can't wait for the sidecar — our api will be recreated mid-run,
	// killing this goroutine. Optimistic success: the sidecar owns the
	// real outcome. On restart, upgrade state resets to zero and the
	// UI's version poll will show the new image's VERSION label.
	upgrade.mu.Lock()
	upgrade.running = false
	upgrade.finished = true
	upgrade.success = true
	upgrade.message = "升级 worker 已启动，API 即将自动重启。如果前端一直 502，可以刷新页面看版本号是否已更新。"
	upgrade.mu.Unlock()
}
