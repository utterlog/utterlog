import type { Context, Hono } from 'hono';
import { currentUserId, optionalAuth } from '../auth/middleware';
import { nowUnix } from '../db/helpers';
import { optionValue } from '../db/options';
import { ok } from '../http/response';
import { ephemeral } from '../store/ephemeral';

const githubOwnerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const githubRepoPattern = /^[A-Za-z0-9._-]+$/;
const githubReservedPaths = new Set([
  'about', 'apps', 'blog', 'collections', 'contact', 'enterprise', 'events', 'explore',
  'features', 'github', 'issues', 'join', 'login', 'marketplace', 'new', 'notifications',
  'orgs', 'organizations', 'pricing', 'pulls', 'search', 'settings', 'sponsors', 'topics', 'trending',
]);

type GitHubProfile = {
  login?: string;
  type?: string;
  name?: string;
  avatar_url?: string;
  html_url?: string;
  bio?: string;
  company?: string;
  location?: string;
  blog?: string;
  public_repos?: number;
  followers?: number;
  following?: number;
  created_at?: string;
};

type GitHubRepo = {
  name?: string;
  full_name?: string;
  html_url?: string;
  description?: string;
  language?: string;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  license?: { spdx_id?: string } | null;
  pushed_at?: string;
  updated_at?: string;
  archived?: boolean;
  fork?: boolean;
};

type CodingRepo = {
  name: string;
  full_name: string;
  html_url: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  open_issues: number;
  license: string;
  pushed_at: string;
  updated_at: string;
  archived: boolean;
  fork: boolean;
  activities?: CodingActivity[];
};

type CodingActivity = {
  type: string;
  label: string;
  repo: string;
  url: string;
  created_at: string;
  created_unix: number;
  count: number;
};

function splitCodingSources(raw: string) {
  return String(raw || '').split(/[\s,，;；]+/).map((value) => value.trim()).filter(Boolean);
}

function extractGitHubOwnerRepo(raw: unknown) {
  let value = String(raw || '').trim().replace(/^@/, '').replace(/\/+$/, '');
  if (!value) return { owner: '', repo: '' };
  if (!value.includes('://') && value.toLowerCase().includes('github.com')) value = `https://${value}`;
  let parts: string[] = [];
  if (value.includes('://')) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return { owner: '', repo: '' };
    }
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'github.com') return { owner: '', repo: '' };
    parts = parsed.pathname.split('/').map((part) => decodeURIComponent(part)).filter(Boolean);
  } else {
    parts = value.split('/').filter(Boolean);
  }
  const owner = String(parts[0] || '').trim();
  let repo = String(parts[1] || '').trim().replace(/\.git$/, '');
  if (!owner || githubReservedPaths.has(owner.toLowerCase()) || !githubOwnerPattern.test(owner)) return { owner: '', repo: '' };
  if (repo && !githubRepoPattern.test(repo)) repo = '';
  return { owner, repo };
}

function parseSelectedRepos(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return new Set<string>();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.map((item) => String(item).toLowerCase()).filter(Boolean));
  } catch {
    // Legacy comma format.
  }
  return new Set(raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean));
}

async function resolveCodingSources() {
  const custom = (await optionValue('coding_github_url', '')).trim();
  if (custom) return { source: 'custom', raw: splitCodingSources(custom) };
  const legacy = (await optionValue('social_github', '')).trim();
  if (legacy) return { source: 'social_github', raw: splitCodingSources(legacy) };
  const socialLinks = (await optionValue('social_links', '')).trim();
  if (!socialLinks) return { source: '', raw: [] as string[] };
  try {
    const links = JSON.parse(socialLinks);
    if (!Array.isArray(links)) return { source: '', raw: [] as string[] };
    return {
      source: 'profile_social_links',
      raw: links
        .filter((item) => `${item?.name || ''} ${item?.icon || ''} ${item?.url || ''}`.toLowerCase().includes('github'))
        .map((item) => String(item?.url || '').trim())
        .filter(Boolean),
    };
  } catch {
    return { source: '', raw: [] as string[] };
  }
}

async function githubHeaders() {
  const token = (await optionValue('github_access_token', '')).trim();
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'Utterlog-Bun',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function githubJson<T>(path: string, timeoutMs = 12000): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: await githubHeaders(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((payload as any).message || `GitHub HTTP ${res.status}`));
  return payload as T;
}

async function githubGraphQL<T>(query: string, variables?: Record<string, unknown>, timeoutMs = 15000): Promise<T> {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      ...(await githubHeaders()),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await res.json().catch(() => ({})) as { data?: T; errors?: { message?: string }[] };
  if (payload.errors?.length) throw new Error(String(payload.errors[0]?.message || 'GitHub GraphQL error'));
  if (!payload.data) throw new Error('GitHub GraphQL 返回为空');
  return payload.data;
}

function dateInSiteTimeZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function rolling365ContributionRange() {
  const timeZone = (await optionValue('site_timezone', 'UTC')).trim() || 'UTC';
  const toDate = dateInSiteTimeZone(new Date(), timeZone);
  const fromAnchor = new Date();
  fromAnchor.setUTCDate(fromAnchor.getUTCDate() - 364);
  const fromDate = dateInSiteTimeZone(fromAnchor, timeZone);
  return {
    timeZone,
    from: `${fromDate}T00:00:00Z`,
    to: `${toDate}T23:59:59Z`,
  };
}

type GitHubContributionCalendar = {
  totalContributions?: number;
  weeks?: { contributionDays?: { date?: string; contributionCount?: number }[] }[];
};

async function fetchGitHubContributionCalendar(login: string) {
  const range = await rolling365ContributionRange();
  const data = await githubGraphQL<{
    user?: {
      contributionsCollection?: {
        contributionCalendar?: GitHubContributionCalendar;
        totalCommitContributions?: number;
        totalIssueContributions?: number;
        totalPullRequestContributions?: number;
        totalPullRequestReviewContributions?: number;
      };
    };
  }>(
    `query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          totalCommitContributions
          totalIssueContributions
          totalPullRequestContributions
          totalPullRequestReviewContributions
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }`,
    { login, from: range.from, to: range.to },
  );
  const collection = data.user?.contributionsCollection;
  const calendar = collection?.contributionCalendar;
  if (!calendar) throw new Error('GitHub 贡献日历为空');
  const dayCounts = new Map<string, number>();
  for (const week of calendar.weeks || []) {
    for (const day of week.contributionDays || []) {
      const date = String(day.date || '');
      if (!date) continue;
      dayCounts.set(date, Number(day.contributionCount || 0));
    }
  }
  const contributions = emptyContributionDays();
  for (const day of contributions) {
    day.count = dayCounts.get(day.date) || 0;
  }
  const yearTotal = Number(calendar.totalContributions || 0);
  const allTotal = [
    collection?.totalCommitContributions,
    collection?.totalIssueContributions,
    collection?.totalPullRequestContributions,
    collection?.totalPullRequestReviewContributions,
  ].reduce((sum, value) => sum + Number(value || 0), 0) || yearTotal;
  return { contributions, yearTotal, allTotal };
}

async function githubAllPublicEvents(owner: string, maxPages = 3) {
  const all: any[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const batch = await githubJson<any[]>(
      `/users/${encodeURIComponent(owner)}/events/public?per_page=100&page=${page}`,
    );
    if (!batch.length) break;
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

async function fetchGitHubFollowingLogins(owner: string, max: number) {
  const configured = (await optionValue('coding_github_following', '')).trim();
  if (configured) {
    try {
      const parsed = JSON.parse(configured);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || '').trim()).filter(Boolean).slice(0, max);
      }
    } catch {
      // fall through to comma split
    }
    return configured.split(/[\s,，;；]+/).map((item) => item.trim()).filter(Boolean).slice(0, max);
  }
  const batch = await githubJson<Array<{ login?: string }>>(
    `/users/${encodeURIComponent(owner)}/following?per_page=${Math.min(max, 100)}`,
  );
  return batch.map((item) => String(item.login || '').trim()).filter(Boolean).slice(0, max);
}

function toCodingRepo(repo: GitHubRepo): CodingRepo {
  return {
    name: String(repo.name || ''),
    full_name: String(repo.full_name || ''),
    html_url: String(repo.html_url || ''),
    description: String(repo.description || ''),
    language: String(repo.language || ''),
    stars: Number(repo.stargazers_count || 0),
    forks: Number(repo.forks_count || 0),
    open_issues: Number(repo.open_issues_count || 0),
    license: repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : '',
    pushed_at: String(repo.pushed_at || ''),
    updated_at: String(repo.updated_at || ''),
    archived: Boolean(repo.archived),
    fork: Boolean(repo.fork),
  };
}

function eventLabel(event: any) {
  const type = String(event.type || '').replace(/Event$/, '');
  if (type === 'Push') return `Pushed ${Array.isArray(event.payload?.commits) ? event.payload.commits.length : 1} commit(s)`;
  if (type === 'PullRequest') return `${event.payload?.action || 'updated'} pull request`;
  if (type === 'Issues') return `${event.payload?.action || 'updated'} issue`;
  if (type === 'IssueComment') return 'Commented on issue';
  if (type === 'Create') return `Created ${event.payload?.ref_type || 'repository'}`;
  if (type === 'Watch') return 'Starred repository';
  if (type === 'Fork') return 'Forked repository';
  return type || 'GitHub activity';
}

