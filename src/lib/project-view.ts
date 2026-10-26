/**
 * 构建期视图模型：把「人工字段（Content Collections）+ 自动字段（缓存）」拼成页面直接可渲染的 ProjectView。
 *
 * 只允许在服务端（Astro 构建期）引用：这里用 node:fs 判断截图 / 本地化 OG 图是否真的存在，
 * 从而在构建期就决定截图回退链走到哪一级，页面与 island 都不需要在运行时猜。
 * 客户端只用 `project-types.ts` 里的纯类型与字典。
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ProjectWithMeta } from './projects';
import { getProjects } from './projects';
import { ogImagePublicPath } from './og-path';
import {
  CATEGORY_ORDER,
  formatCount,
  isoDate,
  STALE_DAYS,
  VALID_FILTER_VALUES,
  type ProjectView,
} from './project-types';
import type { Category } from './project-schema';
import type { FilterOptions } from './project-filter';

const PUBLIC_DIR = resolve('public');

/** 截图字段在数据文件里写作 `public/screenshots/<slug>.webp`（§4.1），页面用站内绝对路径 */
function resolveScreenshot(screenshot: string | undefined): string | null {
  if (!screenshot) return null;
  const relative = screenshot.replace(/^\/?public\//, '');
  return existsSync(resolve(PUBLIC_DIR, relative)) ? `/${relative}` : null;
}

function resolveOgImage(repo: string): string | null {
  const publicPath = ogImagePublicPath(repo);
  return existsSync(resolve(PUBLIC_DIR, publicPath.slice(1))) ? publicPath : null;
}

function isStale(pushedAt: string | null, archived: boolean): boolean {
  if (archived) return true;
  if (!pushedAt) return false;
  const pushed = Date.parse(pushedAt);
  if (!Number.isFinite(pushed)) return false;
  return Date.now() - pushed > STALE_DAYS * 86_400_000;
}

export function toProjectView({ data, meta }: ProjectWithMeta): ProjectView {
  const updatedAt = isoDate(meta.pushedAt);
  const archived = meta.archived === true;

  return {
    slug: data.slug,
    name: data.name,
    tagline: data.tagline_zh,
    description: data.description_zh,
    features: data.features,
    category: data.category,
    tags: data.tags,
    source: data.source,
    tier: data.tier,
    resources: data.resources,
    difficulty: data.difficulty,
    freeTier: data.free_tier,
    pricingNote: data.pricing_note ?? null,
    status: data.status,
    featured: data.featured,

    repo: data.repo,
    repoUrl: `https://github.com/${data.repo}`,
    homepage: data.homepage ?? null,
    docsUrl: data.docs_url ?? null,
    deploy: {
      method: data.deploy.method,
      url: data.deploy.url ?? null,
      guideUrl: data.deploy.guide_url ?? null,
    },

    screenshot: resolveScreenshot(data.screenshot),
    ogImage: resolveOgImage(data.repo),

    stars: meta.stargazersCount,
    starsLabel: formatCount(meta.stargazersCount),
    forks: meta.forksCount,
    language: meta.language,
    license: meta.license,
    updatedAt,
    archived,
    stale: isStale(meta.pushedAt, archived),
    latestRelease: meta.latestRelease,

    addedAt: data.added_at,
    verifiedAt: data.verified_at ?? null,
    verifiedNoteUrl: data.verified_note_url ?? null,
  };
}

/** 全站可见项目（§6.3：delisted 不参与任何列表与「最新收录」） */
export async function getProjectViews(): Promise<ProjectView[]> {
  const projects = await getProjects();
  return projects
    .filter((project) => project.data.status !== 'delisted')
    .map((project) => toProjectView(project));
}

export interface CategorySummary {
  slug: Category;
  count: number;
}

/** 有项目的分类（按 §4.2 定版顺序）；空分类不生成页面 */
export function summariseCategories(views: ProjectView[]): CategorySummary[] {
  const counts = new Map<Category, number>();
  for (const view of views) {
    counts.set(view.category, (counts.get(view.category) ?? 0) + 1);
  }
  return CATEGORY_ORDER.filter((slug) => counts.has(slug)).map((slug) => ({
    slug,
    count: counts.get(slug) ?? 0,
  }));
}

export interface SiteStats {
  total: number;
  official: number;
  thirdParty: number;
}

export function summariseSite(views: ProjectView[]): SiteStats {
  const official = views.filter((view) => view.source === 'official').length;
  return { total: views.length, official, thirdParty: views.length - official };
}

/**
 * UI 下拉里列出的取值：分类只列出「确实有页面」的分类（避免筛出 0 条的死选项），
 * 其余维度用 schema 全枚举 —— 将来新增项目时筛选器不用改代码。
 * URL 解析的合法性判定另见 `VALID_FILTER_VALUES`。
 */
export function buildFilterOptions(views: ProjectView[]): FilterOptions {
  return {
    category: [...new Set(views.map((view) => view.category))].sort(),
    source: VALID_FILTER_VALUES.source,
    tier: VALID_FILTER_VALUES.tier,
    resources: VALID_FILTER_VALUES.resources,
    difficulty: VALID_FILTER_VALUES.difficulty,
    free: VALID_FILTER_VALUES.free,
  };
}
