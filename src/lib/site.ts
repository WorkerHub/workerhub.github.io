/**
 * 站点级常量与绝对地址（SPEC §10：canonical / OG / sitemap 一律写主域名，镜像侧不按访问域名动态生成）。
 *
 * 唯一的域名来源就是这个常量 + `astro.config.mjs` 的 `site`，
 * 页面、sitemap、robots 都引用这里，任何页面都不得读 `Astro.url.host`。
 */
export const SITE = {
  name: 'WorkerHub',
  url: 'https://hub.oneboy.app',
  title: 'WorkerHub · Cloudflare Workers 中文精选应用目录',
  description:
    '汇集可自部署的 Cloudflare Workers 应用：官方自研项目与经收录把关的第三方开源项目，标清部署方式、所需资源、难度与验证等级，直达仓库与部署入口。',
  tagline: 'Cloudflare Workers 生态的中文精选应用目录',
  githubOrg: 'https://github.com/WorkerHub',
  repo: 'https://github.com/WorkerHub/workerhub.github.io',
  locale: 'zh_CN',
} as const;

/** 站内路径 → 主域名绝对地址（canonical / OG / sitemap 共用） */
export function absoluteUrl(pathname: string): string {
  return new URL(pathname, SITE.url).href;
}

/** 导航（页头页脚共用） */
export const NAV_ITEMS = [
  { href: '/projects/', label: '全部项目' },
  { href: '/submit/', label: '提交收录' },
  { href: '/about/', label: '关于' },
] as const;

/** 第三方免责声明（§8.3 页脚必须有一行） */
export const THIRD_PARTY_DISCLAIMER = '第三方项目版权与责任归其作者';
