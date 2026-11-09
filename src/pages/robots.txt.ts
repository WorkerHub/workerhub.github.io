/**
 * robots.txt（SPEC §10）：放行抓取并指向主域名的 sitemap。
 * 副线站同样输出这一份（canonical 恒写真源 SITE.url，不按访问域名生成）。
 */
import type { APIRoute } from 'astro';

import { absoluteUrl } from '@/lib/site';

export const GET: APIRoute = () =>
  new Response(
    ['User-agent: *', 'Allow: /', '', `Sitemap: ${absoluteUrl('/sitemap.xml')}`, ''].join('\n'),
    {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    },
  );
