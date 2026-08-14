/**
 * 「图片处理」tab。
 *
 * 从 Settings.tsx 里 `{activeTab === 'image' && (...)}` 整段搬过来，JSX 一字未改。
 * img.et 随机图片构建器（ImgEtBuilder）只有这个 tab 用得到，一并搬过来，避免
 * ImageTab 反向 import Settings.tsx 形成循环依赖。
 */

import { Input, Switch } from '@/components/ui/shadcn';
import { ExternalLink, Expand, FileImage, Hourglass, Lightbulb, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import type { UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import {
  InputRow, Panel, RadioCardRow, Row, SelectRow, SettingsSection, SwitchRow, SELECT_CLS,
} from './shared';

type T = ReturnType<typeof useI18n>['t'];

export default function ImageTab({ t, register, watch, setValue }: {
  t: T;
  register: UseFormRegister<any>;
  watch: UseFormWatch<any>;
  setValue: UseFormSetValue<any>;
}) {
  const imageQuality = watch('image_quality', 82);

  return (
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
        description={t('admin.settings.image.random.description', '文章没有特色图片时，自动从 API 获取随机封面')}
        action={<Switch checked={!!watch('random_image_enabled')} onCheckedChange={(v: boolean) => setValue('random_image_enabled', v, { shouldDirty: true })} />}
      >
        <ImgEtBuilder register={register} watch={watch} setValue={setValue} />
      </Panel>

      <SettingsSection
        title={t('admin.settings.image.display.section', '图片显示效果')}
        icon={Sparkles}
        description={t('admin.settings.image.display.description', '前端文章特色图片和正文图片的加载动画效果')}
      >
        <Row label={t('admin.settings.image.display.effect', '显示效果')} column>
          <RadioCardRow
            className="w-full"
            value={watch('image_display_effect', 'fade')}
            register={register('image_display_effect')}
            options={[
              { value: 'fade',  label: t('admin.settings.image.display.fade', '淡入'),    desc: t('admin.settings.image.display.fadeDesc', '模糊渐变透明') },
              { value: 'mosaic', label: t('admin.settings.image.display.mosaic', '马赛克'),  desc: t('admin.settings.image.display.mosaicDesc', '方块逐个化开') },
              { value: 'scale', label: t('admin.settings.image.display.scale', '缩放'),    desc: t('admin.settings.image.display.scaleDesc', '从小放到正常') },
              { value: 'none',  label: t('admin.settings.image.display.none', '无'),      desc: t('admin.settings.image.display.noneDesc', '直接显示') },
            ]}
          />
        </Row>
        <InputRow
          label={t('admin.settings.image.display.duration', '动画时长 (ms)')}
          type="number"
          register={register('image_display_duration')}
          placeholder="300"
          last
        />
      </SettingsSection>

      <SettingsSection title={t('admin.settings.image.lazy.section', '懒加载')} icon={Hourglass} description={t('admin.settings.image.lazy.description', '图片进入可视区域时才加载，提升页面加载速度。关闭后图片在页面打开时立即下载（适合幻灯片、长截图归档等场景）')}>
        <SwitchRow label={t('admin.settings.image.lazy.enable', '启用懒加载')} name="image_lazy_load" watch={watch} setValue={setValue} last />
      </SettingsSection>

      <SettingsSection title={t('admin.settings.image.lightbox.section', '图片灯箱')} icon={Expand} description={t('admin.settings.image.lightbox.description', '点击文章图片时全屏预览，支持缩放、拖拽、键盘导航、图片组切换。关闭后点击图片不响应（图片若包在链接里则跟随链接跳转）')}>
        <SwitchRow label={t('admin.settings.image.lightbox.enable', '启用灯箱')} name="image_lightbox" watch={watch} setValue={setValue} last />
      </SettingsSection>
    </>
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
        <label className="mb-1.5 block text-xs-plus font-medium text-foreground">{t('admin.settings.image.random.service', '服务')}</label>
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
          <span className="ml-1 text-2xs text-muted-foreground">
            {t('admin.settings.image.random.customUrlHint', '或在下方直接填自定义 URL')}
          </span>
        </div>
      </div>

      {/* Params grid (only enabled when img.et is selected) */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="block text-xs-plus font-medium text-foreground">{t('admin.settings.image.random.width', '宽度 (px)')}</label>
          <Input type="number" value={parsed.width} onChange={(e) => update({ width: e.target.value })} min={100} max={4096} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs-plus font-medium text-foreground">{t('admin.settings.image.random.height', '高度 (px)')}</label>
          <Input type="number" value={parsed.height} onChange={(e) => update({ height: e.target.value })} min={100} max={4096} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs-plus font-medium text-foreground">{t('admin.settings.image.random.outputFormat', '输出格式 format')}</label>
          <select value={parsed.format} onChange={(e) => update({ format: e.target.value })} className={SELECT_CLS}>
            {formatOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-xs-plus font-medium text-foreground">{t('admin.settings.image.random.type', '类型 type')}</label>
          <select value={parsed.type} onChange={(e) => update({ type: e.target.value })} className={SELECT_CLS}>
            {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs-plus font-medium text-foreground">
            {t('admin.settings.image.random.fixedR', '固定 r')}
            <span className="ml-1 font-normal text-muted-foreground">{t('admin.settings.image.random.fixedRHint', '（按规则锁定图片）')}</span>
          </label>
          <Input type="text" value={parsed.r} onChange={(e) => update({ r: e.target.value })} placeholder={t('admin.common.empty', '留空')} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs-plus font-medium text-foreground">
            {t('admin.settings.image.random.positionS', '多图位置 s')}
            <span className="ml-1 font-normal text-muted-foreground">{t('admin.settings.image.random.positionSHint', '（0/1/2/...）')}</span>
          </label>
          <Input type="text" value={parsed.s} onChange={(e) => update({ s: e.target.value })} placeholder={t('admin.common.empty', '留空')} />
        </div>
      </div>

      {/* Raw URL input + preview */}
      <div>
        <label className="mb-1.5 block text-xs-plus font-medium text-foreground">
          {t('admin.settings.image.random.finalUrl', '最终 API 地址')}
          <span className="ml-1.5 text-2xs font-normal text-muted-foreground">
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
          <label className="text-xs-plus font-medium text-foreground">{t('admin.common.preview', '预览')}</label>
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
            className="flex max-h-70 w-full items-center justify-center overflow-hidden rounded-md border border-border bg-muted"
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
        <code className="mx-1 bg-muted px-1.5 py-px text-2xs">
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
