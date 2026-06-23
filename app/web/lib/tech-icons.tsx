/**
 * 浏览器/操作系统/设备 图标映射
 *
 * 浏览器：/icons/browsers/*.svg
 * 操作系统：/icons/os/*.svg (部分用 FA)
 * 设备：FA icon class
 */

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
  // parseUA in CommentList.tsx produces "Windows 10", "Windows 11",
  // "Windows 8.1", etc.; include the versioned keys so the correct
  // SVG shows up, and keep plain "windows" as a fallback.
  windows: '/icons/os/windows11.svg',
  'windows 10': '/icons/os/windows10.svg',
  'windows 11': '/icons/os/windows11.svg',
  'windows 8': '/icons/os/windows10.svg',
  'windows 8.1': '/icons/os/windows10.svg',
  'windows 7': '/icons/os/windows10.svg',
  linux: '/icons/os/linux.svg',
  ubuntu: '/icons/os/ubuntu.svg',
  debian: '/icons/os/debian.svg',
  android: '/icons/os/androidsvg.svg',
  harmonyos: '/icons/os/harmonyos.svg',
  xiaomi: '/icons/os/xiaomi.svg',
  microsoft: '/icons/os/microsoft.svg',
};

// OS 用 FA icon 的（没有 SVG 文件的）
const osFaMap: Record<string, string> = {
};

const deviceFaMap: Record<string, string> = {
  desktop: 'fa-solid fa-desktop',
  mobile: 'fa-solid fa-mobile-screen',
  tablet: 'fa-solid fa-tablet-screen-button',
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
  return <i className="fa-regular fa-globe" style={{ fontSize: size - 2, color: 'var(--color-text-dim)' }} />;
}

/** 操作系统图标 */
export function OSIcon({ name, size = 16 }: { name: string; size?: number }) {
  const key = normalize(name);
  // Check SVG map first
  const src = osMap[key];
  if (src) {
    return <img src={src} alt={name} style={{ width: size, height: size, objectFit: 'contain' }} />;
  }
  // Check FA map
  const fa = osFaMap[key];
  if (fa) {
    return <i className={fa} style={{ fontSize: size - 2, color: 'var(--color-text-dim)' }} />;
  }
  return <i className="fa-regular fa-microchip" style={{ fontSize: size - 2, color: 'var(--color-text-dim)' }} />;
}

/** 设备图标 */
export function DeviceIcon({ type, size = 16 }: { type: string; size?: number }) {
  const key = normalize(type);
  const fa = deviceFaMap[key] || 'fa-solid fa-desktop';
  return <i className={fa} style={{ fontSize: size - 2, color: 'var(--color-text-dim)' }} />;
}
