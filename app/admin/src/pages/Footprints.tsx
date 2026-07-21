import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from '@/lib/router';
import toast from 'react-hot-toast';
import api, { optionsApi } from '@/lib/api';
import {
  Button,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  EmptyState,
  Input,
  Label,
  LoadingState,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Switch,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/shadcn';
import {
  SlidersHorizontal, ExternalLink, RefreshCw, CircleAlert, Map, Key,
  Search, X, Pencil, FilePen, LocateFixed, Loader2,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { formatDate } from '@/lib/utils';
import { adminDateYMD } from '@/lib/timezone';

type FootprintRow = {
  id: number;
  post_id: number;
  title: string;
  slug?: string;
  display_id?: number;
  cover_url?: string;
  created_at?: number;
  visited_at?: number;
  place_id?: number;
  country_name?: string;
  country_code?: string;
  city_name?: string;
  latitude?: number;
  longitude?: number;
};

type FootprintPlace = {
  id: number;
  country_name?: string;
  country_code?: string;
  city_name?: string;
  visit_count?: number;
};

type FootprintEditForm = {
  country_name: string;
  country_code: string;
  city_name: string;
  latitude: string;
  longitude: string;
  visited_at: string;
};

type FootprintSettingsForm = {
  footprint_enabled: boolean;
  footprint_mapbox_token: string;
  footprint_default_center: string;
  footprint_default_zoom: string;
  footprint_geocoder_provider: string;
};

const defaultFootprintSettings: FootprintSettingsForm = {
  footprint_enabled: false,
  footprint_mapbox_token: '',
  footprint_default_center: '108.14,33.87',
  footprint_default_zoom: '3',
  footprint_geocoder_provider: 'wpista',
};

function responseData<T>(response: any, fallback: T): T {
  const data = response?.data ?? response;
  return (data ?? fallback) as T;
}

function isEnabled(value: unknown) {
  return value === true || value === 'true';
}

function flagUrl(code?: string) {
  const normalized = (code || '').trim().toLowerCase();
  return normalized ? `https://flagcdn.io/flags/4x3/${normalized}.svg` : '';
}

function locationLabel(item: FootprintRow) {
  return [item.city_name, item.country_name].filter(Boolean).join(' · ') || '-';
}

function dateOnly(seconds?: number) {
  if (!seconds) return '';
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return '';
  return adminDateYMD(date);
}

function cleanNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export default function FootprintsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [rows, setRows] = useState<FootprintRow[]>([]);
  const [places, setPlaces] = useState<FootprintPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [keyword, setKeyword] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [hasMapboxToken, setHasMapboxToken] = useState(false);
  const [editing, setEditing] = useState<FootprintRow | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState<FootprintSettingsForm>(defaultFootprintSettings);
  const [form, setForm] = useState<FootprintEditForm>({
    country_name: '',
    country_code: '',
    city_name: '',
    latitude: '',
    longitude: '',
    visited_at: '',
  });
  const [saving, setSaving] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  const stats = useMemo(() => {
    const countries = new Set(
      rows
        .map((item) => (item.country_code || item.country_name || '').trim().toLowerCase())
        .filter(Boolean)
    );
    const configured = rows.filter((item) => Number(item.place_id) > 0).length;
    return { countries: countries.size, configured };
  }, [rows]);

  const fetchFootprints = async (nextKeyword = keyword) => {
    setLoading(true);
    try {
      const [footprintsRes, placesRes, optionsRes] = await Promise.all([
        api.get('/admin/footprints', { params: nextKeyword.trim() ? { keyword: nextKeyword.trim() } : undefined }),
        api.get('/admin/footprints/places').catch(() => ({ data: [] })),
        optionsApi.list().catch(() => ({ data: {} })),
      ]);
      setRows(responseData<FootprintRow[]>(footprintsRes, []));
      setPlaces(responseData<FootprintPlace[]>(placesRes, []));
      const options = responseData<Record<string, any>>(optionsRes, {});
      const nextSettings: FootprintSettingsForm = {
        footprint_enabled: isEnabled(options.footprint_enabled),
        footprint_mapbox_token: String(options.mapbox_access_token || options.footprint_mapbox_token || ''),
        footprint_default_center: String(options.footprint_default_center || defaultFootprintSettings.footprint_default_center),
        footprint_default_zoom: String(options.footprint_default_zoom || defaultFootprintSettings.footprint_default_zoom),
        footprint_geocoder_provider: String(options.footprint_geocoder_provider || defaultFootprintSettings.footprint_geocoder_provider),
      };
      setSettingsForm(nextSettings);
      setEnabled(nextSettings.footprint_enabled);
      setHasMapboxToken(!!nextSettings.footprint_mapbox_token.trim());
    } catch (error: any) {
      toast.error(error?.response?.data?.error?.message || t('admin.footprints.toast.fetchFailed', '获取足迹失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFootprints('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    const next = query.trim();
    setKeyword(next);
    fetchFootprints(next);
  };

  const openPublicPage = () => {
    const suffix = keyword ? `?keyword=${encodeURIComponent(keyword)}` : '';
    window.open(`/footprints${suffix}`, '_blank', 'noopener,noreferrer');
  };

  const openEdit = (item: FootprintRow) => {
    setEditing(item);
    setForm({
      country_name: item.country_name || '',
      country_code: item.country_code || '',
      city_name: item.city_name || '',
      latitude: item.latitude === undefined || item.latitude === null ? '' : String(item.latitude),
      longitude: item.longitude === undefined || item.longitude === null ? '' : String(item.longitude),
      visited_at: dateOnly(item.visited_at || item.created_at),
    });
  };

  const updateForm = (patch: Partial<FootprintEditForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const updateSettingsForm = (patch: Partial<FootprintSettingsForm>) => {
    setSettingsForm((prev) => ({ ...prev, ...patch }));
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      const nextSettings: FootprintSettingsForm = {
        footprint_enabled: settingsForm.footprint_enabled,
        footprint_mapbox_token: settingsForm.footprint_mapbox_token.trim(),
        footprint_default_center: settingsForm.footprint_default_center.trim() || defaultFootprintSettings.footprint_default_center,
        footprint_default_zoom: String(settingsForm.footprint_default_zoom || defaultFootprintSettings.footprint_default_zoom).trim(),
        footprint_geocoder_provider: settingsForm.footprint_geocoder_provider || defaultFootprintSettings.footprint_geocoder_provider,
      };
      const footprintSettings: Record<string, any> = { ...nextSettings };
      delete footprintSettings.footprint_mapbox_token;
      await optionsApi.updateMany(footprintSettings);
      setSettingsForm(nextSettings);
      setEnabled(nextSettings.footprint_enabled);
      setHasMapboxToken(!!nextSettings.footprint_mapbox_token);
      setSettingsOpen(false);
      toast.success(t('admin.footprints.toast.settingsSaved', '足迹设置已保存'));
    } catch (error: any) {
      toast.error(error?.response?.data?.error?.message || t('admin.settings.toast.saveFailed', '保存失败'));
    } finally {
      setSettingsSaving(false);
    }
  };

  const geocode = async () => {
    const queryText = [form.country_name, form.city_name].filter(Boolean).join(' ').trim();
    if (!queryText) {
      toast.error(t('admin.footprint.toast.needPlace', '请输入国家或城市'));
      return;
    }
    setGeocoding(true);
    try {
      const response: any = await api.post('/admin/footprints/geocode', {
        query: queryText,
        country: form.country_name,
        city: form.city_name,
      });
      const data = response.data || response;
      updateForm({
        country_name: data.country_name || form.country_name,
        country_code: data.country_code || form.country_code,
        city_name: data.city_name || form.city_name,
        latitude: data.latitude === undefined ? form.latitude : String(data.latitude),
        longitude: data.longitude === undefined ? form.longitude : String(data.longitude),
      });
      toast.success(t('admin.footprint.toast.geocoded', '足迹坐标已填充'));
    } catch (error: any) {
      toast.error(error?.response?.data?.error?.message || error?.message || t('admin.footprint.toast.geocodeFailed', '地理编码失败'));
    } finally {
      setGeocoding(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.put(`/admin/footprints/${editing.id}`, {
        country_name: form.country_name.trim(),
        country_code: form.country_code.trim().toUpperCase(),
        city_name: form.city_name.trim(),
        latitude: cleanNumber(form.latitude),
        longitude: cleanNumber(form.longitude),
        visited_at: form.visited_at,
      });
      toast.success(t('admin.footprints.toast.saved', '足迹已保存'));
      setEditing(null);
      fetchFootprints();
    } catch (error: any) {
      toast.error(error?.response?.data?.error?.message || t('admin.footprints.toast.saveFailed', '保存足迹失败'));
    } finally {
      setSaving(false);
    }
  };

  const renderSettingsButton = () => (
    <Button type="button" variant="outline" size="icon" title={t('admin.footprints.settings', '足迹设置')} onClick={() => setSettingsOpen(true)}>
      <SlidersHorizontal className="size-4" />
    </Button>
  );

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1.5 text-sm text-muted-foreground">
            {t('admin.footprints.total', '共 {count} 条足迹，{places} 个地点', { count: rows.length, places: places.length })}
          </div>
          <div className="text-xs text-muted-foreground">
            {t('admin.footprints.summary', '{countries} 个国家/地区，{configured} 条已配置', { countries: stats.countries, configured: stats.configured })}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="icon" title={t('admin.footprints.frontPage', '前台足迹页')} onClick={openPublicPage}>
            <ExternalLink className="size-4" />
          </Button>
          {renderSettingsButton()}
          <Button size="icon" title={t('admin.common.refresh', '刷新')} onClick={() => fetchFootprints()} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
        </div>
      </div>

      {!enabled && (
        <div className="mb-3.5 flex items-center gap-2.5 rounded-lg border border-border border-l-[3px] border-l-amber-500 bg-card p-3.5">
          <CircleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="flex-1 text-sm text-muted-foreground">
            {t('admin.footprints.disabledHint', '足迹功能未启用，前台足迹页会显示关闭提示。')}
          </span>
          {renderSettingsButton()}
        </div>
      )}

      {enabled && !hasMapboxToken && (
        <div className="mb-3.5 flex items-center gap-2.5 rounded-lg border border-border border-l-[3px] border-l-primary bg-card p-3.5">
          <Map className="size-4 shrink-0 text-primary" />
          <span className="flex-1 text-sm text-muted-foreground">
            {t('admin.footprints.noTokenHint', '尚未配置 Mapbox Token，前台地图不会渲染，只会显示足迹时间线。')}
          </span>
          {renderSettingsButton()}
        </div>
      )}

      <form onSubmit={onSearch} className="mb-4 flex items-center gap-2.5 rounded-lg border border-border bg-card p-3.5">
        <div className="min-w-[180px] flex-1">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('admin.footprints.searchPlaceholder', '搜索城市、国家')}
          />
        </div>
        <Button type="submit" size="icon" className="shrink-0" title={t('admin.footprints.search', '搜索')}>
          <Search className="size-4" />
        </Button>
        {keyword && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            title={t('admin.common.reset', '重置')}
            onClick={() => {
              setQuery('');
              setKeyword('');
              fetchFootprints('');
            }}
          >
            <X className="size-4" />
          </Button>
        )}
      </form>

      <div className="overflow-hidden rounded-lg border border-border">
        {loading ? (
          <LoadingState label={t('common.loading', '加载中…')} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={t('admin.footprints.empty', '暂无足迹文章')}
            description={t('admin.footprints.emptyHint', '在文章创建或编辑页右侧勾选“加入足迹页面”后会出现在这里。')}
            actionText={t('admin.posts.newPost', '新建文章')}
            onAction={() => navigate('/posts/create')}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin.footprints.columns.post', '文章')}</TableHead>
                <TableHead className="w-[180px]">{t('admin.footprints.columns.place', '地点')}</TableHead>
                <TableHead className="w-[150px]">{t('admin.footprints.columns.date', '访问日期')}</TableHead>
                <TableHead className="w-[90px] text-right">{t('admin.posts.columns.actions', '操作')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((item) => {
                const flag = flagUrl(item.country_code);
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => navigate(`/posts/edit/${item.post_id}`)}
                        className="text-left font-medium text-primary hover:underline"
                      >
                        {item.title || t('admin.posts.untitled', '未命名文章')}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {flag && <img src={flag} alt="" className="h-[13px] w-[18px] object-cover ring-1 ring-border" />}
                        <span>{item.place_id ? locationLabel(item) : t('admin.footprints.pending', '待配置')}</span>
                      </div>
                      {(item.latitude !== undefined || item.longitude !== undefined) && (
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {[item.latitude, item.longitude].filter((value) => value !== undefined && value !== null).join(', ')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{formatDate(item.visited_at || item.created_at || '')}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-primary" onClick={() => openEdit(item)} title={t('admin.footprints.editFootprint', '配置足迹')}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => navigate(`/posts/edit/${item.post_id}`)} title={t('admin.footprints.editPost', '编辑文章')}>
                          <FilePen className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => window.open(`/footprints?keyword=${encodeURIComponent(locationLabel(item))}`, '_blank', 'noopener,noreferrer')} title={t('admin.footprints.viewOnSite', '前台查看')}>
                          <ExternalLink className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={settingsOpen} onOpenChange={(o) => !o && setSettingsOpen(false)}>
        <DialogContent className="max-h-[calc(100vh-32px)] max-w-[680px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('admin.footprints.settings', '足迹设置')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="rounded-lg border border-border bg-card p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <span className="text-sm text-foreground">{t('admin.settings.footprint.enable', '启用足迹功能')}</span>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('admin.settings.footprint.enableHint', '关闭后仍保留文章足迹数据，只是不在前台展示足迹入口。')}</p>
                </div>
                <Switch
                  checked={settingsForm.footprint_enabled}
                  onCheckedChange={(checked) => updateSettingsForm({ footprint_enabled: checked })}
                />
              </div>
            </div>

            <div className="rounded-md border border-border bg-muted p-3.5 text-xs leading-relaxed text-muted-foreground">
              <Key className="mr-1.5 inline size-3.5 align-[-2px] text-primary" />
              {hasMapboxToken
                ? t('admin.settings.footprint.mapboxConfiguredHint', 'Mapbox Token 已在系统设置 → 第三方服务中配置。')
                : t('admin.settings.footprint.mapboxMovedHint', 'Mapbox Token 已移动到系统设置 → 第三方服务。配置后足迹地图和统计地图会共用同一个 Token。')}
              <button
                type="button"
                onClick={() => { window.location.href = '/admin/settings#services'; }}
                className="ml-2.5 text-xs font-semibold text-primary"
              >
                {t('admin.common.goToSettings', '前往设置')}
              </button>
            </div>

            <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 140px' }}>
              <div className="flex flex-col gap-1.5">
                <Label>{t('admin.settings.footprint.defaultCenter', '默认中心点')}</Label>
                <Input
                  value={settingsForm.footprint_default_center}
                  onChange={(event) => updateSettingsForm({ footprint_default_center: event.target.value })}
                  placeholder={defaultFootprintSettings.footprint_default_center}
                />
                <p className="text-xs text-muted-foreground">
                  {t('admin.settings.footprint.defaultCenterHint', '格式：经度,纬度。足迹数据为空或地图初始化时使用。')}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t('admin.settings.footprint.defaultZoom', '默认缩放')}</Label>
                <Input
                  type="number"
                  value={settingsForm.footprint_default_zoom}
                  onChange={(event) => updateSettingsForm({ footprint_default_zoom: event.target.value })}
                  placeholder={defaultFootprintSettings.footprint_default_zoom}
                  min="1"
                  max="12"
                />
                <p className="text-xs text-muted-foreground">
                  {t('admin.settings.footprint.defaultZoomHint', '建议 2-5，数值越大越近。')}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('admin.settings.footprint.geocoderProvider', '地理编码服务')}</Label>
              <Select
                value={settingsForm.footprint_geocoder_provider}
                onValueChange={(v) => updateSettingsForm({ footprint_geocoder_provider: v as string })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wpista">{t('admin.settings.footprint.geocoderWpista', '临时服务：v.wpista.com/marker/geocode')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('admin.settings.footprint.geocoderProviderHint', '暂时使用 Marker-pro 同款临时接口，后续可替换成你自己的接口。')}
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSettingsOpen(false)}>
                {t('admin.common.cancel', '取消')}
              </Button>
              <Button type="button" onClick={saveSettings} disabled={settingsSaving}>
                {settingsSaving && <Loader2 className="size-4 animate-spin" />}{t('admin.common.save', '保存')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[calc(100vh-32px)] max-w-[680px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('admin.footprints.editTitle', '配置足迹')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 120px' }}>
            <div className="flex flex-col gap-1.5">
              <Label>{t('admin.footprint.country', '国家/地区')}</Label>
              <Input
                value={form.country_name}
                onChange={(event) => updateForm({ country_name: event.target.value })}
                placeholder={t('admin.footprint.countryPlaceholder', '泰国 / 中国')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('admin.footprint.countryCode', '代码')}</Label>
              <Input
                value={form.country_code}
                onChange={(event) => updateForm({ country_code: event.target.value.toUpperCase() })}
                placeholder="TH"
                maxLength={2}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('admin.footprint.city', '城市')}</Label>
            <Input
              value={form.city_name}
              onChange={(event) => updateForm({ city_name: event.target.value })}
              placeholder={t('admin.footprint.cityPlaceholder', '曼谷 / 新加坡，可留空只标国家')}
            />
          </div>
          <Button type="button" variant="outline" onClick={geocode} disabled={geocoding} className="w-full">
            {geocoding ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
            {t('admin.footprint.geocode', '获取坐标')}
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t('admin.footprint.latitude', '纬度')}</Label>
              <Input
                value={form.latitude}
                onChange={(event) => updateForm({ latitude: event.target.value })}
                placeholder="13.7563"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('admin.footprint.longitude', '经度')}</Label>
              <Input
                value={form.longitude}
                onChange={(event) => updateForm({ longitude: event.target.value })}
                placeholder="100.5018"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('admin.footprint.visitDate', '访问日期')}</Label>
            <Input
              type="date"
              value={form.visited_at}
              onChange={(event) => updateForm({ visited_at: event.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              {t('admin.common.cancel', '取消')}
            </Button>
            <Button type="button" onClick={saveEdit} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}{t('admin.common.save', '保存')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
