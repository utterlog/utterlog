
import { useState } from 'react';
import { Upload, CloudDownload, Loader2 } from 'lucide-react';
import { mediaApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/lib/i18n';
import { Input, Button, buttonVariants } from '@/components/ui/shadcn';
import { cn } from '@/lib/utils';

interface CoverInputProps {
  value: string;
  onChange: (url: string) => void;
  folder?: string;
  label?: string;
  placeholder?: string;
}

export function CoverInput({ value, onChange, folder, label, placeholder = 'https://...' }: CoverInputProps) {
  const { t } = useI18n();
  const [uploading, setUploading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const displayLabel = label === undefined ? t('admin.cover.label', '封面图片') : label;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const r: any = await mediaApi.upload(file, folder);
      const url = r.url || r.data?.url;
      if (url) { onChange(url); toast.success(t('admin.common.uploadSuccess', '上传成功')); }
    } catch { toast.error(t('admin.common.uploadFailed', '上传失败')); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleFetch = async () => {
    if (!value?.startsWith('http')) { toast.error(t('admin.cover.invalidUrl', '请先输入有效的图片 URL')); return; }
    setFetching(true);
    try {
      const r: any = await mediaApi.downloadUrl(value, folder);
      const url = r.url || r.data?.url;
      if (url) { onChange(url); toast.success(t('admin.cover.synced', '已同步到存储')); }
    } catch { toast.error(t('admin.cover.syncFailed', '同步失败')); }
    finally { setFetching(false); }
  };

  return (
    <div>
      {displayLabel && (
        <label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">{displayLabel}</label>
      )}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        {value && (
          <div
            className="border border-border bg-muted"
            style={{ width: '52px', height: '52px', overflow: 'hidden', flexShrink: 0 }}
          >
            <img
              src={value} alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
            />
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <Input
            className="text-[13px]"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
          />
          <div style={{ display: 'flex', gap: '6px' }}>
            <label className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), uploading ? 'cursor-wait' : 'cursor-pointer')}>
              {uploading
                ? <><Loader2 className="size-3.5 animate-spin" />{t('admin.cover.uploading', '上传中…')}</>
                : <><Upload className="size-3.5" />{t('admin.cover.uploadImage', '上传图片')}</>
              }
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} disabled={uploading} />
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleFetch}
              disabled={fetching || !value?.startsWith('http')}
              title={t('admin.cover.syncTitle', '将当前 URL 下载并保存到配置的存储')}
            >
              {fetching
                ? <><Loader2 className="size-3.5 animate-spin" />{t('admin.cover.syncing', '同步中…')}</>
                : <><CloudDownload className="size-3.5" />{t('admin.cover.syncToStorage', '同步到存储')}</>
              }
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
