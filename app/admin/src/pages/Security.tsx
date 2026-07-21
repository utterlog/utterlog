import * as React from 'react';
import { useEffect, useState } from 'react';
import {
  PieChart, Ban, History, SlidersHorizontal, Lock, ShieldHalf, Globe,
} from 'lucide-react';
import api, { optionsApi } from '@/lib/api';
import { MetricCard, MetricGrid } from '@/components/ui';
import {
  Badge, Button, Input, Label, Switch, Card, CardHeader, CardTitle, CardDescription, CardContent,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/shadcn';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useI18n } from '@/lib/i18n';
import { formatWithAdminTimeZone } from '@/lib/timezone';

const tabs = [
  { id: '概览',     label: '概览',     key: 'admin.security.tabs.overview', Icon: PieChart },
  { id: '封禁管理', label: '封禁管理', key: 'admin.security.tabs.bans', Icon: Ban },
  { id: '安全事件', label: '安全事件', key: 'admin.security.tabs.events', Icon: History },
  { id: '防御设置', label: '防御设置', key: 'admin.security.tabs.settings', Icon: SlidersHorizontal },
];

const toPositiveNumber = (value: string, fallback: number) => {
  const next = Number.parseInt(value, 10);
  return Number.isFinite(next) && next > 0 ? next : fallback;
};

// Settings row —— 左侧 label + hint，右侧控件。替代旧 FormRow*C。
function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3.5 last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

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
      await optionsApi.updateMany({
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
      <div className="mb-7 flex gap-1 border-b border-border">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const TabIcon = tab.Icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-[18px] py-2.5 text-[13px] transition-colors',
                isActive
                  ? 'border-primary font-semibold text-primary'
                  : 'border-transparent font-normal text-muted-foreground hover:text-foreground',
              )}
            >
              <TabIcon className="size-3.5" />
              {t(tab.key, tab.label)}
            </button>
          );
        })}
      </div>

      {/* 概览 */}
      {activeTab === '概览' && overview && (
        <div>
          <MetricGrid compact>
            <MetricCard label={t('admin.security.overview.activeBans', '活跃封禁')} value={overview.active_bans} color="#dc2626" />
            <MetricCard label={t('admin.security.overview.events24h', '24h 安全事件')} value={overview.events_24h} color="#f59e0b" />
            <MetricCard label={t('admin.security.overview.totalEvents', '安全事件')} value={overview.total_events} color="#8b5cf6" />
          </MetricGrid>
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <h3 className="mb-2 text-[13px] font-semibold text-foreground">{t('admin.security.overview.defenseStatus', '防御状态')}</h3>
              <div className="text-[13px]">
                <div className="flex justify-between py-1.5">
                  <span>{t('admin.security.settings.ccDefense', 'CC 防御')}</span>
                  <span className={overview.cc_enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>{overview.cc_enabled ? t('admin.common.onDot', '● 开启') : t('admin.common.offDot', '● 关闭')}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span>{t('admin.security.settings.geoBlock', 'GeoIP 封锁')}</span>
                  <span className={overview.geo_enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>{overview.geo_enabled ? t('admin.common.onDot', '● 开启') : t('admin.common.offDot', '● 关闭')}</span>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="mb-2 text-[13px] font-semibold text-foreground">{t('admin.security.overview.stats', '统计')}</h3>
              <div className="text-[13px]">
                <div className="flex justify-between py-1.5"><span>{t('admin.security.overview.totalBans', '累计封禁')}</span><span>{overview.total_bans}</span></div>
                <div className="flex justify-between py-1.5"><span>{t('admin.security.overview.totalEvents', '安全事件')}</span><span>{overview.total_events}</span></div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* 封禁管理 */}
      {activeTab === '封禁管理' && (
        <div>
          <Card className="mb-4 flex items-end gap-2 p-4">
            <div className="flex-1"><Label className="mb-1 block text-xs text-muted-foreground">{t('admin.security.bans.ipAddress', 'IP 地址')}</Label><Input value={banIP} onChange={e => setBanIP(e.target.value)} placeholder="192.168.1.1" /></div>
            <div className="flex-1"><Label className="mb-1 block text-xs text-muted-foreground">{t('admin.security.bans.reason', '原因')}</Label><Input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder={t('admin.common.optional', '可选')} /></div>
            <div className="w-[100px]"><Label className="mb-1 block text-xs text-muted-foreground">{t('admin.security.bans.durationMinutes', '时长(分)')}</Label><Input value={banDuration} onChange={e => setBanDuration(e.target.value)} placeholder="60" /></div>
            <Button onClick={handleBan}>{t('admin.security.bans.ban', '封禁')}</Button>
          </Card>

          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP</TableHead>
                  <TableHead>{t('admin.security.bans.reason', '原因')}</TableHead>
                  <TableHead>{t('admin.security.bans.type', '类型')}</TableHead>
                  <TableHead>{t('admin.security.bans.duration', '时长')}</TableHead>
                  <TableHead>{t('admin.security.bans.expires', '过期')}</TableHead>
                  <TableHead>{t('admin.common.actions', '操作')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">{t('admin.security.bans.empty', '暂无封禁')}</TableCell>
                  </TableRow>
                ) : (
                  bans.map((b: any, index: number) => (
                    <TableRow key={b.ip || index}>
                      <TableCell className="font-medium">{typeof b.ip === 'string' ? b.ip : ''}</TableCell>
                      <TableCell className="text-muted-foreground">{typeof b.reason === 'string' ? b.reason : ''}</TableCell>
                      <TableCell>
                        <Badge className={cn('border-transparent', b.ban_type === 'auto' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-destructive/15 text-destructive')}>
                          {b.ban_type === 'auto' ? t('admin.security.bans.auto', '自动') : t('admin.security.bans.manual', '手动')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{b.duration ? t('admin.security.bans.minutes', '{count}分', { count: b.duration }) : t('admin.security.bans.permanent', '永久')}</TableCell>
                      <TableCell className="text-muted-foreground">{b.expires_at ? fmtTime(b.expires_at) : t('admin.security.bans.permanent', '永久')}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-primary" onClick={() => handleUnban(b.ip)}>{t('admin.security.bans.unban', '解封')}</Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* 安全事件 */}
      {activeTab === '安全事件' && (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin.common.time', '时间')}</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>{t('admin.security.events.event', '事件')}</TableHead>
                <TableHead>{t('admin.security.events.detail', '详情')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {timeline.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">{t('admin.security.events.empty', '暂无事件')}</TableCell>
                </TableRow>
              ) : (
                timeline.map((e: any, index: number) => (
                  <TableRow key={`${e.created_at || ''}-${e.ip || ''}-${index}`}>
                    <TableCell className="text-muted-foreground">{fmtTime(e.created_at)}</TableCell>
                    <TableCell className="font-medium">{typeof e.ip === 'string' ? e.ip : ''}</TableCell>
                    <TableCell><Badge variant="secondary">{typeof e.event_type === 'string' ? e.event_type : ''}</Badge></TableCell>
                    <TableCell>
                      <span className="inline-block max-w-[200px] truncate text-muted-foreground">
                        {typeof e.detail === 'string' ? e.detail : ''}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* 防御设置 */}
      {activeTab === '防御设置' && (
        <div className="max-w-[980px]">
          <p className="mx-4 mb-[22px] text-xs leading-relaxed text-muted-foreground">
            {t('admin.security.settings.personalBlogHint', '个人博客建议保持默认：CC 防御和地域封锁默认关闭，只有被刷、临时私密访问或需要限制地区访问时再开启。')}
          </p>

          <Card className="mb-4">
            <CardHeader className="p-4 pb-0">
              <CardTitle className="flex items-center gap-2 text-sm"><Lock className="size-4 text-muted-foreground" />{t('admin.security.access.section', '访问控制')}</CardTitle>
              <CardDescription className="text-xs">{t('admin.security.access.description', '控制前台访问和基础 API 访问频率，适合私密博客或临时限流。')}</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <SettingRow
                label={t('admin.security.access.requireLogin', '需要登录才能访问前台')}
                hint={t('admin.security.access.requireLoginHint', '开启后，未登录访客不能直接访问前台页面。')}
              >
                <Switch checked={accessOpts.require_login} onCheckedChange={(checked) => setAccessOpts({ ...accessOpts, require_login: checked })} />
              </SettingRow>
              <SettingRow
                label={t('admin.security.access.apiRateLimit', 'API 限流')}
                hint={t('admin.security.access.apiRateLimitHint', '次/分钟，超出返回 429。')}
              >
                <Input type="number" className="w-[120px]" value={String(accessOpts.rate_limit)} onChange={(e) => setAccessOpts({ ...accessOpts, rate_limit: toPositiveNumber(e.target.value, 60) })} />
              </SettingRow>
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader className="p-4 pb-0">
              <CardTitle className="flex items-center gap-2 text-sm"><ShieldHalf className="size-4 text-muted-foreground" />{t('admin.security.settings.ccTitle', 'CC 防御（频率限制）')}</CardTitle>
              <CardDescription className="text-xs">{t('admin.security.settings.ccDescription', '用于拦截短时间高频访问。个人博客默认关闭即可，被刷时再启用。')}</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <SettingRow
                label={t('admin.security.settings.enableCc', '启用 CC 防御')}
                hint={t('admin.security.settings.enableCcHint', '开启后会按下面阈值拦截同一 IP 的高频请求。')}
              >
                <Switch checked={settings.cc_enabled ?? false} onCheckedChange={(checked) => setSettings({ ...settings, cc_enabled: checked })} />
              </SettingRow>
              <SettingRow
                label={t('admin.security.settings.ccLimit5s', '5 秒内最大请求')}
                hint={t('admin.security.settings.ccLimit5sHint', '用于拦截瞬时高频刷新。')}
              >
                <Input type="number" className="w-[120px]" value={String(settings.cc_limit_5s ?? 30)} onChange={(e) => setSettings({ ...settings, cc_limit_5s: toPositiveNumber(e.target.value, 30) })} />
              </SettingRow>
              <SettingRow
                label={t('admin.security.settings.ccLimit60s', '60 秒内最大请求')}
                hint={t('admin.security.settings.ccLimit60sHint', '用于拦截持续高频请求。')}
              >
                <Input type="number" className="w-[120px]" value={String(settings.cc_limit_60s ?? 120)} onChange={(e) => setSettings({ ...settings, cc_limit_60s: toPositiveNumber(e.target.value, 120) })} />
              </SettingRow>
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader className="p-4 pb-0">
              <CardTitle className="flex items-center gap-2 text-sm"><Globe className="size-4 text-muted-foreground" />{t('admin.security.settings.geoTitle', 'GeoIP 地域封锁')}</CardTitle>
              <CardDescription className="text-xs">{t('admin.security.settings.geoDescription', 'GeoIP 数据源会用于统计和归属地。地域封锁属于高级功能，开启前建议优先使用黑名单模式。')}</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <SettingRow
                label={t('admin.security.settings.geoProvider', 'GeoIP 数据源')}
                hint={t('admin.security.settings.geoProviderHint', '用于访客统计、评论归属地、GeoIP 封锁和服务器出口 IP 识别。')}
              >
                <Select value={settings.ip_geo_provider || 'ipx'} onValueChange={(v) => setSettings({ ...settings, ip_geo_provider: v })}>
                  <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ipx">{t('admin.security.settings.geoProviderIpx', '国际默认源（国外更准确）')}</SelectItem>
                    <SelectItem value="cnip">{t('admin.security.settings.geoProviderCnip', '国内备用源（国内更准确）')}</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
              <SettingRow
                label={t('admin.security.settings.enableGeo', '启用地域封锁')}
                hint={t('admin.security.settings.enableGeoHint', '只影响访问拦截，不影响 GeoIP 数据源用于统计。')}
              >
                <Switch checked={settings.geo_enabled ?? false} onCheckedChange={(checked) => setSettings({ ...settings, geo_enabled: checked })} />
              </SettingRow>
              <SettingRow
                label={t('admin.security.settings.geoMode', '模式')}
                hint={t('admin.security.settings.geoModeHint', '个人博客通常建议使用黑名单，只封锁明确不希望访问的国家或地区。')}
              >
                <Select value={settings.geo_mode || 'whitelist'} onValueChange={(v) => setSettings({ ...settings, geo_mode: v })}>
                  <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whitelist">{t('admin.security.settings.geoWhitelist', '白名单（只允许列表中的国家）')}</SelectItem>
                    <SelectItem value="blacklist">{t('admin.security.settings.geoBlacklist', '黑名单（封锁列表中的国家）')}</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
              <SettingRow
                label={t('admin.security.settings.countryCodes', '国家代码')}
                hint={t('admin.security.settings.countryCodesHint', '逗号分隔，如 CN,HK,TW。')}
              >
                <Input
                  className="w-[240px]"
                  value={(settings.geo_countries || []).join(',')}
                  onChange={(e) => setSettings({
                    ...settings,
                    geo_countries: e.target.value.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean),
                  })}
                />
              </SettingRow>
            </CardContent>
          </Card>

          <div className="mt-2 flex justify-end border-t border-border pt-6">
            <Button onClick={saveSettings} disabled={saving}>
              {t('admin.security.settings.saveCcGeo', '保存设置')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
