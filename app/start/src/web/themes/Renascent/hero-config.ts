/**
 * Renascent 首页 hero 的站长配置。
 *
 * 全部走 options 表（后台「主题 → 首页 Hero」面板写入），前台通过
 * ThemeContext 的 options 整份拿到，不需要额外接口。
 *
 * 所有字段都可以留空 —— 空的那块整体不渲染，不会留下空标题或空框。
 * 这样别人装了这个主题、什么都没填时，hero 会退化成「大标题 + 描述」，
 * 仍然是完整的版面。
 */

export type HeroFact = { label: string; value: string };
export type HeroProject = { name: string; url?: string; note?: string };
export type HeroPlace = { name: string; lng: number; lat: number };

/** 内置的城市经纬度，配置里只写城市名就能落点 */
const KNOWN_PLACES: Record<string, [number, number]> = {
  '深圳': [114.06, 22.54], shenzhen: [114.06, 22.54],
  '北京': [116.40, 39.90], beijing: [116.40, 39.90],
  '上海': [121.47, 31.23], shanghai: [121.47, 31.23],
  '广州': [113.26, 23.13], guangzhou: [113.26, 23.13],
  '杭州': [120.15, 30.27], hangzhou: [120.15, 30.27],
  '成都': [104.07, 30.57], chengdu: [104.07, 30.57],
  '香港': [114.17, 22.32], 'hong kong': [114.17, 22.32], hongkong: [114.17, 22.32],
  '台北': [121.56, 25.03], taipei: [121.56, 25.03],
  '东京': [139.69, 35.69], tokyo: [139.69, 35.69],
  '首尔': [126.98, 37.57], seoul: [126.98, 37.57],
  '新加坡': [103.82, 1.35], singapore: [103.82, 1.35],
  '曼谷': [100.50, 13.76], bangkok: [100.50, 13.76],
  '伦敦': [-0.13, 51.51], london: [-0.13, 51.51],
  '巴黎': [2.35, 48.86], paris: [2.35, 48.86],
  '柏林': [13.40, 52.52], berlin: [13.40, 52.52],
  '纽约': [-74.01, 40.71], 'new york': [-74.01, 40.71],
  '旧金山': [-122.42, 37.77], 'san francisco': [-122.42, 37.77],
  '西雅图': [-122.33, 47.61], seattle: [-122.33, 47.61],
  '洛杉矶': [-118.24, 34.05], 'los angeles': [-118.24, 34.05],
  '悉尼': [151.21, -33.87], sydney: [151.21, -33.87],
  '迪拜': [55.27, 25.20], dubai: [55.27, 25.20],
};

/**
 * 「深圳 · 东京 · 香港」或「Shenzhen, Tokyo, Hong Kong」都认。
 * 想手动给坐标的写成「城市名@经度,纬度」。
 */
export function parsePlaces(raw: string): HeroPlace[] {
  // 「城市@经度,纬度」里的逗号不能当分隔符用，先占位保护起来，切完再还原。
  const guarded: string[] = [];
  const masked = String(raw || '').replace(
    /@\s*-?[\d.]+\s*,\s*-?[\d.]+/g,
    (hit) => `@@${guarded.push(hit) - 1}@@`,
  );
  return masked
    .split(/[\n,，;；·]+/)
    .map((item) => item.trim().replace(/@@(\d+)@@/g, (_, i) => guarded[Number(i)]))
    .filter(Boolean)
    .map((item) => {
      const manual = item.match(/^(.+?)@\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)$/);
      if (manual) {
        return { name: manual[1].trim(), lng: Number(manual[2]), lat: Number(manual[3]) };
      }
      const hit = KNOWN_PLACES[item.toLowerCase()] || KNOWN_PLACES[item];
      // 认不出坐标的城市照样显示名字，只是地图上不落点
      return { name: item, lng: hit?.[0] ?? NaN, lat: hit?.[1] ?? NaN };
    })
    .slice(0, 8);
}

/** 每行一条「标签 = 值」或「标签：值」 */
export function parseFacts(raw: string): HeroFact[] {
  return String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.+?)\s*[=:：]\s*(.+)$/);
      return m ? { label: m[1].trim(), value: m[2].trim() } : { label: '', value: line };
    })
    .filter((f) => f.value)
    .slice(0, 6);
}

/** 每行一条「名称 | 链接 | 备注」，后两段可省 */
export function parseProjects(raw: string): HeroProject[] {
  return String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, url, note] = line.split('|').map((x) => x.trim());
      return { name, url: url || undefined, note: note || undefined };
    })
    .filter((p) => p.name)
    .slice(0, 6);
}

/**
 * 把标题里 *星号* 包住的词拆出来，用于渲染成斜体强调。
 * 例：`A life-long learner, *reborn* with AI.`
 */
export function splitAccentTitle(title: string): Array<{ text: string; accent: boolean }> {
  const parts: Array<{ text: string; accent: boolean }> = [];
  const re = /\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(title))) {
    if (m.index > last) parts.push({ text: title.slice(last, m.index), accent: false });
    parts.push({ text: m[1], accent: true });
    last = m.index + m[0].length;
  }
  if (last < title.length) parts.push({ text: title.slice(last), accent: false });
  return parts.length ? parts : [{ text: title, accent: false }];
}
