import { createHash } from 'node:crypto';
import { config, table } from '../config';
import { many } from '../db/helpers';
import { readResolvedOptionMap } from '../services/options';

async function optionMap(includeSensitive: boolean) {
  return readResolvedOptionMap(includeSensitive);
}

function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
}

function xmlEscape(value: string) {
  return htmlEscape(value);
}

function boolOptionValue(value: unknown, fallback = true) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'off', 'no'].includes(normalized)) return false;
    if (['true', '1', 'on', 'yes'].includes(normalized)) return true;
  }
  return fallback;
}

function siteOrigin(opts: Record<string, string>) {
  return String(opts.site_url || config.appUrl || '').replace(/\/+$/, '');
}

function oneLine(value: string, limit = 240) {
  let text = String(value || '').trim().replace(/\r?\n/g, ' ');
  while (text.includes('  ')) text = text.replaceAll('  ', ' ');
  return [...text].length > limit ? `${[...text].slice(0, limit).join('')}...` : text;
}

const RSS_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function parseNaiveWallClock(text: string, timeZone: string): Date | null {
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4] ?? 0);
  const mi = Number(m[5] ?? 0);
  const s = Number(m[6] ?? 0);
  const target = Date.UTC(y, mo - 1, d, h, mi, s);
  if (!timeZone || timeZone === 'UTC') return new Date(target);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  let ts = target;
  for (let i = 0; i < 4; i++) {
    const parts = formatter.formatToParts(new Date(ts));
    const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
    const got = Date.UTC(pick('year'), pick('month') - 1, pick('day'), pick('hour'), pick('minute'), pick('second'));
    const diff = target - got;
    if (diff === 0) break;
    ts += diff;
  }
  return new Date(ts);
}

