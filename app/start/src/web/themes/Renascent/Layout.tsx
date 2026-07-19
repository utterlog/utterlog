import Header from './Header';
import Footer from './Footer';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="blog-shell renascent-theme">
      <Header />
      <main className="blog-main renascent-main">
        <div className="renascent-frame">
          {children}
        </div>
        <Footer />
      </main>
    </div>
  );
}
