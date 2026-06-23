import type { Metadata } from 'next';
import AlbumsClient from './AlbumsClient';

export const metadata: Metadata = { title: '相册' };

export default function AlbumsPage() {
  return <AlbumsClient />;
}
