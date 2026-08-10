/**
 * DISPATCH 卡片里的世界地图。
 *
 * 用极简的大陆轮廓（等距圆柱投影，viewBox 360×180 直接对应经纬度），
 * 而不是引地图库或几百 KB 的 GeoJSON —— 这里只需要「一眼看出是世界地图」
 * 加几个高亮点，精度无所谓，体积才要紧。整份不到 3KB。
 *
 * 坐标换算：经度 -180..180 → x 0..360，纬度 90..-90 → y 0..180。
 * 所以 pin 只要给 [经度, 纬度] 就能直接落点，不需要额外投影计算。
 */

export type MapPin = { name: string; lng: number; lat: number };

// 轮廓是手绘简化的，只保留可辨识的大陆形状。
const CONTINENTS = [
  // 北美
  'M 58 32 L 78 28 L 96 33 L 104 44 L 98 56 L 86 60 L 80 72 L 72 78 L 66 70 L 62 56 L 54 46 Z',
  // 中美 + 南美
  'M 80 74 L 88 78 L 92 88 L 100 96 L 106 112 L 102 128 L 94 140 L 86 134 L 82 118 L 78 100 L 74 86 Z',
  // 格陵兰
  'M 108 20 L 124 18 L 130 26 L 122 34 L 110 30 Z',
  // 欧洲
  'M 168 34 L 186 30 L 196 36 L 194 46 L 182 52 L 172 48 L 166 42 Z',
  // 非洲
  'M 172 62 L 190 58 L 202 66 L 206 82 L 200 100 L 190 116 L 180 120 L 174 108 L 170 88 L 168 72 Z',
  // 亚洲
  'M 198 28 L 226 24 L 252 28 L 274 34 L 288 44 L 282 56 L 268 62 L 250 58 L 236 64 L 220 60 L 206 52 L 198 40 Z',
  // 东南亚 + 印度
  'M 232 66 L 244 70 L 248 82 L 240 88 L 232 80 Z',
  'M 252 70 L 268 74 L 276 84 L 268 92 L 256 86 Z',
  // 澳洲
  'M 268 108 L 292 104 L 302 114 L 298 128 L 280 132 L 268 122 Z',
];

export default function WorldMap({ pins = [] }: { pins?: MapPin[] }) {
  return (
    <svg
      className="renascent-dispatch-map"
      viewBox="0 0 360 180"
      role="img"
      aria-label={pins.length ? `世界地图，标注 ${pins.map((p) => p.name).join('、')}` : '世界地图'}
    >
      <g className="renascent-dispatch-map-land">
        {CONTINENTS.map((d, i) => <path key={i} d={d} />)}
      </g>
      {pins.map((pin) => {
        // 经纬度 → viewBox 坐标
        const x = pin.lng + 180;
        const y = 90 - pin.lat;
        return (
          <g key={pin.name} className="renascent-dispatch-map-pin">
            <circle cx={x} cy={y} r="5" className="renascent-dispatch-map-halo" />
            <circle cx={x} cy={y} r="2" />
          </g>
        );
      })}
    </svg>
  );
}
