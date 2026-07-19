'use client';

import { useThemeContext } from '@/lib/theme-context';
import { useReaderChatStore } from '@/lib/store';

export default function Footer() {
  const ctx = useThemeContext();
  const siteName = ctx.site.title || 'Utterlog';
  const year = new Date().getFullYear();
  // 陪读卡片 store —— 文章页用户点 X 关掉陪读后，footer 上要冒出一个
  // 「重新打开陪读」的小按钮。Flux 主题 footer 自身没有「回到顶部」按钮
  // 可以做锚点，所以这里用 fixed 定位在视口右下角浮起来。
  const readerActive = useReaderChatStore(s => s.active);
  const readerDismissed = useReaderChatStore(s => s.dismissed);
  const showReader = useReaderChatStore(s => s.show);

  return (
    <>
    {readerActive && readerDismissed && (
      <button
        onClick={showReader}
        title="重新打开陪读"
        style={{
          position: 'fixed', right: 24, bottom: 24, zIndex: 9998,
          width: 44, height: 44, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#fff', border: '1px solid #E5E5E5',
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          color: '#00C767', cursor: 'pointer',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; }}
      >
        <i className="fa-sharp fa-solid fa-message-bot" style={{ fontSize: 16 }} />
      </button>
    )}
    <footer style={{ borderTop: '1px solid #E5E5E5', marginTop: 80 }}>
      <div
        className="flux-container"
        style={{
          padding: '48px 64px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 24,
        }}
      >
        {/* Brand lockup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 22, height: 22, borderRadius: 9999,
              background: '#00C767',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <path d="M9 6l6 6-6 6" stroke="#034F28" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span style={{ fontSize: 15, fontWeight: 500, color: '#011E0F' }}>{siteName}</span>
        </div>

        <div style={{ fontSize: 14, color: '#737373' }}>
          © {year} {siteName}. Powered by{' '}
          <a
            href="https://utterlog.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#737373', textDecoration: 'none', borderBottom: '1px dotted #D4D4D4' }}
          >
            Utterlog
          </a>
        </div>
      </div>
    </footer>
    </>
  );
}
