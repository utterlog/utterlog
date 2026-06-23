import type { Metadata } from 'next';
import FeedsClient from './FeedsClient';

export const metadata: Metadata = { title: '订阅' };

export default function FeedsPage() {
  return <FeedsClient />;
}
