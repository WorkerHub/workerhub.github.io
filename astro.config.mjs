// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

/**
 * SPEC §8.1：Astro + TypeScript，纯静态输出（SSG）+ Tailwind CSS。
 * canonical / sitemap 绝对地址恒写主域名（§10），镜像站不得按访问域名动态生成。
 */
export default defineConfig({
  site: 'https://hub.oneboy.app',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  vite: { plugins: [tailwindcss()] },
});
