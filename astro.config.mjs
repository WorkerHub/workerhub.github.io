// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

/**
 * SPEC §8.1：Astro + TypeScript，纯静态输出（SSG）+ Tailwind CSS。
 * 交互部分挂 React island（搜索/筛选/排序、主题切换），静态页面的卡片在构建期渲染为 HTML、零 JS。
 * canonical / sitemap 绝对地址恒写主域名（§10），镜像站不得按访问域名动态生成——
 * 由 `site` 固定为 https://hub.oneboy.app 保证，页面与 sitemap 都不读请求域名。
 */
export default defineConfig({
  site: 'https://hub.oneboy.app',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // 说明：sitemap.xml 由 src/pages/sitemap.xml.ts 生成（§10 要求文件名恰为 sitemap.xml
  // 且绝对地址恒写主域名；官方 sitemap 集成只产出 sitemap-index.xml + 分片，文件名对不上）
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
