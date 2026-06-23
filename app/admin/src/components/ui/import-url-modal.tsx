
import { useState } from 'react';
import { Button, Input, Modal } from '@/components/ui';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/lib/i18n';

interface ImportUrlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: any) => void;
  type: string; // music, movie, book, game
  platforms?: string;
}

export function ImportUrlModal({ isOpen, onClose, onImport, type, platforms }: ImportUrlModalProps) {
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const defaultPlatforms: Record<string, string> = {
    music: '网易云音乐、QQ音乐、NeoDB',
    movie: '豆瓣、NeoDB、YouTube、B站、优酷、腾讯视频、爱奇艺、IMDB',
    book: '豆瓣、NeoDB',
    game: 'NeoDB、Steam',
  };

  const handleImport = async () => {
    if (!url.trim()) { toast.error(t('admin.import.enterUrl', '请输入链接')); return; }
    setLoading(true);
    try {
      const r: any = await api.post('/media/parse', { url: url.trim() });
      if (r.data) {
        onImport(r.data);
        setUrl('');
        onClose();
        toast.success(t('admin.import.parseSuccess', '解析成功，请确认信息后保存'));
      } else {
        toast.error(t('admin.import.parseFailed', '解析失败'));
      }
    } catch (e: any) {
      toast.error(t('admin.import.parseFailedWithReason', '解析失败：{reason}', { reason: e?.response?.data?.error?.message || e?.message || '' }));
    }
    setLoading(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('admin.import.title', '链接导入')}>
      <div className="space-y-4">
        <p className="text-xs text-dim">
          {t('admin.import.description', '粘贴链接自动解析，支持 {platforms}', { platforms: platforms || defaultPlatforms[type] || t('admin.import.platforms.all', '各大平台') })}
        </p>
        <Input
          label={t('admin.import.urlLabel', '链接地址')}
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://..."
          onKeyDown={e => { if (e.key === 'Enter') handleImport(); }}
          autoFocus
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button variant="secondary" onClick={onClose}>{t('admin.common.cancel', '取消')}</Button>
          <Button onClick={handleImport} loading={loading}>{t('admin.import.parseButton', '解析导入')}</Button>
        </div>
      </div>
    </Modal>
  );
}
