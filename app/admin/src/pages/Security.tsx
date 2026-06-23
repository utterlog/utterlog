
import { useEffect, useState } from 'react';
import api, { optionsApi } from '@/lib/api';
import { Badge, Button, Input, MetricCard, MetricGrid, Table } from '@/components/ui';
import { FormSectionC, FormRowInputC, FormRowSelectC, FormRowToggleC } from '@/components/form/FormC';
import toast from 'react-hot-toast';
import { useI18n } from '@/lib/i18n';
import { formatWithAdminTimeZone } from '@/lib/timezone';

const tabs = [
  { id: '概览',     label: '概览',     key: 'admin.security.tabs.overview', icon: 'fa-regular fa-chart-pie' },
  { id: '封禁管理', label: '封禁管理', key: 'admin.security.tabs.bans', icon: 'fa-regular fa-ban' },
  { id: '安全事件', label: '安全事件', key: 'admin.security.tabs.events', icon: 'fa-regular fa-clock-rotate-left' },
  { id: '防御设置', label: '防御设置', key: 'admin.security.tabs.settings', icon: 'fa-regular fa-sliders' },
];

const toPositiveNumber = (value: string, fallback: number) => {
  const next = Number.parseInt(value, 10);
  return Number.isFinite(next) && next > 0 ? next : fallback;
};

