import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Modal } from '@/components/ui/modal';
import { formatWithAdminTimeZone } from '@/lib/timezone';

interface VersionInfo {
  current: { version: string; commit?: string; built_at: string; runtime?: string; runtime_upgrade_supported?: boolean };
  latest: {
    version: string;
    name: string;
    body: string;
    url: string;
    published_at: string;
    prerelease: boolean;
    commit?: string;
  } | null;
  update_available: boolean;
  checked_at: string;
  error?: string;
}

interface UpgradeStatus {
  running: boolean;
  finished: boolean;
  success: boolean;
  message: string;
  started_at: string;
  log_tail: string;
}

function upgradeTerminalFromLog(status: UpgradeStatus | null): 'success' | 'failure' | null {
  const tail = status?.log_tail || '';
  if (!tail.includes('[TASK-END]')) return null;
  if (/升级应用\s+\[Utterlog\]\s+成功\s+\[TASK-END\]/.test(tail)) return 'success';
  if (/升级应用\s+\[Utterlog\]\s+失败\s+\[TASK-END\]/.test(tail)) return 'failure';
  return null;
}

// Markdown renderer for GitHub release bodies. Handles headings,
// lists, paragraphs, inline code, fenced code blocks, bold/italic,
// and [text](url) links. Mirrors the landing site's changelog
// renderer so admin UI and utterlog.io/changelog show release notes
// identically. XSS-safe: all user content flows through escapeHtml
// before being re-decorated with inline/block markup.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 升级日志的语义高亮 —— 1Panel 风格：时间戳 / [对象] / 状态词 各自上色。
// 必须先 escapeHtml，再用 token regex 加 <span> 包装着色（避免 XSS）。
//
//   2026/05/07 23:30:20  ← 暗灰 (#64748b)
//   [START] [TASK-END]   ← 琥珀 (#fbbf24)
//   [其它内容]            ← 天蓝 (#7dd3fc)
//   成功                  ← 亮绿 (#4ade80)
//   WARN                  ← 黄   (#fbbf24)
//   ERROR / 失败          ← 红   (#f87171)
function highlightLogLine(line: string): string {
  let s = escapeHtml(line);

  // 时间戳 2026/05/07 23:30:20 (放在最前面着色，避免被后续规则吃掉)
  s = s.replace(
    /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/,
    '<span style="color:#64748b;margin-right:8px">$1</span>',
  );

  // [START] / [TASK-END] —— 任务边界标记，琥珀色加粗
  s = s.replace(
    /\[(START|TASK-END)\]/g,
    '<span style="color:#fbbf24;font-weight:600">[$1]</span>',
  );

  // 其它 [...] —— 容器名 / 路径 / 镜像 tag 等"对象"，天蓝
  // 注意：因为 escapeHtml 把 [ 没动，所以可以直接匹配
  s = s.replace(
    /\[([^\]]+)\]/g,
    (m, inner) => {
      // 已经被前面的 START/TASK-END 规则替换过的不再二次处理
      if (m.includes('color:#fbbf24')) return m;
      return `<span style="color:#7dd3fc">[${inner}]</span>`;
    },
  );

  // 状态词 / 错误词
  s = s.replace(/(?<!\w)(成功)(?!\w)/g, '<span style="color:#4ade80;font-weight:500">$1</span>');
  s = s.replace(/(?<!\w)(失败)(?!\w)/g, '<span style="color:#f87171;font-weight:500">$1</span>');
  s = s.replace(/(?<!\w)(ERROR)(?!\w)/g, '<span style="color:#f87171;font-weight:600">$1</span>');
  s = s.replace(/(?<!\w)(WARN)(?!\w)/g, '<span style="color:#fbbf24;font-weight:600">$1</span>');

  return s;
}

