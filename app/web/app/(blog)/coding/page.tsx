import type { Metadata } from 'next';
import PageTitle from '@/components/blog/PageTitle';
import { getCoding } from '@/lib/blog-api';
import { getThemeContextData } from '@/lib/theme-data';
import { formatDateInTimeZone, formatDateTimeInTimeZone, datePartsInTimeZone, isValidTimeZone } from '@/lib/timezone';

export const metadata: Metadata = { title: 'Coding' };

type CodingProfile = {
  login?: string;
  name?: string;
  avatar_url?: string;
  html_url?: string;
  bio?: string;
  location?: string;
  public_repos?: number;
  followers?: number;
};

type CodingRepo = {
  name?: string;
  full_name?: string;
  html_url?: string;
  description?: string;
  language?: string;
  stars?: number;
  forks?: number;
  open_issues?: number;
  license?: string;
  pushed_at?: string;
  archived?: boolean;
  fork?: boolean;
  activities?: CodingActivity[];
};

type CodingActivity = {
  type?: string;
  label?: string;
  repo?: string;
  url?: string;
  created_at?: string;
  created_unix?: number;
  count?: number;
};

type CodingActivityRepoGroup = {
  name?: string;
  full_name?: string;
  html_url?: string;
  summary?: string;
  counts?: Record<string, number>;
  events?: CodingActivity[];
};

type CodingActivityDayGroup = {
  date?: string;
  label?: string;
  summary?: string;
  total?: number;
  repo_count?: number;
  repos?: CodingActivityRepoGroup[];
};

type CodingDay = {
  date: string;
  count: number;
};

type CodingData = {
  enabled?: boolean;
  configured?: boolean;
  source?: string;
  username?: string;
  profile?: CodingProfile;
  profiles?: CodingProfile[];
  repos?: CodingRepo[];
  events?: CodingActivity[];
  activity_days?: CodingActivityDayGroup[];
  contributions?: CodingDay[];
  stats?: {
    total_contributions?: number;
    all_contributions?: number;
    recent_events?: number;
    recent_repos?: number;
    public_repos?: number;
    followers?: number;
  };
  updated_at?: number;
  error?: string;
};

function formatCount(value?: number) {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

function formatDate(value?: string | number, timeZone: string = 'UTC') {
  if (!value) return '';
  return formatDateInTimeZone(value, 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }, timeZone);
}

function formatTime(value?: string, timeZone: string = 'UTC') {
  if (!value) return '';
  return formatDateTimeInTimeZone(value, 'zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }, timeZone);
}

function eventCode(type?: string) {
  const normalized = String(type || '').replace(/Event$/, '').toUpperCase();
  if (normalized.includes('PULLREQUESTREVIEW')) return 'REV';
  if (normalized.includes('PULLREQUEST')) return 'PR';
  if (normalized.includes('ISSUECOMMENT')) return 'CMT';
  if (normalized.includes('ISSUE')) return 'ISS';
  if (normalized === 'COMMIT') return 'COM';
  if (normalized.includes('PUSH')) return 'PUSH';
  if (normalized.includes('CREATE')) return 'NEW';
  if (normalized.includes('DELETE')) return 'DEL';
  if (normalized.includes('FORK')) return 'FORK';
  if (normalized.includes('WATCH')) return 'STAR';
  return normalized.slice(0, 4) || 'LOG';
}

function eventCodeClass(code: string) {
  return `code-${String(code || 'log').toLowerCase().replace(/[^a-z0-9-]/g, '')}`;
}

const EVENT_CODE_ORDER = ['PUSH', 'COM', 'CMT', 'PR', 'REV', 'ISS', 'NEW', 'DEL', 'FORK', 'STAR'];

function eventCountEntries(counts?: Record<string, number>) {
  const source = counts || {};
  const known = EVENT_CODE_ORDER
    .filter(code => Number(source[code] || 0) > 0)
    .map(code => [code, Number(source[code])] as const);
  const rest = Object.entries(source)
    .filter(([code, count]) => !EVENT_CODE_ORDER.includes(code) && Number(count) > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, count]) => [code, Number(count)] as const);
  return [...known, ...rest];
}

function displayLogRepoName(repo: CodingActivityRepoGroup) {
  const fullName = String(repo.full_name || '').trim();
  if (fullName) return fullName;
  return String(repo.name || 'Repository');
}

function contributionLevel(count: number) {
  if (count >= 8) return 4;
  if (count >= 4) return 3;
  if (count >= 2) return 2;
  if (count >= 1) return 1;
  return 0;
}

