import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import api, { optionsApi } from '@/lib/api';
import { ConfirmDialog, LoadingState, Modal, SaveButton } from '@/components/ui';
import { Button, Input, Textarea } from '@/components/ui/shadcn';
import { cn } from '@/lib/utils';
import {
  LayoutGrid, User, Sparkles, Music, History, FileCode,
  RotateCcw, Plus, ChevronUp, ChevronDown, Trash2,
  type LucideIcon,
} from 'lucide-react';

type AboutProfile = {
  name: string;
  avatar: string;
  title: string;
  bio: string;
  mbti: string;
  location: string;
  status: string;
  occupation: string;
  languages: string;
  focus: string;
};

type AboutHobby = {
  icon: string;
  title: string;
  description: string;
};

type AboutMusic = {
  title: string;
  artist: string;
  note: string;
  url: string;
};

type AboutUpdate = {
  date: string;
  type: string;
  title: string;
  description: string;
};

type AboutConfig = {
  mode: 'template' | 'markdown';
  template: string;
  profile: AboutProfile;
  hobbies: AboutHobby[];
  music: AboutMusic[];
  updates: AboutUpdate[];
};

type TabKey = 'template' | 'profile' | 'hobbies' | 'music' | 'updates' | 'custom';

const defaultConfig: AboutConfig = {
  mode: 'template',
  template: 'profile',
  profile: {
    name: '',
    avatar: '',
    title: '',
    bio: '',
    mbti: 'INTJ',
    location: '',
    status: '持续写作中',
    occupation: '独立博客作者',
    languages: '中文 / English',
    focus: '产品、设计、开发',
  },
  hobbies: [
    { icon: 'fa-sharp fa-light fa-pen-nib', title: '写作', description: '记录产品、设计、技术和生活里的长期问题。' },
    { icon: 'fa-sharp fa-light fa-camera-retro', title: '摄影', description: '用图片保存路上的光线、城市和一些偶然瞬间。' },
    { icon: 'fa-sharp fa-light fa-music', title: '音乐', description: '工作和通勤时离不开的背景声，也会收藏阶段性的循环歌单。' },
    { icon: 'fa-sharp fa-light fa-plane-departure', title: '旅行', description: '喜欢慢一点认识城市，把去过的地方写进文章和足迹。' },
  ],
  music: [
    { title: 'Late Night Drive', artist: 'Playlist', note: '适合深夜写作', url: '' },
    { title: 'City Walk', artist: 'Daily Mix', note: '适合散步和整理思路', url: '' },
    { title: 'Focus Mode', artist: 'Instrumental', note: '适合编码和阅读', url: '' },
  ],
  updates: [
    { date: '2026-04-29', type: '更新', title: '关于页升级', description: '将关于页面改为结构化个人资料、兴趣、音乐和站点记录。' },
    { date: '2026-04-01', type: '记录', title: '持续写作', description: '继续用文章保存想法、项目和旅途中的观察。' },
    { date: '2026-01-01', type: '开始', title: '新的一年', description: '整理站点方向，让博客更像一个长期主页。' },
  ],
};

const tabs: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: 'template', label: '模板', icon: LayoutGrid },
  { key: 'profile', label: '基础资料', icon: User },
  { key: 'hobbies', label: '兴趣爱好', icon: Sparkles },
  { key: 'music', label: '音乐', icon: Music },
  { key: 'updates', label: '站点记录', icon: History },
  { key: 'custom', label: 'Markdown 内容', icon: FileCode },
];

const fieldRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '120px minmax(0, 1fr)',
  gap: 12,
  alignItems: 'center',
  minHeight: 48,
};

const fieldLabelCls = 'text-sm font-semibold text-muted-foreground';

const aboutActionButtonStyle: CSSProperties = {
  minWidth: 210,
  paddingLeft: 22,
  paddingRight: 22,
  justifyContent: 'center',
};

function mergeConfig(raw: any): AboutConfig {
  const parsed = raw && typeof raw === 'object' ? raw : {};
  return {
    mode: parsed.mode === 'markdown' ? 'markdown' : 'template',
    template: parsed.template || defaultConfig.template,
    profile: { ...defaultConfig.profile, ...(parsed.profile || {}) },
    hobbies: Array.isArray(parsed.hobbies) && parsed.hobbies.length ? parsed.hobbies : defaultConfig.hobbies,
    music: Array.isArray(parsed.music) && parsed.music.length ? parsed.music : defaultConfig.music,
    updates: Array.isArray(parsed.updates) && parsed.updates.length ? parsed.updates : defaultConfig.updates,
  };
}

