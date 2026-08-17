
import { useEffect, useMemo, useState } from 'react';
import { optionsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Button, ConfirmDialog, Spinner,
  Tabs, TabsList, TabsTrigger,
} from '@/components/ui/shadcn';
import {
  Loader2,
  Save,
} from 'lucide-react';
// tab 头的图标走动画版：hover 整个 tab 时由 AnimatedIcon 命令式驱动。
import { AnimatedIcon } from '@/components/ui/animated-icon';
import type { AnimatedIcon as AnimatedIconType } from '@/components/ui/animated-icon';
import { GlobeIcon } from '@/components/ui/globe';
import { SearchIcon } from '@/components/ui/search';
import { MailIcon } from '@/components/ui/mail';
import { SendIcon } from '@/components/ui/send';
import { MessagesSquareIcon } from '@/components/ui/messages-square';
import { DatabaseIcon } from '@/components/ui/database';
import { ImageIcon as AnimatedImageIcon } from '@/components/ui/image';
import { KeyIcon } from '@/components/ui/key';
import { CloudDownloadIcon } from '@/components/ui/cloud-download';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { invalidateSiteOptions, loadSiteOptions } from '@/lib/site';
import { setAdminTimeZone } from '@/lib/timezone';
import { useForm } from 'react-hook-form';
import UpdateTab from './settings/UpdateTab';
import ServicesTab from './settings/ServicesTab';
import SeoTab from './settings/SeoTab';
import TelegramTab from './settings/TelegramTab';
import EmailTab from './settings/EmailTab';
import CommentTab from './settings/CommentTab';
import GeneralTab, { brandingPreviewSrc } from './settings/GeneralTab';
import MediaTab from './settings/MediaTab';
import ImageTab from './settings/ImageTab';

// Native <select> styled like the shadcn Input so it stays compatible
// with react-hook-form register() (Base UI Select can't take register).
const VALID_TABS = new Set(['general', 'seo', 'email', 'telegram', 'comment', 'media', 'image', 'services', 'update']);
function initialTabFromHash(): string {
  if (typeof window === 'undefined') return 'general';
  const h = window.location.hash.replace(/^#/, '');
  return VALID_TABS.has(h) ? h : 'general';
}

const TAB_FIELDS: Record<string, string[]> = {
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
    'mapbox_access_token',
    'github_access_token',
    'google_maps_api_key', 'amap_api_key', 'tencent_maps_api_key',
    'tinypng_api_key',
    'ip_geo_provider',
  ],
};