function eventUrl(event: any) {
  return String(
    event.payload?.pull_request?.html_url ||
    event.payload?.issue?.html_url ||
    event.payload?.comment?.html_url ||
    (event.repo?.name ? `https://github.com/${event.repo.name}` : ''),
  );
}

function toCodingActivity(event: any): CodingActivity {
  const createdAt = String(event.created_at || '');
  const createdUnix = Math.floor((Date.parse(createdAt) || Date.now()) / 1000);
  const count = event.type === 'PushEvent' && Array.isArray(event.payload?.commits)
    ? Math.max(1, event.payload.commits.length)
    : 1;
  return {
    type: String(event.type || ''),
    label: eventLabel(event),
    repo: String(event.repo?.name || ''),
    url: eventUrl(event),
    created_at: createdAt,
    created_unix: createdUnix,
    count,
  };
}

function eventCode(type: string) {
  const normalized = String(type || '').replace(/Event$/, '').toUpperCase();
  if (normalized.includes('PULLREQUESTREVIEW')) return 'REV';
  if (normalized.includes('PULLREQUEST')) return 'PR';
  if (normalized.includes('ISSUECOMMENT')) return 'CMT';
  if (normalized.includes('ISSUE')) return 'ISS';
  if (normalized.includes('PUSH')) return 'PUSH';
  if (normalized.includes('CREATE')) return 'NEW';
  if (normalized.includes('DELETE')) return 'DEL';
  if (normalized.includes('FORK')) return 'FORK';
  if (normalized.includes('WATCH')) return 'STAR';
  return normalized.slice(0, 4) || 'LOG';
}

function emptyContributionDays(now = new Date()) {
  const days: { date: string; count: number }[] = [];
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let i = 364; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    days.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  return days;
}

function activityDays(events: CodingActivity[], repos: CodingRepo[], selected: Set<string>) {
  const repoMap = new Map(repos.map((repo) => [repo.full_name.toLowerCase(), repo]));
  const hasSelection = selected.size > 0;
  const byDay = new Map<string, { date: string; label: string; total: number; repo_count: number; repos: any[]; repoMap: Map<string, any>; latest: number }>();
  for (const event of events) {
    const repoKey = event.repo.toLowerCase();
    if (hasSelection && !selected.has(repoKey)) continue;
    const date = new Date(event.created_at).toISOString().slice(0, 10);
    if (!byDay.has(date)) byDay.set(date, { date, label: date, total: 0, repo_count: 0, repos: [], repoMap: new Map(), latest: 0 });
    const day = byDay.get(date)!;
    const meta = repoMap.get(repoKey);
    if (!day.repoMap.has(repoKey)) {
      day.repoMap.set(repoKey, {
        name: meta?.name || event.repo.split('/').pop() || event.repo || 'Repository',
        full_name: meta?.full_name || event.repo,
        html_url: meta?.html_url || (event.repo ? `https://github.com/${event.repo}` : ''),
        summary: '',
        counts: {},
        events: [],
        latest: 0,
      });
    }
    const group = day.repoMap.get(repoKey);
    const code = eventCode(event.type);
    group.counts[code] = Number(group.counts[code] || 0) + Math.max(1, event.count || 1);
    if (group.events.length < 5) group.events.push(event);
    group.latest = Math.max(group.latest, event.created_unix);
    day.total += Math.max(1, event.count || 1);
    day.latest = Math.max(day.latest, event.created_unix);
  }
  return Array.from(byDay.values())
    .sort((a, b) => b.latest - a.latest)
    .slice(0, 60)
    .map((day) => {
      const groups = Array.from(day.repoMap.values()).sort((a, b) => b.latest - a.latest);
      return {
        date: day.date,
        label: day.label,
        summary: `${day.total} activities across ${groups.length} repos`,
        total: day.total,
        repo_count: groups.length,
        repos: groups.map(({ latest, ...repo }) => ({ ...repo, summary: Object.entries(repo.counts).map(([k, v]) => `${v} ${k}`).join(' · ') })),
      };
    });
}

