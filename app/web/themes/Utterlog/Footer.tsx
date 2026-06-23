'use client';

import { useEffect, useState } from 'react';
import { useReaderChatStore } from '@/lib/store';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export default function Footer() {
  const [siteOptions, setSiteOptions] = useState<any>({});
  // 陪读卡片 store —— 文章页用户点 X 关掉陪读后，footer 上要冒出一个
  // 「重新打开陪读」的小按钮。Utterlog 主题 footer 自身没有「回到顶部」
  // 按钮可以做锚点，所以这里用 fixed 定位在视口右下角浮起来。
  const readerActive = useReaderChatStore(s => s.active);
  const readerDismissed = useReaderChatStore(s => s.dismissed);
  const showReader = useReaderChatStore(s => s.show);

  useEffect(() => {
    fetch(`${API}/options`, { cache: 'no-store' }).then(r => r.json()).then(r => setSiteOptions(r.data || {})).catch(() => {});
  }, []);

  const siteName = siteOptions.site_title || 'Utterlog';
  const hasBeian = siteOptions.beian_gongan || siteOptions.beian_icp;

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
          background: '#fff', border: '1px solid #e0e0e0',
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          color: '#0052D9', cursor: 'pointer',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; }}
      >
        <i className="fa-sharp fa-solid fa-message-bot" style={{ fontSize: 16 }} />
      </button>
    )}
    <footer style={{ background: '#f4f6f8', borderTop: '1px solid #e9e9e9', padding: '32px 40px', textAlign: 'center' }}>
      <p style={{ fontSize: '13px', color: '#6b7280' }}>
        &copy; {new Date().getFullYear()} {siteName}. Powered by Utterlog.
      </p>
      {hasBeian && (
        <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px', display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {siteOptions.beian_icp && (
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer"
              style={{ color: '#9ca3af', textDecoration: 'none' }}>
              {siteOptions.beian_icp}
            </a>
          )}
          {siteOptions.beian_gongan && (
            <a href={`https://beian.mps.gov.cn/#/query/webSearch?code=${siteOptions.beian_gongan.replace(/\D/g, '')}`}
              target="_blank" rel="noopener noreferrer"
              style={{ color: '#9ca3af', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <img src="/images/beian/ghs.png" alt="" style={{ width: '14px', height: '14px' }} />
              {siteOptions.beian_gongan}
            </a>
          )}
        </p>
      )}
    </footer>
    </>
  );
}