function renderChangelog(md: string): string {
  if (!md) return '';
  const rawLines = md.split('\n');
  const out: string[] = [];
  let inList = false;
  let inCode = false;
  let codeLang = '';
  const codeBuf: string[] = [];

  const flushList = () => {
    if (inList) { out.push('</ul>'); inList = false; }
  };
  const flushCode = () => {
    const langClass = codeLang ? ` class="language-${escapeHtml(codeLang)}"` : '';
    out.push(`<pre><code${langClass}>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
    codeBuf.length = 0;
    codeLang = '';
    inCode = false;
  };

  // Stash inline code into placeholders so ** inside `code` isn't
  // mistaken for bold; restore at the end.
  const inlineFmt = (s: string) => {
    const codeStash: string[] = [];
    let t = escapeHtml(s).replace(/`([^`]+)`/g, (_, c) => {
      codeStash.push(`<code>${c}</code>`);
      return `\u0000${codeStash.length - 1}\u0000`;
    });
    t = t
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;!?]|$)/g, '$1<em>$2</em>')
      .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;!?]|$)/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\u0000(\d+)\u0000/g, (_, n) => codeStash[Number(n)]);
    return t;
  };

  // GFM 表格切分：把 | a | b | 拆成单元格数组（首尾空字符串过滤）
  const splitRow = (line: string): string[] =>
    line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const fence = rawLine.match(/^```\s*([\w-]*)\s*$/);
    if (fence) {
      if (inCode) { flushCode(); }
      else { flushList(); inCode = true; codeLang = fence[1] || ''; }
      continue;
    }
    if (inCode) { codeBuf.push(rawLine); continue; }

    // GFM 表格：当前行以 | 开头 + 下一行像 |---|---| 分隔行 → 整段做表格
    // 这是之前缺的功能，导致 release notes 里的对比表格全部当成 <p> 显示
    // 成 "| col | col |" 的原文 raw 字符。
    if (/^\s*\|.*\|\s*$/.test(rawLine) && i + 1 < rawLines.length && /^\s*\|?[\s|:-]+\|?\s*$/.test(rawLines[i + 1]) && rawLines[i + 1].includes('-')) {
      flushList();
      const headers = splitRow(rawLine);
      i++; // 吃掉分隔行
      const rows: string[][] = [];
      while (i + 1 < rawLines.length && /^\s*\|.*\|\s*$/.test(rawLines[i + 1])) {
        i++;
        rows.push(splitRow(rawLines[i]));
      }
      out.push('<div class="changelog-table-wrap"><table class="changelog-table"><thead><tr>');
      for (const h of headers) out.push(`<th>${inlineFmt(h)}</th>`);
      out.push('</tr></thead><tbody>');
      for (const r of rows) {
        out.push('<tr>');
        for (const c of r) out.push(`<td>${inlineFmt(c)}</td>`);
        out.push('</tr>');
      }
      out.push('</tbody></table></div>');
      continue;
    }

    if (/^\s*[-*]\s+/.test(rawLine)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineFmt(rawLine.replace(/^\s*[-*]\s+/, ''))}</li>`);
      continue;
    }

    flushList();
    if (/^#+\s+/.test(rawLine)) {
      const level = Math.min(rawLine.match(/^#+/)![0].length + 2, 6);
      out.push(`<h${level}>${inlineFmt(rawLine.replace(/^#+\s+/, ''))}</h${level}>`);
    } else if (/^---+\s*$/.test(rawLine)) {
      out.push('<hr />');
    } else if (rawLine.trim()) {
      out.push(`<p>${inlineFmt(rawLine)}</p>`);
    }
  }
  if (inCode) flushCode();
  flushList();
  return out.join('\n');
}

// The full version + upgrade UI. Renders inline — meant to be dropped
// into the Settings page's "系统更新" tab. Handles fetch, refresh,
// one-click upgrade, progress polling, and changelog rendering.
interface ReleaseItem {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
}

