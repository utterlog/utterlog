'use client';

import { datePartsInTimeZone, isValidTimeZone } from '@/lib/timezone';

interface HeatmapProps {
  data: { date: string; count: number }[];
  timeZone?: string;
}

// 把 yyyy-mm-dd 串转换成"在 site_timezone 视角下的当地 0 点 Date"对象。
// 用作 UTC 步长游标 —— 365 个自然日下来日历偏移不再依赖浏览器本地时区。
function parseSiteDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}
function ymdInTz(d: Date, tz: string): string {
  const t = datePartsInTimeZone(d, tz);
  return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
}

export default function Heatmap({ data, timeZone }: HeatmapProps) {
  const tz = isValidTimeZone(timeZone) ? timeZone! : 'UTC';

  // "今天 / 起始日" 都按 site_timezone 切日 —— 否则用户在 +08 看到的
  // 最右一格可能是 UTC 今天（=站点昨天），跟后端 ul_stats_global 的
  // site-tz 日活分桶对不上，文章发布也是同样。
  const todayYmd = ymdInTz(new Date(), tz);
  const today = parseSiteDate(todayYmd);
  const startYmd = (() => {
    const d = parseSiteDate(todayYmd);
    d.setUTCDate(d.getUTCDate() - 364);
    return ymdInTz(d, 'UTC'); // already at UTC midnight after step
  })();
  const start = parseSiteDate(startYmd);
  // 让起始格回到周日（默认 GitHub 风格）
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());

  const countMap = new Map<string, number>();
  for (const d of data) countMap.set(d.date, d.count);

  const weeks: { date: Date; count: number; dateStr: string }[][] = [];
  const current = new Date(start);
  while (current <= today || weeks.length < 53) {
    const week: { date: Date; count: number; dateStr: string }[] = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = ymdInTz(current, 'UTC');
      week.push({ date: new Date(current), count: countMap.get(dateStr) || 0, dateStr });
      current.setUTCDate(current.getUTCDate() + 1);
    }
    weeks.push(week);
    if (current > today && weeks.length >= 53) break;
  }

  const monthLabels: { label: string; col: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, i) => {
    const month = week[0].date.getUTCMonth();
    if (month !== lastMonth) {
      monthLabels.push({ label: `${month + 1}月`, col: i });
      lastMonth = month;
    }
  });

  const getColor = (count: number) => {
    if (count === 0) return '#ebedf0';
    if (count === 1) return '#9be9a8';
    if (count === 2) return '#40c463';
    if (count <= 4) return '#30a14e';
    return '#216e39';
  };

  return (
    <div style={{ overflow: 'hidden' }}>
      {/* Month labels */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '3px' }}>
        {weeks.map((_, i) => {
          const label = monthLabels.find(m => m.col === i);
          return (
            <div key={i} style={{ flex: '1 0 0', fontSize: '10px', color: '#999', textAlign: 'left', minWidth: 0 }}>
              {label ? label.label : ''}
            </div>
          );
        })}
      </div>

      {/* Grid — auto-size cells to fill width */}
      <div style={{ display: 'flex', gap: '2px' }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ flex: '1 0 0', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
            {week.map((day, di) => {
              const isFuture = day.date > today;
              return (
                <div key={di} title={isFuture ? '' : `${day.dateStr}: ${day.count} 篇`}
                  style={{
                    width: '100%', aspectRatio: '1',
                    background: isFuture ? 'transparent' : getColor(day.count),
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '8px', fontSize: '11px', color: '#999' }}>
        <span>少</span>
        {['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'].map((c, i) => (
          <div key={i} style={{ width: '11px', height: '11px', background: c }} />
        ))}
        <span>多</span>
      </div>
    </div>
  );
}
