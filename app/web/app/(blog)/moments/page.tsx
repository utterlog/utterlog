import type { Metadata } from 'next';
import MomentsClient from './MomentsClient';

export const metadata: Metadata = { title: '说说' };

export default function MomentsPage() {
  return <MomentsClient />;
}