export default function SecurityPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('概览');
  const [overview, setOverview] = useState<any>(null);
  const [bans, setBans] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  // Access control (merged from old /settings?tab=security)
  const [accessOpts, setAccessOpts] = useState<{ require_login: boolean; rate_limit: number }>({
    require_login: false, rate_limit: 60,
  });
  const [banIP, setBanIP] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('60');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (activeTab === '概览') api.get('/security/overview').then((r: any) => setOverview(r.data || r)).catch(() => {});
    if (activeTab === '封禁管理') api.get('/security/bans').then((r: any) => setBans(r.data || [])).catch(() => {});
    if (activeTab === '安全事件') api.get('/security/timeline').then((r: any) => setTimeline(r.data || [])).catch(() => {});
    if (activeTab === '防御设置') {
      api.get('/security/settings').then((r: any) => setSettings(r.data || r)).catch(() => {});
      // Also load access-control options
      optionsApi.list().then((r: any) => {
        const opts = r.data || r || {};
        setAccessOpts({
          require_login: opts.require_login === true || opts.require_login === 'true',
          rate_limit: Number(opts.rate_limit) || 60,
        });
      }).catch(() => {});
    }
  }, [activeTab]);

  const handleBan = async () => {
    if (!banIP) return;
    try {
      await api.post('/security/ban', { ip: banIP, reason: banReason, duration: parseInt(banDuration) });
      toast.success(t('admin.security.toast.banned', '已封禁')); setBanIP(''); setBanReason('');
      api.get('/security/bans').then((r: any) => setBans(r.data || []));
    } catch { toast.error(t('admin.security.toast.banFailed', '封禁失败')); }
  };

  const handleUnban = async (ip: string) => {
    try { await api.post('/security/unban', { ip }); toast.success(t('admin.security.toast.unbanned', '已解封')); setBans(bans.filter(b => b.ip !== ip)); } catch { toast.error(t('admin.common.operationFailed', '操作失败')); }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await api.put('/options', {
        require_login: accessOpts.require_login,
        rate_limit: accessOpts.rate_limit,
      });
      await api.post('/security/settings', settings);
      toast.success(t('admin.settings.toast.saved', '设置已保存'));
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || t('admin.settings.toast.saveFailed', '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const fmtTime = (ts: any) => {
    if (!ts) return '-';
    const n = typeof ts === 'number' ? ts : parseInt(ts);
    return formatWithAdminTimeZone(new Date(n * 1000), 'zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--color-border)', marginBottom: '28px' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 18px', fontSize: '13px', fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-text-sub)',
              borderTop: 'none', borderLeft: 'none', borderRight: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
              background: 'none', cursor: 'pointer', transition: 'all 0.15s',
              whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px',
            }}
          >
            <i className={tab.icon} style={{ fontSize: '13px' }} />
            {t(tab.key, tab.label)}
          </button>
        ))}
      </div>

      {/* 概览 */}
      {activeTab === '概览' && overview && (
        <div>
          <MetricGrid compact>
            <MetricCard label={t('admin.security.overview.activeBans', '活跃封禁')} value={overview.active_bans} color="#dc2626" />
            <MetricCard label={t('admin.security.overview.events24h', '24h 安全事件')} value={overview.events_24h} color="#f59e0b" />
            <MetricCard label={t('admin.security.overview.totalEvents', '安全事件')} value={overview.total_events} color="#8b5cf6" />
          </MetricGrid>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="card" style={{ padding: '16px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>{t('admin.security.overview.defenseStatus', '防御状态')}</h3>
              <div style={{ fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span>{t('admin.security.settings.ccDefense', 'CC 防御')}</span>
                  <span style={{ color: overview.cc_enabled ? '#16a34a' : '#dc2626' }}>{overview.cc_enabled ? t('admin.common.onDot', '● 开启') : t('admin.common.offDot', '● 关闭')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span>{t('admin.security.settings.geoBlock', 'GeoIP 封锁')}</span>
                  <span style={{ color: overview.geo_enabled ? '#16a34a' : '#dc2626' }}>{overview.geo_enabled ? t('admin.common.onDot', '● 开启') : t('admin.common.offDot', '● 关闭')}</span>
                </div>
              </div>
            </div>
            <div className="card" style={{ padding: '16px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>{t('admin.security.overview.stats', '统计')}</h3>
              <div style={{ fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span>{t('admin.security.overview.totalBans', '累计封禁')}</span><span>{overview.total_bans}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span>{t('admin.security.overview.totalEvents', '安全事件')}</span><span>{overview.total_events}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 封禁管理 */}
      {activeTab === '封禁管理' && (
        <div>
          <div className="card" style={{ padding: '16px', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}><label className="text-xs text-sub block mb-1">{t('admin.security.bans.ipAddress', 'IP 地址')}</label><Input value={banIP} onChange={e => setBanIP(e.target.value)} placeholder="192.168.1.1" /></div>
            <div style={{ flex: 1 }}><label className="text-xs text-sub block mb-1">{t('admin.security.bans.reason', '原因')}</label><Input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder={t('admin.common.optional', '可选')} /></div>
            <div style={{ width: '100px' }}><label className="text-xs text-sub block mb-1">{t('admin.security.bans.durationMinutes', '时长(分)')}</label><Input value={banDuration} onChange={e => setBanDuration(e.target.value)} placeholder="60" /></div>
            <Button onClick={handleBan}>{t('admin.security.bans.ban', '封禁')}</Button>
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <Table
              data={bans.map((ban, index) => ({ ...ban, id: ban.ip || index }))}
              emptyText={t('admin.security.bans.empty', '暂无封禁')}
              columns={[
                { key: 'ip', title: 'IP', render: (b) => <span style={{ fontWeight: 500 }}>{typeof b.ip === 'string' ? b.ip : ''}</span> },
                { key: 'reason', title: t('admin.security.bans.reason', '原因'), render: (b) => <span className="text-dim">{typeof b.reason === 'string' ? b.reason : ''}</span> },
                {
                  key: 'ban_type',
                  title: t('admin.security.bans.type', '类型'),
                  render: (b) => (
                    <Badge variant={b.ban_type === 'auto' ? 'warning' : 'error'}>
                      {b.ban_type === 'auto' ? t('admin.security.bans.auto', '自动') : t('admin.security.bans.manual', '手动')}
                    </Badge>
                  ),
                },
                { key: 'duration', title: t('admin.security.bans.duration', '时长'), render: (b) => <span className="text-dim">{b.duration ? t('admin.security.bans.minutes', '{count}分', { count: b.duration }) : t('admin.security.bans.permanent', '永久')}</span> },
                { key: 'expires_at', title: t('admin.security.bans.expires', '过期'), render: (b) => <span className="text-dim">{b.expires_at ? fmtTime(b.expires_at) : t('admin.security.bans.permanent', '永久')}</span> },
                {
                  key: 'actions',
                  title: t('admin.common.actions', '操作'),
                  render: (b) => <button onClick={() => handleUnban(b.ip)} className="text-primary-themed" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>{t('admin.security.bans.unban', '解封')}</button>,
                },
              ]}
            />
          </div>
        </div>
      )}

      {/* 安全事件 */}
      {activeTab === '安全事件' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <Table
            data={timeline.map((event, index) => ({ ...event, id: `${event.created_at || ''}-${event.ip || ''}-${index}` }))}
            emptyText={t('admin.security.events.empty', '暂无事件')}
            columns={[
              { key: 'created_at', title: t('admin.common.time', '时间'), render: (e) => <span className="text-dim">{fmtTime(e.created_at)}</span> },
              { key: 'ip', title: 'IP', render: (e) => <span style={{ fontWeight: 500 }}>{typeof e.ip === 'string' ? e.ip : ''}</span> },
              { key: 'event_type', title: t('admin.security.events.event', '事件'), render: (e) => <Badge>{typeof e.event_type === 'string' ? e.event_type : ''}</Badge> },
              {
                key: 'detail',
                title: t('admin.security.events.detail', '详情'),
                render: (e) => (
                  <span className="text-dim" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                    {typeof e.detail === 'string' ? e.detail : ''}
                  </span>
                ),
              },
            ]}
          />
        </div>
      )}

      {/* 防御设置 */}
      {activeTab === '防御设置' && (
        <div style={{ maxWidth: 980 }}>
          <p className="text-dim" style={{ fontSize: 12, lineHeight: 1.7, margin: '0 16px 22px' }}>
            {t('admin.security.settings.personalBlogHint', '个人博客建议保持默认：CC 防御和地域封锁默认关闭，只有被刷、临时私密访问或需要限制地区访问时再开启。')}
          </p>

          <FormSectionC
            title={t('admin.security.access.section', '访问控制')}
            icon="fa-regular fa-lock"
            description={t('admin.security.access.description', '控制前台访问和基础 API 访问频率，适合私密博客或临时限流。')}
          >
            <FormRowToggleC
              label={t('admin.security.access.requireLogin', '需要登录才能访问前台')}
              hint={t('admin.security.access.requireLoginHint', '开启后，未登录访客不能直接访问前台页面。')}
              checked={accessOpts.require_login}
              onChange={(checked) => setAccessOpts({ ...accessOpts, require_login: checked })}
            />
            <FormRowInputC
              label={t('admin.security.access.apiRateLimit', 'API 限流')}
              hint={t('admin.security.access.apiRateLimitHint', '次/分钟，超出返回 429。')}
              type="number"
              value={String(accessOpts.rate_limit)}
              onChange={(value) => setAccessOpts({ ...accessOpts, rate_limit: toPositiveNumber(value, 60) })}
              last
            />
          </FormSectionC>

          <FormSectionC
            title={t('admin.security.settings.ccTitle', 'CC 防御（频率限制）')}
            icon="fa-regular fa-shield-halved"
            description={t('admin.security.settings.ccDescription', '用于拦截短时间高频访问。个人博客默认关闭即可，被刷时再启用。')}
          >
            <FormRowToggleC
              label={t('admin.security.settings.enableCc', '启用 CC 防御')}
              hint={t('admin.security.settings.enableCcHint', '开启后会按下面阈值拦截同一 IP 的高频请求。')}
              checked={settings.cc_enabled ?? false}
              onChange={(checked) => setSettings({ ...settings, cc_enabled: checked })}
            />
            <FormRowInputC
              label={t('admin.security.settings.ccLimit5s', '5 秒内最大请求')}
              hint={t('admin.security.settings.ccLimit5sHint', '用于拦截瞬时高频刷新。')}
              type="number"
              value={String(settings.cc_limit_5s ?? 30)}
              onChange={(value) => setSettings({ ...settings, cc_limit_5s: toPositiveNumber(value, 30) })}
            />
            <FormRowInputC
              label={t('admin.security.settings.ccLimit60s', '60 秒内最大请求')}
              hint={t('admin.security.settings.ccLimit60sHint', '用于拦截持续高频请求。')}
              type="number"
              value={String(settings.cc_limit_60s ?? 120)}
              onChange={(value) => setSettings({ ...settings, cc_limit_60s: toPositiveNumber(value, 120) })}
              last
            />
          </FormSectionC>

          <FormSectionC
            title={t('admin.security.settings.geoTitle', 'GeoIP 地域封锁')}
            icon="fa-regular fa-globe"
            description={t('admin.security.settings.geoDescription', 'GeoIP 数据源会用于统计和归属地。地域封锁属于高级功能，开启前建议优先使用黑名单模式。')}
          >
            <FormRowSelectC
              label={t('admin.security.settings.geoProvider', 'GeoIP 数据源')}
              hint={t('admin.security.settings.geoProviderHint', '用于访客统计、评论归属地、GeoIP 封锁和服务器出口 IP 识别。')}
              value={settings.ip_geo_provider || 'ipx'}
              onChange={(value) => setSettings({ ...settings, ip_geo_provider: value })}
              options={[
                { value: 'ipx', label: t('admin.security.settings.geoProviderIpx', '国际默认源（国外更准确）') },
                { value: 'cnip', label: t('admin.security.settings.geoProviderCnip', '国内备用源（国内更准确）') },
              ]}
              controlWidth="100%"
            />
            <FormRowToggleC
              label={t('admin.security.settings.enableGeo', '启用地域封锁')}
              hint={t('admin.security.settings.enableGeoHint', '只影响访问拦截，不影响 GeoIP 数据源用于统计。')}
              checked={settings.geo_enabled ?? false}
              onChange={(checked) => setSettings({ ...settings, geo_enabled: checked })}
            />
            <FormRowSelectC
              label={t('admin.security.settings.geoMode', '模式')}
              hint={t('admin.security.settings.geoModeHint', '个人博客通常建议使用黑名单，只封锁明确不希望访问的国家或地区。')}
              value={settings.geo_mode || 'whitelist'}
              onChange={(value) => setSettings({ ...settings, geo_mode: value })}
              options={[
                { value: 'whitelist', label: t('admin.security.settings.geoWhitelist', '白名单（只允许列表中的国家）') },
                { value: 'blacklist', label: t('admin.security.settings.geoBlacklist', '黑名单（封锁列表中的国家）') },
              ]}
              controlWidth="100%"
            />
            <FormRowInputC
              label={t('admin.security.settings.countryCodes', '国家代码')}
              hint={t('admin.security.settings.countryCodesHint', '逗号分隔，如 CN,HK,TW。')}
              value={(settings.geo_countries || []).join(',')}
              onChange={(value) => setSettings({
                ...settings,
                geo_countries: value.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean),
              })}
              last
            />
          </FormSectionC>

          <div style={{ paddingTop: '24px', borderTop: '1px solid var(--color-border)', marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={saveSettings} loading={saving}>
              {t('admin.security.settings.saveCcGeo', '保存设置')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