function contributionCells(days: CodingDay[]) {
  if (!days.length) return [];
  const first = new Date(`${days[0].date}T00:00:00Z`);
  const blanks = Number.isNaN(first.getTime()) ? 0 : first.getUTCDay();
  return [...Array.from({ length: blanks }, () => null), ...days];
}

function contributionWeeks(days: CodingDay[]) {
  const cells = contributionCells(days);
  const weeks: Array<Array<CodingDay | null>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

function todayContributionCount(days: CodingDay[], timeZone: string) {
  // "今天"按站点时区切日 —— 后端 contribution builder 也按 site_tz
  // 生成日期键，两边对齐才能让最右
  // 一格的 count 在跨午夜 / 跨时区时不偏移。
  const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const t = datePartsInTimeZone(new Date(), tz);
  const today = `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
  return days.find(day => day.date === today)?.count || 0;
}

function contributionYear(days: CodingDay[]) {
  const lastDay = days.length ? days[days.length - 1]?.date : '';
  const year = String(lastDay || '').slice(0, 4);
  return /^\d{4}$/.test(year) ? year : String(new Date().getFullYear());
}

// 把活动日分成「最近 3 天 / 本周（除最近 3 天外）/ 更早」三段。
//   - 最近 3 天 = 今天 + 昨天 + 前天
//   - 本周 = 本周一 0:00 之后，但不在最近 3 天范围内
//   - 更早 = 本周一之前
// 周一作为本周起点，符合中国日历习惯；如果今天是周日 / 周一这种边界
// 情况，本周组可能为空，渲染时会自动隐藏对应小标题。
type ActivityBucket = {
  key: 'recent' | 'thisWeek' | 'older';
  title: string;
  hint: string;
  days: CodingActivityDayGroup[];
};
function groupActivityDays(days: CodingActivityDayGroup[], timeZone: string): ActivityBucket[] {
  // 把"今天"按站点时区取，避免服务器或浏览器本地时区让边界飘动。
  const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const today = datePartsInTimeZone(new Date(), tz);
  const todayStr = `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;
  const todayUTC = new Date(`${todayStr}T00:00:00Z`);
  const threeDaysAgoUTC = new Date(todayUTC);
  threeDaysAgoUTC.setUTCDate(todayUTC.getUTCDate() - 2); // 含今天的 3 个自然日

  // 周一 = 站点时区今天往前 (dow+6)%7 天，dow 0=Sun..6=Sat。
  const dow = todayUTC.getUTCDay();
  const daysFromMonday = (dow + 6) % 7;
  const mondayUTC = new Date(todayUTC);
  mondayUTC.setUTCDate(todayUTC.getUTCDate() - daysFromMonday);

  const dayKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const recentSet = new Set<string>();
  const weekSet = new Set<string>();
  for (let i = 0; i < 3; i++) {
    const d = new Date(threeDaysAgoUTC);
    d.setUTCDate(threeDaysAgoUTC.getUTCDate() + i);
    recentSet.add(dayKey(d));
  }
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayUTC);
    d.setUTCDate(mondayUTC.getUTCDate() + i);
    if (d > todayUTC) break;
    weekSet.add(dayKey(d));
  }

  const recent: CodingActivityDayGroup[] = [];
  const thisWeek: CodingActivityDayGroup[] = [];
  const older: CodingActivityDayGroup[] = [];
  for (const day of days) {
    const key = String(day.date || '');
    if (!key) { older.push(day); continue; }
    if (recentSet.has(key)) recent.push(day);
    else if (weekSet.has(key)) thisWeek.push(day);
    else older.push(day);
  }
  return [
    { key: 'recent', title: '最近 3 天', hint: 'Last 3 days', days: recent },
    { key: 'thisWeek', title: '本周', hint: 'This week', days: thisWeek },
    { key: 'older', title: '更早', hint: 'Earlier', days: older },
  ];
}

function codingAccountTitle(profiles: CodingProfile[], username: string) {
  const logins = profiles.length
    ? profiles.map(item => item.login).filter(Boolean)
    : String(username || '').split(',').map(item => item.trim()).filter(Boolean);
  if (!logins.length) return '@github';
  return logins.map(item => `@${String(item).replace(/^@+/, '')}`).join(' / ');
}

function codingProfileURL(profile: CodingProfile, profiles: CodingProfile[], username: string) {
  if (profile.html_url) return profile.html_url;
  const firstProfile = profiles.find(item => item.html_url || item.login);
  if (firstProfile?.html_url) return firstProfile.html_url;
  if (firstProfile?.login) return `https://github.com/${firstProfile.login}`;
  const firstUsername = String(username || '').split(',').map(item => item.trim()).filter(Boolean)[0];
  return firstUsername ? `https://github.com/${firstUsername.replace(/^@+/, '')}` : '';
}