export default function SystemUpdatePanel() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgradeStatus, setUpgradeStatus] = useState<UpgradeStatus | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [releases, setReleases] = useState<ReleaseItem[] | null>(null);
  const [releasesErr, setReleasesErr] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 升级进度模态框 —— 点升级时自动打开；完成 / 失败后用户可关闭。
  // 关闭后还能从"查看升级日志"按钮重新打开（只要 log_tail 还在）
  const [logModalOpen, setLogModalOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const upgradeSettledRef = useRef(false);
  // 升级日志滚动容器 + 末尾哨兵 —— 每次 log_tail 变化都自动滚到底部，
  // 让最新一行始终在视口里，符合"日志在持续滚动"的预期视觉
  const logScrollRef = useRef<HTMLDivElement | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  // 自动跟随：log_tail 变化 → 平滑滚到末尾哨兵；用户手动滚到中间想
  // 看历史时，下次有新行还是会被拖回底部。这是 docker / k8s logs
  // 经典行为，期望"实时刷"的用户最熟悉。
  useEffect(() => {
    if (!logModalOpen) return;
    const tail = upgradeStatus?.log_tail || '';
    if (!tail) return;
    requestAnimationFrame(() => {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }, [upgradeStatus?.log_tail, logModalOpen]);

  // 升级开始 → 自动弹模态框；完成后保留模态框直到用户主动关闭。
  // 进行中时关掉再点也能再开（log_tail 还在 SystemUpgradeStatus 接口里）
  useEffect(() => {
    if (upgrading) setLogModalOpen(true);
  }, [upgrading]);

  async function load(refresh = false) {
    setLoading(true);
    try {
      const r = await api.get<any>(`/admin/system/version${refresh ? '?refresh=1' : ''}`);
      setInfo(r.data);
    } catch (e: any) {
      toast.error('获取版本信息失败：' + (e?.message || 'unknown'));
    } finally {
      setLoading(false);
    }
  }

  async function loadReleases(refresh = false) {
    try {
      const r = await api.get<any>(`/admin/system/releases${refresh ? '?refresh=1' : ''}`);
      setReleases((r.data?.releases || []) as ReleaseItem[]);
      setReleasesErr(r.data?.error || '');
    } catch (e: any) {
      setReleasesErr(e?.message || '加载更新历史失败');
    }
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Verifies whether the upgrade actually took effect. 三种成功信号
  // 任一命中就算成功：
  //   1. current.version === 期望的 GitHub tag（最强信号）
  //   2. current.commit 跟升级前不一样（容器二进制变了 = 拉到新镜像
  //      重建过；覆盖 dev / sha-only 构建，BuildVersion 是 'dev' 时也能
  //      认）
  //   3. current.built_at 跟升级前不一样（兜底，仅当 commit 不可用时
  //      用 build time 当代理）
  // 之前只看 (1)，dev 安装永远 'dev' 永远过不了；生产里如果 docker
  // 镜像 :latest 还没更新到新 tag、或者用户 compose 锁定了具体版本号，
  // 也会被卡 60s 然后误报"升级未生效"。
  async function verifyUpgradeApplied(expected: string, maxWaitSec = 180) {
    // 升级前先记录基线 —— commit / built_at 跟 expected 都要拿来对比
    const baseCommit = (info?.current?.commit || '').toLowerCase();
    const baseBuiltAt = info?.current?.built_at || '';
    const started = Date.now();
    let lastErr = '';
    let lastGot = '';
    let lastCommit = '';
    while (Date.now() - started < maxWaitSec * 1000) {
      try {
        const r = await api.get<any>('/admin/system/version?refresh=1');
        setInfo(r.data);
        const got = r.data?.current?.version || '';
        const commit = (r.data?.current?.commit || '').toLowerCase();
        const builtAt = r.data?.current?.built_at || '';
        lastGot = got;
        lastCommit = commit;
        if (expected && got === expected) {
          toast.success(`升级完成 — 已运行 ${got}`);
          // 通知所有 mounted 的 VersionBadge 立刻清缓存重拉，左上角
          // 版本号 pill 不用等 10 分钟 TTL 也能立刻显示新版本
          window.dispatchEvent(new Event('admin:version-changed'));
          return true;
        }
        if (baseCommit && commit && baseCommit !== commit) {
          toast.success(`升级完成 — 容器已重建（commit ${commit.slice(0, 7)}）`);
          window.dispatchEvent(new Event('admin:version-changed'));
          return true;
        }
        if (!baseCommit && !commit && baseBuiltAt && builtAt && baseBuiltAt !== builtAt) {
          toast.success('升级完成 — 容器已重建');
          window.dispatchEvent(new Event('admin:version-changed'));
          return true;
        }
      } catch (e: any) {
        lastErr = e?.message || '';
      }
      await new Promise((res) => setTimeout(res, 2000));
    }
    // 兜底：3 种语气分级，避免一律用红色 error toast 吓到用户
    //   A. 网络 / 鉴权错误 —— 真的有问题，error toast
    //   B. api 在响应、版本号没变化 —— 镜像 / tag 同步问题，warning info
    //   C. api 在响应、commit 已变（但版本号字串没匹配）—— 实际上升级了，
    //      只是 docker label 跟 BuildVersion 注入对不上（main vs v2.x.x）。
    //      这种情况是"成功未确认"，不是失败 —— 用 info toast 告诉用户
    //      "升级已应用，但版本号自动确认超时，可手动刷新核对"。
    const baseSnapshot = info?.current?.version || '';
    if (lastErr) {
      toast.error(`无法确认升级结果（${lastErr}）—— 请手动刷新页面核对版本`);
    } else if (lastCommit && lastCommit !== (info?.current?.commit || '').toLowerCase()) {
      // commit 已经变了 —— 升级实际生效，但版本字串可能因为 docker
      // label "main" 跟 BuildVersion ldflags 注入不一致而对不上。
      // 这不是失败，是"成功 + 自动确认信号有歧义"。
      toast(
        `升级已应用 —— 容器 commit 已更新到 ${lastCommit.slice(0, 7)}，` +
        `但版本号自动确认超时。可手动刷新页面核对。`
      );
    } else if (lastGot && lastGot === baseSnapshot) {
      toast(
        `升级超时未确认 —— 当前版本 ${lastGot}，期望 ${expected || '?'}。` +
        `镜像可能还在拉取或 registry 还没同步，等几分钟刷新页面再看。`
      );
    } else {
      toast.error(
        `升级未生效 —— 容器仍在 ${lastGot || '旧版本'}（commit ${lastCommit.slice(0, 7) || '?'}），期望 ${expected || '?'}。` +
        `请检查 docker logs。`
      );
    }
    return false;
  }

  async function pollStatus() {
    try {
      const r = await api.get<any>('/admin/system/upgrade/status');
      const status = r.data as UpgradeStatus;
      const terminal = upgradeTerminalFromLog(status);
      const normalizedStatus = terminal
        ? { ...status, running: false, finished: true, success: terminal === 'success' }
        : status;
      setUpgradeStatus(normalizedStatus);

      if ((!normalizedStatus.running && normalizedStatus.finished) && !upgradeSettledRef.current) {
        upgradeSettledRef.current = true;
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        if (normalizedStatus.success && terminal === 'success') {
          toast.success('升级完成');
          setUpgrading(false);
          await load(true);
          window.dispatchEvent(new Event('admin:version-changed'));
        } else if (normalizedStatus.success) {
          // Backend's "success" is optimistic — verify the running
          // version actually flipped before declaring victory.
          // 这里超时**必须**给足时间 —— 真实升级流程包括：
          //   sidecar pull 镜像 (~30s) + recreate container (~5s) +
          //   新 api 启动 + DB 初始化 + cron 启动 (~15s) +
          //   utterlog.io 缓存同步 (~10s)
          // 总计经常 60-90s。之前写死 60s 导致升级实际成功了但 UI 还
          // 在 60s 截止时误报"升级未生效 / 升级失败"，吓到用户。
          // 给 240s 留足空间，verify 自己内部成功信号命中就立刻 return
          // 不会真等满 240s。
          const expected = info?.latest?.version || '';
          toast('升级脚本已执行，正在确认容器版本…');
          try {
            await verifyUpgradeApplied(expected, 240);
            await load(true);
            window.dispatchEvent(new Event('admin:version-changed'));
          } finally {
            setUpgrading(false);
          }
        } else {
          toast.error('升级失败：' + (normalizedStatus.message || '请查看升级日志'));
          setUpgrading(false);
        }
      }
    } catch (_) {
      // api likely restarting — keep polling
    }
  }

  // The button just opens the confirm modal. Real work happens in
  // `runUpgrade` after the user clicks "确认升级" — this way the native
  // browser confirm() is gone and we get a styled modal matching Plan A.
  function doUpgrade() {
    setConfirmOpen(true);
  }

  async function runUpgrade() {
    setConfirmOpen(false);
    setUpgrading(true);
    upgradeSettledRef.current = false;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    try {
      const r = await api.post<any>('/admin/system/upgrade');
      if (r.data?.started === false) {
        setUpgrading(false);
        toast.error(r.data?.message || '当前部署环境不支持后台一键升级，请按提示手动执行 compose 更新。');
        await pollStatus();
        return;
      }
      toast('升级已开始，请勿刷新页面');
      pollRef.current = setInterval(pollStatus, 2000);
    } catch (e: any) {
      setUpgrading(false);
      const msg = e?.response?.data?.error?.message || e?.message;
      toast.error('启动升级失败：' + msg);
    }
  }

  useEffect(() => {
    load();
    loadReleases();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function fmtDate(iso: string) {
    return formatWithAdminTimeZone(new Date(iso), 'zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // Main label = release version (v1.0.5). Commit SHA goes below as
  // a small subtitle so the UI never fronts an ugly "sha-<40hex>".
  const cur = info?.current.version || '—';
  const curCommit = info?.current.commit || '';
  const lat = info?.latest?.version || '—';
  const updateAvailable = info?.update_available ?? false;
  const runtimeUpgradeSupported = info?.current.runtime_upgrade_supported === true;
  // Tri-state: update-available | up-to-date | check-failed. The old
  // 2-state logic (just updateAvailable) collapsed check-failed into
  // up-to-date, so GitHub rate-limits / network blips silently claimed
  // the user was current even when they weren't.
  const checkFailed = !!info && info.latest == null && !!info.error;
  const checkState: 'update' | 'ok' | 'unknown' =
    checkFailed ? 'unknown' : updateAvailable ? 'update' : 'ok';

  // Status color: blue when an update is available, green when up-to-date,
  // amber when we couldn't actually check (GitHub rate-limit / network /
  // missing-release) so the UI doesn't look like a false positive.
  const statusColor = checkState === 'update' ? '#0052D9' : checkState === 'unknown' ? '#d97706' : '#16a34a';
  const statusColorDark = checkState === 'update' ? '#003DA6' : checkState === 'unknown' ? '#b45309' : '#15803d';
  const statusColorSoft = checkState === 'update' ? 'rgba(0,82,217,0.08)' : checkState === 'unknown' ? 'rgba(217,119,6,0.10)' : 'rgba(22,163,74,0.08)';

  // Primary button = main action (upgrade / "up-to-date"). Blue or green.
  const primaryBtnStyle: React.CSSProperties = {
    height: 40, padding: '0 20px',
    display: 'inline-flex', alignItems: 'center', gap: 8,
    background: statusColor, color: '#fff',
    border: `1px solid ${statusColor}`,
    fontSize: 14, fontWeight: 600,
    cursor: upgrading || loading || !runtimeUpgradeSupported ? 'not-allowed' : (updateAvailable ? 'pointer' : 'default'),
    opacity: upgrading || loading || !runtimeUpgradeSupported ? 0.6 : 1,
    transition: 'background-color 0.15s, border-color 0.15s',
    fontFamily: 'inherit',
  };
  // Secondary button = refresh check. Always outlined gray.
  const secondaryBtnStyle: React.CSSProperties = {
    height: 40, padding: '0 16px',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'var(--color-surface, #fff)', color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    fontSize: 13,
    cursor: loading || upgrading ? 'not-allowed' : 'pointer',
    opacity: loading || upgrading ? 0.5 : 1,
    transition: 'border-color 0.15s, color 0.15s',
    fontFamily: 'inherit',
  };

  return (
    <div>
      {/* Version card */}
      <div style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 4 }}>当前版本</div>
            <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'ui-monospace, monospace', color: updateAvailable ? 'var(--color-text)' : statusColor }}>{cur}</div>
            {curCommit && (
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>
                提交 {curCommit.length > 7 ? curCommit.slice(0, 7) : curCommit}
              </div>
            )}
            {info?.current.built_at && (
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                构建于 {info.current.built_at}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 4 }}>最新版本</div>
            <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'ui-monospace, monospace', color: statusColor }}>
              {lat}
            </div>
            {info?.latest?.commit && (
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>
                提交 {info.latest.commit}
              </div>
            )}
            {info?.latest?.published_at && (
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                发布于 {formatWithAdminTimeZone(new Date(info.latest.published_at), 'zh-CN', {})}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {checkState === 'update' ? (
            <button
              type="button"
              onClick={doUpgrade}
              disabled={upgrading || loading || !runtimeUpgradeSupported}
              style={primaryBtnStyle}
              title={runtimeUpgradeSupported ? undefined : 'Bun 容器版需要通过部署命令更新'}
              onMouseEnter={(e) => { if (!upgrading && !loading && runtimeUpgradeSupported) e.currentTarget.style.background = statusColorDark; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = statusColor; }}
            >
              <i className={`fa-solid ${upgrading ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-down'}`} />
              {upgrading ? '升级中…' : runtimeUpgradeSupported ? '一键升级到 ' + lat : '检测到新版本，需手动部署'}
            </button>
          ) : checkState === 'unknown' ? (
            <button type="button" disabled style={primaryBtnStyle}>
              <i className="fa-solid fa-triangle-exclamation" />
              版本检查失败
            </button>
          ) : (
            // Up-to-date — still let the admin force a re-pull. Useful
            // when latest == current but the user suspects a botched
            // previous upgrade (network blip during compose pull, image
            // layers half-cached, etc.), or when they just want to
            // redeploy the same tag.
            <button
              type="button"
              onClick={doUpgrade}
              disabled={upgrading || loading || !runtimeUpgradeSupported}
              style={{ ...primaryBtnStyle, cursor: upgrading || loading || !runtimeUpgradeSupported ? 'not-allowed' : 'pointer' }}
              title="重新拉取当前版本并重启容器"
              onMouseEnter={(e) => { if (!upgrading && !loading && runtimeUpgradeSupported) e.currentTarget.style.background = statusColorDark; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = statusColor; }}
            >
              <i className={`fa-solid ${upgrading ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'}`} />
              {upgrading ? '重新部署中…' : runtimeUpgradeSupported ? '重新部署 ' + cur : 'Bun 容器模式'}
            </button>
          )}
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading || upgrading}
            style={secondaryBtnStyle}
            onMouseEnter={(e) => { if (!loading && !upgrading) { e.currentTarget.style.borderColor = statusColor; e.currentTarget.style.color = statusColor; } }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text)'; }}
          >
            <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'}`} />
            刷新检查
          </button>
          <div style={{ flex: 1 }} />
          {info?.latest?.url && (
            <a href={info.latest.url} target="_blank" rel="noopener" style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>
              在 GitHub 查看 <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: 10, marginLeft: 2 }} />
            </a>
          )}
        </div>

        {info?.error && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef2f2', borderLeft: '3px solid #dc2626', color: '#991b1b', fontSize: 12 }}>
            <i className="fa-solid fa-circle-exclamation" style={{ marginRight: 6 }} />
            {info.error}
          </div>
        )}
        {!runtimeUpgradeSupported && (
          <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8fafc', borderLeft: '3px solid #64748b', color: '#334155', fontSize: 12, lineHeight: 1.7 }}>
            <i className="fa-solid fa-terminal" style={{ marginRight: 6 }} />
            当前 Bun 版不在运行时操作 Docker。更新请在部署目录执行：
            <code style={{ marginLeft: 6, fontFamily: 'ui-monospace,monospace' }}>docker compose pull app && docker compose up -d app</code>
          </div>
        )}
      </div>

      {/* Changelog */}
      {info?.latest?.body && (
        <div style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', padding: '20px 24px', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fa-solid fa-clipboard-list" style={{ color: 'var(--color-primary)' }} />
            更新内容 — {info.latest.version}
          </h3>
          <div
            className="changelog-body"
            style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--color-text)' }}
            dangerouslySetInnerHTML={{ __html: renderChangelog(info.latest.body) }}
          />
        </div>
      )}

      {/* 升级日志重开按钮 —— 模态框被用户关掉后还能再打开（只要状态在）。
          升级进行中保持显示，方便用户随时观察 */}
      {upgradeStatus && (upgrading || upgradeStatus.log_tail) && !logModalOpen && (
        <button
          type="button"
          onClick={() => setLogModalOpen(true)}
          className="btn btn-sm"
          style={{
            marginBottom: 16,
            background: upgradeStatus.running ? 'var(--color-primary)' : 'var(--color-bg-soft)',
            color: upgradeStatus.running ? '#fff' : 'var(--color-text)',
            border: '1px solid var(--color-border)',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <i
            className={`fa-solid ${upgradeStatus.running ? 'fa-spinner fa-spin' : upgradeStatus.success ? 'fa-circle-check' : 'fa-circle-xmark'}`}
            style={{ color: upgradeStatus.running ? '#fff' : upgradeStatus.success ? '#16a34a' : '#dc2626' }}
          />
          {upgradeStatus.running ? '查看升级进度…' : upgradeStatus.success ? '查看升级日志（成功）' : '查看升级日志（失败）'}
        </button>
      )}

      {/* 升级日志模态框 —— 1Panel-style 终端面板 + 语义高亮 + 自动
          滚动到最新一行 + 新行 fade-in 动画。
          每行 className="upgrade-log-line" 触发 CSS 关键帧，新挂载的
          DOM 节点（即新出现的行）自动跑一次飘入动画 */}
      <Modal
        isOpen={logModalOpen && !!upgradeStatus && (upgrading || !!upgradeStatus.log_tail)}
        onClose={() => setLogModalOpen(false)}
        title={
          upgradeStatus?.running
            ? '升级进行中 — 实时日志'
            : upgradeStatus?.success
            ? '升级完成 — 日志归档'
            : '升级失败 — 错误日志'
        }
        size="xl"
      >
        <div style={{
          background: '#0a0e1a',
          color: '#cbd5e1',
          padding: 0,
          fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
          fontSize: 12.5,
          lineHeight: 1.75,
          borderRadius: 6,
          border: '1px solid #1e293b',
          margin: '-20px -20px',  /* 抵消 Modal 内部 padding 让终端贴边 */
        }}>
          {/* 顶部状态条：spinner / 对勾 / 叉 + 文案 */}
          <div style={{
            fontSize: 11.5,
            color: '#94a3b8',
            padding: '14px 20px 10px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontWeight: 500,
            letterSpacing: 0.3,
            background: 'linear-gradient(180deg, #0f1729 0%, #0a0e1a 100%)',
          }}>
            <i
              className={`fa-solid ${upgradeStatus?.running ? 'fa-spinner fa-spin' : upgradeStatus?.success ? 'fa-circle-check' : 'fa-circle-xmark'}`}
              style={{ color: upgradeStatus?.running ? '#60a5fa' : upgradeStatus?.success ? '#4ade80' : '#f87171', fontSize: 13 }}
            />
            <span style={{ color: '#cbd5e1' }}>
              {upgradeStatus?.running ? '正在拉取镜像 / 重建容器…' : upgradeStatus?.success ? '完成' : '失败'}
            </span>
            {upgradeStatus?.started_at && (
              <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 11 }}>
                started: {formatWithAdminTimeZone(new Date(upgradeStatus.started_at), 'zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </span>
            )}
          </div>

          {/* 日志正文 —— max-height 控制滚动，ref 存到 logScrollRef
              方便 useEffect 调 scrollIntoView */}
          <div
            ref={logScrollRef}
            style={{
              maxHeight: '60vh',
              minHeight: 280,
              overflowY: 'auto',
              padding: '12px 20px 16px',
            }}
          >
            {(upgradeStatus?.log_tail || '').split('\n').filter(Boolean).map((line, i) => (
              <div
                key={i}
                className="upgrade-log-line"
                dangerouslySetInnerHTML={{ __html: highlightLogLine(line) }}
              />
            ))}
            {!upgradeStatus?.log_tail && (
              <div style={{ color: '#64748b' }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />
                正在启动 sidecar 容器...
              </div>
            )}
            {/* 末尾哨兵：useEffect 会让它 scrollIntoView，强制日志贴底显示 */}
            <div ref={logEndRef} style={{ height: 1 }} />
          </div>

          {/* 底部进度条（running 时无限循环动画，完成后固定） */}
          {upgradeStatus?.running && (
            <div style={{
              height: 2,
              background: '#1e293b',
              overflow: 'hidden',
              position: 'relative',
            }}>
              <div className="upgrade-log-progress-bar" />
            </div>
          )}
        </div>
      </Modal>

      {/* Data preservation notice */}
      <div style={{ border: '1px solid var(--color-border)', background: '#fefce8', padding: '14px 18px', fontSize: 12, color: '#713f12', marginBottom: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="fa-solid fa-shield-halved" />
          升级安全保证
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li>数据库 (<code>pgdata/</code>) — 永不触碰</li>
          <li>配置文件 (<code>.env</code>) — 保持不变</li>
          <li>上传文件 (<code>uploads/</code>) 和用户扩展 (<code>content/</code>) — 完整保留</li>
          <li>系统内置主题和代码 — 自动更新到最新版</li>
        </ul>
      </div>

      {/* ================= Release history / changelog ================= */}
      <div style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fa-solid fa-clock-rotate-left" style={{ color: 'var(--color-primary)' }} />
            更新历史
            {releases && <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 400 }}>最近 {releases.length} 个发布</span>}
          </h3>
          <button
            type="button"
            className="btn"
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={() => loadReleases(true)}
          >
            <i className="fa-solid fa-arrows-rotate" style={{ marginRight: 4 }} />
            刷新
          </button>
        </div>

        {releasesErr && (
          <div style={{ padding: '10px 20px', background: '#fef2f2', borderBottom: '1px solid #fca5a5', color: '#991b1b', fontSize: 12 }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 6 }} />
            {releasesErr}
            {' · '}
            <a href="https://github.com/utterlog/utterlog/releases" target="_blank" rel="noopener" style={{ color: 'inherit', textDecoration: 'underline' }}>
              在 GitHub 查看
            </a>
          </div>
        )}

        {releases === null ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-dim)' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />
            加载更新历史…
          </div>
        ) : releases.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-dim)' }}>
            还没有发布的 tag 版本。开发阶段的改动请看{' '}
            <a
              href="https://github.com/utterlog/utterlog/commits/main"
              target="_blank" rel="noopener"
              style={{ color: 'var(--color-primary)' }}
            >
              GitHub 提交历史 <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: 10 }} />
            </a>
          </div>
        ) : (
          <div>
            {releases.map((rel) => {
              const isOpen = expanded.has(rel.id);
              const isCurrent = info?.current.version === rel.tag_name;
              return (
                <div key={rel.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <button
                    type="button"
                    onClick={() => toggleExpand(rel.id)}
                    style={{
                      width: '100%', padding: '14px 20px',
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: 'none', border: 'none', cursor: 'pointer',
                      textAlign: 'left', color: 'var(--color-text)',
                    }}
                  >
                    <i className={`fa-solid fa-chevron-${isOpen ? 'down' : 'right'}`} style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 10 }} />
                    <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 13, fontWeight: 600, color: 'var(--color-primary)' }}>
                      {rel.tag_name}
                    </span>
                    {isCurrent && (
                      <span style={{ fontSize: 10, padding: '1px 6px', background: '#16a34a', color: '#fff', fontWeight: 700 }}>
                        CURRENT
                      </span>
                    )}
                    {rel.prerelease && (
                      <span style={{ fontSize: 10, padding: '1px 6px', background: '#f59e0b', color: '#fff', fontWeight: 700 }}>
                        PRE-RELEASE
                      </span>
                    )}
                    {rel.name && rel.name !== rel.tag_name && (
                      <span style={{ fontSize: 13, color: 'var(--color-text-dim)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rel.name}
                      </span>
                    )}
                    {!rel.name || rel.name === rel.tag_name ? <span style={{ flex: 1 }} /> : null}
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'ui-monospace,monospace', whiteSpace: 'nowrap' }}>
                      {fmtDate(rel.published_at)}
                    </span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '2px 20px 18px 42px', borderTop: '1px dashed var(--color-border)' }}>
                      <div
                        className="changelog-body"
                        style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--color-text)' }}
                        dangerouslySetInnerHTML={{ __html: renderChangelog(rel.body) || '<p style="color:var(--color-text-muted);font-size:12px">（无更新说明）</p>' }}
                      />
                      <a
                        href={rel.html_url}
                        target="_blank" rel="noopener"
                        style={{ display: 'inline-block', marginTop: 10, fontSize: 11, color: 'var(--color-text-dim)' }}
                      >
                        在 GitHub 查看完整发布 <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: 9, marginLeft: 2 }} />
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upgrade confirm dialog — styled modal, replaces native confirm() */}
      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title={checkState === 'update' ? '确认一键升级' : '确认重新部署'} size="sm">
        <div>
          <div style={{
            width: 44, height: 44, margin: '0 auto 14px',
            background: 'var(--color-primary-soft, #E6EEFB)',
            color: 'var(--color-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20,
          }}>
            <i className={`fa-solid ${checkState === 'update' ? 'fa-cloud-arrow-down' : 'fa-arrows-rotate'}`} />
          </div>
          <div style={{ fontSize: 14, color: 'var(--color-text)', lineHeight: 1.7, textAlign: 'center', marginBottom: 6 }}>
            {checkState === 'update' ? (
              <>即将升级到 <b style={{ color: 'var(--color-primary)', fontFamily: 'ui-monospace,monospace' }}>{lat}</b></>
            ) : (
              <>即将重新部署 <b style={{ color: 'var(--color-primary)', fontFamily: 'ui-monospace,monospace' }}>{cur}</b></>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-dim)', lineHeight: 1.7, textAlign: 'center', marginBottom: 16 }}>
            {checkState === 'update'
              ? '拉取最新镜像并重建容器，约需 30-60 秒。'
              : '重新拉取当前版本镜像并重建容器，约需 30-60 秒。'}
            <br />
            期间后台短暂不可访问，数据、配置、上传文件全部保留。
          </div>

          <div style={{
            background: '#fefce8', border: '1px solid #fde68a',
            padding: '10px 14px', fontSize: 12, color: '#713f12',
            lineHeight: 1.6, marginBottom: 18,
          }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 6 }} />
            升级过程中请勿刷新或关闭此页面。
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              style={{
                height: 38, padding: '0 18px',
                background: 'var(--color-surface, #fff)', color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={runUpgrade}
              style={{
                height: 38, padding: '0 18px',
                background: 'var(--color-primary)', color: '#fff',
                border: '1px solid var(--color-primary)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <i className={`fa-solid ${checkState === 'update' ? 'fa-cloud-arrow-down' : 'fa-arrows-rotate'}`} />
              {checkState === 'update' ? '确认升级' : '确认重新部署'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
