import Header from './Header';
import Footer from './Footer';
import MiniMusicPlayer from './MiniMusicPlayer';
import TopProgress from './TopProgress';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="blog-shell nebula-theme">
      <TopProgress />
      <Header />
      <main className="blog-main nebula-main">
        <div className="nebula-frame">
          {children}
        </div>
        <Footer />
      </main>
      <MiniMusicPlayer />
    </div>
  );
}
