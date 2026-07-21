import { useEffect, useRef, useState } from 'react';
import {
  RefreshCw, Upload, Loader2, TriangleAlert, Lightbulb, Palette, Check,
  ExternalLink, Trash2, List, IdCard, AppWindow, LayoutGrid, Share2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { themesApi, type ExtensionManifest } from '@/lib/api';
import FooterIconsEditor from '@/components/FooterIconsEditor';
import AzureProfileSettings from '@/components/AzureProfileSettings';
import MenusPage from './Menus';
import { Button, buttonVariants, Card, ConfirmDialog, LoadingState } from '@/components/ui/shadcn';
import { cn } from '@/lib/utils';

export default function Themes() {
  const [tab, setTab] = useState<'themes' | 'menus' | 'profile' | 'header' | 'footer' | 'hero'>('themes');
  const [themes, setThemes] = useState<ExtensionManifest[]>([]);
  const [active, setActive] = useState<string>('');
  const [requestedTheme, setRequestedTheme] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const [azureAccent, setAzureAccent] = useState<'blue' | 'red'>('blue');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 当前 active 主题在 manifest 里声明了哪些自定义 admin panel —— tabs
  // 据此动态显示，避免给"用不到这个面板"的主题展示无效设置入口。
  const activeManifest = themes.find((t) => t.id === active);
  const adminPanels: string[] = activeManifest?.adminPanels
    || activeManifest?.admin_panels
    || [];
  const showProfile = adminPanels.includes('profile_card');
  const showHeader = adminPanels.includes('header_buttons');
  const showFooter = adminPanels.includes('footer_icons');
  const showHero = adminPanels.includes('hero_tiles');

  const fetchList = async () => {
    setLoading(true);
    try {
      const r: any = await themesApi.list();
      const d = r.data || r;
      setThemes(d.themes || []);
      setActive(d.active || '');
      setRequestedTheme(d.requested || null);
      setAzureAccent(d.azure_accent === 'red' ? 'red' : 'blue');
    } catch {
      toast.error('获取主题列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, []);

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast.error('请上传 .zip 格式的主题包');
      return;
    }
    setUploading(true);
    const tid = toast.loading('正在上传…');
    try {
      const r: any = await themesApi.upload(file);
      toast.success(`主题「${r.data?.name || r.name || '未命名'}」已安装`, { id: tid });
      fetchList();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || '上传失败', { id: tid });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleActivate = async (id: string, accent?: 'blue' | 'red') => {
    if (id === active && id !== 'Azure') return;
    if (id === active && id === 'Azure' && (!accent || accent === azureAccent)) return;
    setActivating(id);
    try {
      const payload = id === 'Azure' ? { accent: accent || azureAccent } : undefined;
      const res: any = await themesApi.activate(id, payload);
      const nextAccent = res?.data?.azure_accent === 'red' || payload?.accent === 'red' ? 'red' : 'blue';
      setActive(id);
      setAzureAccent(nextAccent);
      setRequestedTheme(null);
      setThemes((prev) => prev.map((t) => ({ ...t, enabled: t.id === id })));
      toast.success(id === 'Azure' && accent ? 'Azure 配色已更新' : '主题已切换，刷新前台即可生效');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || '切换失败');
    } finally {
      setActivating(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteId(null);
    try {
      await themesApi.remove(id);
      toast.success('主题已删除');
      fetchList();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || '删除失败');
    }
  };

  // Tab bar — themes / menus 始终显示；profile / header / footer 三个
  // 自定义面板按 activeManifest.adminPanels 决定是否出现。新主题想用
  // 哪个面板，在 manifest.json 里写 "adminPanels": [...] 即可。
  const allTabs: { key: typeof tab; label: string; Icon: typeof List; visible: boolean }[] = [
    { key: 'themes', label: '主题', Icon: Palette, visible: true },
    { key: 'menus', label: '菜单', Icon: List, visible: true },
    { key: 'profile', label: '资料卡', Icon: IdCard, visible: showProfile },
    { key: 'header', label: '头部按钮', Icon: AppWindow, visible: showHeader },
    { key: 'hero', label: '首页图块', Icon: LayoutGrid, visible: showHero },
    { key: 'footer', label: '页脚图标', Icon: Share2, visible: showFooter },
  ];
  const tabs = allTabs.filter(t => t.visible);
  // 如果当前 tab 在新主题里被隐藏（比如刚切了主题），自动回退到 themes
  useEffect(() => {
    if (!tabs.find(t => t.key === tab)) setTab('themes');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showProfile, showHeader, showFooter, showHero]);

  return (
    <div>
      <div className="mb-5 flex gap-1 border-b border-border">
        {tabs.map(ti => {
          const TabIcon = ti.Icon;
          const isActive = tab === ti.key;
          return (
            <button
              key={ti.key}
              onClick={() => setTab(ti.key)}
              className={cn(
                'inline-flex items-center gap-1.5 border-b-2 px-[18px] py-2.5 text-sm transition-colors',
                isActive
                  ? 'border-primary font-semibold text-primary'
                  : 'border-transparent font-normal text-muted-foreground hover:text-foreground',
              )}
            >
              <TabIcon className="size-3.5" />
              {ti.label}
            </button>
          );
        })}
      </div>

      {tab === 'menus' && <MenusPage />}
      {tab === 'profile' && showProfile && <AzureProfileSettings />}
      {tab === 'header' && showHeader && (
        <FooterIconsEditor
          optionKey="theme_header_buttons"
          title="头部图标按钮"
          emptyText="尚未配置额外按钮，主题头部仍会显示固定的随机访问和搜索按钮。"
          emptyRow={{ icon: 'fa-light fa-link', label: '按钮', href: '/' }}
          description={
            <>
              显示在主题头部右侧的额外正方形图标按钮；固定随机访问和搜索按钮由主题始终显示，不在这里删除。图标支持 FontAwesome 类名（如 <code>fa-light fa-link</code>）、
              图片 URL、内联 SVG、或上传图片。填写「复制文本」后点击按钮会复制内容，优先于链接。
            </>
          }
        />
      )}
      {tab === 'hero' && showHero && (
        <FooterIconsEditor
          optionKey="nebula_hero_tiles"
          title="首页 Hero 图块（最多 4 个）"
          emptyText="尚未配置，前台会显示主题内置的 4 个默认图块（影音 / 代码 / 旅行 / 日常）。添加第一个即覆盖默认。"
          emptyRow={{ icon: 'fa-solid fa-star', label: '图块', href: '/' }}
          description={
            <>
              首页顶部 Hero 区的 4 个图块按钮。位置 / 旋转 / 动画由主题 CSS 控制，按数组顺序填充第 1-4 位；超过 4 个会被忽略。图标支持 FontAwesome 类名（如 <code>fa-solid fa-tv-music</code>）、
              图片 URL、内联 SVG、或上传图片。「标题」会在鼠标悬浮时显示在图块下方；链接留空则该图块仅作展示。
            </>
          }
        />
      )}
      {tab === 'footer' && showFooter && <FooterIconsEditor />}
      {tab === 'themes' && <>
      {/* Toolbar */}
      <div className="mb-5 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          共 {themes.length} 个主题
          {active && (
            <>
              {' · 当前 '}
              <span className="font-semibold text-primary">
                {themes.find((t) => t.id === active)?.name || active}
              </span>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchList} disabled={loading} title="刷新列表">
            <RefreshCw className="size-4" />
          </Button>
          <Button size="icon" onClick={() => fileInputRef.current?.click()} disabled={uploading} title={uploading ? '上传中…' : '上传主题 .zip'}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />
        </div>
      </div>

      {/* Upload hint */}
      {requestedTheme && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="m-0">数据库记录的主题为 <strong>{requestedTheme}</strong>，但当前运行时不支持，前台实际渲染 <strong>{active}</strong>。请重新启用内置主题。</p>
        </div>
      )}
      <div className="mb-5 flex items-start gap-2 rounded-lg border border-border bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="m-0">主题包为 <code className="rounded bg-background px-1.5 py-0.5 text-[11px]">.zip</code> 格式，根目录包含 <code className="rounded bg-background px-1.5 py-0.5 text-[11px]">manifest.json</code>（含 <code>id / name / version</code>）。上传后自动解压到 <code className="rounded bg-background px-1.5 py-0.5 text-[11px]">content/themes/&lt;id&gt;/</code>。</p>
      </div>

      {/* Grid */}
      {loading ? (
        <LoadingState />
      ) : themes.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Palette className="size-8 text-muted-foreground" />
          <p className="m-0 text-sm text-muted-foreground">暂无主题，点「上传主题」安装第一个</p>
        </Card>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {themes.map((theme) => {
            const isActive = theme.id === active;
            const canActivate = theme.supported !== false;
            return (
              <Card
                key={theme.id}
                className={cn(
                  'relative flex flex-col overflow-hidden p-0',
                  isActive ? 'border-primary' : 'border-border',
                )}
              >
                <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-muted">
                  {/* Fallback layer — theme name + initial, shown before img loads or when img fails */}
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
                    <div className="flex size-10 items-center justify-center rounded bg-primary/10 text-lg font-bold text-primary">
                      {theme.name?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <span className="text-[11px] uppercase tracking-wider">{theme.name}</span>
                  </div>
                  {theme.preview && (
                    <img src={theme.preview} alt={theme.name}
                      className="relative z-[1] size-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                </div>

                {isActive && (
                  <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                    <Check className="size-2.5" /> 使用中
                  </div>
                )}

                <div className="flex flex-1 flex-col p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="m-0 text-sm font-semibold text-foreground">
                      {theme.name}
                    </h3>
                    <span className="text-[11px] text-muted-foreground">v{theme.version}</span>
                  </div>
                  {theme.author && (
                    <p className="mb-2 mt-0 text-[11px] text-muted-foreground">by {theme.author}</p>
                  )}
                  {theme.description && (
                    <p className="mb-3 mt-0 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{theme.description}</p>
                  )}
                  {theme.supported === false && (
                    <p className="mb-3 mt-0 text-[11px] text-amber-600 dark:text-amber-400">
                      当前运行时不支持此主题，暂不可切换
                    </p>
                  )}
                  {theme.id === 'Azure' && isActive && (
                    <div className="mb-3 flex gap-2">
                      {(['blue', 'red'] as const).map((accent) => (
                        <Button
                          key={accent}
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={activating === theme.id}
                          onClick={() => handleActivate('Azure', accent)}
                          className={cn(
                            'flex-1',
                            azureAccent === accent ? 'border-primary bg-primary/10' : 'border-border',
                            accent === 'red' ? 'text-[#F53102] hover:text-[#F53102]' : 'text-primary hover:text-primary',
                          )}
                        >
                          {accent === 'blue' ? '蔚蓝' : '中国红'}
                        </Button>
                      ))}
                    </div>
                  )}

                  {/* mt-auto pushes the action row to the bottom of the card so
                      every theme's button lines up regardless of description length. */}
                  <div className="mt-auto flex gap-1.5">
                    {isActive ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled
                        className="flex-1 border-primary bg-primary/10 text-primary opacity-100 disabled:opacity-100"
                      >
                        <Check className="size-3.5" /> 当前主题
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={activating === theme.id || !canActivate}
                        onClick={() => handleActivate(theme.id)}
                      >
                        {activating === theme.id ? '切换中…' : (canActivate ? '启用' : '暂不可用')}
                      </Button>
                    )}
                    {theme.homepage && (
                      <a
                        href={theme.homepage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'px-2.5')}
                        title="主页"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                    {!isActive && !theme.builtin && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="px-2.5 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(theme.id)}
                        title="删除"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        title="确认删除主题？"
        message={`将永久删除主题「${themes.find((t) => t.id === deleteId)?.name || ''}」，不可撤销。`}
        confirmText="删除"
      />

      </>}
    </div>
  );
}
