import Header from './Header';
import Footer from './Footer';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="blog-shell azure-shell">
      <Header />
      <main className="blog-main azure-main">
        <div className="azure-frame">
          {children}
        </div>
        <Footer />
      </main>
    </div>
  );
}
