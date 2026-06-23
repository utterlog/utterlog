/**
 * Plugin System — 声明式插件注册表
 *
 * 插件结构：
 * app/web/plugins/{name}/
 * ├── plugin.json  — 名称、版本、hooks、settings
 * └── [assets]     — 可选静态资源
 *
 * 工作方式：
 * - 静态导入 plugin.json（同主题，Next.js SSR 限制）
 * - active_plugins 选项存储启用的插件列表 (JSON 数组)
 * - 活跃插件的 hooks 合并到 Slot 注册表
 * - 插件 settings 存为普通 options: plugin_{name}_{key}
 */

export interface PluginSetting {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'toggle';
  placeholder?: string;
  default?: string;
  options?: string[];
}

export interface PluginManifest {
  name: string;
  displayName: string;
  description: string;
  version: string;
  author: string;
  hooks?: Record<string, string>;  // slot_name → HTML content
  settings?: PluginSetting[];
}

// 静态导入所有插件 manifest
import analyticsManifest from '@/plugins/analytics/plugin.json';
import copyrightManifest from '@/plugins/copyright/plugin.json';

const pluginRegistry: Record<string, PluginManifest> = {
  analytics: analyticsManifest as PluginManifest,
  copyright: copyrightManifest as PluginManifest,
};

/**
 * 获取所有已注册的插件
 */
export function getAllPlugins(): Record<string, PluginManifest> {
  return pluginRegistry;
}

/**
 * 获取指定插件的 manifest
 */
export function getPlugin(name: string): PluginManifest | undefined {
  return pluginRegistry[name];
}

/**
 * 解析 active_plugins 选项值为数组
 */
export function parseActivePlugins(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 收集所有活跃插件在指定 slot 的 hooks 内容
 * 用于和 Slot 组件的 options 数据合并
 */
export function getPluginHooksForSlot(slotName: string, activePluginNames: string[], options: Record<string, string>): string[] {
  const results: string[] = [];
  for (const name of activePluginNames) {
    const plugin = pluginRegistry[name];
    if (!plugin?.hooks?.[slotName]) continue;

    let content = plugin.hooks[slotName];
    // 替换 settings 变量: {{setting_key}} → 实际值
    if (plugin.settings) {
      for (const setting of plugin.settings) {
        const optionKey = `plugin_${name}_${setting.key}`;
        const value = options[optionKey] || setting.default || '';
        content = content.replace(new RegExp(`\\{\\{${setting.key}\\}\\}`, 'g'), value);
      }
    }
    results.push(content);
  }
  return results;
}
