import Header from './Header';
import Footer from './Footer';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="blog-shell" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f4f6f8', color: '#202020', fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif' }}>
      <Header />
      <main className="blog-main" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px' }}>
          {children}
        </div>
        <div style={{ flexShrink: 0 }}>
          <Footer />
        </div>
      </main>
    </div>
  );
}