function parsePostPublishedDate(
  post: { published_at?: unknown; created_at?: unknown },
  timeZone = 'UTC',
): Date {
  const raw = post.published_at ?? post.created_at ?? 0;
  if (typeof raw === 'number' || /^\d+$/.test(String(raw))) {
    const n = Number(raw);
    const date = new Date(n > 1e9 && n < 1e10 ? n * 1000 : n);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const text = String(raw).trim();
  if (!text) return new Date();
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const naive = parseNaiveWallClock(text, timeZone);
  if (naive) return naive;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatTimezoneOffset(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(date);
  const tzName = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT';
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return '+0000';
  const sign = match[1];
  const hh = String(match[2]).padStart(2, '0');
  const mm = String(match[3] || '00').padStart(2, '0');
  return `${sign}${hh}${mm}`;
}

function formatRfc822InTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || '00';
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  const month = RSS_MONTHS[Number(pick('month')) - 1] || 'Jan';
  const offset = formatTimezoneOffset(date, timeZone);
  return `${weekday}, ${pick('day')} ${month} ${pick('year')} ${pick('hour')}:${pick('minute')}:${pick('second')} ${offset}`;
}

function formatIso8601Date(date: Date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function postDateParts(
  post: { published_at?: unknown; created_at?: unknown },
  timeZone = 'UTC',
) {
  const date = parsePostPublishedDate(post, timeZone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    iso: date.toISOString(),
  };
}

function formatRssPubDate(
  post: { published_at?: unknown; created_at?: unknown },
  timeZone = 'UTC',
) {
  return formatRfc822InTimeZone(parsePostPublishedDate(post, timeZone), timeZone);
}

function rssItemLimit(opts: Record<string, string>) {
  const configured = Number(String(opts.rss_items || '').trim());
  if (Number.isFinite(configured) && configured > 0) return Math.min(100, Math.max(1, Math.floor(configured)));
  return 20;
}

function cdata(value: string) {
  return `<![CDATA[${String(value || '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

async function loadPublishedPostsForFeed(limit = 50) {
  return many<Record<string, unknown>>(
    `select p.id, p.slug, p.display_id, p.title, p.excerpt, p.content, p.created_at, p.published_at,
            coalesce((
              select m.slug from ${table('relationships')} r
              join ${table('metas')} m on m.id = r.meta_id and m.type = 'category'
              where r.post_id = p.id order by m.id asc limit 1
            ), '') as category_slug
     from ${table('posts')} p
     where p.status = 'publish' and p.type = 'post'
     order by coalesce(p.published_at, to_timestamp(p.created_at)) desc nulls last, p.id desc
     limit $1`,
    [limit],
  ).catch(() => []);
}

function buildRssFeedXml(opts: Record<string, string>, posts: Record<string, unknown>[]) {
  const site = siteOrigin(opts);
  const timeZone = String(opts.site_timezone || 'UTC').trim() || 'UTC';
  const channelTitle = String(opts.site_title || 'Utterlog').trim() || 'Utterlog';
  const channelDescription = String(opts.site_description || opts.seo_default_description || channelTitle).trim();
  const permalink = opts.permalink_structure || '/posts/%postname%';
  const feedUrl = `${site}/feed`;
  const now = new Date();
  const lastBuildDate = formatRfc822InTimeZone(now, timeZone);
  const items = posts.map((post) => {
    const path = buildPostPath(post, permalink, timeZone);
    const link = `${site}${path}`;
    const guid = `${site}/?p=${post.id}`;
    const publishedAt = parsePostPublishedDate(post, timeZone);
    const description = oneLine(String(post.excerpt || post.content || '').trim(), 500);
    return [
      '  <item>',
      `    <title>${cdata(String(post.title || ''))}</title>`,
      `    <link>${xmlEscape(link)}</link>`,
      `    <guid isPermaLink="false">${xmlEscape(guid)}</guid>`,
      `    <pubDate>${formatRssPubDate(post, timeZone)}</pubDate>`,
      `    <dc:date>${formatIso8601Date(publishedAt)}</dc:date>`,
      `    <description>${cdata(description)}</description>`,
      '  </item>',
    ].join('\n');
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<title>${xmlEscape(channelTitle)}</title>
<link>${xmlEscape(site)}</link>
<description>${xmlEscape(channelDescription)}</description>
<language>zh-CN</language>
<lastBuildDate>${lastBuildDate}</lastBuildDate>
<ttl>60</ttl>
<atom:link href="${xmlEscape(feedUrl)}" rel="self" type="application/rss+xml"/>
${items}
</channel>
</rss>`;
}

export async function publicFeedResponse(request: Request) {
  const opts: Record<string, string> = await optionMap(false).catch(() => ({}));
  const posts = await loadPublishedPostsForFeed(rssItemLimit(opts));
  const xml = buildRssFeedXml(opts, posts);
  const etag = `"${createHash('sha1').update(xml).digest('hex')}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag, 'cache-control': 'public, max-age=300, must-revalidate' } });
  }
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8',
    'cache-control': 'public, max-age=300, must-revalidate', etag } });
}

function buildPostPath(
  post: { id?: unknown; display_id?: unknown; slug?: unknown; category_slug?: unknown; published_at?: unknown; created_at?: unknown },
  template = '',
  timeZone = 'UTC',
) {
  const tpl = template.trim() || '/posts/%postname%';
  const parts = postDateParts(post, timeZone);
  const category = encodeURIComponent(String(post.category_slug || 'uncategorized'));
  const path = tpl
    .replace(/%postname%/g, encodeURIComponent(String(post.slug || post.id || '')))
    .replace(/%post_id%/g, String(post.id || ''))
    .replace(/%display_id%/g, String(post.display_id || post.id || ''))
    .replace(/%year%/g, parts.year)
    .replace(/%month%/g, parts.month)
    .replace(/%day%/g, parts.day)
    .replace(/%category%/g, category);
  return path.startsWith('/') ? path : `/${path}`;
}

const aiBotUserAgents = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'CCBot',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Bytespider',
  'FacebookBot',
  'Meta-ExternalAgent',
  'Applebot-Extended',
  'DuckAssistBot',
  'Diffbot',
];

export async function robotsTxtResponse() {
  const opts: Record<string, string> = await optionMap(false).catch(() => ({}));
  const site = siteOrigin(opts);
  const aiAllowed = boolOptionValue(opts.ai_crawl_allowed, true);
  const lines = ['User-agent: *', 'Allow: /', 'Disallow: /admin/', 'Disallow: /api/', ''];
  for (const agent of aiBotUserAgents) {
    lines.push(`User-agent: ${agent}`, `${aiAllowed ? 'Allow' : 'Disallow'}: /`, '');
  }
  if (site) {
    lines.push(`Sitemap: ${site}/sitemap.xml`);
    if (boolOptionValue(opts.llms_txt_enabled, true)) lines.push(`# llms.txt available at ${site}/llms.txt`);
  }
  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}

export async function sitemapXmlResponse() {
  const opts: Record<string, string> = await optionMap(false).catch(() => ({}));
  const site = siteOrigin(opts);
  const headers = { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' };
  if (!site) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>', { headers });
  }
  const now = new Date().toISOString();
  const items: { loc: string; lastmod: string; changefreq: string; priority: string }[] = [
    { loc: `${site}/`, lastmod: now, changefreq: 'daily', priority: '1.0' },
  ];
  for (const path of ['/about', '/archives', '/films', '/moments', '/footprints', '/links', '/albums', '/music', '/books', '/games', '/movies', '/goods', '/feeds']) {
    items.push({ loc: `${site}${path}`, lastmod: now, changefreq: 'weekly', priority: '0.6' });
  }
  const posts = await many<Record<string, unknown>>(
    `select p.id, p.slug, p.display_id, p.type, p.created_at, p.updated_at, p.published_at,
            coalesce((
              select m.slug from ${table('relationships')} r
              join ${table('metas')} m on m.id = r.meta_id and m.type = 'category'
              where r.post_id = p.id order by m.id asc limit 1
            ), '') as category_slug
     from ${table('posts')} p
     where p.status = 'publish'
     order by coalesce(p.published_at, to_timestamp(p.created_at)) desc
     limit 5000`,
  ).catch(() => []);
  const permalink = opts.permalink_structure || '/posts/%postname%';
  for (const post of posts) {
    const path = String(post.type || '') === 'video'
      ? `/films/${encodeURIComponent(String(post.slug || post.display_id || post.id || ''))}`
      : buildPostPath(post, permalink);
    items.push({
      loc: `${site}${path}`,
      lastmod: postDateParts({ published_at: post.updated_at || post.published_at || post.created_at }).iso,
      changefreq: 'monthly',
      priority: '0.8',
    });
  }
  const metas = await many<Record<string, unknown>>(
    `select slug, type, updated_at, created_at
     from ${table('metas')}
     where type in ('category','tag') and coalesce(slug,'') <> ''`,
  ).catch(() => []);
  for (const meta of metas) {
    const base = meta.type === 'category' ? '/categories/' : '/tags/';
    items.push({
      loc: `${site}${base}${encodeURIComponent(String(meta.slug || ''))}`,
      lastmod: postDateParts({ published_at: meta.updated_at || meta.created_at }).iso,
      changefreq: 'weekly',
      priority: meta.type === 'category' ? '0.5' : '0.4',
    });
  }
  const urls = items.map((item) => (
    `  <url><loc>${xmlEscape(item.loc)}</loc><lastmod>${item.lastmod}</lastmod><changefreq>${item.changefreq}</changefreq><priority>${item.priority}</priority></url>`
  )).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, { headers });
}

