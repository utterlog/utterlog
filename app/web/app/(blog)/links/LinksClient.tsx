'use client';

// 友链页主题分发器
//
// v2.3.1 给友链页加了集成 toolbar (分组 tabs + 视图切换 card/compact +
// 随机骰子)，UI class (.links-toolbar / .links-view-btn / .links-group-tab)
// 的样式只在 app/web/themes/Nebula/styles.css 里写了。其他主题
// (Azure / Chred / Flux / Renascent / Utterlog) 拿到的是一串没样式的
// toolbar 元素，按钮散落在页面顶部，UI 错位。
//
// 修复方式：按 useThemeContext().theme.name 分流：
//   - Nebula     → NebulaLinksView（新版本：toolbar + 视图切换）
//   - 其他主题   → LegacyLinksView（v2.3.0 简单分组 tabs + 申请按钮，
//                  纯 inline 样式跨主题安全）

import { useThemeContext } from '@/lib/theme-context';
import NebulaLinksView from './NebulaLinksView';
import LegacyLinksView from './LegacyLinksView';

export default function LinksClient() {
  const { theme } = useThemeContext();
  const isNebula = theme?.name === 'Nebula';
  return isNebula ? <NebulaLinksView /> : <LegacyLinksView />;
}
