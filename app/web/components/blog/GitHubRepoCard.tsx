'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useThemeContext } from '@/lib/theme-context';
import { formatDateInTimeZone } from '@/lib/timezone';

interface GitHubRepoCardProps {
  owner: string;
  repo: string;
  url?: string;
}

interface GitHubRepoData {
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  pushed_at: string | null;
  license?: {
    spdx_id?: string;
  } | null;
  owner?: {
    avatar_url?: string;
  } | null;
}

interface GitHubReleaseData {
  tag_name?: string;
  name?: string;
}

interface GitHubTagData {
  name?: string;
}

type GitHubLanguagesData = Record<string, number>;

const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Go: '#00add8',
  Rust: '#dea584',
  Python: '#3572a5',
  PHP: '#4f5d95',
  Java: '#b07219',
  Kotlin: '#a97bff',
  Swift: '#f05138',
  Ruby: '#701516',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  Shell: '#89e051',
  Dockerfile: '#384d54',
  Dart: '#00b4ab',
  Elixir: '#6e4a7e',
  Lua: '#000080',
  Zig: '#ec915c',
};

function getLanguageColor(language?: string | null) {
  if (!language) return '#94a3b8';
  return LANGUAGE_COLORS[language] || '#64748b';
}

async function loadRepoVersion(owner: string, repo: string, signal: AbortSignal) {
  const encodedOwner = encodeURIComponent(owner);
  const encodedRepo = encodeURIComponent(repo);
  const headers = { Accept: 'application/vnd.github+json' };
  const releaseResp = await fetch(`https://api.github.com/repos/${encodedOwner}/${encodedRepo}/releases/latest`, { headers, signal });
  if (releaseResp.ok) {
    const release = await releaseResp.json() as GitHubReleaseData;
    return release.tag_name || release.name || '';
  }

  const tagsResp = await fetch(`https://api.github.com/repos/${encodedOwner}/${encodedRepo}/tags?per_page=1`, { headers, signal });
  if (!tagsResp.ok) return '';
  const tags = await tagsResp.json() as GitHubTagData[];
  return tags[0]?.name || '';
}

async function loadRepoLanguages(owner: string, repo: string, signal: AbortSignal) {
  const encodedOwner = encodeURIComponent(owner);
  const encodedRepo = encodeURIComponent(repo);
  const response = await fetch(`https://api.github.com/repos/${encodedOwner}/${encodedRepo}/languages`, {
    headers: { Accept: 'application/vnd.github+json' },
    signal,
  });
  if (!response.ok) return {};
  return await response.json() as GitHubLanguagesData;
}

