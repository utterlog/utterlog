import { Link } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';

export default function NotFound() {
  const { t } = useI18n();

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '80px 20px', textAlign: 'center',
    }}>
      <i className="fa-regular fa-ghost" style={{ fontSize: 48, color: 'var(--color-text-dim)', marginBottom: 16 }} />
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>{t('admin.notFound.title', '页面未找到')}</h1>
      <p className="text-sub" style={{ fontSize: 13, margin: '0 0 20px' }}>{t('admin.notFound.description', '此页面正在迁移中或不存在')}</p>
      <Link to="/" className="btn btn-secondary" style={{ textDecoration: 'none' }}>{t('admin.notFound.back', '返回概览')}</Link>
    </div>
  );
}
