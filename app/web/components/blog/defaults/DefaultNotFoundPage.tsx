import Link from 'next/link';

export default function DefaultNotFoundPage() {
  return (
    <div style={{ textAlign: 'center', padding: '6rem 2rem' }}>
      <i className="fa-sharp fa-light fa-ghost" style={{ fontSize: '64px', color: 'var(--color-text-dim)', marginBottom: '24px', display: 'block' }} />
      <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-text-main)', marginBottom: '12px' }}>404</h1>
      <p style={{ fontSize: '16px', color: 'var(--color-text-sub)', marginBottom: '32px' }}>页面不存在或已被删除</p>
      <Link href="/" style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        padding: '10px 24px', border: '1px solid var(--color-border)',
        textDecoration: 'none', color: 'var(--color-text-main)',
        fontSize: '14px', fontWeight: 500, transition: 'border-color 0.15s',
      }} className="hover:border-primary">
        <i className="fa-sharp fa-light fa-arrow-left" /> 返回首页
      </Link>
    </div>
  );
}
