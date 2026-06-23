import { useId, useMemo } from 'react';

// Comprehensive timezone list — 60+ major cities organized by UTC offset.
// 想再加请加进来：[IANA, 中文城市, EN city]。UTC 偏移由 Intl 在渲染时
// 实时计算，不需要在这里写死（自动覆盖夏令时差异）。
const ZONES: Array<[string, string, string]> = [
  // UTC −12 → −1
  ['Pacific/Midway', '中途岛', 'Midway'],
  ['Pacific/Honolulu', '檀香山', 'Honolulu'],
  ['America/Anchorage', '安克雷奇', 'Anchorage'],
  ['America/Los_Angeles', '洛杉矶', 'Los Angeles'],
  ['America/Vancouver', '温哥华', 'Vancouver'],
  ['America/Tijuana', '蒂华纳', 'Tijuana'],
  ['America/Denver', '丹佛', 'Denver'],
  ['America/Phoenix', '凤凰城', 'Phoenix'],
  ['America/Mexico_City', '墨西哥城', 'Mexico City'],
  ['America/Chicago', '芝加哥', 'Chicago'],
  ['America/Guatemala', '危地马拉', 'Guatemala'],
  ['America/New_York', '纽约', 'New York'],
  ['America/Toronto', '多伦多', 'Toronto'],
  ['America/Bogota', '波哥大', 'Bogotá'],
  ['America/Lima', '利马', 'Lima'],
  ['America/Halifax', '哈利法克斯', 'Halifax'],
  ['America/Santiago', '圣地亚哥', 'Santiago'],
  ['America/Sao_Paulo', '圣保罗', 'São Paulo'],
  ['America/Argentina/Buenos_Aires', '布宜诺斯艾利斯', 'Buenos Aires'],
  ['America/Noronha', '诺罗尼亚', 'Noronha'],
  ['Atlantic/Azores', '亚速尔群岛', 'Azores'],
  ['Atlantic/Cape_Verde', '佛得角', 'Cape Verde'],

  // UTC 0
  ['UTC', 'UTC', 'UTC'],
  ['Europe/London', '伦敦', 'London'],
  ['Europe/Dublin', '都柏林', 'Dublin'],
  ['Europe/Lisbon', '里斯本', 'Lisbon'],
  ['Africa/Casablanca', '卡萨布兰卡', 'Casablanca'],
  ['Africa/Accra', '阿克拉', 'Accra'],

  // UTC +1
  ['Europe/Paris', '巴黎', 'Paris'],
  ['Europe/Berlin', '柏林', 'Berlin'],
  ['Europe/Madrid', '马德里', 'Madrid'],
  ['Europe/Rome', '罗马', 'Rome'],
  ['Europe/Amsterdam', '阿姆斯特丹', 'Amsterdam'],
  ['Europe/Brussels', '布鲁塞尔', 'Brussels'],
  ['Europe/Vienna', '维也纳', 'Vienna'],
  ['Europe/Warsaw', '华沙', 'Warsaw'],
  ['Europe/Stockholm', '斯德哥尔摩', 'Stockholm'],
  ['Europe/Copenhagen', '哥本哈根', 'Copenhagen'],
  ['Europe/Oslo', '奥斯陆', 'Oslo'],
  ['Europe/Zurich', '苏黎世', 'Zurich'],
  ['Africa/Lagos', '拉各斯', 'Lagos'],
  ['Africa/Algiers', '阿尔及尔', 'Algiers'],

  // UTC +2
  ['Europe/Helsinki', '赫尔辛基', 'Helsinki'],
  ['Europe/Athens', '雅典', 'Athens'],
  ['Europe/Bucharest', '布加勒斯特', 'Bucharest'],
  ['Europe/Kiev', '基辅', 'Kyiv'],
  ['Europe/Istanbul', '伊斯坦布尔', 'Istanbul'],
  ['Asia/Jerusalem', '耶路撒冷', 'Jerusalem'],
  ['Africa/Cairo', '开罗', 'Cairo'],
  ['Africa/Johannesburg', '约翰内斯堡', 'Johannesburg'],

  // UTC +3
  ['Europe/Moscow', '莫斯科', 'Moscow'],
  ['Asia/Riyadh', '利雅得', 'Riyadh'],
  ['Africa/Nairobi', '内罗毕', 'Nairobi'],

  // UTC +3:30 / +4
  ['Asia/Tehran', '德黑兰', 'Tehran'],
  ['Asia/Dubai', '迪拜', 'Dubai'],
  ['Asia/Baku', '巴库', 'Baku'],
  ['Indian/Mauritius', '毛里求斯', 'Mauritius'],

  // UTC +4:30 / +5 / +5:30 / +5:45
  ['Asia/Kabul', '喀布尔', 'Kabul'],
  ['Asia/Karachi', '卡拉奇', 'Karachi'],
  ['Asia/Tashkent', '塔什干', 'Tashkent'],
  ['Asia/Yekaterinburg', '叶卡捷琳堡', 'Yekaterinburg'],
  ['Asia/Kolkata', '加尔各答', 'Kolkata'],
  ['Asia/Colombo', '科伦坡', 'Colombo'],
  ['Asia/Kathmandu', '加德满都', 'Kathmandu'],

  // UTC +6 / +6:30
  ['Asia/Almaty', '阿拉木图', 'Almaty'],
  ['Asia/Dhaka', '达卡', 'Dhaka'],
  ['Asia/Yangon', '仰光', 'Yangon'],

  // UTC +7
  ['Asia/Bangkok', '曼谷', 'Bangkok'],
  ['Asia/Jakarta', '雅加达', 'Jakarta'],
  ['Asia/Ho_Chi_Minh', '胡志明市', 'Ho Chi Minh City'],
  ['Asia/Phnom_Penh', '金边', 'Phnom Penh'],
  ['Asia/Vientiane', '万象', 'Vientiane'],
  ['Asia/Krasnoyarsk', '克拉斯诺亚尔斯克', 'Krasnoyarsk'],

  // UTC +8
  ['Asia/Shanghai', '北京 / 上海', 'Beijing / Shanghai'],
  ['Asia/Chongqing', '重庆', 'Chongqing'],
  ['Asia/Urumqi', '乌鲁木齐', 'Ürümqi'],
  ['Asia/Hong_Kong', '香港', 'Hong Kong'],
  ['Asia/Macau', '澳门', 'Macau'],
  ['Asia/Taipei', '台北', 'Taipei'],
  ['Asia/Singapore', '新加坡', 'Singapore'],
  ['Asia/Kuala_Lumpur', '吉隆坡', 'Kuala Lumpur'],
  ['Asia/Manila', '马尼拉', 'Manila'],
  ['Asia/Brunei', '文莱', 'Brunei'],
  ['Asia/Ulaanbaatar', '乌兰巴托', 'Ulaanbaatar'],
  ['Australia/Perth', '珀斯', 'Perth'],
  ['Asia/Irkutsk', '伊尔库茨克', 'Irkutsk'],

  // UTC +9
  ['Asia/Tokyo', '东京', 'Tokyo'],
  ['Asia/Seoul', '首尔', 'Seoul'],
  ['Asia/Pyongyang', '平壤', 'Pyongyang'],
  ['Asia/Yakutsk', '雅库茨克', 'Yakutsk'],

  // UTC +9:30 / +10
  ['Australia/Adelaide', '阿德莱德', 'Adelaide'],
  ['Australia/Darwin', '达尔文', 'Darwin'],
  ['Australia/Brisbane', '布里斯班', 'Brisbane'],
  ['Australia/Sydney', '悉尼', 'Sydney'],
  ['Australia/Melbourne', '墨尔本', 'Melbourne'],
  ['Pacific/Guam', '关岛', 'Guam'],
  ['Pacific/Port_Moresby', '莫尔兹比港', 'Port Moresby'],

  // UTC +11 / +12 / +13
  ['Pacific/Noumea', '努美阿', 'Nouméa'],
  ['Pacific/Auckland', '奥克兰', 'Auckland'],
  ['Pacific/Fiji', '斐济', 'Fiji'],
  ['Pacific/Tongatapu', '汤加塔布', 'Tongatapu'],
];

