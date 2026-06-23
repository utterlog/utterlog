import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { optionsApi } from '@/lib/api';
import { Button, EmptyState, Input, LoadingState, Modal, Table, Toggle } from '@/components/ui';
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
    <Button type="button" variant="secondary" size="sm" className="btn-square" title={t('admin.footprints.settings', '足迹设置')} onClick={() => setSettingsOpen(true)}>
      <i className="fa-regular fa-sliders" />
    </Button>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
        <div>
          <div className="text-dim" style={{ fontSize: 13, marginBottom: 6 }}>
            {t('admin.footprints.total', '共 {count} 条足迹，{places} 个地点', { count: rows.length, places: places.length })}
          </div>
          <div className="text-sub" style={{ fontSize: 12 }}>
            {t('admin.footprints.summary', '{countries} 个国家/地区，{configured} 条已配置', { countries: stats.countries, configured: stats.configured })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button variant="secondary" size="sm" className="btn-square" title={t('admin.footprints.frontPage', '前台足迹页')} onClick={openPublicPage}>
            <i className="fa-regular fa-arrow-up-right-from-square" />
          </Button>
          {renderSettingsButton()}
          <Button size="sm" className="btn-square" title={t('admin.common.refresh', '刷新')} onClick={() => fetchFootprints()} loading={loading}>
            <i className="fa-regular fa-arrows-rotate" />
          </Button>
        </div>
      </div>

      {!enabled && (
        <div className="card" style={{ padding: 14, marginBottom: 14, borderLeft: '3px solid #f59e0b', display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="fa-regular fa-circle-exclamation" style={{ color: '#d97706' }} />
          <span className="text-sub" style={{ fontSize: 13, flex: 1 }}>
            {t('admin.footprints.disabledHint', '足迹功能未启用，前台足迹页会显示关闭提示。')}
          </span>
          {renderSettingsButton()}
        </div>
      )}

      {enabled && !hasMapboxToken && (
        <div className="card" style={{ padding: 14, marginBottom: 14, borderLeft: '3px solid var(--color-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="fa-regular fa-map" style={{ color: 'var(--color-primary)' }} />
          <span className="text-sub" style={{ fontSize: 13, flex: 1 }}>
            {t('admin.footprints.noTokenHint', '尚未配置 Mapbox Token，前台地图不会渲染，只会显示足迹时间线。')}
          </span>
          {renderSettingsButton()}
        </div>
      )}

      <form onSubmit={onSearch} className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('admin.footprints.searchPlaceholder', '搜索城市、国家')}
            style={{ height: 36 }}
          />
        </div>
        <Button type="submit" size="sm" className="btn-square" title={t('admin.footprints.search', '搜索')} style={{ flexShrink: 0 }}>
          <i className="fa-regular fa-magnifying-glass" />
        </Button>
        {keyword && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="btn-square"
            title={t('admin.common.reset', '重置')}
            onClick={() => {
              setQuery('');
              setKeyword('');
              fetchFootprints('');
            }}
          >
            <i className="fa-regular fa-xmark" />
          </Button>
        )}
      </form>

      <div className="card" style={{ overflow: 'hidden' }}>
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
          <Table
            data={rows}
            columns={[
              {
                key: 'title',
                title: t('admin.footprints.columns.post', '文章'),
                render: (item: FootprintRow) => (
                  <button
                    type="button"
                    onClick={() => navigate(`/posts/edit/${item.post_id}`)}
                    className="text-primary-themed"
                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontWeight: 500 }}
                  >
                    {item.title || t('admin.posts.untitled', '未命名文章')}
                  </button>
                ),
              },
              {
                key: 'place',
                title: t('admin.footprints.columns.place', '地点'),
                width: '180px',
                render: (item: FootprintRow) => {
                  const flag = flagUrl(item.country_code);
                  return (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {flag && <img src={flag} alt="" style={{ width: 18, height: 13, objectFit: 'cover', boxShadow: '0 0 0 1px var(--color-border)' }} />}
                        <span>{item.place_id ? locationLabel(item) : t('admin.footprints.pending', '待配置')}</span>
                      </div>
                      {(item.latitude !== undefined || item.longitude !== undefined) && (
                        <div className="text-dim" style={{ fontSize: 11, marginTop: 4 }}>
                          {[item.latitude, item.longitude].filter((value) => value !== undefined && value !== null).join(', ')}
                        </div>
                      )}
                    </>
                  );
                },
              },
              {
                key: 'visited_at',
                title: t('admin.footprints.columns.date', '访问日期'),
                width: '150px',
                render: (item: FootprintRow) => <span className="text-dim" style={{ fontSize: 12 }}>{formatDate(item.visited_at || item.created_at || '')}</span>,
              },
              {
                key: 'actions',
                title: <span style={{ display: 'block', textAlign: 'right' }}>{t('admin.posts.columns.actions', '操作')}</span>,
                width: '90px',
                render: (item: FootprintRow) => (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      title={t('admin.footprints.editFootprint', '配置足迹')}
                      className="action-btn primary"
                    >
                      <i className="fa-regular fa-pen" style={{ fontSize: 14 }} />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/posts/edit/${item.post_id}`)}
                      title={t('admin.footprints.editPost', '编辑文章')}
                      className="action-btn"
                    >
                      <i className="fa-regular fa-file-pen" style={{ fontSize: 14 }} />
                    </button>
                    <button
                      type="button"
                      onClick={() => window.open(`/footprints?keyword=${encodeURIComponent(locationLabel(item))}`, '_blank', 'noopener,noreferrer')}
                      title={t('admin.footprints.viewOnSite', '前台查看')}
                      className="action-btn"
                    >
                      <i className="fa-regular fa-arrow-up-right-from-square" style={{ fontSize: 14 }} />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>

      <Modal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={t('admin.footprints.settings', '足迹设置')}
        size="lg"
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card" style={{ padding: 14 }}>
            <Toggle
              checked={settingsForm.footprint_enabled}
              onChange={(event) => updateSettingsForm({ footprint_enabled: event.target.checked })}
              label={t('admin.settings.footprint.enable', '启用足迹功能')}
              description={t('admin.settings.footprint.enableHint', '关闭后仍保留文章足迹数据，只是不在前台展示足迹入口。')}
            />
          </div>

          <div style={{ padding: '12px 14px', border: '1px solid var(--color-border)', background: 'var(--color-bg-soft)', fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-sub)' }}>
            <i className="fa-regular fa-key" style={{ marginRight: 6, color: 'var(--color-primary)' }} />
            {hasMapboxToken
              ? t('admin.settings.footprint.mapboxConfiguredHint', 'Mapbox Token 已在系统设置 → 第三方服务中配置。')
              : t('admin.settings.footprint.mapboxMovedHint', 'Mapbox Token 已移动到系统设置 → 第三方服务。配置后足迹地图和统计地图会共用同一个 Token。')}
            <button
              type="button"
              onClick={() => { window.location.href = '/admin/settings#services'; }}
              style={{ marginLeft: 10, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              {t('admin.common.goToSettings', '前往设置')}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12 }}>
            <div>
              <Input
                label={t('admin.settings.footprint.defaultCenter', '默认中心点')}
                value={settingsForm.footprint_default_center}
                onChange={(event) => updateSettingsForm({ footprint_default_center: event.target.value })}
                placeholder={defaultFootprintSettings.footprint_default_center}
              />
              <p className="text-dim" style={{ margin: '6px 0 0', fontSize: 12 }}>
                {t('admin.settings.footprint.defaultCenterHint', '格式：经度,纬度。足迹数据为空或地图初始化时使用。')}
              </p>
            </div>
            <div>
              <Input
                type="number"
                label={t('admin.settings.footprint.defaultZoom', '默认缩放')}
                value={settingsForm.footprint_default_zoom}
                onChange={(event) => updateSettingsForm({ footprint_default_zoom: event.target.value })}
                placeholder={defaultFootprintSettings.footprint_default_zoom}
                min="1"
                max="12"
              />
              <p className="text-dim" style={{ margin: '6px 0 0', fontSize: 12 }}>
                {t('admin.settings.footprint.defaultZoomHint', '建议 2-5，数值越大越近。')}
              </p>
            </div>
          </div>

          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              {t('admin.settings.footprint.geocoderProvider', '地理编码服务')}
            </label>
            <select
              className="input"
              value={settingsForm.footprint_geocoder_provider}
              onChange={(event) => updateSettingsForm({ footprint_geocoder_provider: event.target.value })}
            >
              <option value="wpista">{t('admin.settings.footprint.geocoderWpista', '临时服务：v.wpista.com/marker/geocode')}</option>
            </select>
            <p className="text-dim" style={{ margin: '6px 0 0', fontSize: 12 }}>
              {t('admin.settings.footprint.geocoderProviderHint', '暂时使用 Marker-pro 同款临时接口，后续可替换成你自己的接口。')}
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <Button type="button" variant="secondary" onClick={() => setSettingsOpen(false)}>
              {t('admin.common.cancel', '取消')}
            </Button>
            <Button type="button" onClick={saveSettings} loading={settingsSaving}>
              {t('admin.common.save', '保存')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={t('admin.footprints.editTitle', '配置足迹')}
        size="lg"
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12, marginBottom: 12 }}>
          <Input
            label={t('admin.footprint.country', '国家/地区')}
            value={form.country_name}
            onChange={(event) => updateForm({ country_name: event.target.value })}
            placeholder={t('admin.footprint.countryPlaceholder', '泰国 / 中国')}
          />
          <Input
            label={t('admin.footprint.countryCode', '代码')}
            value={form.country_code}
            onChange={(event) => updateForm({ country_code: event.target.value.toUpperCase() })}
            placeholder="TH"
            maxLength={2}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <Input
            label={t('admin.footprint.city', '城市')}
            value={form.city_name}
            onChange={(event) => updateForm({ city_name: event.target.value })}
            placeholder={t('admin.footprint.cityPlaceholder', '曼谷 / 新加坡，可留空只标国家')}
          />
        </div>
        <Button type="button" variant="secondary" onClick={geocode} loading={geocoding} style={{ width: '100%', gap: 8, marginBottom: 12 }}>
          <i className="fa-regular fa-location-crosshairs" />
          {t('admin.footprint.geocode', '获取坐标')}
        </Button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <Input
            label={t('admin.footprint.latitude', '纬度')}
            value={form.latitude}
            onChange={(event) => updateForm({ latitude: event.target.value })}
            placeholder="13.7563"
          />
          <Input
            label={t('admin.footprint.longitude', '经度')}
            value={form.longitude}
            onChange={(event) => updateForm({ longitude: event.target.value })}
            placeholder="100.5018"
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <Input
            type="date"
            label={t('admin.footprint.visitDate', '访问日期')}
            value={form.visited_at}
            onChange={(event) => updateForm({ visited_at: event.target.value })}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
            {t('admin.common.cancel', '取消')}
          </Button>
          <Button type="button" onClick={saveEdit} loading={saving}>
            {t('admin.common.save', '保存')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
