import Header from './Header';
import Footer from './Footer';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="blog-shell" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f5f5f5', color: '#1a1a1a', fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif' }}>
      <Header />
      <main className="blog-main" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: '1400px', width: '100%', margin: '0 auto', borderLeft: '1px solid #d9d9d9', borderRight: '1px solid #d9d9d9', background: '#fff', minHeight: 'calc(100vh - 60px)' }}>
          {children}
        </div>
        <Footer />
      </main>
    </div>
  );
}
