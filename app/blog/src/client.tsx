import './process-polyfill';
import { hydrateRoot } from 'react-dom/client';
import { BlogHydrateApp } from './blog-app';
import type { UtterlogBoot } from './types';

declare global {
  interface Window {
    __UTTERLOG_HYDRATING__?: boolean;
  }
}

const BOOT_SCRIPT_ID = 'utterlog-boot-data';

function readBoot(): UtterlogBoot | null {
  const el = document.getElementById(BOOT_SCRIPT_ID);
  if (!el?.textContent) return null;
  try {
    const boot = JSON.parse(el.textContent) as UtterlogBoot;
    if (!boot?.ctx?.theme?.name) return null;
    return boot;
  } catch {
    return null;
  }
}

const boot = readBoot();
const root = document.getElementById('root');
if (boot && root) {
  window.__UTTERLOG_HYDRATING__ = true;
  hydrateRoot(root, <BlogHydrateApp boot={boot} />);
  queueMicrotask(() => {
    window.__UTTERLOG_HYDRATING__ = false;
  });
}
