import type { Metadata } from 'next';
import AboutContent from './AboutContent';

export const metadata: Metadata = {
  title: '关于',
};

export default function AboutPage() {
  return <AboutContent />;
}
