// fallback 仅用于"全部"这类虚拟分类
const fallbackIcons: Record<string, string> = {
  '全部': 'fa-sharp fa-light fa-grid-2',
};

// 动态获取分类图标：优先 meta.icon 字段，fallback 到默认
export function getCategoryIcon(cat: { name: string; icon?: string }): string {
  if (cat.icon && cat.icon.startsWith('fa')) return cat.icon;
  return fallbackIcons[cat.name] || 'fa-sharp fa-light fa-folder';
}

// 兼容旧代码：categoryIcons[name] 访问方式
export const categoryIcons = new Proxy({} as Record<string, string>, {
  get: (_, name: string) => fallbackIcons[name] || 'fa-sharp fa-light fa-folder',
});
