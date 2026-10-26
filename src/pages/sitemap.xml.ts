/**
 * sitemap.xml（SPEC §10）：构建时生成，含首页 + 列表/提交/关于 + 全部项目详情页 + 全部分类页；
 * 绝对地址一律写主域名 `https://hub.oneboy.app`（镜像站不按访问域名生成）。
 */
import type { APIRoute } from 'astro';

import { getProjectViews, summariseCategories } from '@/lib/project-view';
import { absoluteUrl } from '@/lib/site';

const escapeXml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

export const GET: APIRoute = async () => {
  const views = await getProjectViews();
  const categories = summariseCategories(views);

  const paths = [
    '/',
    '/projects/',
    '/submit/',
    '/about/',
    ...categories.map((category) => `/categories/${category.slug}/`),
    ...views.map((view) => `/p/${view.slug}/`),
  ];

  // 构建日期作为 lastmod：静态站没有逐页更新时间，用统一构建时间最不容易误导
  const lastmod = new Date().toISOString().slice(0, 10);

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map(
      (path) =>
        `  <url><loc>${escapeXml(absoluteUrl(path))}</loc><lastmod>${lastmod}</lastmod></url>`,
    ),
    '</urlset>',
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
