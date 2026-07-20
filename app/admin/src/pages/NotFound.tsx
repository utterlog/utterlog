import { Ghost } from 'lucide-react';
import { Link } from '@/lib/router';
import { useI18n } from '@/lib/i18n';

export default function NotFound() {
  const { t } = useI18n();

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '80px 20px', textAlign: 'center',
    }}>
      <Ghost className="size-12 text-muted-foreground" />
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>{t('admin.notFound.title', '页面未找到')}</h1>
      <p className="text-sub" style={{ fontSize: 14, margin: '0 0 20px' }}>{t('admin.notFound.description', '此页面正在迁移中或不存在')}</p>
      <Link to="/" className="btn btn-secondary" style={{ textDecoration: 'none' }}>{t('admin.notFound.back', '返回概览')}</Link>
    </div>
  );
}
