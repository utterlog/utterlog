import Header from './Header';
import Footer from './Footer';

// data-theme="Flux" stamping is now handled centrally by
// app/(blog)/layout.tsx so it runs before paint (server-injected
// inline script). Layout can stay a server component.

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="blog-shell flux-theme"
      style={{
        display: 'flex', flexDirection: 'column', minHeight: '100vh',
        background: '#FFFFFF', color: '#171717',
        fontFamily: 'Matter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
      }}
    >
      <Header />
      <main className="blog-main" style={{ flex: 1 }}>
        <div className="flux-container" style={{ paddingTop: 40, paddingBottom: 80 }}>
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}
