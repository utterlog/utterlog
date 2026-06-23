
import { useState } from 'react';
import { mediaApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/lib/i18n';

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
        <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>{displayLabel}</label>
      )}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        {value && (
          <div style={{ width: '52px', height: '52px', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, background: 'var(--color-bg-soft)', border: '1px solid var(--color-border)' }}>
            <img
              src={value} alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
            />
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <input
            className="input focus-ring"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            style={{ fontSize: '13px' }}
          />
          <div style={{ display: 'flex', gap: '6px' }}>
            <label
              className="btn btn-secondary"
              style={{ cursor: uploading ? 'wait' : 'pointer', fontSize: '12px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              {uploading
                ? <><i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '11px' }} />{t('admin.cover.uploading', '上传中…')}</>
                : <><i className="fa-regular fa-upload" style={{ fontSize: '11px' }} />{t('admin.cover.uploadImage', '上传图片')}</>
              }
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} disabled={uploading} />
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              onClick={handleFetch}
              disabled={fetching || !value?.startsWith('http')}
              title={t('admin.cover.syncTitle', '将当前 URL 下载并保存到配置的存储')}
            >
              {fetching
                ? <><i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '11px' }} />{t('admin.cover.syncing', '同步中…')}</>
                : <><i className="fa-regular fa-cloud-arrow-down" style={{ fontSize: '11px' }} />{t('admin.cover.syncToStorage', '同步到存储')}</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