export default function SettingsPage() {
  const { t, reload: reloadI18n } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(initialTabFromHash);
  // tab 头图标的动画由这个驱动：热区是整个 tab，不是那 16px 图标本身。
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
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
  const effectiveSiteTimezone = watch('site_timezone_effective', '');
  const mediaDriver = watch('media_driver', 'local');
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
        ip_geo_provider: s.ip_geo_provider || 'ipx',
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
        // 安全（require_login / rate_limit 随安全中心一并下线，中间件已移除；
        // two_factor_enabled / two_factor_code 也在 2026-08-17 一并摘掉 ——
        // 只往表单 state 里塞，页面上没有任何控件渲染它们，后端也不读。
        // 真正的 2FA 是活的，但它存在 users.totp_enabled **列**上，
        // 走 backend/services/auth-security.ts，跟这两个同名 option 无关。）
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


  const onSubmit = async (data: any) => {
    setSaving(true);
    try {
      const fields = TAB_FIELDS[activeTab];
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

  // useMemo：这个字面量只随语言变化，但组件每次重渲染（切 tab、输入任何
  // 一个字段）都会重建它。
  const tabs: { id: string; label: string; icon: AnimatedIconType }[] = useMemo(() => [
    { id: 'general', label: t('admin.settings.tabs.general', '常规设置'), icon: GlobeIcon },
    { id: 'seo', label: t('admin.settings.tabs.seo', 'SEO 与 AI'), icon: SearchIcon },
    { id: 'email', label: t('admin.settings.tabs.email', '邮件设置'), icon: MailIcon },
    { id: 'telegram', label: 'Telegram', icon: SendIcon },
    { id: 'comment', label: t('admin.settings.tabs.comment', '评论设置'), icon: MessagesSquareIcon },
    { id: 'media', label: t('admin.settings.tabs.media', '存储设置'), icon: DatabaseIcon },
    { id: 'image', label: t('admin.settings.tabs.image', '图片处理'), icon: AnimatedImageIcon },
    { id: 'services', label: t('admin.settings.tabs.services', '第三方服务'), icon: KeyIcon },
    { id: 'update', label: t('admin.settings.tabs.update', '系统更新'), icon: CloudDownloadIcon },
  ], [t]);

  if (loading) {
    return <Spinner />;
  }

  return (
    <div className="w-full">
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as string)} className="mb-7">
        {/* 选中态直接由 activeTab 判断，不依赖组件库的属性 —— 之前写的
            data-[selected]: 与 Base UI 实际输出的 aria-selected 对不上，
            激活样式一直没生效。窄屏横向滚动而不是换行，九个 tab 换行会把
            表单顶下去半屏。 */}
        <TabsList className="flex h-auto w-full flex-nowrap justify-start gap-0.5 overflow-x-auto rounded-none border-b border-border bg-transparent p-0 text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                onMouseEnter={() => setHoveredTab(tab.id)}
                onMouseLeave={() => setHoveredTab(null)}
                className={cn(
                  'group relative h-11 shrink-0 gap-1.5 rounded-t-md border-b-2 border-transparent px-3.5',
                  'text-xs-plus font-normal transition-colors',
                  selected
                    ? 'border-primary bg-transparent font-semibold text-primary shadow-none'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                <AnimatedIcon
                  icon={tab.icon}
                  hovered={hoveredTab === tab.id}
                  size={16}
                  className={cn('flex size-4 shrink-0 items-center justify-center transition-colors', selected ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')}
                />
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
            <GeneralTab
              t={t}
              register={register}
              watch={watch}
              locales={locales}
              effectiveSiteTimezone={effectiveSiteTimezone}
              handleBrandingUpload={handleBrandingUpload}
            />
          )}

          {/* ==================== SEO 与 AI ==================== */}
          {activeTab === 'seo' && (
            <SeoTab t={t} register={register} watch={watch} setValue={setValue} />
          )}

          {/* ==================== 邮件设置 ==================== */}
          {activeTab === 'email' && (
            <EmailTab t={t} register={register} watch={watch} />
          )}

          {/* ==================== Telegram ==================== */}
          {activeTab === 'telegram' && (
            <TelegramTab
              t={t}
              register={register}
              watch={watch}
              setValue={setValue}
              getValues={getValues}
              reset={reset}
              tgChats={tgChats}
              setTgChats={setTgChats}
              fetchingChatId={fetchingChatId}
              setFetchingChatId={setFetchingChatId}
            />
          )}

          {/* ==================== 评论设置 ==================== */}
          {activeTab === 'comment' && <CommentTab t={t} register={register} watch={watch} setValue={setValue} />}

          {/* ==================== 存储设置 ==================== */}
          {activeTab === 'media' && (
            <MediaTab
              t={t}
              register={register}
              mediaDriver={mediaDriver}
              storageLimitGb={storageLimitGb}
              storageStats={storageStats}
              formatSize={formatSize}
              cleaningDatabase={cleaningDatabase}
              setConfirmCleanupDatabase={setConfirmCleanupDatabase}
              databaseCleanupResult={databaseCleanupResult}
              testStorageConnection={testStorageConnection}
              testingStorage={testingStorage}
            />
          )}

          {/* ==================== 图片处理 ==================== */}
          {activeTab === 'image' && (
            <ImageTab t={t} register={register} watch={watch} setValue={setValue} />
          )}

          {/* ==================== 第三方服务 ==================== */}
          {activeTab === 'services' && (
            <ServicesTab t={t} register={register} watch={watch} />
          )}

          {/* ==================== 安全设置 ==================== */}

          {/* ==================== 系统更新 ==================== */}
          {activeTab === 'update' && <UpdateTab t={t} />}

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
