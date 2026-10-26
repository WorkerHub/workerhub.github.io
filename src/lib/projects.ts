/**
 * 页面侧的项目数据入口：人工字段（Content Collections）+ 自动字段（构建时缓存）。
 *
 * 页面永远不直接读 GitHub API，也不直接读 YAML：自动字段缺失时返回 null 由前端降级，
 * 绝不让页面报错（SPEC §9.2）。
 */
import { getCollection } from 'astro:content';
import { META_CACHE_PATH } from './build-config';
import { emptyRepoMeta, readMetaCache, type RepoMeta } from './github-meta';
import type { ProjectInput } from './project-schema';

export interface ProjectWithMeta {
  slug: string;
  data: ProjectInput;
  /** 自动字段；抓取与缓存都不可用时各字段为 null */
  meta: RepoMeta;
}

export async function getProjects(): Promise<ProjectWithMeta[]> {
  const entries = await getCollection('projects');
  const cache = readMetaCache(META_CACHE_PATH, (message) => console.warn(`⚠ ${message}`));

  const projects = entries.map((entry) => ({
    slug: entry.id,
    data: entry.data as ProjectInput,
    meta: cache.repos[entry.data.repo] ?? emptyRepoMeta(),
  }));

  return sortProjects(projects);
}

/** §8.2 默认排序：官方置顶 → 精选 → 收录日期倒序 */
export function sortProjects(projects: ProjectWithMeta[]): ProjectWithMeta[] {
  return [...projects].sort((a, b) => {
    const officialDelta =
      Number(b.data.source === 'official') - Number(a.data.source === 'official');
    if (officialDelta !== 0) return officialDelta;

    const featuredDelta = Number(b.data.featured) - Number(a.data.featured);
    if (featuredDelta !== 0) return featuredDelta;

    return b.data.added_at.localeCompare(a.data.added_at);
  });
}

/** star 降序；自动字段缺失时该项排到末尾（§8.2 排序降级） */
export function sortByStars(projects: ProjectWithMeta[]): ProjectWithMeta[] {
  return [...projects].sort((a, b) => {
    const aStars = a.meta.stargazersCount;
    const bStars = b.meta.stargazersCount;
    if (aStars === null && bStars === null) return 0;
    if (aStars === null) return 1;
    if (bStars === null) return -1;
    return bStars - aStars;
  });
}
