/* 全站唯一的 ambient 声明文件。

   原先有三份，声明的东西大量重复：
     - src/web/globals.d.ts            `*.css` + `*.module.css`
     - src/backend/types/web-ambient.d.ts  `*.css` + 一个从没用过的 NextFetchInit
   2026-08-17 删掉那两份（tsc 与构建实测都通过）。`*.module.css` 没人用
   —— 站里没有 CSS Modules；NextFetchInit 是 Next.js 时期的化石，全仓 0 引用。

   `*.css?url` 这条也没有任何 import 用到，但**保留**：它是 Vite 的标准
   资源导入形式，删掉不会报错、加回来却要重新查一遍为什么，留着成本是 4 行。 */

declare module '*.css?url' {
  const href: string;
  export default href;
}

declare module '*.css';
