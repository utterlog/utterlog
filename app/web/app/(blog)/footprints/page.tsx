import type { Metadata } from 'next';
import { getFootprints, getOptions } from '@/lib/blog-api';
import FootprintsClient from './FootprintsClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '足迹' };

export default async function FootprintsPage() {
  const [optionsRes, footprintsRes] = await Promise.all([
    getOptions().catch(() => ({ data: {} } as any)),
    getFootprints().catch(() => ({ data: [] } as any)),
  ]);
  const options = (optionsRes?.data || {}) as Record<string, string>;
  const rows = Array.isArray(footprintsRes?.data) ? footprintsRes.data : [];

  return <FootprintsClient initialRows={rows} options={options} />;
}
