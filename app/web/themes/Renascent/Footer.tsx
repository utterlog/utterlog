'use client';

import Link from 'next/link';
import { useReaderChatStore } from '@/lib/store';
import { useThemeContext } from '@/lib/theme-context';

export default function Footer() {
  const { site, owner, menus } = useThemeContext();
  const year = new Date().getFullYear();
  const siteName = site.title || 'Utterlog';
  const footerItems = menus.footer || [];
  const readerActive = useReaderChatStore(state => state.active);
  const readerDismissed = useReaderChatStore(state => state.dismissed);
  const showReader = useReaderChatStore(state => state.show);

  return (
    <>
      {readerActive && readerDismissed && (
        <button
          type="button"
          className="renascent-reader-button"
          title="重新打开陪读"
          aria-label="重新打开陪读"
          onClick={showReader}
        >
          <i className="fa-sharp fa-solid fa-message-bot" aria-hidden="true" />
        </button>
      )}
      <footer className="renascent-footer">
        <div className="renascent-container renascent-footer-inner">
          <div>
            <Link prefetch={false} href="/" className="renascent-footer-brand">Renascent·@{siteName}</Link>
            {owner.bio && <p className="renascent-footer-bio">{owner.bio}</p>}
          </div>
          <div className="renascent-footer-links">
            {footerItems.map(item => (
              <Link prefetch={false} key={`${item.href}-${item.label}`} href={item.href || '#'}>{item.label}</Link>
            ))}
            <a href="/feed">RSS</a>
            <a href="https://utterlog.com" target="_blank" rel="noopener noreferrer">Utterlog</a>
          </div>
          <div className="renascent-footer-meta">
            © {year} {siteName}
          </div>
        </div>
      </footer>
    </>
  );
}