function parseConfig(raw: unknown): AboutConfig {
  if (!raw) return defaultConfig;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return mergeConfig(parsed);
  } catch {
    return defaultConfig;
  }
}

function normalizeConfig(config: AboutConfig): AboutConfig {
  const cleanItems = <T extends { title: string }>(items: T[]) =>
    items
      .map(item => Object.fromEntries(Object.entries(item).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])) as T)
      .filter(item => item.title);
  return {
    mode: config.mode === 'markdown' ? 'markdown' : 'template',
    template: config.template || 'profile',
    profile: Object.fromEntries(
      Object.entries(config.profile).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
    ) as AboutProfile,
    hobbies: cleanItems(config.hobbies),
    music: cleanItems(config.music),
    updates: cleanItems(config.updates),
  };
}

export default function AboutPageEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<TabKey>('template');
  const [config, setConfig] = useState<AboutConfig>(defaultConfig);
  const [markdownContent, setMarkdownContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmResetTemplate, setConfirmResetTemplate] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      try {
        const r: any = await optionsApi.list();
        const opts = r.data || r || {};
        setConfig(parseConfig(opts.page_about_config));
        setMarkdownContent(opts.page_about_markdown || '');
        setTab('template');
      } catch {
        toast.error('读取关于页配置失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const previewName = useMemo(() => config.profile.name || '站点作者', [config.profile.name]);

  const updateProfile = (key: keyof AboutProfile, value: string) => {
    setConfig(prev => ({ ...prev, profile: { ...prev.profile, [key]: value } }));
  };

  const updateArrayItem = <K extends 'hobbies' | 'music' | 'updates'>(
    key: K,
    index: number,
    patch: Partial<AboutConfig[K][number]>
  ) => {
    setConfig(prev => ({
      ...prev,
      [key]: prev[key].map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  };

  const addArrayItem = (key: 'hobbies' | 'music' | 'updates') => {
    const empty = key === 'hobbies'
      ? { icon: 'fa-regular fa-star', title: '', description: '' }
      : key === 'music'
        ? { title: '', artist: '', note: '', url: '' }
        : { date: '', type: '记录', title: '', description: '' };
    setConfig(prev => ({ ...prev, [key]: [...prev[key], empty as any] }));
  };

  const removeArrayItem = (key: 'hobbies' | 'music' | 'updates', index: number) => {
    setConfig(prev => ({ ...prev, [key]: prev[key].filter((_, i) => i !== index) }));
  };

  const moveArrayItem = (key: 'hobbies' | 'music' | 'updates', index: number, dir: -1 | 1) => {
    setConfig(prev => {
      const next = [...prev[key]];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, [key]: next };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await optionsApi.updateMany({
        page_about_config: JSON.stringify(normalizeConfig(config)),
        page_about_markdown: markdownContent,
      });
      toast.success('关于页已保存');
      onClose();
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const resetTemplate = () => {
    setConfig(defaultConfig);
    setConfirmResetTemplate(false);
    toast.success('已载入默认模板');
  };

  const renderProfile = () => (
    <div style={{ display: 'grid', gap: 12 }}>
      {([
        ['name', '名称', '留空使用博主昵称 / 站点标题'],
        ['avatar', '头像', '图片 URL，留空使用博主头像'],
        ['title', '一句话标题', '例如 分享设计与科技生活'],
        ['bio', '简介', '显示在个人名片里的短介绍'],
        ['mbti', 'MBTI', '例如 INTJ / INFP'],
        ['location', '所在地', '例如 上海 / 互联网'],
        ['status', '当前状态', '例如 持续写作中'],
        ['occupation', '身份', '例如 产品设计师 / 开发者'],
        ['languages', '语言', '例如 中文 / English / Русский'],
        ['focus', '正在关注', '例如 AI、设计系统、旅行'],
      ] as [keyof AboutProfile, string, string][]).map(([key, label, placeholder]) => (
        <div style={fieldRow} key={key}>
          <label className={fieldLabelCls}>{label}</label>
          {key === 'bio' ? (
            <Textarea
              value={config.profile[key]}
              onChange={e => updateProfile(key, e.target.value)}
              placeholder={placeholder}
              rows={3}
              className="resize-y"
            />
          ) : (
            <Input
              value={config.profile[key]}
              onChange={e => updateProfile(key, e.target.value)}
              placeholder={placeholder}
            />
          )}
        </div>
      ))}
    </div>
  );

  const renderHobbies = () => (
    <EditableList
      items={config.hobbies}
      addLabel="添加爱好"
      onAdd={() => addArrayItem('hobbies')}
      onMove={(index, dir) => moveArrayItem('hobbies', index, dir)}
      onRemove={(index) => removeArrayItem('hobbies', index)}
      render={(item, index) => (
        <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', gap: 8 }}>
          <Input value={item.icon} onChange={e => updateArrayItem('hobbies', index, { icon: e.target.value })} placeholder="fa-regular fa-star" />
          <Input value={item.title} onChange={e => updateArrayItem('hobbies', index, { title: e.target.value })} placeholder="爱好名称" />
          <Textarea value={item.description} onChange={e => updateArrayItem('hobbies', index, { description: e.target.value })} placeholder="一句话说明" rows={2} className="resize-y" style={{ gridColumn: '1 / -1' }} />
        </div>
      )}
    />
  );

  const renderMusic = () => (
    <EditableList
      items={config.music}
      addLabel="添加音乐"
      onAdd={() => addArrayItem('music')}
      onMove={(index, dir) => moveArrayItem('music', index, dir)}
      onRemove={(index) => removeArrayItem('music', index)}
      render={(item, index) => (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
          <Input value={item.title} onChange={e => updateArrayItem('music', index, { title: e.target.value })} placeholder="歌名 / 歌单名" />
          <Input value={item.artist} onChange={e => updateArrayItem('music', index, { artist: e.target.value })} placeholder="歌手 / 来源" />
          <Input value={item.note} onChange={e => updateArrayItem('music', index, { note: e.target.value })} placeholder="备注" />
          <Input value={item.url} onChange={e => updateArrayItem('music', index, { url: e.target.value })} placeholder="链接，可选" />
        </div>
      )}
    />
  );

  const renderUpdates = () => (
    <EditableList
      items={config.updates}
      addLabel="添加记录"
      onAdd={() => addArrayItem('updates')}
      onMove={(index, dir) => moveArrayItem('updates', index, dir)}
      onRemove={(index) => removeArrayItem('updates', index)}
      render={(item, index) => (
        <div style={{ display: 'grid', gridTemplateColumns: '150px 110px minmax(0, 1fr)', gap: 8 }}>
          <Input value={item.date} onChange={e => updateArrayItem('updates', index, { date: e.target.value })} placeholder="2026-04-29" />
          <Input value={item.type} onChange={e => updateArrayItem('updates', index, { type: e.target.value })} placeholder="更新" />
          <Input value={item.title} onChange={e => updateArrayItem('updates', index, { title: e.target.value })} placeholder="标题" />
          <Textarea value={item.description} onChange={e => updateArrayItem('updates', index, { description: e.target.value })} placeholder="记录说明" rows={2} className="resize-y" style={{ gridColumn: '1 / -1' }} />
        </div>
      )}
    />
  );

  const renderBody = () => {
    if (loading) return <LoadingState padding="48px 0" />;
    if (tab === 'template') {
      return (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <button
              type="button"
              onClick={() => setConfig(prev => ({ ...prev, mode: 'template' }))}
              className={cn(
                'cursor-pointer rounded-lg border p-4 text-left',
                config.mode === 'template' ? 'border-primary bg-primary/5' : 'border-border bg-card',
              )}
              style={{ minHeight: 92 }}
            >
              <div className="flex items-center gap-2 font-bold text-foreground">
                <LayoutGrid className="size-4 text-primary" /> 默认模板
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                使用结构化表单生成个人主页，适合不想写 Markdown 的用户。
              </p>
            </button>
            <button
              type="button"
              onClick={() => setConfig(prev => ({ ...prev, mode: 'markdown' }))}
              className={cn(
                'cursor-pointer rounded-lg border p-4 text-left',
                config.mode === 'markdown' ? 'border-primary bg-primary/5' : 'border-border bg-card',
              )}
              style={{ minHeight: 92 }}
            >
              <div className="flex items-center gap-2 font-bold text-foreground">
                <FileCode className="size-4 text-primary" /> 自定义 Markdown
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                单独写 Markdown 正文，前台只渲染 Markdown 内容，不显示默认资料模板。
              </p>
            </button>
          </div>
          <div className="rounded-lg border border-border bg-muted p-[18px]">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="flex size-[52px] items-center justify-center rounded-md border border-border bg-card text-primary">
                <User className="size-5" />
              </div>
              <div>
                <div className="text-base font-bold text-foreground">个人主页模板</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  包含个人名片、信息网格、兴趣爱好、音乐和站点更新记录。当前预览名称：{previewName}
                </div>
              </div>
            </div>
          </div>
          <p className="m-0 text-sm leading-loose text-muted-foreground">
            这个版本先提供一个稳定模板。后续可以继续增加“极简名片”“时间线主页”“摄影作品集”等模板，数据结构保持不变。
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => setConfirmResetTemplate(true)} style={aboutActionButtonStyle}>
              <RotateCcw className="size-3.5" /> 载入默认模板
            </Button>
            <Button variant="secondary" onClick={() => setTab('custom')} style={aboutActionButtonStyle}>
              <FileCode className="size-3.5" /> 编辑 Markdown
            </Button>
          </div>
        </div>
      );
    }
    if (tab === 'profile') return renderProfile();
    if (tab === 'hobbies') return renderHobbies();
    if (tab === 'music') return renderMusic();
    if (tab === 'updates') return renderUpdates();
    return (
      <div>
        <p className="mb-2.5 mt-0 text-xs leading-relaxed text-muted-foreground">
          这里是独立的 Markdown 内容。需要在「模板」里选择「自定义 Markdown」后，前台才会用这段内容作为关于页正文。
        </p>
        {config.mode !== 'markdown' && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
            <Button size="sm" variant="secondary" onClick={() => setConfig(prev => ({ ...prev, mode: 'markdown' }))}>
              <FileCode className="size-3" /> 切换为自定义 Markdown
            </Button>
          </div>
        )}
        <Textarea
          value={markdownContent}
          onChange={e => setMarkdownContent(e.target.value)}
          placeholder={"## 关于我\n\n写一段自定义 Markdown 介绍…\n\n> 支持引用、列表、表格、链接和图片。"}
          rows={12}
          className="resize-y font-mono text-sm"
        />
      </div>
    );
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="关于页面配置" size="xl">
      <div style={{
        display: 'grid',
        gridTemplateColumns: '180px minmax(0, 1fr)',
        gap: 20,
        height: 'clamp(420px, calc(100vh - 148px), 680px)',
        minHeight: 0,
        overflow: 'hidden',
      }}>
        <div className="border-r border-border" style={{ paddingRight: 14, minHeight: 0, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            {tabs.map(item => {
              const TabIcon = item.icon;
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-md border px-3 text-left text-sm',
                    active
                      ? 'border-primary/30 bg-primary/5 font-bold text-primary'
                      : 'border-transparent font-medium text-muted-foreground',
                  )}
                  style={{ minHeight: 38 }}
                >
                  <TabIcon className="size-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
            {renderBody()}
          </div>
          <div className="border-t border-border" style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 18, marginTop: 18 }}>
            <Button variant="secondary" onClick={onClose} disabled={saving}>取消</Button>
            <SaveButton onClick={handleSave} loading={saving} />
          </div>
        </div>
      </div>
      <ConfirmDialog
        isOpen={confirmResetTemplate}
        onClose={() => setConfirmResetTemplate(false)}
        onConfirm={resetTemplate}
        title="恢复默认模板"
        message="确定用默认模板覆盖当前关于页配置吗？自定义内容不会被覆盖。"
        confirmText="覆盖配置"
      />
    </Modal>
  );
}

function EditableList<T>({
  items,
  addLabel,
  onAdd,
  onMove,
  onRemove,
  render,
}: {
  items: T[];
  addLabel: string;
  onAdd: () => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (index: number) => void;
  render: (item: T, index: number) => ReactNode;
}) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.map((item, index) => (
        <div key={index} className="rounded-lg border border-border p-3">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'start' }}>
            <div>{render(item, index)}</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <Button variant="outline" size="icon" onClick={() => onMove(index, -1)} disabled={index === 0} title="上移">
                <ChevronUp className="size-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => onMove(index, 1)} disabled={index === items.length - 1} title="下移">
                <ChevronDown className="size-4" />
              </Button>
              <Button variant="outline" size="icon" className="text-destructive hover:text-destructive" onClick={() => onRemove(index)} title="删除">
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      ))}
      <div>
        <Button variant="secondary" onClick={onAdd}>
          <Plus className="size-3.5" /> {addLabel}
        </Button>
      </div>
    </div>
  );
}
