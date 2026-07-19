/**
 * Slots — 轻量级内容注入系统
 *
 * 标准 Slot 名称：
 * - head_scripts: <head> 内注入 (analytics, meta tags)
 * - footer_scripts: </body> 前注入 (chat widgets, tracking)
 * - before_content: 文章内容前
 * - after_content: 文章内容后
 * - sidebar_top: 侧栏顶部
 * - sidebar_bottom: 侧栏底部
 *
 * 数据来源：
 * 1. ul_options 表，键名 slot_{name}（设置页代码注入）
 * 2. 活跃插件的 hooks（plugin.json 中声明的 slot 映射）
 */

import { parseActivePlugins, getPluginHooksForSlot } from './plugins';
import SlotHeadClient from '@/components/blog/SlotHeadClient';

export const SLOT_DEFINITIONS = [
  { name: 'head_scripts', label: 'Head 代码', description: '注入到 <head> 标签内，用于统计代码、SEO meta 等', placeholder: '<!-- 例如 Google Analytics -->\n<script async src="https://..."></script>' },
  { name: 'footer_scripts', label: 'Footer 代码', description: '注入到 </body> 标签前，用于聊天组件、追踪脚本等', placeholder: '<!-- 例如在线客服 -->\n<script src="https://..."></script>' },
  { name: 'before_content', label: '文章内容前', description: '显示在文章正文上方，用于公告、广告等', placeholder: '<div class="notice">公告内容</div>' },
  { name: 'after_content', label: '文章内容后', description: '显示在文章正文下方，用于版权声明、推广等', placeholder: '<div>版权声明 © 2026</div>' },
  { name: 'sidebar_top', label: '侧栏顶部', description: '侧栏最上方的自定义内容', placeholder: '<div>自定义侧栏内容</div>' },
  { name: 'sidebar_bottom', label: '侧栏底部', description: '侧栏最下方的自定义内容', placeholder: '<div>侧栏底部广告</div>' },
] as const;

export type SlotName = typeof SLOT_DEFINITIONS[number]['name'];

/**
 * 合并 slot 内容：options 中的手动注入 + 活跃插件的 hooks
 */
function resolveSlotContent(slotName: SlotName, options: Record<string, string>): string {
  const parts: string[] = [];

  // 1. 手动注入的内容（设置页代码注入 Tab）
  const manual = options[`slot_${slotName}`];
  if (manual) parts.push(manual);

  // 2. 活跃插件的 hooks
  const activePlugins = parseActivePlugins(options.active_plugins);
  if (activePlugins.length > 0) {
    const pluginHooks = getPluginHooksForSlot(slotName, activePlugins, options);
    parts.push(...pluginHooks);
  }

  return parts.join('\n');
}

/**
 * Slot 组件 — 渲染指定 slot 的 HTML 内容（手动注入 + 插件 hooks）
 * 用于 body 内可见内容 (before_content, after_content, sidebar_*)
 */
export function Slot({ name, options }: { name: SlotName; options: Record<string, string> }) {
  const content = resolveSlotContent(name, options);
  if (!content) return null;
  return <div dangerouslySetInnerHTML={{ __html: content }} />;
}

/**
 * SlotHead 组件 — 渲染 head 内的 slot 内容
 * 合并：slot_head_scripts + 旧 custom_head_code + 插件 head_scripts hooks
 * 使用客户端 useEffect 直接插入原始 HTML 到 document.head，保留所有属性
 */
export function SlotHead({ options }: { options: Record<string, string> }) {
  const parts: string[] = [];
  const slotContent = options.slot_head_scripts;
  if (slotContent) parts.push(slotContent);
  if (!slotContent && options.custom_head_code) parts.push(options.custom_head_code);
  const activePlugins = parseActivePlugins(options.active_plugins);
  if (activePlugins.length > 0) {
    parts.push(...getPluginHooksForSlot('head_scripts', activePlugins, options));
  }
  const combined = parts.join('\n').trim();
  if (!combined) return null;
  return <SlotHeadClient html={combined} />;
}

/**
 * SlotFooter 组件 — 渲染 footer_scripts slot（手动注入 + 插件 hooks）
 */
export function SlotFooter({ options }: { options: Record<string, string> }) {
  const content = resolveSlotContent('footer_scripts', options);
  if (!content) return null;
  return <div dangerouslySetInnerHTML={{ __html: content }} />;
}
