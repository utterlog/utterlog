
import { type ReactNode, useEffect, useState } from 'react';
import { optionsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Button, Card, ConfirmDialog, Input, Textarea, Switch, Spinner,
  Tabs, TabsList, TabsTrigger,
} from '@/components/ui/shadcn';
import {
  Globe, Search, Mail, Send, MessagesSquare, Database, Image as ImageIcon,
  Key, CloudDownload, Info, Shield, ShieldCheck, Code, Bot, Tag, AtSign,
  ArrowDownWideNarrow, FileImage, Hourglass, Expand, Bell, UserCog, Map,
  GitBranch, MapPin, LocateFixed, Minimize2, ImageOff, CloudUpload, Bird,
  ExternalLink, Loader2, Plug, Link as LinkIcon, Megaphone, Users, User,
  HardDrive, Cloud, Brush, BookOpen, Film, Music, Zap, Images, Lightbulb,
  RefreshCw, Save, type LucideIcon,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { invalidateSiteOptions, loadSiteOptions } from '@/lib/site';
import { setAdminTimeZone } from '@/lib/timezone';
import { useForm } from 'react-hook-form';
import SystemUpdatePanel from '@/components/SystemUpdatePanel';
import { TimezoneCombobox } from '@/components/TimezoneCombobox';

// Native <select> styled like the shadcn Input so it stays compatible
// with react-hook-form register() (Base UI Select can't take register).
const SELECT_CLS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

// ---------------------------------------------------------------------------
// Local layout helpers — replicate the old FormC section/row look with shadcn
// semantic tokens so both light/dark themes work out of the box.
// ---------------------------------------------------------------------------

function SettingsSection({
  title, icon: Icon, description, inlineDescription, footerHint, children,
}: {
  title?: string;
  icon?: LucideIcon;
  description?: string;
  inlineDescription?: boolean;
  footerHint?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-6">
      {title && (
        <div className="px-4 pb-2.5">
          <div className={cn('flex items-center gap-2', inlineDescription && 'min-w-0')}>
            {Icon && <Icon className="size-3.5 shrink-0 text-primary" />}
            <h3 className="text-sm font-semibold tracking-wide text-foreground">{title}</h3>
            {inlineDescription && description && (
              <p className="min-w-0 truncate text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {!inlineDescription && description && (
            <p className={cn('mt-1.5 text-xs leading-relaxed text-muted-foreground', Icon && 'pl-[22px]')}>
              {description}
            </p>
          )}
        </div>
      )}
      <Card className="overflow-hidden">{children}</Card>
      {footerHint && (
        <p className="mx-4 mt-2 text-[11px] leading-relaxed text-muted-foreground">{footerHint}</p>
      )}
    </section>
  );
}

// A simple padded Card panel for blocks that aren't built from labelled rows.
function Panel({ title, action, children, className }: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('mb-6 p-6', className)}>
      {(title || action) && (
        <div className={cn('flex items-center justify-between', action ? 'mb-2' : 'mb-5')}>
          {title && <h3 className="text-[13px] font-semibold tracking-wide text-foreground">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </Card>
  );
}

function Row({ label, hint, last, align = 'left', column, children }: {
  label?: string;
  hint?: string;
  last?: boolean;
  align?: 'left' | 'right';
  column?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn('grid min-h-[56px] grid-cols-[32%_1fr]', !last && 'border-b border-border')}>
      <div className="flex flex-col justify-center px-3.5 py-2.5">
        {label && <div className="text-[13px] font-medium text-foreground">{label}</div>}
        {hint && <div className="mt-0.5 text-xs leading-normal text-muted-foreground">{hint}</div>}
      </div>
      <div className={cn('flex px-3.5 py-1.5', column ? 'flex-col justify-center' : 'items-center', align === 'right' && !column && 'justify-end')}>
        {children}
      </div>
    </div>
  );
}

function InputRow({ label, hint, type = 'text', placeholder, register, last }: {
  label: string;
  hint?: string;
  type?: string;
  placeholder?: string;
  register?: any;
  last?: boolean;
}) {
  return (
    <Row label={label} hint={hint} last={last}>
      {type === 'range' ? (
        <input type="range" className="h-2 w-full cursor-pointer accent-primary" {...(register || {})} />
      ) : (
        <Input type={type} placeholder={placeholder} {...(register || {})} />
      )}
    </Row>
  );
}

function SelectRow({ label, hint, register, options, last }: {
  label: string;
  hint?: string;
  register?: any;
  options: { value: string; label: string }[];
  last?: boolean;
}) {
  return (
    <Row label={label} hint={hint} last={last}>
      <select className={SELECT_CLS} {...(register || {})}>
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </Row>
  );
}

function TextareaRow({ label, hint, rows = 3, placeholder, register, last }: {
  label: string;
  hint?: string;
  rows?: number;
  placeholder?: string;
  register?: any;
  last?: boolean;
}) {
  return (
    <Row label={label} hint={hint} last={last} column>
      <Textarea rows={rows} placeholder={placeholder} {...(register || {})} />
    </Row>
  );
}

function RadioRow({ label, hint, options, register, last }: {
  label: string;
  hint?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  register: any;
  last?: boolean;
}) {
  return (
    <Row label={label} hint={hint} last={last}>
      <div className="flex flex-wrap items-center gap-4">
        {options.map((opt) => (
          <label key={opt.value} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-foreground">
            <input type="radio" value={opt.value} {...register} className="accent-primary" />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </Row>
  );
}

function SwitchRow({ label, hint, name, watch, setValue, last }: {
  label: string;
  hint?: string;
  name: string;
  watch: any;
  setValue: any;
  last?: boolean;
}) {
  return (
    <Row label={label} hint={hint} last={last} align="right">
      <Switch
        checked={!!watch(name)}
        onCheckedChange={(v: boolean) => setValue(name, v, { shouldDirty: true })}
      />
    </Row>
  );
}

// Tab IDs recognized on #hash so deep links like /settings#update land
// directly on the right pane. Keep in sync with `tabs` below.
const VALID_TABS = new Set(['general', 'seo', 'email', 'telegram', 'comment', 'media', 'image', 'services', 'update']);
function initialTabFromHash(): string {
  if (typeof window === 'undefined') return 'general';
  const h = window.location.hash.replace(/^#/, '');
  return VALID_TABS.has(h) ? h : 'general';
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

/**
 * Logo / Favicon 预览。
 * 之前是裸 <img onError={display:none}>，加载失败容器一片空白
 * （ternary 是 val? img : icon，img 加载失败被 hide 掉但 icon
 * 已经因为 val 非空被跳过）。这里抽出来用 useState 跟踪错误，
 * 失败时降级到图标占位 + 提示文字，让用户看到「图片加载失败」
 * 而不是空白以为没存上。
 *
 * 父组件用 key={val} 在路径变化时重新挂载本组件，error state
 * 自动重置 —— 用户改完路径或重新上传就会立即重新尝试加载。
 */
function brandingPreviewSrc(field: string, value: string) {
  const val = (value || '').trim();
  if (field === 'site_favicon' && /^\/favicon\.[a-z0-9]+$/i.test(val) && val !== '/favicon.ico') {
    return '/favicon.ico';
  }
  return val;
}

function BrandingPreview({ src, alt }: { src: string; alt: string }) {
  const { t } = useI18n();
  const [error, setError] = useState(false);
  if (!src || error) {
    const Icon = error ? ImageOff : ImageIcon;
    return (
      <div className="flex flex-col items-center gap-1 text-muted-foreground">
        <Icon className="size-6 opacity-40" />
        {error && (
          <span className="text-[10px] opacity-70">{t('admin.settings.branding.loadFailed', '加载失败')}</span>
        )}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="max-h-12 max-w-[80%] object-contain"
      onError={() => setError(true)}
    />
  );
}

export default function SettingsPage() {
  const { t, reload: reloadI18n } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(initialTabFromHash);
  const [locales, setLocales] = useState<{ locale: string; name: string; native_name: string; source?: string }[]>([
    { locale: 'zh-CN', name: 'Chinese (Simplified)', native_name: '简体中文' },
    { locale: 'en-US', name: 'English', native_name: 'English' },
    { locale: 'ru-RU', name: 'Russian', native_name: 'Русский' },
  ]);

  // Respond to hash changes (e.g. VersionBadge link from sidebar) and
  // update the URL when the user clicks a tab so refresh/bookmark work.
  useEffect(() => {
    const onHash = () => setActiveTab(initialTabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    const currentHash = window.location.hash.replace(/^#/, '');
    if (activeTab !== currentHash) {
      history.replaceState(null, '', `#${activeTab}`);
    }
  }, [activeTab]);

  const { register, handleSubmit, reset, getValues, watch, setValue } = useForm();
  const emailProvider = watch('email_provider', 'smtp');
  const effectiveSiteTimezone = watch('site_timezone_effective', '');
  const mediaDriver = watch('media_driver', 'local');
  const imageQuality = watch('image_quality', 82);
  const storageLimitGb = watch('storage_limit_gb', 10);
  const [storageStats, setStorageStats] = useState<{
    files: number;
    size: number;
    drivers?: Record<string, { files: number; size: number }>;
    // disk is the real host filesystem usage of the uploads directory
    // (statfs in backend). Present when the api reports it; absent on
    // very old api builds — UI falls back to the synthetic budget.
    disk?: { total: number; used: number; free: number; percent: number; path?: string };
  }>({ files: 0, size: 0 });
  const [testingStorage, setTestingStorage] = useState(false);
  const [cleaningDatabase, setCleaningDatabase] = useState(false);
  const [confirmCleanupDatabase, setConfirmCleanupDatabase] = useState(false);
  const [databaseCleanupResult, setDatabaseCleanupResult] = useState<Record<string, number> | null>(null);
  const [tgChats, setTgChats] = useState<{ id: string; type: string; name: string }[]>([]);
  const [fetchingChatId, setFetchingChatId] = useState(false);

  useEffect(() => { fetchSettings(); fetchLocales(); }, []);

  const fetchLocales = async () => {
    try {
      const response: any = await api.get('/i18n/locales');
      const items = response.data || [];
      if (Array.isArray(items) && items.length > 0) {
        setLocales(items);
      }
    } catch {}
  };

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response: any = await optionsApi.list();
      const s = response.data || {};
      setAdminTimeZone(s.site_timezone, s.site_timezone_effective);
      reset({
        // 常规
        site_title: s.site_title || '',
        // Header 标题显示方式：text / text_logo / logo
        // 留空时按"有 Logo 走 logo，没 Logo 走 text"做隐式默认，
        // 这样从 v1.3.x 升上来的旧站点视觉上不会突变。
        site_brand_mode: s.site_brand_mode || (s.site_logo ? 'logo' : 'text'),
        site_subtitle: s.site_subtitle || '',
        site_locale: s.site_locale || 'zh-CN',
        site_timezone: s.site_timezone || '',
        site_timezone_effective: s.site_timezone_effective || '',
        admin_email: s.admin_email || '',
        // site_description / site_keywords moved to SEO tab as
        // seo_default_description / seo_default_keywords. The DB
        // columns are still read by the layout.tsx metadata fallback
        // for back-compat with sites that haven't migrated yet, but
        // the General tab no longer exposes editing.
        site_url: s.site_url || '',
        site_logo: s.site_logo || '',
        site_logo_dark: s.site_logo_dark || '',
        site_favicon: brandingPreviewSrc('site_favicon', s.site_favicon || ''),
        beian_gongan: s.beian_gongan || '',
        beian_icp: s.beian_icp || '',
        custom_head_code: s.custom_head_code || '',
        slot_before_content: s.slot_before_content || '',
        slot_after_content: s.slot_after_content || '',
        slot_sidebar_top: s.slot_sidebar_top || '',
        slot_sidebar_bottom: s.slot_sidebar_bottom || '',
        site_since: s.site_since || '',
        // SEO + AI
        ai_crawl_allowed: s.ai_crawl_allowed ?? true,
        llms_txt_enabled: s.llms_txt_enabled ?? true,
        llms_full_enabled: s.llms_full_enabled ?? false,
        seo_default_description: s.seo_default_description || '',
        seo_default_keywords: s.seo_default_keywords || '',
        seo_default_image: s.seo_default_image || '',
        seo_twitter_handle: s.seo_twitter_handle || '',
        seo_twitter_card: s.seo_twitter_card || 'summary_large_image',
        // 邮件
        email_provider: s.email_provider || 'smtp',
        email_from: s.email_from || '',
        email_from_name: s.email_from_name || '',
        smtp_host: s.smtp_host || '',
        smtp_port: s.smtp_port || '587',
        smtp_user: s.smtp_user || '',
        smtp_pass: s.smtp_pass || '',
        smtp_encryption: s.smtp_encryption || 'tls',
        resend_api_key: s.resend_api_key || '',
        sendflare_api_key: s.sendflare_api_key || '',
        // 评论
        allow_comments: s.allow_comments !== false,
        comment_moderation: s.comment_moderation ?? false,
        comment_trust_returning: s.comment_trust_returning ?? true,
        comment_require_email: s.comment_require_email ?? true,
        comment_notify_admin: s.comment_notify_admin ?? true,
        // comment_pagination / comment_per_page 移除 —— 评论一直是
        // 一次性渲染（CommentList.tsx 没分页代码），是历史 placebo
        comment_order: s.comment_order || 'newest',
        comment_captcha_mode: s.comment_captcha_mode || 'pow',
        comment_captcha_difficulty: s.comment_captcha_difficulty || 4,
        // AI 评论审核 + 智能回复（v1.4.0 新功能，参考 Typecho CommentAI 插件思路）
        ai_comment_audit_enabled: s.ai_comment_audit_enabled === 'true',
        ai_comment_audit_threshold: s.ai_comment_audit_threshold || '0.8',
        ai_comment_audit_fail_action: s.ai_comment_audit_fail_action || 'reject',
        ai_comment_reply_enabled: s.ai_comment_reply_enabled === 'true',
        ai_comment_reply_mode: s.ai_comment_reply_mode || 'audit',
        ai_comment_reply_badge_text: s.ai_comment_reply_badge_text ?? '🤖 AI 辅助回复',
        ai_comment_reply_rate_limit: s.ai_comment_reply_rate_limit || '20',
        ai_comment_reply_delay: s.ai_comment_reply_delay || '0',
        ai_comment_reply_context_title: s.ai_comment_reply_context_title !== 'false',
        ai_comment_reply_context_excerpt: s.ai_comment_reply_context_excerpt !== 'false',
        ai_comment_reply_context_parent: s.ai_comment_reply_context_parent !== 'false',
        ai_comment_reply_only_first: s.ai_comment_reply_only_first === 'true',
        ai_comment_audit_prompt: s.ai_comment_audit_prompt || '',
        ai_comment_reply_prompt: s.ai_comment_reply_prompt || '',
        // Telegram
        telegram_bot_token: s.telegram_bot_token || '',
        telegram_chat_id: s.telegram_chat_id || '',
        telegram_webhook_secret: s.telegram_webhook_secret || '',
        tg_notify_comment: s.tg_notify_comment ?? false,
        tg_notify_follow: s.tg_notify_follow ?? false,
        tg_notify_publish: s.tg_notify_publish ?? false,
        tg_daily_report: s.tg_daily_report ?? false,
        tg_comment_approve: s.tg_comment_approve ?? false,
        tg_comment_reply: s.tg_comment_reply ?? false,
        tg_publish_moment: s.tg_publish_moment ?? false,
        tg_ai_chat: s.tg_ai_chat ?? false,
        tg_auto_upload_image: s.tg_auto_upload_image ?? false,
        // 媒体
        storage_limit_gb: s.storage_limit_gb || 10,
        media_driver: s.media_driver || 'local',
        max_upload_size: s.max_upload_size || 20,
        allowed_extensions: s.allowed_extensions || 'jpg, jpeg, png, gif, webp, svg, ico, mp4, mp3, pdf, zip, doc, docx, xls, xlsx, ppt, pptx, txt, md',
        image_convert_format: s.image_convert_format || '',
        image_quality: s.image_quality || 82,
        image_max_width: s.image_max_width || '',
        image_strip_exif: s.image_strip_exif ?? true,
        // 图片处理
        random_image_api: s.random_image_api || '',
        // Default true so saving the General tab doesn't silently
        // write `false` for users who never visited 图片处理. The
        // helper randomCoverUrl() reads === 'false' as the explicit
        // off signal, so undefined / unset / true all keep showing
        // covers; only an admin actively flipping the toggle off
        // disables them.
        random_image_enabled: s.random_image_enabled ?? true,
        image_lazy_load: s.image_lazy_load ?? true,
        image_lightbox: s.image_lightbox ?? true,
        image_display_effect: s.image_display_effect || 'fade',
        image_display_duration: s.image_display_duration || 300,
        // 第三方服务
        mapbox_access_token: s.mapbox_access_token || s.footprint_mapbox_token || '',
        mapbox_api_url: s.mapbox_api_url || 'https://api.mapbox.com',
        github_access_token: s.github_access_token || '',
        google_maps_api_key: s.google_maps_api_key || '',
        amap_api_key: s.amap_api_key || '',
        tencent_maps_api_key: s.tencent_maps_api_key || '',
        tinypng_api_key: s.tinypng_api_key || '',
        // S3/R2
        s3_endpoint: s.s3_endpoint || '',
        s3_region: s.s3_region || '',
        s3_bucket: s.s3_bucket || '',
        s3_access_key: s.s3_access_key || '',
        s3_secret_key: s.s3_secret_key || '',
        s3_custom_domain: s.s3_custom_domain || '',
        folder_driver_covers: s.folder_driver_covers || '',
        folder_driver_books: s.folder_driver_books || '',
        folder_driver_movies: s.folder_driver_movies || '',
        folder_driver_music: s.folder_driver_music || '',
        folder_driver_links: s.folder_driver_links || '',
        folder_driver_moments: s.folder_driver_moments || '',
        folder_driver_albums: s.folder_driver_albums || '',
        folder_driver_avatars: s.folder_driver_avatars || '',
        // Utterlog 网络
        utterlog_auto_push: s.utterlog_auto_push ?? true,
        utterlog_share_posts: s.utterlog_share_posts ?? true,
        utterlog_share_moments: s.utterlog_share_moments ?? false,
        utterlog_share_comments: s.utterlog_share_comments ?? false,
        // 安全
        require_login: s.require_login ?? false,
        rate_limit: s.rate_limit || 60,
        two_factor_enabled: s.two_factor_enabled ?? false,
        two_factor_code: '',
      });
      try {
        const sr: any = await api.get('/media/stats');
        if (sr.success || sr.data) {
          const d = sr.data || sr;
          setStorageStats({
            files: d.files || 0,
            size: d.size || 0,
            drivers: d.drivers,
            disk: d.disk,
          });
        }
      } catch {}
    } catch {
      toast.error(t('admin.settings.toast.fetchFailed', '获取设置失败'));
    } finally {
      setLoading(false);
    }
  };

  const tabFields: Record<string, string[]> = {
    // Must include every field the General tab actually renders via
    // register(...). onSubmit filters the form payload through this
    // whitelist — if a field is missing here, the user's edit silently
    // vanishes (the save POST just doesn't include that key, so the DB
    // row stays unchanged and on reload the field reverts).
    general: [
      'site_title', 'site_brand_mode', 'site_subtitle', 'site_locale', 'site_timezone', 'site_url',
      'admin_email', 'site_since',
      'site_logo', 'site_logo_dark', 'site_favicon',
      'beian_gongan', 'beian_icp',
      'custom_head_code',
    ],
    seo: [
      'ai_crawl_allowed', 'llms_txt_enabled', 'llms_full_enabled',
      'seo_default_description', 'seo_default_keywords', 'seo_default_image',
      'seo_twitter_handle', 'seo_twitter_card',
    ],
    email: ['email_provider', 'email_from', 'email_from_name', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_encryption', 'resend_api_key', 'sendflare_api_key'],
    telegram: [
      'telegram_bot_token', 'telegram_chat_id', 'telegram_webhook_secret',
      'tg_notify_comment', 'tg_notify_follow', 'tg_notify_publish', 'tg_daily_report',
      'tg_comment_approve', 'tg_comment_reply', 'tg_publish_moment',
      'tg_ai_chat', 'tg_auto_upload_image',
    ],
    comment: [
      'allow_comments', 'comment_moderation', 'comment_trust_returning',
      'comment_require_email', 'comment_notify_admin', 'comment_order',
      'comment_captcha_mode', 'comment_captcha_difficulty',
      // AI 评论审核 + 智能回复
      'ai_comment_audit_enabled', 'ai_comment_audit_threshold', 'ai_comment_audit_fail_action',
      'ai_comment_reply_enabled', 'ai_comment_reply_mode', 'ai_comment_reply_badge_text',
      'ai_comment_reply_rate_limit', 'ai_comment_reply_delay',
      'ai_comment_reply_context_title', 'ai_comment_reply_context_excerpt',
      'ai_comment_reply_context_parent', 'ai_comment_reply_only_first',
      'ai_comment_audit_prompt', 'ai_comment_reply_prompt',
    ],
    media: ['media_driver', 's3_endpoint', 's3_region', 's3_bucket', 's3_access_key', 's3_secret_key', 's3_custom_domain', 'storage_limit_gb', 'max_upload_size', 'allowed_extensions', 'folder_driver_covers', 'folder_driver_books', 'folder_driver_movies', 'folder_driver_music', 'folder_driver_links', 'folder_driver_moments', 'folder_driver_albums', 'folder_driver_avatars'],
    image: [
      'image_convert_format', 'image_quality', 'image_max_width', 'image_strip_exif',
      // tinypng_enabled was removed from image handling: no backend handler
      // ever called TinyPNG during uploads. tinypng_api_key now lives in
      // the centralized third-party services tab for future integration.
      'random_image_enabled', 'random_image_api',
      // Display effect + lazy/lightbox toggles. Earlier rev had two
      // dead multi-selects here ('image_lazy_load_placeholder' and
      // 'image_lightbox_style') with 5 + 4 options that no front-end
      // code ever read. They've been removed from the form; the
      // residual DB keys are cleaned up by the Bun database migration
      // on next boot.
      'image_display_effect', 'image_display_duration',
      'image_lazy_load', 'image_lightbox',
    ],
    services: [
      'mapbox_access_token', 'mapbox_api_url',
      'github_access_token',
      'google_maps_api_key', 'amap_api_key', 'tencent_maps_api_key',
      'tinypng_api_key',
    ],
  };

  const onSubmit = async (data: any) => {
    setSaving(true);
    try {
      const fields = tabFields[activeTab];
      if (fields) {
        const filtered: Record<string, any> = {};
        for (const key of fields) {
          if (key in data) filtered[key] = data[key];
        }
        // Backward compatibility: existing footprint pages still read
        // footprint_mapbox_token in older builds. Keep it mirrored while
        // mapbox_access_token becomes the canonical site-wide key.
        if (activeTab === 'services' && 'mapbox_access_token' in filtered) {
          filtered.footprint_mapbox_token = filtered.mapbox_access_token;
        }
        await optionsApi.updateMany(filtered);
      } else {
        await optionsApi.updateMany(data);
      }
      if (activeTab === 'general') {
        invalidateSiteOptions();
        await loadSiteOptions();
        setAdminTimeZone(data.site_timezone, data.site_timezone || effectiveSiteTimezone);
        await reloadI18n();
      }
      toast.success(t('admin.settings.toast.saved', '设置已保存'));
    } catch {
      toast.error(t('admin.settings.toast.saveFailed', '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const testStorageConnection = async () => {
    setTestingStorage(true);
    try {
      const vals = getValues();
      if (!vals.s3_bucket || !vals.s3_access_key || !vals.s3_secret_key) {
        toast.error(t('admin.settings.toast.fillBucketKeys', '请先填写 Bucket、Access Key 和 Secret Key'));
        setTestingStorage(false);
        return;
      }
      const r: any = await api.post('/media/test-connection', {
        driver: vals.media_driver,
        endpoint: vals.s3_endpoint,
        region: vals.s3_region || 'auto',
        bucket: vals.s3_bucket,
        access_key: vals.s3_access_key,
        secret_key: vals.s3_secret_key,
      });
      if (r.success) toast.success(t('admin.common.connectionSuccess', '连接成功'));
      else toast.error(r.error?.message || r.error || t('admin.common.connectionFailed', '连接失败'));
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message || e?.message || t('admin.common.connectionFailed', '连接失败');
      toast.error(msg);
    } finally {
      setTestingStorage(false);
    }
  };

  const cleanupDatabase = async () => {
    setCleaningDatabase(true);
    try {
      const response: any = await api.post('/admin/system/cleanup-database');
      const data = response.data || {};
      setDatabaseCleanupResult(data);
      setConfirmCleanupDatabase(false);
      toast.success(t('admin.settings.media.cleanup.success', '数据库清理完成，处理 {count} 条残留', { count: Number(data.total || 0) }));
      fetchSettings();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || t('admin.settings.media.cleanup.failed', '数据库清理失败'));
    } finally {
      setCleaningDatabase(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const handleBrandingUpload = async (e: React.ChangeEvent<HTMLInputElement>, purpose: 'logo' | 'dark-logo' | 'favicon', field: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    const allowed = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'svg'];
    if (!ext || !allowed.includes(ext)) {
      toast.error(t('admin.settings.toast.invalidBrandingFormat', '请上传 PNG/JPG/GIF/WebP/AVIF/ICO/SVG 格式'));
      e.target.value = '';
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('purpose', purpose);
    try {
      const r: any = await api.post('/media/upload-branding', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = purpose === 'favicon'
        ? '/favicon.ico'
        : (r.data?.url || r.url);
      if (url) {
        reset({ ...getValues(), [field]: url });
        await optionsApi.updateMany({ [field]: url });
        toast.success(t('admin.common.uploadSuccess', '上传成功'));
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || t('admin.common.uploadFailed', '上传失败'));
    }
    e.target.value = '';
  };

  const tabs: { id: string; label: string; icon: LucideIcon }[] = [
    { id: 'general', label: t('admin.settings.tabs.general', '常规设置'), icon: Globe },
    { id: 'seo', label: t('admin.settings.tabs.seo', 'SEO 与 AI'), icon: Search },
    { id: 'email', label: t('admin.settings.tabs.email', '邮件设置'), icon: Mail },
    { id: 'telegram', label: 'Telegram', icon: Send },
    { id: 'comment', label: t('admin.settings.tabs.comment', '评论设置'), icon: MessagesSquare },
    { id: 'media', label: t('admin.settings.tabs.media', '存储设置'), icon: Database },
    { id: 'image', label: t('admin.settings.tabs.image', '图片处理'), icon: ImageIcon },
    { id: 'services', label: t('admin.settings.tabs.services', '第三方服务'), icon: Key },
    { id: 'update', label: t('admin.settings.tabs.update', '系统更新'), icon: CloudDownload },
  ];

  const serviceSections: Array<{
    title: string;
    icon: LucideIcon;
    description: string;
    footerHint?: string;
    fields: Array<{ name: string; label: string; type?: string; placeholder?: string; hint?: string }>;
  }> = [
    {
      title: t('admin.settings.services.mapbox.section', 'Mapbox'),
      icon: Map,
      description: t('admin.settings.services.mapbox.description', '全站统一 Mapbox 配置。数据统计访客地图和前台足迹地图都会从这里读取。'),
      footerHint: t('admin.settings.services.mapbox.footer', 'Mapbox public token 通常以 pk. 开头，可在 account.mapbox.com 创建。旧版足迹设置里的 token 会自动兼容并同步到这里。'),
      fields: [
        { name: 'mapbox_access_token', label: t('admin.settings.services.mapbox.token', 'Mapbox Token'), type: 'password', placeholder: 'pk.eyJ1...' },
        { name: 'mapbox_api_url', label: t('admin.settings.services.mapbox.apiUrl', 'Mapbox API 地址'), placeholder: 'https://api.mapbox.com', hint: t('admin.settings.services.mapbox.apiUrlHint', '一般保持默认。只有自建代理或特殊网络环境才需要修改。') },
      ],
    },
    {
      title: t('admin.settings.services.github.section', 'GitHub'),
      icon: GitBranch,
      description: t('admin.settings.services.github.description', '全站统一 GitHub Token。Coding 页面读取公开项目时可不填；填写后用于服务端贡献统计和提升 GitHub API 速率。'),
      footerHint: t('admin.settings.services.github.footer', '建议只授予最小只读权限。Token 只保存在服务端，不会输出到前台；公开页面不会因为配置 Token 自动混入私有仓库。'),
      fields: [
        { name: 'github_access_token', label: t('admin.settings.services.github.token', 'GitHub Token'), type: 'password', placeholder: 'github_pat_...' },
      ],
    },
    {
      title: t('admin.settings.services.google.section', 'Google Maps'),
      icon: MapPin,
      description: t('admin.settings.services.google.description', '预留给后续地理编码、地图或地址服务使用。当前足迹地理编码仍使用足迹页配置的临时服务。'),
      fields: [
        { name: 'google_maps_api_key', label: t('admin.settings.services.google.apiKey', 'Google Maps API Key'), type: 'password', placeholder: 'AIza...' },
      ],
    },
    {
      title: t('admin.settings.services.amap.section', '高德地图'),
      icon: MapPin,
      description: t('admin.settings.services.amap.description', '用于国内经纬度反查城市名、地址解析等地理编码能力。后续说说位置和足迹地理编码可从这里读取。'),
      footerHint: t('admin.settings.services.amap.footer', '填写高德开放平台 Web 服务 Key。建议只给服务端接口使用，不在前台公开输出。'),
      fields: [
        { name: 'amap_api_key', label: t('admin.settings.services.amap.apiKey', '高德地图 Web 服务 Key'), type: 'password', placeholder: 'AMap Web Service Key' },
      ],
    },
    {
      title: t('admin.settings.services.tencent.section', '腾讯位置服务'),
      icon: LocateFixed,
      description: t('admin.settings.services.tencent.description', '用于国内逆地址解析、城市名识别和后续位置服务。可作为 Mapbox 的国内兜底服务。'),
      footerHint: t('admin.settings.services.tencent.footer', '填写腾讯位置服务 WebService API Key。建议只给服务端接口使用，不在前台公开输出。'),
      fields: [
        { name: 'tencent_maps_api_key', label: t('admin.settings.services.tencent.apiKey', '腾讯位置服务 Key'), type: 'password', placeholder: 'Tencent Location Service Key' },
      ],
    },
    {
      title: t('admin.settings.services.tinypng.section', 'TinyPNG'),
      icon: Minimize2,
      description: t('admin.settings.services.tinypng.description', '集中保存 TinyPNG Key。当前上传压缩仍走系统内置编码器，TinyPNG 在线压缩接入后会直接读取这里。'),
      fields: [
        { name: 'tinypng_api_key', label: t('admin.settings.services.tinypng.apiKey', 'TinyPNG API Key'), type: 'password', placeholder: 'TinyPNG API Key' },
      ],
    },
  ];

  if (loading) {
    return <Spinner />;
  }

  return (
    <div className="w-full">
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as string)} className="mb-7">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent p-0 text-muted-foreground">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="h-10 gap-1.5 rounded-none border-b-2 border-transparent px-4 text-sm font-normal text-muted-foreground hover:bg-muted hover:text-foreground data-[selected]:border-primary data-[selected]:bg-transparent data-[selected]:font-semibold data-[selected]:text-primary data-[selected]:shadow-none"
              >
                <Icon className="size-4" />
                <span>{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Content */}
      <div>
        <form onSubmit={handleSubmit(onSubmit)}>

          {/* ==================== 常规设置 ==================== */}
          {activeTab === 'general' && (
            <>
              <SettingsSection title={t('admin.settings.general.section', '站点基础信息')} icon={Info}>
                <InputRow label={t('admin.settings.general.siteTitle', '站点名称')} register={register('site_title')} placeholder={t('admin.settings.general.siteTitlePlaceholder', '我的博客')} />
                <RadioRow
                  label={t('admin.settings.general.brandMode', '标题显示方式')}
                  hint={t('admin.settings.general.brandModeHint', 'Header 处显示文字、Logo 或两者；支持响应站点标题设置的主题')}
                  register={register('site_brand_mode')}
                  options={[
                    { value: 'text', label: t('admin.settings.general.brandText', '文字') },
                    { value: 'text_logo', label: t('admin.settings.general.brandTextLogo', '文字 + Logo') },
                    { value: 'logo', label: 'Logo' },
                  ]}
                />
                <InputRow label={t('admin.settings.general.subtitle', '副标题')} register={register('site_subtitle')} placeholder={t('admin.settings.general.subtitlePlaceholder', '一句话 Slogan')} />
                <SelectRow
                  label={t('admin.settings.general.siteLanguage', '站点语言')}
                  hint={t('admin.settings.general.siteLanguageHint', '读取内置语言包和安装目录 locales/*.json；影响前台 lang、RSS 和后台界面翻译')}
                  register={register('site_locale')}
                  options={locales.map((loc) => ({
                    value: loc.locale,
                    label: `${loc.native_name || loc.name || loc.locale} (${loc.locale})${loc.source === 'external' ? ` · ${t('admin.settings.general.customLanguagePack', '自定义')}` : ''}`,
                  }))}
                />
                {/* 站点时区 —— input + datalist 组合：可下拉选 60+ 主要城市
                    （label 显示 "城市 · UTC±N · IANA"），也可直接键入任意
                    合法 IANA 名。后端 siteclock.IsValid 兜底校验，无效保持
                    原值不写入。留空 → 走自动识别（os env TZ → 浏览器 → UTC）。*/}
                <Row
                  label={t('admin.settings.general.siteTimezone', '站点时区')}
                  hint={t('admin.settings.general.siteTimezoneHint', '全站发布时间、归档和统计按此时区显示；留空自动使用本地时区。当前生效：{timezone}', { timezone: effectiveSiteTimezone || browserTimeZone() || 'UTC' })}
                >
                  <TimezoneCombobox register={register('site_timezone')} />
                </Row>
                <InputRow label={t('admin.settings.general.siteUrl', '站点网址')} register={register('site_url')} placeholder="https://yourdomain.com" />
                <InputRow label={t('admin.settings.general.adminEmail', '管理员邮箱')} type="email" register={register('admin_email')} placeholder="admin@yourdomain.com" hint={t('admin.settings.general.adminEmailHint', '接收系统升级、安全通知等消息')} />
                <InputRow label={t('admin.settings.general.siteSince', '建站时间')} type="date" register={register('site_since')} hint={t('admin.settings.general.siteSinceHint', '留空则从第一篇文章算起。站点描述和关键词请到 SEO 与 AI tab 设置。')} last />
              </SettingsSection>

              <SettingsSection title={t('admin.settings.branding.section', 'Logo & Favicon')} icon={ImageIcon} footerHint={t('admin.settings.branding.footer', 'Logo 与深色 Logo 自动按比例压缩到 512×512 以内并转为 WebP；Favicon 自动生成多尺寸 /favicon.ico。')}>
                <div className="grid grid-cols-3 gap-4 p-4">
                  {([
                    { label: t('admin.settings.branding.siteLogo', '网站 Logo'), field: 'site_logo', purpose: 'logo' as const, placeholder: 'https://...' },
                    { label: t('admin.settings.branding.darkLogo', '深色模式 Logo'), field: 'site_logo_dark', purpose: 'dark-logo' as const, placeholder: t('admin.settings.branding.darkLogoPlaceholder', '留空沿用默认') },
                    { label: 'Favicon', field: 'site_favicon', purpose: 'favicon' as const, placeholder: '/favicon.ico' },
                  ]).map(item => {
                    const val = watch(item.field);
                    return (
                      <div key={item.field} className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-muted-foreground">{item.label}</label>
                        <div className={cn(
                          'flex h-20 items-center justify-center overflow-hidden rounded-md border border-border',
                          item.purpose === 'dark-logo' ? 'bg-neutral-900' : 'bg-muted',
                        )}>
                          {/* key={val} 让路径变化时强制重渲染子组件，
                              清掉上一次的 error state；这样上传失败 →
                              修正路径 → 重新加载会自动恢复，不会卡在
                              老的"加载失败"占位上。 */}
                          <BrandingPreview key={`${item.field}:${val}`} src={brandingPreviewSrc(item.field, val)} alt={item.label} />
                        </div>
                        <div className="flex gap-1.5">
                          <Input className="min-w-0 flex-1 text-xs" placeholder={item.placeholder} {...register(item.field)} />
                          <label
                            className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground"
                            title={t('admin.common.uploadImage', '上传图片')}
                          >
                            <CloudUpload className="size-3.5" />
                            <input type="file" accept=".png,.jpg,.jpeg,.gif,.webp,.avif,.ico,.svg" className="hidden" onChange={(e) => handleBrandingUpload(e, item.purpose, item.field)} />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SettingsSection>

              <SettingsSection
                title={t('admin.settings.beian.section', 'ICP / 公安备案')}
                icon={Shield}
                footerHint={t('admin.settings.beian.footer', '公安备案链接自动从备案号提取编号生成；ICP 备案链接固定指向 beian.miit.gov.cn。')}
              >
                <InputRow
                  label={t('admin.settings.beian.gongan', '公安联网备案号')}
                  register={register('beian_gongan')}
                  placeholder={t('admin.settings.beian.gonganPlaceholder', '鲁公网安备00000000000000号')}
                />
                <InputRow
                  label={t('admin.settings.beian.icp', 'ICP 备案号')}
                  register={register('beian_icp')}
                  placeholder={t('admin.settings.beian.icpPlaceholder', '鲁ICP备00000000号')}
                  last
                />
              </SettingsSection>

              <SettingsSection
                title={t('admin.settings.codeInjection.section', '代码注入')}
                icon={Code}
                footerHint={t('admin.settings.codeInjection.footer', '插入到页面 <head> 标签内，用于接入第三方统计 / 监控 / 验证脚本。请只填可信来源的代码。')}
              >
                <TextareaRow
                  label={t('admin.settings.codeInjection.headCode', '自定义 <head> 代码')}
                  rows={6}
                  register={register('custom_head_code')}
                  placeholder={t('admin.settings.codeInjection.headCodePlaceholder', '<!-- Google Analytics / 百度统计 / Clarity 等 -->\n<script async src="https://..."></script>')}
                  hint={t('admin.settings.codeInjection.headCodeHint', '支持任意 <script> / <meta> / <link> 标签。保存后立即生效。')}
                  last
                />
              </SettingsSection>
            </>
          )}

          {/* ==================== SEO 与 AI ==================== */}
          {activeTab === 'seo' && (
            <>
              <SettingsSection
                title={t('admin.settings.seo.aiCrawl.section', 'AI 抓取策略')}
                icon={Bot}
                footerHint={t('admin.settings.seo.aiCrawl.footer', '生成的 /robots.txt 会按这些选项设置 GPTBot / ClaudeBot / CCBot / PerplexityBot / Google-Extended 的 Allow / Disallow。')}
              >
                <SwitchRow
                  label={t('admin.settings.seo.aiCrawl.allow', '允许 AI 爬虫读取站点')}
                  hint={t('admin.settings.seo.aiCrawl.allowHint', '关闭后 robots.txt 会拒绝所有 AI 训练爬虫；普通搜索引擎不受影响。')}
                  name="ai_crawl_allowed" watch={watch} setValue={setValue}
                />
                <SwitchRow
                  label={t('admin.settings.seo.aiCrawl.llmsTxt', '生成 /llms.txt 站点索引')}
                  hint={t('admin.settings.seo.aiCrawl.llmsTxtHint', 'LLM 友好的 markdown 索引（标题 + 描述 + 文章列表），是 llmstxt.org 提议的新规范。')}
                  name="llms_txt_enabled" watch={watch} setValue={setValue}
                />
                <SwitchRow
                  label={t('admin.settings.seo.aiCrawl.llmsFull', '生成 /llms-full.txt 全文版')}
                  hint={t('admin.settings.seo.aiCrawl.llmsFullHint', '包含每篇文章 markdown 全文，体积更大；建议同时开启 ai_crawl_allowed 才有意义。')}
                  name="llms_full_enabled" watch={watch} setValue={setValue}
                  last
                />
              </SettingsSection>

              <SettingsSection
                title={t('admin.settings.seo.meta.section', '默认 SEO 元信息')}
                icon={Tag}
                footerHint={t('admin.settings.seo.meta.footer', '单篇文章未自定时使用这些值；文章自带的 cover_url / excerpt 会优先生效。')}
              >
                <TextareaRow
                  label={t('admin.settings.seo.meta.description', '默认描述')}
                  rows={2}
                  register={register('seo_default_description')}
                  placeholder={t('admin.settings.seo.meta.descriptionPlaceholder', '一句话描述站点 - 用作 meta description / og:description 兜底')}
                />
                <InputRow
                  label={t('admin.settings.seo.meta.keywords', '默认关键词')}
                  register={register('seo_default_keywords')}
                  placeholder={t('admin.settings.seo.meta.keywordsPlaceholder', '博客,技术,生活')}
                />
                <InputRow
                  label={t('admin.settings.seo.meta.defaultImage', '默认分享图 URL')}
                  register={register('seo_default_image')}
                  placeholder="https://yourdomain.com/og-image.jpg"
                  hint={t('admin.settings.seo.meta.defaultImageHint', '建议 1200x630。X / Facebook / 微信卡片图兜底。')}
                  last
                />
              </SettingsSection>

              <SettingsSection
                title={t('admin.settings.seo.twitter.section', 'X (Twitter) 卡片')}
                icon={AtSign}
              >
                <InputRow
                  label={t('admin.settings.seo.twitter.handle', 'X 用户名')}
                  register={register('seo_twitter_handle')}
                  placeholder="@yourhandle"
                  hint={t('admin.settings.seo.twitter.handleHint', '带 @ 前缀；用于 twitter:site 标签。')}
                />
                <SelectRow
                  label={t('admin.settings.seo.twitter.card', '卡片样式')}
                  register={register('seo_twitter_card')}
                  options={[
                    { value: 'summary_large_image', label: t('admin.settings.seo.twitter.largeCard', '大图卡片 - summary_large_image (推荐)') },
                    { value: 'summary', label: t('admin.settings.seo.twitter.summaryCard', '小图卡片 - summary') },
                  ]}
                  last
                />
              </SettingsSection>
            </>
          )}

          {/* ==================== 邮件设置 ==================== */}
          {activeTab === 'email' && (
            <>
              <Panel title={t('admin.settings.email.sender.section', '发件人信息')}>
                <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium text-muted-foreground">{t('admin.settings.email.sender.email', '发件人邮箱')}</label>
                    <Input placeholder="noreply@yourdomain.com" {...register('email_from')} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium text-muted-foreground">{t('admin.settings.email.sender.name', '发件人名称')}</label>
                    <Input placeholder="Utterlog" {...register('email_from_name')} />
                  </div>
                </div>
              </Panel>

              <Panel title={t('admin.settings.email.provider.section', '邮件服务商')}>
                <div className="mb-6">
                  <label className="mb-2 block text-[13px] font-medium text-muted-foreground">{t('admin.settings.email.provider.choose', '选择服务商')}</label>
                  <div className="flex gap-2.5">
                    {([
                      { value: 'smtp', label: 'SMTP', icon: Mail, desc: t('admin.settings.email.provider.smtpDesc', '通用 SMTP 协议') },
                      { value: 'resend', label: 'Resend', icon: Send, desc: t('admin.settings.email.provider.resendDesc', '免费 3000 封/月') },
                      { value: 'sendflare', label: 'Sendflare', icon: Bird, desc: t('admin.settings.email.provider.sendflareDesc', '免费 5000 封/月') },
                    ]).map(d => {
                      const Icon = d.icon;
                      const active = emailProvider === d.value;
                      return (
                        <label key={d.value} className={cn(
                          'flex flex-1 cursor-pointer flex-col items-center gap-2 rounded-md border p-4 transition-colors',
                          active ? 'border-primary bg-primary/5' : 'border-border bg-transparent',
                        )}>
                          <input type="radio" value={d.value} {...register('email_provider')} className="hidden" />
                          <Icon className={cn('size-5', active ? 'text-primary' : 'text-muted-foreground')} />
                          <span className={cn('text-[13px] font-semibold', active ? 'text-primary' : 'text-foreground')}>{d.label}</span>
                          <span className="text-[11px] text-muted-foreground">{d.desc}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {emailProvider === 'smtp' && (
                  <div className="flex flex-col gap-5 rounded-md border border-border bg-muted p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Mail className="size-[15px] text-primary" />
                        <h4 className="text-sm font-semibold text-foreground">{t('admin.settings.email.smtp.section', 'SMTP 配置')}</h4>
                      </div>
                      <a href="https://support.google.com/a/answer/176600" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground no-underline hover:text-foreground">
                        <ExternalLink className="size-2.5" /> {t('admin.settings.email.smtp.gmailGuide', 'Gmail SMTP 指南')}
                      </a>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-[13px] font-medium text-muted-foreground">{t('admin.settings.email.smtp.host', 'SMTP 主机')}</label>
                        <Input {...register('smtp_host')} placeholder="smtp.gmail.com" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[13px] font-medium text-muted-foreground">{t('admin.settings.email.smtp.port', '端口')}</label>
                        <Input {...register('smtp_port')} placeholder="587" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-[13px] font-medium text-muted-foreground">{t('admin.settings.email.smtp.username', '用户名')}</label>
                        <Input {...register('smtp_user')} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[13px] font-medium text-muted-foreground">{t('admin.settings.email.smtp.password', '密码')}</label>
                        <Input type="password" {...register('smtp_pass')} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[13px] font-medium text-muted-foreground">{t('admin.settings.email.smtp.encryption', '加密方式')}</label>
                      <select className={cn(SELECT_CLS, 'max-w-[200px]')} {...register('smtp_encryption')}>
                        <option value="tls">TLS</option>
                        <option value="ssl">SSL</option>
                        <option value="none">{t('admin.settings.email.smtp.noEncryption', '无加密')}</option>
                      </select>
                    </div>
                  </div>
                )}

                {emailProvider === 'resend' && (
                  <div className="flex flex-col gap-5 rounded-md border border-border bg-muted p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Send className="size-[15px] text-primary" />
                        <h4 className="text-sm font-semibold text-foreground">{t('admin.settings.email.resend.section', 'Resend 配置')}</h4>
                      </div>
                      <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground no-underline hover:text-foreground">
                        <ExternalLink className="size-2.5" /> resend.com
                      </a>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[13px] font-medium text-muted-foreground">API Key</label>
                      <Input type="password" {...register('resend_api_key')} placeholder="re_..." />
                      <p className="text-xs text-muted-foreground">{t('admin.settings.email.resend.apiKeyHint', '在 resend.com Dashboard 的 API Keys 中创建')}</p>
                    </div>
                  </div>
                )}

                {emailProvider === 'sendflare' && (
                  <div className="flex flex-col gap-5 rounded-md border border-border bg-muted p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bird className="size-[15px] text-primary" />
                        <h4 className="text-sm font-semibold text-foreground">{t('admin.settings.email.sendflare.section', 'Sendflare 配置')}</h4>
                      </div>
                      <a href="https://sendflare.com?affiliateCode=98ee3f7h4nqf" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground no-underline hover:text-foreground">
                        <ExternalLink className="size-2.5" /> sendflare.com
                      </a>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[13px] font-medium text-muted-foreground">API Key</label>
                      <Input type="password" {...register('sendflare_api_key')} placeholder="sf_..." />
                      <p className="text-xs text-muted-foreground">{t('admin.settings.email.sendflare.apiKeyHint', '在 sendflare.com Dashboard 的 API Keys 中创建')}</p>
                    </div>
                  </div>
                )}
              </Panel>

              <Panel title={t('admin.settings.email.test.section', '测试邮件')}>
                <p className="-mt-4 mb-4 text-xs text-muted-foreground">{t('admin.settings.email.test.description', '保存设置后发送测试邮件，验证邮件服务是否正常')}</p>
                <div className="flex items-center gap-2.5">
                  <Input
                    placeholder={t('admin.settings.email.test.recipientPlaceholder', '收件邮箱（留空发送到管理员邮箱）')}
                    className="max-w-[320px]"
                    id="test-email-input"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    onClick={async () => {
                      const input = document.getElementById('test-email-input') as HTMLInputElement;
                      try {
                        const r: any = await api.post('/options/test-email', { to: input?.value || '' });
                        toast.success(r.data?.message || t('admin.settings.email.test.sent', '测试邮件已发送'));
                      } catch (e: any) {
                        toast.error(e?.response?.data?.error?.message || t('admin.common.sendFailed', '发送失败'));
                      }
                    }}
                  >
                    <Send className="size-3.5" /> {t('admin.common.send', '发送')}
                  </Button>
                </div>
              </Panel>
            </>
          )}

          {/* ==================== Telegram ==================== */}
          {activeTab === 'telegram' && (
            <>
              <Panel title={t('admin.settings.telegram.connection.section', 'Bot 连接')}>
                <div className="flex flex-col gap-5">
                  <div className="space-y-1.5">
                    <label className="block text-[13px] font-medium text-muted-foreground">Bot Token</label>
                    <Input type="password" placeholder={t('admin.settings.telegram.botTokenPlaceholder', '从 @BotFather 获取')} {...register('telegram_bot_token')} />
                    <p className="text-xs text-muted-foreground">{t('admin.settings.telegram.botFatherPrefix', '在 Telegram 中搜索')} <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-primary">@BotFather</a>{t('admin.settings.telegram.botFatherSuffix', '，发送 /newbot 创建')}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-[13px] font-medium text-muted-foreground">Chat ID</label>
                      <div className="flex gap-1.5">
                        <Input placeholder={t('admin.settings.telegram.chatIdPlaceholder', '你的用户/群组 ID')} className="min-w-0 flex-1" {...register('telegram_chat_id')} />
                        <Button
                          type="button"
                          variant="outline"
                          className="shrink-0 whitespace-nowrap"
                          disabled={fetchingChatId}
                          onClick={async () => {
                            setFetchingChatId(true);
                            setTgChats([]);
                            try {
                              const vals = getValues();
                              const r: any = await api.post('/telegram/get-chat-id', { bot_token: vals.telegram_bot_token });
                              setTgChats(r.data?.chats || []);
                              if (!r.data?.chats?.length) toast(r.data?.hint || t('admin.settings.telegram.noChats', '未找到聊天记录，请先向 Bot 发送一条消息'));
                            } catch (e: any) { toast.error(e?.response?.data?.error?.message || t('admin.common.fetchFailed', '获取失败')); }
                            finally { setFetchingChatId(false); }
                          }}
                        >
                          {fetchingChatId ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />}
                          {t('admin.common.fetch', '获取')}
                        </Button>
                      </div>
                      {tgChats.length > 0 && (
                        <div className="mt-1.5 overflow-hidden rounded-md border border-border">
                          {tgChats.map((chat) => {
                            const ChatIcon = chat.type === 'channel' ? Megaphone : (chat.type === 'group' || chat.type === 'supergroup') ? Users : User;
                            return (
                              <button
                                key={chat.id}
                                type="button"
                                onClick={() => { reset({ ...getValues(), telegram_chat_id: chat.id }); setTgChats([]); }}
                                className="flex w-full items-center gap-2 border-b border-border px-2.5 py-[7px] text-left text-xs last:border-b-0 hover:bg-accent"
                              >
                                <ChatIcon className="size-3 shrink-0 text-muted-foreground" />
                                <span className="flex-1 text-foreground">{chat.name || t('admin.common.unknownWrapped', '(未知)')}</span>
                                <span className="font-mono text-muted-foreground">{chat.id}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[13px] font-medium text-muted-foreground">Webhook Secret</label>
                      <Input type="password" placeholder={t('admin.settings.telegram.webhookSecretPlaceholder', '自定义密钥（可选）')} {...register('telegram_webhook_secret')} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const vals = getValues();
                          const r: any = await api.post('/telegram/test', {
                            bot_token: vals.telegram_bot_token,
                            chat_id: vals.telegram_chat_id,
                          });
                          toast.success(r.data?.message || t('admin.common.connectionSuccess', '连接成功'));
                        } catch (e: any) { toast.error(e?.response?.data?.error?.message || t('admin.common.connectionFailed', '连接失败')); }
                      }}
                    >
                      <Plug className="size-3.5" /> {t('admin.common.testConnection', '测试连接')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const r: any = await api.post('/telegram/setup-webhook');
                          toast.success(r.data?.message || t('admin.settings.telegram.webhookSuccess', 'Webhook 设置成功'));
                        } catch (e: any) { toast.error(e?.response?.data?.error?.message || t('admin.settings.telegram.webhookFailed', 'Webhook 设置失败')); }
                      }}
                    >
                      <LinkIcon className="size-3.5" /> {t('admin.settings.telegram.setupWebhook', '设置 Webhook')}
                    </Button>
                  </div>
                  <p className="border border-border bg-muted px-3 py-2.5 text-xs leading-loose text-muted-foreground">
                    <strong>Webhook</strong> {t('admin.settings.telegram.webhookDescription', '是 Telegram 向你的服务器推送消息的回调地址。设置后，Bot 收到的消息会实时转发到你的博客后端，用于评论审批、回复等功能。需要先保存 Bot Token，再点「设置 Webhook」。')}
                  </p>
                </div>
              </Panel>

              <SettingsSection title={t('admin.settings.telegram.notifications.section', '通知功能')} icon={Bell}>
                <SwitchRow label={t('admin.settings.telegram.notifications.newComment', '新评论通知')} name="tg_notify_comment" watch={watch} setValue={setValue} />
                <SwitchRow label={t('admin.settings.telegram.notifications.newFollow', '新关注通知')} name="tg_notify_follow" watch={watch} setValue={setValue} />
                <SwitchRow label={t('admin.settings.telegram.notifications.postPublished', '文章发布通知')} name="tg_notify_publish" watch={watch} setValue={setValue} />
                <SwitchRow label={t('admin.settings.telegram.notifications.dailyReport', '每日数据报告')} name="tg_daily_report" watch={watch} setValue={setValue} last />
              </SettingsSection>

              <SettingsSection title={t('admin.settings.telegram.management.section', '管理功能')} icon={UserCog}>
                <SwitchRow label={t('admin.settings.telegram.management.commentApproval', '评论审批')} hint={t('admin.settings.telegram.management.commentApprovalHint', '回复 /approve 通过')} name="tg_comment_approve" watch={watch} setValue={setValue} />
                <SwitchRow label={t('admin.settings.telegram.management.replyComments', '回复评论')} hint={t('admin.settings.telegram.management.replyCommentsHint', '直接回复消息即可')} name="tg_comment_reply" watch={watch} setValue={setValue} />
                <SwitchRow label={t('admin.settings.telegram.management.publishMoment', '发布说说')} hint={t('admin.settings.telegram.management.publishMomentHint', '发送文字/图片自动发布')} name="tg_publish_moment" watch={watch} setValue={setValue} />
                <SwitchRow label={t('admin.settings.telegram.management.aiChat', 'AI 聊天')} hint={t('admin.settings.telegram.management.aiChatHint', '/ai 开头消息对接 AI 助手')} name="tg_ai_chat" watch={watch} setValue={setValue} last />
              </SettingsSection>

              <SettingsSection title={t('admin.settings.telegram.imageUpload.section', '图片上传')} icon={ImageIcon}>
                <SwitchRow
                  label={t('admin.settings.telegram.imageUpload.autoUpload', '自动上传图片到媒体库')}
                  hint={t('admin.settings.telegram.imageUpload.autoUploadHint', '通过 Telegram 发送图片时，自动上传到媒体库')}
                  name="tg_auto_upload_image" watch={watch} setValue={setValue}
                  last
                />
              </SettingsSection>
            </>
          )}

          {/* ==================== 评论设置 ==================== */}
          {activeTab === 'comment' && (
            <>
              <SettingsSection title={t('admin.settings.comment.switches.section', '评论开关')} icon={MessagesSquare}>
                <SwitchRow label={t('admin.settings.comment.switches.allowComments', '允许评论')} name="allow_comments" watch={watch} setValue={setValue} />
                <SwitchRow label={t('admin.settings.comment.switches.requireModeration', '评论需要审核')} name="comment_moderation" watch={watch} setValue={setValue} />
                <SwitchRow
                  label={t('admin.settings.comment.switches.trustReturning', '信任历史访客')}
                  hint={t('admin.settings.comment.switches.trustReturningHint', '评论者邮箱或浏览器指纹之前有过通过的评论，自动通过审核')}
                  name="comment_trust_returning" watch={watch} setValue={setValue}
                />
                <SwitchRow label={t('admin.settings.comment.switches.requireEmail', '评论需要填写邮箱')} name="comment_require_email" watch={watch} setValue={setValue} />
                <SwitchRow label={t('admin.settings.comment.switches.notifyAdmin', '新评论邮件通知管理员')} name="comment_notify_admin" watch={watch} setValue={setValue} last />
              </SettingsSection>

              <SettingsSection title={t('admin.settings.comment.order.section', '排序')} icon={ArrowDownWideNarrow} footerHint={t('admin.settings.comment.order.footer', '访客在评论区可以自行切换并存到本地，这里设的是没切换过时的初始顺序。')}>
                <RadioRow
                  label={t('admin.settings.comment.order.defaultOrder', '默认排序')}
                  hint={t('admin.settings.comment.order.defaultOrderHint', '访客首次进入评论区的初始顺序')}
                  register={register('comment_order')}
                  options={[
                    { value: 'newest', label: t('admin.settings.comment.order.newestFirst', '最新在前') },
                    { value: 'oldest', label: t('admin.settings.comment.order.oldestFirst', '最早在前') },
                  ]}
                  last
                />
              </SettingsSection>

              {/* 人机验证：保留自定义 3 列图标 radio 卡片（非表单式 UI），
                  只把子输入转成 InputRow 保持风格一致 */}
              <SettingsSection title={t('admin.settings.comment.captcha.section', '人机验证')} icon={Shield}>
                <div className={cn('px-3.5 pb-2.5 pt-3.5', watch('comment_captcha_mode') === 'pow' && 'border-b border-border')}>
                  <div className="mb-2.5 text-sm font-medium text-foreground">{t('admin.settings.comment.captcha.method', '验证方式')}</div>
                  <div className="flex gap-2.5">
                    {([
                      { value: 'off', label: t('admin.common.off', '关闭'), desc: t('admin.settings.comment.captcha.offDesc', '不验证') },
                      { value: 'pow', label: t('admin.settings.comment.captcha.pow', 'PoW 验证'), desc: t('admin.settings.comment.captcha.powDesc', '点击计算') },
                      { value: 'image', label: t('admin.settings.comment.captcha.image', '图片验证码'), desc: t('admin.settings.comment.captcha.imageDesc', '输入字符') },
                    ] as const).map(opt => {
                      const active = watch('comment_captcha_mode') === opt.value;
                      return (
                        <label key={opt.value} className={cn(
                          'flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-md border px-2 py-3 transition-colors',
                          active ? 'border-primary bg-primary/5' : 'border-border bg-transparent',
                        )}>
                          <input type="radio" value={opt.value} {...register('comment_captcha_mode')} className="hidden" />
                          <span className={cn('text-[13px] font-semibold', active ? 'text-primary' : 'text-foreground')}>{opt.label}</span>
                          <span className="text-[11px] text-muted-foreground">{opt.desc}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                {watch('comment_captcha_mode') === 'pow' && (
                  <InputRow
                    label={t('admin.settings.comment.captcha.difficulty', '验证难度')}
                    hint={t('admin.settings.comment.captcha.difficultyHint', '1-6，越大越难')}
                    type="number"
                    register={register('comment_captcha_difficulty')}
                    last
                  />
                )}
              </SettingsSection>

              {/* AI 评论审核 —— 复用全局 ai_providers，admin 可在「常规设置 →
                  AI → 用途路由」给 'comment-audit' purpose 单独绑 provider，
                  也可不绑自动 fallback 默认链。 */}
              <SettingsSection title={t('admin.settings.comment.aiAudit.section', 'AI 评论审核')} icon={ShieldCheck} footerHint={t('admin.settings.comment.aiAudit.footer', '启用后访客评论先经 AI 判断是否合规，再走原有人机验证 / 信任路径。AI 审核失败按下方策略处理，提示词在最下方「自定义提示词」可改。')}>
                <SwitchRow label={t('admin.settings.comment.aiAudit.enable', '启用 AI 审核')} name="ai_comment_audit_enabled" watch={watch} setValue={setValue} />
                <InputRow
                  label={t('admin.settings.comment.aiAudit.threshold', '审核阈值')}
                  hint={t('admin.settings.comment.aiAudit.thresholdHint', '0-1 之间。AI 返回的 confidence >= 阈值才算通过，越高越严格')}
                  type="number"
                  register={register('ai_comment_audit_threshold')}
                />
                <SelectRow
                  label={t('admin.settings.comment.aiAudit.failAction', '审核失败处理')}
                  register={register('ai_comment_audit_fail_action')}
                  options={[
                    { value: 'reject', label: t('admin.settings.comment.aiAudit.reject', '直接拦截（标记为垃圾）') },
                    { value: 'pending', label: t('admin.settings.comment.aiAudit.pending', '转人工审核（待审核队列）') },
                    { value: 'ignore', label: t('admin.settings.comment.aiAudit.ignore', '忽略（继续按原状态处理）') },
                  ]}
                  last
                />
              </SettingsSection>

              {/* AI 智能回复 —— 用 ai_purpose_comment-reply_provider 路由。
                  审核通过的评论异步生成回复入队列，按 mode 决定后续流程。 */}
              <SettingsSection title={t('admin.settings.comment.aiReply.section', 'AI 智能回复')} icon={Bot} footerHint={t('admin.settings.comment.aiReply.footer', '审核通过的评论自动调 AI 生成回复。auto 模式直接发布，audit 模式入队列等管理员审核（推荐），suggest 仅显示建议不发布。提示词在最下方「自定义提示词」可改。')}>
                <SwitchRow label={t('admin.settings.comment.aiReply.enable', '启用 AI 智能回复')} name="ai_comment_reply_enabled" watch={watch} setValue={setValue} />
                <SelectRow
                  label={t('admin.settings.comment.aiReply.mode', '回复模式')}
                  register={register('ai_comment_reply_mode')}
                  options={[
                    { value: 'audit', label: t('admin.settings.comment.aiReply.modeAudit', '人工审核模式（推荐）- 入队列等审核') },
                    { value: 'auto', label: t('admin.settings.comment.aiReply.modeAuto', '全自动模式 - 生成后直接发布') },
                    { value: 'suggest', label: t('admin.settings.comment.aiReply.modeSuggest', '仅建议模式 - 入队列但不发布') },
                  ]}
                />
                <InputRow
                  label={t('admin.settings.comment.aiReply.badgeText', 'AI 标识文本')}
                  hint={t('admin.settings.comment.aiReply.badgeTextHint', '附加在 AI 回复末尾的标识，留空则不显示。透明性原则建议保留')}
                  register={register('ai_comment_reply_badge_text')}
                />
                <InputRow
                  label={t('admin.settings.comment.aiReply.rateLimit', '每小时调用上限')}
                  hint={t('admin.settings.comment.aiReply.rateLimitHint', '防止 API 费用失控，0 为不限制')}
                  type="number"
                  register={register('ai_comment_reply_rate_limit')}
                />
                <InputRow
                  label={t('admin.settings.comment.aiReply.delay', '回复延迟（秒）')}
                  hint={t('admin.settings.comment.aiReply.delayHint', '审核通过后延迟多少秒再调 AI，0 为立即。建议 30-120 秒让回复更自然')}
                  type="number"
                  register={register('ai_comment_reply_delay')}
                />
                <SwitchRow
                  label={t('admin.settings.comment.aiReply.contextTitle', '上下文：包含文章标题')}
                  hint={t('admin.settings.comment.aiReply.contextTitleHint', '把当前文章标题传给 AI，回复更贴题')}
                  name="ai_comment_reply_context_title" watch={watch} setValue={setValue}
                />
                <SwitchRow
                  label={t('admin.settings.comment.aiReply.contextExcerpt', '上下文：包含文章摘要（前 300 字）')}
                  name="ai_comment_reply_context_excerpt" watch={watch} setValue={setValue}
                />
                <SwitchRow
                  label={t('admin.settings.comment.aiReply.contextParent', '上下文：包含父级评论')}
                  hint={t('admin.settings.comment.aiReply.contextParentHint', '访客回复其他人评论时，把对方的评论传给 AI')}
                  name="ai_comment_reply_context_parent" watch={watch} setValue={setValue}
                />
                <SwitchRow
                  label={t('admin.settings.comment.aiReply.onlyFirst', '仅对文章首条评论回复')}
                  hint={t('admin.settings.comment.aiReply.onlyFirstHint', '开启后同一文章 AI 只回复一次')}
                  name="ai_comment_reply_only_first" watch={watch} setValue={setValue}
                  last
                />
              </SettingsSection>
            </>
          )}

          {/* ==================== 存储设置 ==================== */}
          {activeTab === 'media' && (
            <>
              <Panel title={t('admin.settings.media.usage.section', '存储用量')}>
                <div className="flex flex-col gap-4">
                  {(() => {
                    const drivers = storageStats.drivers || {};
                    const local = drivers['local'] || { files: 0, size: 0 };
                    const cloud = drivers['s3'] || drivers['r2'] || { files: 0, size: 0 };
                    // Cloud driver still uses the admin-configured GB
                    // budget — there's no host filesystem to measure
                    // for S3/R2.
                    const limitBytes = (Number(storageLimitGb) || 10) * 1024 * 1024 * 1024;
                    const cloudRatio = cloud.size / limitBytes;

                    // Local: real disk usage of the host filesystem
                    // hosting the uploads directory (statfs in
                    // backend). Falls back to the synthetic budget
                    // if the disk info is missing (only hits when
                    // statfs syscall failed entirely or talking to
                    // a pre-disk-payload api build).
                    const disk = storageStats.disk;
                    const diskTotal = disk ? (Number(disk.total) || 0) : 0;
                    const diskUsed  = disk ? (Number(disk.used)  || 0) : 0;
                    const diskFree  = disk ? (Number(disk.free)  || 0) : 0;
                    const useDisk = diskTotal > 0;
                    const localRatio = useDisk ? diskUsed / diskTotal : (local.size / limitBytes);
                    const barColor = (ratio: number) => ratio > 0.9 ? 'bg-destructive' : ratio > 0.7 ? 'bg-amber-500' : 'bg-primary';

                    return (<>
                      {/* Local — real host disk when available */}
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <HardDrive className="size-3" /> {t('admin.settings.media.localStorage', '本地存储')}
                            <span className="text-xs text-muted-foreground">({t('admin.settings.media.fileCount', '{count} 个文件', { count: local.files })})</span>
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {useDisk
                              ? <>{formatSize(diskUsed)} / {formatSize(diskTotal)}<span className="ml-1.5 text-muted-foreground">{t('admin.settings.media.remaining', '剩余 {size}', { size: formatSize(diskFree) })}</span></>
                              : formatSize(local.size)
                            }
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className={cn('h-full transition-[width] duration-300', barColor(localRatio))} style={{ width: `${Math.min(localRatio * 100, 100)}%` }} />
                        </div>
                        {useDisk && (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {t('admin.settings.media.uploadsDiskUsage', '其中 utterlog 上传文件 {size}（占主机磁盘 {percent}%）', { size: formatSize(local.size), percent: ((local.size / diskTotal) * 100).toFixed(1) })}
                          </div>
                        )}
                      </div>
                      {/* Cloud (show when configured or has data) */}
                      {(mediaDriver === 's3' || mediaDriver === 'r2' || cloud.files > 0) && (
                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Cloud className="size-3" />
                              {mediaDriver === 'r2' ? 'Cloudflare R2' : 'AWS S3'}
                              <span className="text-xs text-muted-foreground">({t('admin.settings.media.fileCount', '{count} 个文件', { count: cloud.files })})</span>
                            </span>
                            <span className="font-mono text-xs text-muted-foreground">{formatSize(cloud.size)}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className={cn('h-full transition-[width] duration-300', cloudRatio > 0.9 ? 'bg-destructive' : 'bg-amber-500')} style={{ width: `${Math.min(cloudRatio * 100, 100)}%` }} />
                          </div>
                        </div>
                      )}
                    </>);
                  })()}
                </div>
              </Panel>

              <Panel>
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-foreground">{t('admin.settings.media.cleanup.section', '数据库清理')}</h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {t('admin.settings.media.cleanup.description', '清理媒体库缺失文件记录、失效相册关联、孤儿文章关系、孤儿评论、足迹残留和过期授权数据。不会删除正文内容，也不会删除远程对象存储里的文件。')}
                    </p>
                  </div>
                  <Button type="button" variant="secondary" disabled={cleaningDatabase} onClick={() => setConfirmCleanupDatabase(true)} className="min-w-[148px]">
                    {cleaningDatabase ? <Loader2 className="size-3.5 animate-spin" /> : <Brush className="size-3.5" />}
                    {t('admin.settings.media.cleanup.button', '清理数据库')}
                  </Button>
                </div>
                {databaseCleanupResult && (
                  <div className="mt-[18px] grid grid-cols-4 gap-2">
                    {[
                      ['media_missing_files', t('admin.settings.media.cleanup.mediaMissingFiles', '缺失媒体')],
                      ['album_links_reset', t('admin.settings.media.cleanup.albumLinksReset', '相册关联')],
                      ['album_covers_cleared', t('admin.settings.media.cleanup.albumCoversCleared', '失效封面')],
                      ['relationships_deleted', t('admin.settings.media.cleanup.relationshipsDeleted', '文章关系')],
                      ['comments_deleted', t('admin.settings.media.cleanup.commentsDeleted', '孤儿评论')],
                      ['footprints_deleted', t('admin.settings.media.cleanup.footprintsDeleted', '足迹关联')],
                      ['expired_tokens_deleted', t('admin.settings.media.cleanup.expiredTokensDeleted', '过期令牌')],
                      ['expired_bans_deleted', t('admin.settings.media.cleanup.expiredBansDeleted', '过期封禁')],
                      ['total', t('admin.settings.media.cleanup.total', '合计')],
                    ].map(([key, label]) => (
                      <div key={key} className={cn('rounded-md border border-border px-3 py-2.5', key === 'total' ? 'bg-primary/5' : 'bg-muted')}>
                        <div className={cn('font-mono text-lg leading-tight', key === 'total' ? 'text-primary' : 'text-foreground')}>{Number(databaseCleanupResult[key] || 0)}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title={t('admin.settings.media.driver.section', '存储方式')}>
                <div className="mb-6">
                  <label className="mb-2 block text-[13px] font-medium text-muted-foreground">{t('admin.settings.media.driver.label', '存储驱动')}</label>
                  <div className="flex gap-2.5">
                    {([
                      { value: 'local', label: t('admin.settings.media.localStorage', '本地存储'), icon: HardDrive, desc: t('admin.settings.media.driver.localDesc', '文件保存在服务器本地') },
                      { value: 's3', label: 'AWS S3', icon: Cloud, desc: t('admin.settings.media.driver.s3Desc', 'Amazon S3 / 兼容存储') },
                      { value: 'r2', label: 'Cloudflare R2', icon: Cloud, desc: t('admin.settings.media.driver.r2Desc', '零出口费用对象存储') },
                    ]).map(d => {
                      const Icon = d.icon;
                      const active = mediaDriver === d.value;
                      return (
                        <label key={d.value} className={cn(
                          'flex flex-1 cursor-pointer flex-col items-center gap-2 rounded-md border p-4 transition-colors',
                          active ? 'border-primary bg-primary/5' : 'border-border bg-transparent',
                        )}>
                          <input type="radio" value={d.value} {...register('media_driver')} className="hidden" />
                          <Icon className={cn('size-[22px]', active ? 'text-primary' : 'text-muted-foreground')} />
                          <span className={cn('text-[13px] font-semibold', active ? 'text-primary' : 'text-foreground')}>{d.label}</span>
                          <span className="text-center text-[11px] text-muted-foreground">{d.desc}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {(mediaDriver === 's3' || mediaDriver === 'r2') && (
                  <div className="flex flex-col gap-5 rounded-md border border-border bg-muted p-6">
                    <div className="flex items-center gap-2">
                      <Cloud className="size-4 text-primary" />
                      <h4 className="text-sm font-semibold text-foreground">{t('admin.settings.media.cloudConfig', '{provider} 配置', { provider: mediaDriver === 'r2' ? 'Cloudflare R2' : 'AWS S3' })}</h4>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-[13px] font-medium text-muted-foreground">Endpoint</label>
                        <Input {...register('s3_endpoint')} placeholder={mediaDriver === 'r2' ? 'https://<account_id>.r2.cloudflarestorage.com' : 'https://s3.amazonaws.com'} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[13px] font-medium text-muted-foreground">Region</label>
                        <Input {...register('s3_region')} placeholder={mediaDriver === 'r2' ? 'auto' : 'us-east-1'} />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[13px] font-medium text-muted-foreground">Bucket</label>
                      <Input {...register('s3_bucket')} placeholder="my-bucket" className="max-w-[320px]" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-[13px] font-medium text-muted-foreground">Access Key</label>
                        <Input {...register('s3_access_key')} placeholder="AKIA..." />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[13px] font-medium text-muted-foreground">Secret Key</label>
                        <Input type="password" {...register('s3_secret_key')} placeholder="••••••••" />
                      </div>
                    </div>

                    <div className="border-t border-border pt-5">
                      <div className="mb-2 flex items-center gap-1.5">
                        <Globe className="size-3.5 text-primary" />
                        <label className="text-[13px] font-medium text-muted-foreground">{t('admin.settings.media.customDomain', '自定义域名 (CDN)')}</label>
                      </div>
                      <Input {...register('s3_custom_domain')} placeholder="https://cdn.yourdomain.com" className="max-w-[400px]" />
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {t('admin.settings.media.customDomainHint', '绑定自定义域名后，所有文件 URL 将使用此域名访问。')}
                        {mediaDriver === 'r2' && ` ${t('admin.settings.media.r2CustomDomainHint', 'R2 可在 Cloudflare Dashboard 中绑定自定义域名。')}`}
                        {mediaDriver === 's3' && ` ${t('admin.settings.media.s3CdnHint', '建议配合 CloudFront 或其他 CDN 使用。')}`}
                        {t('admin.settings.media.customDomainEmptyHint', ' 留空则使用 Bucket 原始地址。')}
                      </p>
                    </div>

                    <div className="border-t border-border pt-5">
                      <label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">{t('admin.settings.media.storageLimit', '空间容量限制 (GB)')}</label>
                      <Input type="number" min={1} {...register('storage_limit_gb')} placeholder="10" className="w-40" />
                      <p className="mt-1 text-xs text-muted-foreground">{t('admin.settings.media.storageLimitHint', '超过此容量将不允许继续上传')}</p>
                    </div>

                    <div className="flex items-center gap-2.5 pt-1">
                      <Button type="button" variant="outline" onClick={testStorageConnection} disabled={testingStorage}>
                        {testingStorage ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
                        {testingStorage ? t('admin.common.testing', '测试中…') : t('admin.common.testConnection', '测试连接')}
                      </Button>
                    </div>
                  </div>
                )}
              </Panel>

              <Panel title={t('admin.settings.media.folderRouting.section', '分类存储路由')}>
                <p className="mb-5 -mt-3 text-xs leading-relaxed text-muted-foreground">
                  {t('admin.settings.media.folderRouting.description', '为每个上传分类单独指定存储位置。选择「云端」时，该分类的文件将上传至已配置的 S3/R2；选择「本地」时始终保存在服务器本地。「跟随全局」使用上方存储方式设置。')}
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { key: 'folder_driver_covers', label: t('admin.settings.media.folderRouting.covers', '文章封面'), icon: ImageIcon },
                    { key: 'folder_driver_books', label: t('admin.settings.media.folderRouting.books', '书单封面'), icon: BookOpen },
                    { key: 'folder_driver_movies', label: t('admin.settings.media.folderRouting.movies', '影视封面'), icon: Film },
                    { key: 'folder_driver_music', label: t('admin.settings.media.folderRouting.music', '音乐封面'), icon: Music },
                    { key: 'folder_driver_links', label: t('admin.settings.media.folderRouting.links', '友链头像'), icon: LinkIcon },
                    { key: 'folder_driver_moments', label: t('admin.settings.media.folderRouting.moments', '动态图片'), icon: Zap },
                    { key: 'folder_driver_albums', label: t('admin.settings.media.folderRouting.albums', '相册图片'), icon: Images },
                    { key: 'folder_driver_avatars', label: t('admin.settings.media.folderRouting.avatars', '用户头像'), icon: User },
                  ].map(({ key, label, icon: Icon }) => (
                    <div key={key} className="flex items-center justify-between rounded-md border border-border bg-muted px-3.5 py-2.5">
                      <span className="flex items-center gap-2 text-[13px] text-foreground">
                        <Icon className="size-3.5 text-muted-foreground" />
                        {label}
                      </span>
                      <select className={cn(SELECT_CLS, 'h-8 w-[100px] px-2 py-1 text-xs')} {...register(key)}>
                        <option value="">{t('admin.settings.media.folderRouting.followGlobal', '跟随全局')}</option>
                        <option value="local">{t('admin.settings.media.folderRouting.local', '本地')}</option>
                        <option value="cloud">{t('admin.settings.media.folderRouting.cloud', '云端')}</option>
                      </select>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title={t('admin.settings.media.uploadLimits.section', '上传限制')}>
                <div className="grid gap-y-6">
                  <div className="space-y-1.5">
                    <label className="block text-[13px] font-medium text-muted-foreground">{t('admin.settings.media.uploadLimits.maxSize', '最大上传大小 (MB)')}</label>
                    <Input type="number" {...register('max_upload_size')} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[13px] font-medium text-muted-foreground">{t('admin.settings.media.uploadLimits.allowedTypes', '允许的文件类型')}</label>
                    <Textarea className="font-mono text-xs" rows={3} {...register('allowed_extensions')} placeholder={t('admin.settings.media.uploadLimits.allowedTypesPlaceholder', '每行一个扩展名，或用逗号分隔')} />
                    <p className="text-xs text-muted-foreground">
                      {t('admin.settings.media.uploadLimits.commonTypes', '常用：jpg, jpeg, png, gif, webp, svg, ico, mp4, mp3, pdf, zip, doc, docx, xls, xlsx, ppt, pptx, txt, md')}
                    </p>
                  </div>
                </div>
              </Panel>
            </>
          )}

          {/* ==================== 图片处理 ==================== */}
          {activeTab === 'image' && (
            <>
              <SettingsSection title={t('admin.settings.image.processing.section', '压缩与转换')} icon={FileImage} description={t('admin.settings.image.processing.description', '上传图片时自动重新编码（仅 PNG/JPEG 输入会进入处理流程；WebP/AVIF/GIF/SVG 等直通保存）')}>
                <SelectRow
                  label={t('admin.settings.image.processing.convertFormat', '上传后自动转换格式')}
                  register={register('image_convert_format')}
                  options={[
                    { value: '',     label: t('admin.settings.image.processing.keepOriginal', '不转换（保持原格式）') },
                    { value: 'webp', label: t('admin.settings.image.processing.webp', 'WebP（推荐，体积小兼容好）') },
                    { value: 'avif', label: t('admin.settings.image.processing.avif', 'AVIF（体积更小，编码慢 1-3s/张）') },
                    { value: 'jpg',  label: 'JPEG' },
                  ]}
                />
                <InputRow
                  label={t('admin.settings.image.processing.quality', '压缩质量')}
                  hint={t('admin.settings.image.processing.qualityHint', '当前 {quality}，推荐 75-85，越低体积越小但画质降低（WebP / JPEG / AVIF 均生效）', { quality: imageQuality })}
                  type="range"
                  register={register('image_quality')}
                />
                <InputRow
                  label={t('admin.settings.image.processing.maxWidth', '最大宽度 (px)')}
                  hint={t('admin.settings.image.processing.maxWidthHint', '留空不限制，建议 1920 或 2560。超过此宽度的图片会自动等比缩小（Lanczos 算法）')}
                  type="number"
                  register={register('image_max_width')}
                  placeholder="1920"
                />
                <SwitchRow
                  label={t('admin.settings.image.processing.stripExif', '去除 EXIF 信息')}
                  hint={t('admin.settings.image.processing.stripExifHint', '编码后的图片本身一律不含 EXIF（重新编码自动去除）。此开关控制是否把原图的 EXIF 元数据（相机/镜头/光圈/拍摄日期）保存到数据库，供前台 LazyImage 显示拍摄参数。开启=不保存=前台不显示；关闭=保存=前台可显示')}
                  name="image_strip_exif" watch={watch} setValue={setValue}
                  last
                />
              </SettingsSection>

              <Panel
                title={t('admin.settings.image.random.section', '随机图片 API')}
                action={<Switch checked={!!watch('random_image_enabled')} onCheckedChange={(v: boolean) => setValue('random_image_enabled', v, { shouldDirty: true })} />}
              >
                <p className="mb-5 text-xs text-muted-foreground">{t('admin.settings.image.random.description', '文章没有特色图片时，自动从 API 获取随机封面')}</p>
                <ImgEtBuilder register={register} watch={watch} setValue={setValue} />
              </Panel>

              <Panel title={t('admin.settings.image.display.section', '图片显示效果')}>
                <p className="-mt-3 mb-5 text-xs text-muted-foreground">{t('admin.settings.image.display.description', '前端文章特色图片和正文图片的加载动画效果')}</p>
                <div className="grid gap-y-6">
                  <div>
                    <label className="mb-2 block text-[13px] font-medium text-muted-foreground">{t('admin.settings.image.display.effect', '显示效果')}</label>
                    <div className="grid grid-cols-4 gap-2.5">
                      {[
                        { value: 'fade',  label: t('admin.settings.image.display.fade', '淡入'),    desc: t('admin.settings.image.display.fadeDesc', '模糊渐变透明') },
                        { value: 'pixel', label: t('admin.settings.image.display.pixel', '像素化'),  desc: t('admin.settings.image.display.pixelDesc', '马赛克块消散') },
                        { value: 'scale', label: t('admin.settings.image.display.scale', '缩放'),    desc: t('admin.settings.image.display.scaleDesc', '从小放到正常') },
                        { value: 'none',  label: t('admin.settings.image.display.none', '无'),      desc: t('admin.settings.image.display.noneDesc', '直接显示') },
                      ].map(effect => {
                        const active = watch('image_display_effect', 'fade') === effect.value;
                        return (
                          <label key={effect.value} className={cn(
                            'cursor-pointer rounded-md border px-2.5 py-3 text-center transition-colors',
                            active ? 'border-primary bg-primary/5' : 'border-border bg-transparent',
                          )}>
                            <input type="radio" value={effect.value} {...register('image_display_effect')} className="hidden" />
                            <p className={cn('text-[13px] font-semibold', active ? 'text-primary' : 'text-foreground')}>{effect.label}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{effect.desc}</p>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[13px] font-medium text-muted-foreground">{t('admin.settings.image.display.duration', '动画时长 (ms)')}</label>
                    <Input type="number" {...register('image_display_duration')} placeholder="300" />
                  </div>
                </div>
              </Panel>

              <SettingsSection title={t('admin.settings.image.lazy.section', '懒加载')} icon={Hourglass} description={t('admin.settings.image.lazy.description', '图片进入可视区域时才加载，提升页面加载速度。关闭后图片在页面打开时立即下载（适合幻灯片、长截图归档等场景）')}>
                <SwitchRow label={t('admin.settings.image.lazy.enable', '启用懒加载')} name="image_lazy_load" watch={watch} setValue={setValue} last />
              </SettingsSection>

              <SettingsSection title={t('admin.settings.image.lightbox.section', '图片灯箱')} icon={Expand} description={t('admin.settings.image.lightbox.description', '点击文章图片时全屏预览，支持缩放、拖拽、键盘导航、图片组切换。关闭后点击图片不响应（图片若包在链接里则跟随链接跳转）')}>
                <SwitchRow label={t('admin.settings.image.lightbox.enable', '启用灯箱')} name="image_lightbox" watch={watch} setValue={setValue} last />
              </SettingsSection>
            </>
          )}

          {/* ==================== 第三方服务 ==================== */}
          {activeTab === 'services' && (
            <>
              {serviceSections.map((section) => (
                <SettingsSection
                  key={section.title}
                  title={section.title}
                  icon={section.icon}
                  description={section.description}
                  inlineDescription
                  footerHint={section.footerHint}
                >
                  {section.fields.map((field, index) => (
                    <InputRow
                      key={field.name}
                      label={field.label}
                      type={field.type}
                      register={register(field.name)}
                      placeholder={field.placeholder}
                      hint={field.hint}
                      last={index === section.fields.length - 1}
                    />
                  ))}
                </SettingsSection>
              ))}
            </>
          )}

          {/* ==================== 安全设置 ==================== */}

          {/* ==================== 系统更新 ==================== */}
          {activeTab === 'update' && (
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold tracking-wide text-foreground">
                <CloudDownload className="size-4 text-primary" />
                {t('admin.settings.update.section', '系统更新')}
              </h3>
              <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                {t('admin.settings.update.description', 'Utterlog 通过 GitHub Releases 推送新版本。下方会实时比对你当前运行的版本和最新发布；有新版本时点「一键升级」即可。升级过程保留所有数据、配置和用户上传。')}
              </p>
              <SystemUpdatePanel />
              <div className="mt-6 border border-border bg-muted px-[18px] py-3.5 text-xs leading-loose text-muted-foreground">
                <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
                  <Info className="size-3.5" />
                  {t('admin.settings.update.otherMethods', '其它升级方式')}
                </div>
                · {t('admin.settings.update.commandLine', '命令行')}：<code className="border border-border bg-card px-1.5 py-px font-mono text-[11px]">curl -fsSL https://utterlog.io/update.sh | bash</code>
                <br />
                · {t('admin.settings.update.changelog', '历史版本')}：<a href="https://utterlog.io/changelog" target="_blank" rel="noopener" className="text-primary">utterlog.io/changelog</a>
                <br />
                · {t('admin.settings.update.docs', '文档')}：<a href="https://docs.utterlog.io/update/" target="_blank" rel="noopener" className="text-primary">docs.utterlog.io/update</a>
              </div>
            </div>
          )}

          {/* Save button — only shows on editable tabs (not read-only "update" tab) */}
          {activeTab !== 'update' && (
            <div className="mt-6 flex justify-end">
              <Button type="button" onClick={handleSubmit(onSubmit)} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {t('admin.settings.saveSettings', '保存设置')}
              </Button>
            </div>
          )}
        </form>
      </div>
      <ConfirmDialog
        open={confirmCleanupDatabase}
        onOpenChange={(o) => { if (!o && !cleaningDatabase) setConfirmCleanupDatabase(false); }}
        onConfirm={cleanupDatabase}
        title={t('admin.settings.media.cleanup.title', '清理数据库')}
        message={t('admin.settings.media.cleanup.confirm', '清理会删除数据库里可以确认无效的残留记录，例如缺失文件的媒体记录、失效相册关联、孤儿文章关联和过期令牌。是否继续？')}
        confirmText={t('admin.settings.media.cleanup.button', '清理数据库')}
      />
    </div>
  );
}

// ================== img.et Random Image Builder ==================
// Visual builder for https://img.et/<w>/<h>?type=...&r=...&s=...&format=...
// Writes result URL to the `random_image_api` form field.
function ImgEtBuilder({ register, watch, setValue }: { register: any; watch: any; setValue: any }) {
  const { t } = useI18n();
  const currentUrl: string = watch('random_image_api') || '';

  // Local builder state — persisted into the URL on change
  const parsed = (() => {
    try {
      if (currentUrl.startsWith('https://img.et/') || currentUrl.startsWith('http://img.et/')) {
        const u = new URL(currentUrl);
        const m = u.pathname.match(/^\/(\d+)\/(\d+)\/?$/);
        return {
          width: m?.[1] || '1920',
          height: m?.[2] || '1080',
          type: u.searchParams.get('type') || '',
          r: u.searchParams.get('r') || '',
          s: u.searchParams.get('s') || '',
          format: u.searchParams.get('format') || 'webp',
          isImgEt: true,
        };
      }
    } catch {}
    return { width: '1920', height: '1080', type: 'banner', r: '', s: '', format: 'webp', isImgEt: false };
  })();

  const buildURL = (w: string, h: string, type: string, r: string, s: string, format: string) => {
    const q = new URLSearchParams();
    if (type) q.set('type', type);
    if (r) q.set('r', r);
    if (s) q.set('s', s);
    if (format) q.set('format', format);
    const qs = q.toString();
    return `https://img.et/${w}/${h}${qs ? '?' + qs : ''}`;
  };

  const update = (patch: Partial<typeof parsed>) => {
    const next = { ...parsed, ...patch };
    const url = buildURL(next.width, next.height, next.type, next.r, next.s, next.format);
    setValue('random_image_api', url, { shouldDirty: true });
  };

  const typeOptions = [
    { value: '', label: t('admin.settings.image.random.typeAny', '任意 / 随机') },
    { value: 'banner', label: t('admin.settings.image.random.typeBanner', 'banner - 通用横幅、默认头图') },
    { value: 'landscape', label: t('admin.settings.image.random.typeLandscape', 'landscape - 风景、山水、自然场景') },
    { value: 'beauty', label: t('admin.settings.image.random.typeBeauty', 'beauty - 人物、人像、美图') },
    { value: 'anime', label: t('admin.settings.image.random.typeAnime', 'anime - 动漫、插画、二次元') },
    { value: 'city', label: t('admin.settings.image.random.typeCity', 'city - 城市、建筑、街景') },
    { value: 'nature', label: t('admin.settings.image.random.typeNature', 'nature - 森林、海洋、天空、植物') },
    { value: 'car', label: t('admin.settings.image.random.typeCar', 'car - 汽车、机车、赛道') },
    { value: 'game', label: t('admin.settings.image.random.typeGame', 'game - 游戏、电竞、虚拟场景') },
    { value: 'food', label: t('admin.settings.image.random.typeFood', 'food - 美食、甜点、饮品') },
    { value: 'animal', label: t('admin.settings.image.random.typeAnimal', 'animal - 动物、萌宠、野生生态') },
    { value: 'travel', label: t('admin.settings.image.random.typeTravel', 'travel - 旅行、目的地、度假') },
    { value: 'space', label: t('admin.settings.image.random.typeSpace', 'space - 星空、宇宙、科幻') },
    { value: 'tech', label: t('admin.settings.image.random.typeTech', 'tech - 科技、数码、未来感') },
    { value: 'business', label: t('admin.settings.image.random.typeBusiness', 'business - 商务、办公、团队') },
    { value: 'sports', label: t('admin.settings.image.random.typeSports', 'sports - 运动、健身、赛事') },
    { value: 'architecture', label: t('admin.settings.image.random.typeArchitecture', 'architecture - 建筑、室内、空间设计') },
  ];

  const formatOptions = [
    { value: 'webp', label: t('admin.settings.image.random.formatWebp', 'WebP（推荐，体积小）') },
    { value: 'avif', label: t('admin.settings.image.random.formatAvif', 'AVIF（更小，新浏览器）') },
    { value: 'jpg', label: t('admin.settings.image.random.formatJpeg', 'JPEG（兼容性好）') },
    { value: 'png', label: t('admin.settings.image.random.formatPng', 'PNG（有损压缩）') },
  ];

  return (
    <div className="flex flex-col gap-3.5">
      {/* Service preset selector */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-muted-foreground">{t('admin.settings.image.random.service', '服务')}</label>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => update({})}
            className={cn(
              'rounded-md border px-3.5 py-1.5 text-xs font-medium transition-colors',
              parsed.isImgEt ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-accent',
            )}
          >
            {t('admin.settings.image.random.imgEtRecommended', 'img.et （推荐）')}
          </button>
          <span className="ml-1 text-[11px] text-muted-foreground">
            {t('admin.settings.image.random.customUrlHint', '或在下方直接填自定义 URL')}
          </span>
        </div>
      </div>

      {/* Params grid (only enabled when img.et is selected) */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted-foreground">{t('admin.settings.image.random.width', '宽度 (px)')}</label>
          <Input type="number" value={parsed.width} onChange={(e) => update({ width: e.target.value })} min={100} max={4096} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted-foreground">{t('admin.settings.image.random.height', '高度 (px)')}</label>
          <Input type="number" value={parsed.height} onChange={(e) => update({ height: e.target.value })} min={100} max={4096} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted-foreground">{t('admin.settings.image.random.outputFormat', '输出格式 format')}</label>
          <select value={parsed.format} onChange={(e) => update({ format: e.target.value })} className={SELECT_CLS}>
            {formatOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted-foreground">{t('admin.settings.image.random.type', '类型 type')}</label>
          <select value={parsed.type} onChange={(e) => update({ type: e.target.value })} className={SELECT_CLS}>
            {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted-foreground">
            {t('admin.settings.image.random.fixedR', '固定 r')}
            <span className="ml-1 font-normal text-muted-foreground">{t('admin.settings.image.random.fixedRHint', '（按规则锁定图片）')}</span>
          </label>
          <Input type="text" value={parsed.r} onChange={(e) => update({ r: e.target.value })} placeholder={t('admin.common.empty', '留空')} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted-foreground">
            {t('admin.settings.image.random.positionS', '多图位置 s')}
            <span className="ml-1 font-normal text-muted-foreground">{t('admin.settings.image.random.positionSHint', '（0/1/2/...）')}</span>
          </label>
          <Input type="text" value={parsed.s} onChange={(e) => update({ s: e.target.value })} placeholder={t('admin.common.empty', '留空')} />
        </div>
      </div>

      {/* Raw URL input + preview */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
          {t('admin.settings.image.random.finalUrl', '最终 API 地址')}
          <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
            {t('admin.settings.image.random.finalUrlHint', '（可直接编辑；改上方参数会覆盖）')}
          </span>
        </label>
        <Input
          className="font-mono text-xs"
          {...register('random_image_api')}
          placeholder="https://img.et/1920/1080?type=landscape&format=webp"
        />
      </div>

      {/* Preview */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground">{t('admin.common.preview', '预览')}</label>
          <button
            type="button"
            onClick={() => setValue('random_image_api', currentUrl + (currentUrl.includes('?') ? '&' : '?') + '_=' + Date.now(), { shouldDirty: true })}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            title={t('admin.settings.image.random.refreshPreview', '刷新预览')}
          >
            <RefreshCw className="size-3" /> {t('admin.settings.image.random.nextImage', '换一张')}
          </button>
        </div>
        {currentUrl ? (
          <div
            className="flex max-h-[280px] w-full items-center justify-center overflow-hidden rounded-md border border-border bg-muted"
            style={{ aspectRatio: parsed.width && parsed.height ? `${parsed.width} / ${parsed.height}` : '16 / 9' }}
          >
            <img
              src={currentUrl}
              alt="preview"
              className="size-full object-cover"
              onError={(e) => { (e.currentTarget.parentElement!.innerHTML = `<span class="text-xs text-muted-foreground">${t('admin.settings.image.random.previewLoadFailed', '图片加载失败，请检查 URL 或参数')}</span>`); }}
            />
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-muted p-10 text-center text-xs text-muted-foreground">
            {t('admin.settings.image.random.previewEmpty', '填入参数后会显示预览')}
          </div>
        )}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        <Lightbulb className="mr-1.5 inline size-3 text-primary" />
        <strong>{t('admin.settings.image.random.example', '用法示例')}</strong>：
        <code className="mx-1 bg-muted px-1.5 py-px text-[11px]">
          https://img.et/1920/1080?type=landscape&format=webp
        </code>
        {t('admin.settings.image.random.exampleDescription', '现代浏览器默认用 webp；Safari 17+ / Chrome 100+ 可选 avif 体积更小。更多详细用法可访问')}{' '}
        <a
          href="https://img.et"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary no-underline"
        >
          img.et
          <ExternalLink className="size-2.5" />
        </a>
        {t('admin.common.period', '。')}
      </p>
    </div>
  );
}