async function codingPayload(c: Context) {
  const enabled = (await optionValue('page_coding', 'true')) !== 'false';
  const includeRepos = new URL(c.req.url).searchParams.get('include_repos') === 'true' && currentUserId(c) > 0;
  const { source, raw } = await resolveCodingSources();
  const seenOwners = new Set<string>();
  const sourceRepos = new Set<string>();
  const owners: string[] = [];
  for (const item of raw) {
    const parsed = extractGitHubOwnerRepo(item);
    if (!parsed.owner) continue;
    const ownerKey = parsed.owner.toLowerCase();
    if (!seenOwners.has(ownerKey)) {
      seenOwners.add(ownerKey);
      owners.push(parsed.owner);
    }
    if (parsed.repo) sourceRepos.add(`${parsed.owner}/${parsed.repo}`.toLowerCase());
  }
  if (!owners.length) {
    return {
      enabled,
      configured: false,
      source,
      username: '',
      repos: [],
      events: [],
      activity_days: [],
      contributions: emptyContributionDays(),
      stats: { total_contributions: 0, all_contributions: 0, recent_events: 0, recent_repos: 0, public_repos: 0, followers: 0 },
      updated_at: nowUnix(),
    };
  }
  const optionSelected = parseSelectedRepos(await optionValue('coding_selected_repos', ''));
  const selected = new Set([...sourceRepos, ...optionSelected]);
  const cacheKey = `coding:v5:${owners.join(',').toLowerCase()}:${Array.from(selected).sort().join(',')}:${includeRepos ? 'with-repos' : 'public'}`;
  const cached = await ephemeral.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const profiles: GitHubProfile[] = [];
  const allRepos = new Map<string, CodingRepo>();
  const events: CodingActivity[] = [];
  let firstError = '';
  let contributions = emptyContributionDays();
  let yearContributions = 0;
  let allContributions = 0;
  for (const owner of owners) {
    try {
      const [profile, reposRaw, eventsRaw, contributionData] = await Promise.all([
        githubJson<GitHubProfile>(`/users/${encodeURIComponent(owner)}`),
        githubJson<GitHubRepo[]>(`/users/${encodeURIComponent(owner)}/repos?per_page=100&sort=updated`),
        githubAllPublicEvents(owner),
        fetchGitHubContributionCalendar(owner).catch(() => null),
      ]);
      profiles.push(profile);
      for (const repo of reposRaw) {
        const item = toCodingRepo(repo);
        if (item.full_name) allRepos.set(item.full_name.toLowerCase(), item);
      }
      events.push(...eventsRaw.map(toCodingActivity));
      if (contributionData) {
        for (let i = 0; i < contributions.length; i++) {
          contributions[i].count += contributionData.contributions[i]?.count || 0;
        }
        yearContributions += contributionData.yearTotal;
        allContributions += contributionData.allTotal;
      }
    } catch (err) {
      firstError ||= err instanceof Error ? err.message : 'GitHub 数据读取失败';
    }
  }
  const includeFollowing = (await optionValue('coding_include_following', 'true')) !== 'false';
  const followingMax = Math.min(30, Math.max(0, Number(await optionValue('coding_github_following_max', '20')) || 20));
  if (includeFollowing && owners[0]) {
    const ownerKeys = new Set(owners.map((owner) => owner.toLowerCase()));
    const followingLogins = await fetchGitHubFollowingLogins(owners[0], followingMax).catch(() => [] as string[]);
    for (const login of followingLogins) {
      if (ownerKeys.has(login.toLowerCase())) continue;
      try {
        const followingEvents = await githubAllPublicEvents(login);
        events.push(...followingEvents.map(toCodingActivity));
      } catch {
        // skip one following user
      }
    }
  }
  if (!yearContributions) {
    const dayIndex = new Map(contributions.map((day, index) => [day.date, index]));
    for (const event of events) {
      const date = new Date(event.created_at).toISOString().slice(0, 10);
      const idx = dayIndex.get(date);
      if (idx !== undefined) contributions[idx].count += Math.max(1, event.count || 1);
    }
    yearContributions = contributions.reduce((sum, day) => sum + day.count, 0);
    allContributions = yearContributions;
  }
  const repos = Array.from(allRepos.values()).sort((a, b) => String(b.pushed_at || b.updated_at).localeCompare(String(a.pushed_at || a.updated_at)));
  const hasSelection = selected.size > 0;
  const displayRepos = repos
    .filter((repo) => !hasSelection || selected.has(repo.full_name.toLowerCase()))
    .slice(0, 12)
    .map((repo) => ({ ...repo, activities: events.filter((event) => event.repo.toLowerCase() === repo.full_name.toLowerCase()).slice(0, 5) }));
  const payload = {
    enabled,
    configured: true,
    source,
    username: owners.join(','),
    profile: profiles[0] || null,
    profiles,
    repos: displayRepos,
    available_repos: includeRepos ? repos : undefined,
    events: events.sort((a, b) => b.created_unix - a.created_unix).slice(0, 200),
    activity_days: activityDays(events, repos, new Set()),
    contributions,
    stats: {
      total_contributions: yearContributions,
      all_contributions: allContributions,
      recent_events: events.length,
      recent_repos: displayRepos.length,
      public_repos: repos.length,
      followers: profiles.reduce((sum, profile) => sum + Number(profile.followers || 0), 0),
    },
    updated_at: nowUnix(),
    error: firstError || undefined,
  };
  await ephemeral.set(cacheKey, JSON.stringify(payload), firstError ? 300 : 3600);
  return payload;
}

export function registerCodingRoutes(app: Hono) {
  app.get('/api/v1/coding', optionalAuth, async (c) => ok(c, await codingPayload(c)));
}
