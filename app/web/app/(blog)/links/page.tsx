import type { Metadata } from 'next';
import LinksClient from './LinksClient';

export const metadata: Metadata = { title: '友链' };

export default function LinksPage() {
  return <LinksClient />;
}