// 算出指定时区当前的 UTC 偏移（分钟），自动处理夏令时。Intl 在所有
// 主流浏览器都支持；timeZoneName: 'longOffset' 返回 "GMT+08:00"。
function offsetMinutesOf(tz: string, now: Date): number | null {
  try {
    const dtf = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      timeZoneName: 'longOffset',
    });
    const parts = dtf.formatToParts(now);
    const off = parts.find((p) => p.type === 'timeZoneName')?.value || '';
    // 形如 "GMT+08:00" / "GMT-05:30" / "GMT"
    const m = off.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!m) return 0;
    const sign = m[1] === '-' ? -1 : 1;
    const h = parseInt(m[2], 10);
    const mins = parseInt(m[3] || '0', 10);
    return sign * (h * 60 + mins);
  } catch {
    return null;
  }
}

// 把分钟数格式化成 "UTC+8" / "UTC+5:30" / "UTC−3:30" / "UTC"
function formatOffset(minutes: number | null): string {
  if (minutes === null) return '?';
  if (minutes === 0) return 'UTC';
  const sign = minutes >= 0 ? '+' : '−'; // 用真减号好看
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(m).padStart(2, '0')}`;
}

// TimezoneCombobox —— input + datalist 组合，支持下拉选择和自由键入。
// 用户既能从 60+ 城市里搜索"东京"/"+9"/"Asia/Tokyo"，也能直接粘任意
// 合法 IANA 名（后端 siteclock.IsValid 兜底校验）。
//
// register: react-hook-form 的 register('site_timezone') 返回值。
export function TimezoneCombobox({
  register,
  placeholder,
}: {
  register: any;
  placeholder?: string;
}) {
  const id = useId();
  const listId = `tz-list-${id}`;

  // 列表按当前偏移排序，UTC 前面，方便用户找
  const sorted = useMemo(() => {
    const now = new Date();
    return ZONES
      .map(([tz, cn, en]) => ({ tz, cn, en, offset: offsetMinutesOf(tz, now) }))
      .sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0));
  }, []);

  return (
    <>
      <input
        type="text"
        list={listId}
        placeholder={placeholder || 'Asia/Shanghai'}
        autoComplete="off"
        className="settings-input"
        {...register}
      />
      <datalist id={listId}>
        {sorted.map(({ tz, cn, en, offset }) => (
          // datalist option 在大多数浏览器里 label 用于显示、value 是
          // 选中后真正填回 input 的值。Safari 不显示 label，所以拼一份
          // 完整文本作为 label 字段冗余写一份在 value 里也不行（value
          // 必须是合法 IANA）。最稳妥：value=IANA，label 是"城市 · 偏移
          // · IANA"，搜索 cn / en / IANA / 偏移都能命中。
          <option key={tz} value={tz} label={`${cn} · ${formatOffset(offset)} · ${tz}`}>
            {`${cn} (${en}) · ${formatOffset(offset)} · ${tz}`}
          </option>
        ))}
      </datalist>
    </>
  );
}
