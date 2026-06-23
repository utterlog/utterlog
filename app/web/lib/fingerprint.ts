/**
 * 访客指纹识别 — IP + Cookie ID + 浏览器指纹 三合一
 *
 * visitor_id: localStorage 持久化的随机 UUID（同设备同浏览器唯一）
 * fingerprint: 浏览器特征 hash（canvas + screen + timezone + language + platform）
 *
 * 不依赖第三方库，纯本地计算。
 */

// ===== Visitor ID (Cookie ID equivalent, stored in localStorage) =====

const VID_KEY = 'utterlog_vid';

export function getVisitorId(): string {
  if (typeof window === 'undefined') return '';
  let vid = localStorage.getItem(VID_KEY);
  if (!vid) {
    vid = crypto.randomUUID();
    localStorage.setItem(VID_KEY, vid);
  }
  return vid;
}

// ===== Browser Fingerprint =====

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Draw text with specific styling
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(50, 0, 80, 30);
    ctx.fillStyle = '#069';
    ctx.fillText('Utterlog!@#$%', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Fingerprint', 4, 30);

    // Draw shapes
    ctx.beginPath();
    ctx.arc(100, 25, 10, 0, Math.PI * 2);
    ctx.fill();

    return canvas.toDataURL();
  } catch {
    return '';
  }
}

function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return '';
    const g = gl as WebGLRenderingContext;
    const debugInfo = g.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return '';
    const vendor = g.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const renderer = g.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    return `${vendor}~${renderer}`;
  } catch {
    return '';
  }
}

export async function getFingerprint(): Promise<string> {
  if (typeof window === 'undefined') return '';

  const components: string[] = [
    // Screen
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    `dpr:${window.devicePixelRatio}`,
    // Timezone + Language
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    // Platform
    navigator.platform,
    `cores:${navigator.hardwareConcurrency || 0}`,
    `mem:${(navigator as any).deviceMemory || 0}`,
    // Touch support
    `touch:${navigator.maxTouchPoints || 0}`,
    // Canvas
    getCanvasFingerprint(),
    // WebGL
    getWebGLFingerprint(),
    // Installed plugins count (varies across browsers)
    `plugins:${navigator.plugins?.length || 0}`,
    // PDF viewer
    `pdf:${navigator.pdfViewerEnabled ?? ''}`,
  ];

  const raw = components.join('|');
  return sha256(raw);
}
