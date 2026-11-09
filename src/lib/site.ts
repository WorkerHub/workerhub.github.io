/**
 * 站点级常量与绝对地址（canonical / OG / sitemap 一律写主域名，副线侧不按访问域名动态生成）。
 *
 * 域名只有一个真源：就是下面 `SITE.url` 这一份字面量。`astro.config.ts` 的 `site`
 * 从这里读取，页面、端点、库、脚本一律由它派生，任何页面都不得读 `Astro.url.host`，
 * 也不得再写第二份域名字面量（副线继续 serving 同一份产物，但不参与地址生成）。
 */
export const SITE = {
  name: 'WorkerHub',
  url: 'https://workerhub.github.io',
  title: 'WorkerHub · Cloudflare Workers 中文精选应用目录',
  description:
    '汇集可自部署的 Cloudflare Workers 应用：自研项目与经收录把关的第三方开源项目，标清部署方式、所需资源、难度与验证等级，直达仓库与部署入口。',
  tagline: 'Cloudflare Workers 生态的中文精选应用目录',
  githubOrg: 'https://github.com/WorkerHub',
  repo: 'https://github.com/WorkerHub/workerhub.github.io',
  locale: 'zh_CN',
} as const;

/** 站内路径 → 主域名绝对地址（canonical / og:url / og:image / sitemap / robots 共用） */
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
