import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '安装 · Utterlog',
};

export default function InstallLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