function formatCount(value?: number) {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

function formatDate(value: string | null | undefined, timeZone: string) {
  if (!value) return '';
  return formatDateInTimeZone(value, 'zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }, timeZone);
}

export default function GitHubRepoCard({ owner, repo, url }: GitHubRepoCardProps) {
  const { timeZone } = useThemeContext();
  const cleanOwner = String(owner || '').trim();
  const cleanRepo = String(repo || '').trim().replace(/\.git$/i, '');
  const fallbackUrl = url || `https://github.com/${cleanOwner}/${cleanRepo}`;
  const [data, setData] = useState<GitHubRepoData | null>(null);
  const [failed, setFailed] = useState(false);
  const [readyToFetch, setReadyToFetch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState('');
  const [languages, setLanguages] = useState<GitHubLanguagesData>({});

  useEffect(() => {
    if (!cleanOwner || !cleanRepo) {
      setFailed(true);
      return;
    }

    setReadyToFetch(false);
    setLoading(false);
    setFailed(false);
    setData(null);
    setVersion('');
    setLanguages({});

    let settled = false;
    const release = () => {
      if (settled) return;
      settled = true;
      setReadyToFetch(true);
    };

    if (document.readyState === 'complete') {
      const id = window.setTimeout(release, 0);
      return () => {
        settled = true;
        window.clearTimeout(id);
      };
    }

    const fallback = window.setTimeout(release, 5000);
    window.addEventListener('load', release, { once: true });

    return () => {
      settled = true;
      window.clearTimeout(fallback);
      window.removeEventListener('load', release);
    };
  }, [cleanOwner, cleanRepo]);

  useEffect(() => {
    if (!readyToFetch) return;
    if (!cleanOwner || !cleanRepo) {
      setFailed(true);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setFailed(false);
    setData(null);
    setVersion('');
    setLanguages({});

    const encodedOwner = encodeURIComponent(cleanOwner);
    const encodedRepo = encodeURIComponent(cleanRepo);

    fetch(`https://api.github.com/repos/${encodedOwner}/${encodedRepo}`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    })
      .then(response => {
        if (!response.ok) throw new Error(`GitHub API ${response.status}`);
        return response.json();
      })
      .then((repoData: GitHubRepoData) => {
        if (active) setData(repoData);
      })
      .catch(error => {
        if (active && error?.name !== 'AbortError') setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    loadRepoVersion(cleanOwner, cleanRepo, controller.signal)
      .then(repoVersion => {
        if (active) setVersion(repoVersion);
      })
      .catch(error => {
        if (error?.name !== 'AbortError' && active) setVersion('');
      });

    loadRepoLanguages(cleanOwner, cleanRepo, controller.signal)
      .then(repoLanguages => {
        if (active) setLanguages(repoLanguages);
      })
      .catch(error => {
        if (error?.name !== 'AbortError' && active) setLanguages({});
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [readyToFetch, cleanOwner, cleanRepo]);

  const fullName = data?.full_name || `${cleanOwner}/${cleanRepo}`;
  const href = data?.html_url || fallbackUrl;
  const waiting = !readyToFetch && !data && !failed;
  const languageColor = getLanguageColor(data?.language);
  const avatarSrc = data?.owner?.avatar_url || '';
  const languageEntries = Object.entries(languages)
    .filter(([, bytes]) => bytes > 0)
    .sort((a, b) => b[1] - a[1]);
  const languageTotal = languageEntries.reduce((sum, [, bytes]) => sum + bytes, 0);
  const languageSegments = languageEntries.length > 0 && languageTotal > 0
    ? languageEntries.map(([name, bytes]) => ({
      name,
      width: (bytes / languageTotal) * 100,
      color: getLanguageColor(name),
    }))
    : [{
      name: data?.language || '',
      width: 100,
      color: languageColor,
    }];
  const description = data?.description || (failed
    ? '无法读取 GitHub 仓库信息，点击打开仓库页面。'
    : loading
      ? '正在读取 GitHub 仓库信息…'
      : '页面加载完成后异步读取仓库信息。');

  return (
    <a
      className="github-repo-card"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ '--github-language-color': languageColor } as CSSProperties}
    >
      <div className="github-repo-card__content">
        <div className="github-repo-card__kicker">
          <i className="fa-brands fa-github" aria-hidden="true" />
          <span>GitHub</span>
        </div>
        <div className="github-repo-card__title">{fullName}</div>
        <p className="github-repo-card__desc">{description}</p>
        {loading ? (
          <div className="github-repo-card__loading" aria-live="polite">
            <span className="github-repo-card__spinner" aria-hidden="true" />
            <span>正在读取仓库信息</span>
          </div>
        ) : data ? (
          <div className="github-repo-card__meta">
            {data?.language && <span><i className="fa-solid fa-code" aria-hidden="true" />{data.language}</span>}
            {version && <span><i className="fa-solid fa-tag" aria-hidden="true" />{version}</span>}
            <span><i className="fa-regular fa-star" aria-hidden="true" />{formatCount(data?.stargazers_count)}</span>
            <span><i className="fa-solid fa-code-fork" aria-hidden="true" />{formatCount(data?.forks_count)}</span>
            {!!data?.open_issues_count && <span><i className="fa-regular fa-circle-dot" aria-hidden="true" />{formatCount(data.open_issues_count)}</span>}
            {data?.license?.spdx_id && data.license.spdx_id !== 'NOASSERTION' && <span>{data.license.spdx_id}</span>}
            {data?.pushed_at && <span>{formatDate(data.pushed_at, timeZone)}</span>}
          </div>
        ) : (
          <div className="github-repo-card__status">
            <i className={failed ? 'fa-solid fa-circle-exclamation' : 'fa-regular fa-clock'} aria-hidden="true" />
            <span>{failed ? '点击打开仓库页面' : waiting ? '页面加载后读取' : '等待读取仓库信息'}</span>
          </div>
        )}
      </div>
      <div
        className="github-repo-card__visual"
        aria-hidden="true"
      >
        <div className="github-repo-card__avatar-shell">
          {avatarSrc ? (
            <img className="github-repo-card__avatar" src={avatarSrc} alt="" loading="lazy" />
          ) : (
            <i className="fa-brands fa-github" aria-hidden="true" />
          )}
        </div>
      </div>
      <div className="github-repo-card__language-bar" aria-hidden="true">
        {languageSegments.map(segment => (
          <span
            key={segment.name || 'unknown'}
            title={segment.name}
            style={{
              width: `${segment.width}%`,
              background: segment.color,
            }}
          />
        ))}
      </div>
    </a>
  );
}
