import { useI18n } from '@/lib/i18n';

export type FootprintFormValue = {
  place_id?: number;
  country_name?: string;
  country_code?: string;
  city_name?: string;
  latitude?: number | string;
  longitude?: number | string;
  cover_url?: string;
  route_id?: number;
  route_name?: string;
  visited_at?: string;
  route_order?: number | string;
  keywords?: string;
  note?: string;
};

function cleanNumber(value: number | string | undefined) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function dateOnly(value?: string) {
  if (!value) return '';
  return value.includes('T') ? value.slice(0, 10) : value;
}

export function normalizeFootprintsForPayload(items: FootprintFormValue[], fallbackCoverUrl?: string, fallbackDate?: string) {
  const source = items.length ? items : [{}];
  return source.map((item) => {
    const payload: any = {
      place_id: Number(item.place_id || 0),
      country_name: (item.country_name || '').trim(),
      country_code: (item.country_code || '').trim().toUpperCase(),
      city_name: (item.city_name || '').trim(),
      latitude: cleanNumber(item.latitude),
      longitude: cleanNumber(item.longitude),
      cover_url: (item.cover_url || fallbackCoverUrl || '').trim(),
      route_id: Number(item.route_id || 0),
      route_name: (item.route_name || '').trim(),
      visited_at: item.visited_at || dateOnly(fallbackDate),
      route_order: Number(item.route_order || 0),
      keywords: (item.keywords || '').trim(),
      note: (item.note || '').trim(),
    };
    if (payload.latitude === undefined) delete payload.latitude;
    if (payload.longitude === undefined) delete payload.longitude;
    return payload;
  });
}

export default function FootprintEditor({
  enabled,
  onEnabledChange,
}: {
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  value: FootprintFormValue[];
  onChange: (next: FootprintFormValue[]) => void;
  defaultDate?: string;
  fallbackCoverUrl?: string;
}) {
  const { t } = useI18n();

  return (
    <div>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
        <input type="checkbox" checked={enabled} onChange={(e) => onEnabledChange(e.target.checked)} className="size-4 cursor-pointer accent-primary" />
        {t('admin.footprint.enablePost', '加入足迹页面')}
      </label>
      {enabled && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {t('admin.footprint.configureHint', '地点、坐标和路线请到左侧「足迹」页面配置。')}
        </p>
      )}
    </div>
  );
}