export default async function CodingPage() {
  const [res, ctx] = await Promise.all([
    getCoding().catch(() => ({ data: {} } as any)),
    getThemeContextData().catch(() => null),
  ]);
  const timeZone = ctx?.timeZone || 'UTC';
  const data = (res?.data || {}) as CodingData;
  const profile = data.profile || {};
  const profiles = Array.isArray(data.profiles) ? data.profiles.filter(item => item?.login) : [];
  const username = data.username || profile.login || '';
  const activityDays = Array.isArray(data.activity_days) ? data.activity_days : [];
  const activityBuckets = groupActivityDays(activityDays, timeZone).filter(b => b.days.length > 0);
  // 热力图改成 rolling 365 天：以"今天"为最后一格，往前 1 整年（含
   // 当周到周日补齐一列）。GitHub 风格 —— 不再以"自然年 1/1 到 12/31"
   // 排版（那种排法 5 月会落在中间，跟 GitHub 的"今天在最右"习惯不符）。
   const allDays = Array.isArray(data.contributions) ? data.contributions : [];
   const rollingDays = (() => {
     if (!allDays.length) return allDays;
     // "今天"按站点时区取，跟后端 rolling365Range（site_tz）对齐；
     // 否则边界格子在跨午夜的访客那里会偏移一天。
     const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
     const t = datePartsInTimeZone(new Date(), tz);
     const todayISO = `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
     const cutoff = new Date(`${todayISO}T00:00:00Z`);
     cutoff.setUTCDate(cutoff.getUTCDate() - 364);
     const cutoffISO = cutoff.toISOString().slice(0, 10);
     return allDays.filter((d) => d.date >= cutoffISO && d.date <= todayISO);
   })();
  const days = rollingDays;
  const weeks = contributionWeeks(days);
  const todayContributions = todayContributionCount(days, timeZone);
  const heatmapYear = contributionYear(days);
  const stats = data.stats || {};
  const profileSummary = profiles.length > 1
    ? profiles.map(item => item.name || item.login).filter(Boolean).join(' / ')
    : (profile.bio || 'Public coding activity, repositories and recent shipping rhythm.');
  const updatedAt = formatDate(data.updated_at, timeZone);
  const titleText = codingAccountTitle(profiles, username);
  const titleURL = codingProfileURL(profile, profiles, username);
  const heatmapAvatar = profile.avatar_url || profiles.find(item => item.avatar_url)?.avatar_url || '';
  const titleStats = [
    { label: 'total contributions', value: stats.all_contributions ?? stats.total_contributions },
    { label: 'public repos', value: stats.public_repos },
    { label: 'followers', value: stats.followers },
  ];

  return (
    <div className="coding-page">
      <PageTitle
        title={titleURL ? (
          <a href={titleURL} target="_blank" rel="noopener noreferrer" className="coding-title-link">
            {titleText}
          </a>
        ) : titleText}
        icon="fa-brands fa-github"
        subtitle={profileSummary}
        className="coding-page-title"
        meta={titleStats.map((item) => (
          <span className="blog-page-title-stat coding-title-stat" key={item.label}>
            <strong>{formatCount(item.value)}</strong>
            <span>{item.label}</span>
          </span>
        ))}
      />

      <section className="coding-hero">
        <div className="coding-hero-copywrap">
          <h2 className="coding-hero-title">
            <span>代码持续生长。</span>
            <em>Code keeps moving, one commit at a time.</em>
          </h2>
          <p className="coding-hero-copy">
            <span>记录仓库、贡献热力和最近构建动态。</span>
            <span>A quiet journal of repositories, contributions, and recent shipping activity.</span>
          </p>
        </div>
        <div className="coding-hero-aside" aria-label="Coding summary">
          <span>Today</span>
          <strong>{formatCount(todayContributions)}</strong>
          <small>contributions</small>
        </div>
      </section>

      {data.enabled === false && (
        <div className="coding-notice">
          <i className="fa-regular fa-circle-info" aria-hidden="true" />
          <span>Coding 页面尚未启用，可在后台「页面」中开启。</span>
        </div>
      )}

      {!data.configured && (
        <div className="coding-notice">
          <i className="fa-regular fa-circle-info" aria-hidden="true" />
          <span>未配置 GitHub 地址。可在后台「页面 → Coding」填写；留空时会自动读取个人资料里的 GitHub 社交链接。</span>
        </div>
      )}

      {data.error && (
        <div className="coding-notice">
          <i className="fa-regular fa-triangle-exclamation" aria-hidden="true" />
          <span>GitHub 数据暂时无法刷新：{data.error}</span>
        </div>
      )}

      {data.configured && (
        <>
          <section className="coding-section coding-heatmap-section">
            <div className="coding-section-head">
              <div>
                <span>§ 01 · ACTIVITY</span>
                <h3>GitHub — <em>contribution rhythm</em></h3>
              </div>
              <div className="coding-heatmap-side">
                {heatmapAvatar ? (
                  <img
                    src={heatmapAvatar}
                    alt=""
                    className="coding-heatmap-avatar"
                    title={updatedAt ? `updated ${updatedAt}` : 'GitHub'}
                  />
                ) : updatedAt ? (
                  <time>updated {updatedAt}</time>
                ) : null}
              </div>
            </div>
            <div className="coding-heatmap-scroll">
              {/* 布局走 globals.css 的 flex（53 周等分父级宽度），不再
                  inline 设 gridTemplateColumns —— 之前是 display: grid
                  时代的遗物，现在 flex 下无效，留着只会让人误以为还在
                  用 grid。CSS 单一来源，跨主题一致。 */}
              <div
                className="coding-heatmap"
                aria-label="GitHub activity heatmap"
              >
                {weeks.map((week, weekIndex) => (
                  <span className="coding-heatmap-week" key={`week-${weekIndex}`}>
                    {week.map((day, dayIndex) => (
                      <span
                        key={day?.date || `blank-${weekIndex}-${dayIndex}`}
                        className={`coding-heatmap-cell level-${day ? contributionLevel(day.count) : 'blank'}`}
                        title={day ? `${day.date}: ${day.count}` : undefined}
                      />
                    ))}
                  </span>
                ))}
              </div>
            </div>
            <div className="coding-heatmap-legend">
              <span>Less</span>
              {[0, 1, 2, 3, 4].map((level) => <i key={level} className={`level-${level}`} />)}
              <span>More · {formatCount(stats.total_contributions)} contributions in {heatmapYear}</span>
            </div>
          </section>

          <section className="coding-section coding-log-section">
            <div className="coding-section-head compact">
              <div>
                <span>§ 02 · SHIPPING LOG</span>
                <h3>Daily repository activity</h3>
              </div>
            </div>
            <div className="coding-log">
              {activityBuckets.length === 0 ? (
                <div className="coding-empty">暂无最近 GitHub 动态。</div>
              ) : activityBuckets.map((bucket) => (
                <div className={`coding-log-bucket coding-log-bucket-${bucket.key}`} key={bucket.key}>
                  <div className="coding-log-bucket-head">
                    <strong>{bucket.title}</strong>
                    <span>· {bucket.hint} · {bucket.days.length} day{bucket.days.length === 1 ? '' : 's'}</span>
                  </div>
                  {bucket.days.map((day) => {
                    const dayRepos = Array.isArray(day.repos) ? day.repos : [];
                    return (
                      <section className="coding-log-day" key={day.date || day.label}>
                        <header className="coding-log-day-head">
                          <div className="coding-log-day-kicker">
                            <strong>{day.label || formatDate(day.date, timeZone)}</strong>
                            <span>· {formatCount(day.total)} ACROSS {formatCount(day.repo_count)} REPOS</span>
                          </div>
                          {day.date && <time>{formatDate(day.date, timeZone)}</time>}
                        </header>
                        <div className="coding-log-repos">
                          {dayRepos.map((repo) => {
                            const events = Array.isArray(repo.events) ? repo.events : [];
                            const counts = eventCountEntries(repo.counts);
                            return (
                              <article className="coding-log-repo" key={`${day.date}-${repo.full_name || repo.name}`}>
                                <a href={repo.html_url || '#'} target="_blank" rel="noopener noreferrer" className="coding-log-repo-head">
                                  <span className="coding-log-repo-name">{displayLogRepoName(repo)}</span>
                                  <span className="coding-log-counts">
                                    {counts.map(([code, count]) => (
                                      <span className={`coding-event-code ${eventCodeClass(code)}`} key={code}>{formatCount(count)} {code}</span>
                                    ))}
                                  </span>
                                </a>
                                <div className="coding-log-events">
                                  {events.length === 0 ? (
                                    <div className="coding-project-empty">暂无最近动作。</div>
                                  ) : events.map((event, index) => {
                                    const code = eventCode(event.type);
                                    return (
                                      <a href={event.url || repo.html_url || '#'} target="_blank" rel="noopener noreferrer" className="coding-event" key={`${event.created_at}-${index}`}>
                                        <span className={`coding-event-code ${eventCodeClass(code)}`}>{code}</span>
                                        <span className="coding-event-text">
                                          <em>{event.label}</em>
                                        </span>
                                        <time>{formatTime(event.created_at, timeZone)}</time>
                                      </a>
                                    );
                                  })}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
