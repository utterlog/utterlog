/**
 * 浏览器/操作系统/设备 图标映射
 *
 * 浏览器：/icons/browsers/*.svg
 * 操作系统：/icons/os/*.svg (部分用 lucide)
 * 设备：lucide 图标
 */
import { Globe, Cpu, Monitor, Smartphone, Tablet, type LucideIcon } from 'lucide-react';

const browserMap: Record<string, string> = {
  chrome: '/icons/browsers/chrome.svg',
  'google chrome': '/icons/browsers/chrome.svg',
  firefox: '/icons/browsers/firefox.svg',
  'mozilla firefox': '/icons/browsers/firefox.svg',
  safari: '/icons/browsers/safari.svg',
  edge: '/icons/browsers/edge.svg',
  'microsoft edge': '/icons/browsers/edge.svg',
};

const osMap: Record<string, string> = {
  macos: '/icons/os/macos.svg',
  ios: '/icons/os/ios.svg',
  windows: '/icons/os/windows11.svg',
  linux: '/icons/os/linux.svg',
  ubuntu: '/icons/os/ubuntu.svg',
  debian: '/icons/os/debian.svg',
  android: '/icons/os/androidsvg.svg',
  harmonyos: '/icons/os/harmonyos.svg',
  xiaomi: '/icons/os/xiaomi.svg',
  microsoft: '/icons/os/microsoft.svg',
};

// OS 用 lucide 图标的（没有 SVG 文件的）
const osIconMap: Record<string, LucideIcon> = {
};

const deviceIconMap: Record<string, LucideIcon> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
};

function normalize(name: string): string {
  return (name || '').toLowerCase().trim();
}

/** 浏览器图标 */
export function BrowserIcon({ name, size = 16 }: { name: string; size?: number }) {
  const key = normalize(name);
  const src = browserMap[key];
  if (src) {
    return <img src={src} alt={name} style={{ width: size, height: size, objectFit: 'contain' }} />;
  }
  return <Globe size={size} className="text-muted-foreground" />;
}

/** 操作系统图标 */
export function OSIcon({ name, size = 16 }: { name: string; size?: number }) {
  const key = normalize(name);
  // Check SVG map first
  const src = osMap[key];
  if (src) {
    return <img src={src} alt={name} style={{ width: size, height: size, objectFit: 'contain' }} />;
  }
  // Check lucide map
  const Icon = osIconMap[key];
  if (Icon) {
    return <Icon size={size} className="text-muted-foreground" />;
  }
  return <Cpu size={size} className="text-muted-foreground" />;
}

/** 设备图标 */
export function DeviceIcon({ type, size = 16 }: { type: string; size?: number }) {
  const key = normalize(type);
  const Icon = deviceIconMap[key] || Monitor;
  return <Icon size={size} className="text-muted-foreground" />;
}