export async function llmsTxtResponse() {
  const opts: Record<string, string> = await optionMap(false).catch(() => ({}));
  if (!boolOptionValue(opts.llms_txt_enabled, true)) {
    return new Response('llms.txt is disabled in this site SEO settings', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  const site = siteOrigin(opts);
  const title = String(opts.site_title || 'Utterlog').trim() || 'Utterlog';
  const tagline = String(opts.seo_default_description || opts.site_description || '').trim();
  const posts = await many<{ title: string; slug: string; excerpt: string; created_at: number }>(
    `select title, slug, coalesce(excerpt,'') as excerpt, created_at
     from ${table('posts')}
     where status = 'publish' and type = 'post'
     order by coalesce(published_at, to_timestamp(created_at)) desc
     limit 200`,
  ).catch(() => []);
  const lines = [`# ${title}`, ''];
  if (tagline) lines.push(`> ${oneLine(tagline)}`, '');
  if (site) lines.push(`Site: ${site}`, '');
  if (posts.length) {
    lines.push('## Posts', '');
    for (const post of posts) {
      const url = `${site || ''}/posts/${encodeURIComponent(post.slug || '')}`;
      const summary = oneLine(post.excerpt || post.title || '');
      lines.push(summary && summary !== post.title ? `- [${post.title}](${url}): ${summary}` : `- [${post.title}](${url})`);
    }
  }
  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}

export async function llmsFullTxtResponse() {
  const opts: Record<string, string> = await optionMap(false).catch(() => ({}));
  if (String(opts.llms_full_enabled || '').trim().toLowerCase() !== 'true') {
    return new Response('llms-full.txt is disabled in this site SEO settings', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  const site = siteOrigin(opts);
  const title = String(opts.site_title || 'Utterlog').trim() || 'Utterlog';
  const tagline = String(opts.seo_default_description || opts.site_description || '').trim();
  const posts = await many<{ title: string; slug: string; excerpt: string; content: string; published_at: unknown; created_at: unknown }>(
    `select title, slug, excerpt, content, published_at, created_at
     from ${table('posts')}
     where status = 'publish' and type = 'post'
     order by coalesce(published_at, to_timestamp(created_at)) desc
     limit 500`,
  ).catch(() => []);
  const body = posts.map((post) => {
    const url = `${site}/${encodeURIComponent(String(post.slug || ''))}`;
    const excerpt = String(post.excerpt || '').trim();
    return [
      `## ${post.title}`,
      `URL: ${url}`,
      `Published: ${postDateParts(post).iso}`,
      excerpt ? `Summary: ${excerpt}` : '',
      String(post.content || '').trim(),
    ].filter(Boolean).join('\n');
  }).join('\n\n---\n\n');
  const header = [`# ${title}`, tagline ? `\n> ${oneLine(tagline)}\n` : '', site ? `\nSite: ${site}\nGenerated: ${new Date().toISOString()}\n` : ''].join('');
  return new Response(`${header}\n${body}\n`, {
    headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
