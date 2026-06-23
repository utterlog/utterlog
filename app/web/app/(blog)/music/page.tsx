import type { Metadata } from 'next';
import MusicClient from './MusicClient';

export const metadata: Metadata = { title: '音乐' };

export default function MusicPage() {
  return <MusicClient />;
}
