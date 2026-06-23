const botSubstrings = [
  'bot',
  'crawl',
  'spider',
  'scraper',
  'fetcher',
  'headless',
  'phantomjs',
  'puppeteer',
  'playwright',
  'selenium',
  'lighthouse',
  'chrome-lighthouse',
  'pagespeed',
  'curl/',
  'wget/',
  'python-',
  'python/',
  'go-http',
  'okhttp',
  'java/',
  'ruby',
  'postman',
  'insomnia',
  'httpie',
  'axios/',
  'libwww',
  'urllib',
  'requests/',
  'aiohttp',
  'archive.org',
  'wayback',
  'prerender',
  'ahrefs',
  'semrush',
  'mj12',
  'dotbot',
  'blexbot',
  'yandex',
  'baidu',
  'sogou',
  '360spider',
  'bytespider',
  'haosouspider',
  'facebookexternalhit',
  'facebookcatalog',
  'slack-imgproxy',
  'twitterbot',
  'linkedinbot',
  'whatsapp',
  'telegrambot',
  'discordbot',
  'skypeuripreview',
  'uptimerobot',
  'pingdom',
  'statuscake',
  'gtmetrix',
  'newrelic',
  'nagios',
  'zabbix',
  'datadog',
  'monitis',
  'site24x7',
  'apachebench',
  'ab/',
  'siege',
  'wrk',
  'jmeter',
  'gptbot',
  'chatgpt',
  'claude-web',
  'claudebot',
  'anthropic',
  'google-extended',
  'perplexity',
  'ccbot',
  'google-inspectiontool',
  'applebot',
  'feedparser',
  'feedly',
  'inoreader',
  'newsblur',
  'tiny tiny rss',
];

const compatibleURLBot = /compatible;.*https?:\/\//i;
const minRealUaLength = 15;

export function isBotUa(ua: string) {
  if (!ua) return true;
  if (ua.length < minRealUaLength) return true;
  const lower = ua.toLowerCase();
  if (botSubstrings.some((pattern) => lower.includes(pattern))) return true;
  return compatibleURLBot.test(lower);
}

function escapeSqlLike(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_').replaceAll("'", "''");
}

export const botSqlPattern = `(
  user_agent is null
  or user_agent = ''
  or length(user_agent) < ${minRealUaLength}
  or ${botSubstrings.map((pattern) => `lower(user_agent) like '%${escapeSqlLike(pattern)}%' escape '\\'`).join('\n  or ')}
)`;
