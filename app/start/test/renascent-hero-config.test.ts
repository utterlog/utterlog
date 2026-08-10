import { describe, expect, test } from 'bun:test';
import {
  parseFacts, parsePlaces, parseProjects, splitAccentTitle,
} from '../src/web/themes/Renascent/hero-config';

/**
 * Renascent 首页 hero 的配置解析。
 *
 * 这几个函数把站长在后台填的自由文本变成结构化数据，容错要足够宽 ——
 * 填错格式的结果应该是「那一条不显示」，而不是整个 hero 崩掉或抛异常。
 */

describe('城市列表', () => {
  test('中文分隔符和英文逗号都认', () => {
    expect(parsePlaces('深圳 · 东京 · 香港').map((p) => p.name)).toEqual(['深圳', '东京', '香港']);
    expect(parsePlaces('Shenzhen, Tokyo, Hong Kong').map((p) => p.name)).toEqual(['Shenzhen', 'Tokyo', 'Hong Kong']);
    expect(parsePlaces('深圳，东京；香港\n北京').map((p) => p.name)).toEqual(['深圳', '东京', '香港', '北京']);
  });

  test('内置城市能查到坐标', () => {
    const [sz] = parsePlaces('深圳');
    expect(sz.lng).toBeCloseTo(114.06, 1);
    expect(sz.lat).toBeCloseTo(22.54, 1);
    // 英文名、大小写都认
    expect(parsePlaces('TOKYO')[0].lat).toBeCloseTo(35.69, 1);
    expect(parsePlaces('Hong Kong')[0].lng).toBeCloseTo(114.17, 1);
  });

  test('认不出的城市照样显示名字，只是不落点', () => {
    const [x] = parsePlaces('某个小县城');
    expect(x.name).toBe('某个小县城');
    expect(Number.isFinite(x.lng)).toBe(false);
  });

  test('可以手动给坐标', () => {
    const [x] = parsePlaces('乌鲁木齐@87.62,43.79');
    expect(x.name).toBe('乌鲁木齐');
    expect(x.lng).toBeCloseTo(87.62, 1);
  });

  test('空输入返回空数组，不抛错', () => {
    expect(parsePlaces('')).toEqual([]);
    expect(parsePlaces('   ')).toEqual([]);
  });
});

describe('档案表', () => {
  test('= 和中英文冒号都能分隔', () => {
    expect(parseFacts('FIRST BOOK = 2004\nLANGUAGES: 中文\nSINCE：2018')).toEqual([
      { label: 'FIRST BOOK', value: '2004' },
      { label: 'LANGUAGES', value: '中文' },
      { label: 'SINCE', value: '2018' },
    ]);
  });

  test('没有分隔符的行整行当值，不丢内容', () => {
    expect(parseFacts('就一句话')).toEqual([{ label: '', value: '就一句话' }]);
  });

  test('值里含冒号时只按第一个分隔（时间不会被切坏）', () => {
    const [f] = parseFacts('UPDATED = 2026-08-10 15:30');
    expect(f.value).toBe('2026-08-10 15:30');
  });

  test('空行被忽略', () => {
    expect(parseFacts('A = 1\n\n\nB = 2')).toHaveLength(2);
  });
});

describe('项目列表', () => {
  test('三段式解析', () => {
    expect(parseProjects('vmark.app | https://vmark.app | 写作工具')).toEqual([
      { name: 'vmark.app', url: 'https://vmark.app', note: '写作工具' },
    ]);
  });

  test('后两段可省', () => {
    expect(parseProjects('claudepot')).toEqual([{ name: 'claudepot', url: undefined, note: undefined }]);
    expect(parseProjects('claudepot | | 尚未发布')).toEqual([
      { name: 'claudepot', url: undefined, note: '尚未发布' },
    ]);
  });

  test('没名字的行被丢掉', () => {
    expect(parseProjects(' | https://x.com')).toEqual([]);
  });
});

describe('标题强调词', () => {
  test('星号包住的词被拆成 accent 段', () => {
    expect(splitAccentTitle('A life-long learner, *reborn* with AI.')).toEqual([
      { text: 'A life-long learner, ', accent: false },
      { text: 'reborn', accent: true },
      { text: ' with AI.', accent: false },
    ]);
  });

  test('没有星号时原样返回一段', () => {
    expect(splitAccentTitle('普通标题')).toEqual([{ text: '普通标题', accent: false }]);
  });

  test('多个强调词都能拆', () => {
    const parts = splitAccentTitle('*一* 和 *二*');
    expect(parts.filter((p) => p.accent).map((p) => p.text)).toEqual(['一', '二']);
  });

  test('空标题不抛错', () => {
    expect(splitAccentTitle('')).toEqual([{ text: '', accent: false }]);
  });
});

describe('上限保护', () => {
  // 站长贴进来一大段的话，前台版面不该被撑爆
  test('城市最多 8 个、档案最多 6 行、项目最多 6 条', () => {
    expect(parsePlaces(Array.from({ length: 20 }, (_, i) => `城市${i}`).join(' · '))).toHaveLength(8);
    expect(parseFacts(Array.from({ length: 20 }, (_, i) => `L${i} = V${i}`).join('\n'))).toHaveLength(6);
    expect(parseProjects(Array.from({ length: 20 }, (_, i) => `P${i}`).join('\n'))).toHaveLength(6);
  });
});

describe('手动坐标与普通城市混排', () => {
  // 「城市@经度,纬度」里的逗号不能被当成城市分隔符 —— 解析时要先保护起来
  test('混在一起也能正确切分', () => {
    const r = parsePlaces('深圳 · 乌鲁木齐@87.62,43.79 · 东京');
    expect(r.map((p) => p.name)).toEqual(['深圳', '乌鲁木齐', '东京']);
    expect(r[1].lng).toBeCloseTo(87.62, 1);
    expect(r[0].lng).toBeCloseTo(114.06, 1);
  });

  test('逗号分隔时手动坐标也不被切坏', () => {
    const r = parsePlaces('北京, 某地@10,20, 东京');
    expect(r.map((p) => p.name)).toEqual(['北京', '某地', '东京']);
    expect(r[1].lat).toBeCloseTo(20, 1);
  });
});
