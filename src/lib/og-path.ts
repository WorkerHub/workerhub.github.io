/**
 * OG 图本地化路径（构建期脚本 + 页面共用；不依赖 fs，可在浏览器外任意环境引用）。
 *
 * SPEC §8.3：截图回退链第 2 级是「仓库 Open Graph 图，构建时抓取并本地化缓存」，
 * 页面只引用本站路径 `/og/github/<owner>-<repo>.png`，绝不热链 GitHub 临时 URL。
 */
export const OG_IMAGE_PUBLIC_DIR = 'og/github';

/** `maillab/cloud-mail` → `maillab-cloud-mail.png` */
export const ogImageFileName = (repo: string): string =>
  `${repo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;

/** 页面引用用的绝对路径（相对站点根） */
export const ogImagePublicPath = (repo: string): string =>
  `/${OG_IMAGE_PUBLIC_DIR}/${ogImageFileName(repo)}`;
