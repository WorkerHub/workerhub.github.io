/**
 * 搜索 / 六维筛选 / 五种排序（SPEC §8.2，全部浏览器本地完成，零后端）。
 *
 * 纯函数、无 DOM：服务端渲染（分类页预置过滤）与浏览器 island 共用同一份实现，
 * 保证「分类页预置过滤」与「列表页手选过滤」结果一致。单元测试见 tests/project-filter.test.ts。
 */
import {
  EMPTY_FILTERS,
  VALID_FILTER_VALUES,
  type FilterState,
  type ProjectView,
  type SortKey,
  SORT_OPTIONS,
} from './project-types';

/** §8.2 搜索命中面：名称、tagline、长介绍、标签（中英文均可） */
export function searchHaystack(project: ProjectView): string {
  return [project.name, project.tagline, project.description, ...project.tags]
    .join(' ')
    .toLowerCase();
}

export function matchesQuery(project: ProjectView, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = searchHaystack(project);
  return tokens.every((token) => haystack.includes(token));
}

/** 多选维度：空数组表示不过滤；否则命中任一即可 */
const hitsAny = (selected: string[], value: string): boolean =>
  selected.length === 0 || selected.includes(value);

const hitsAnyOf = (selected: string[], values: string[]): boolean =>
  selected.length === 0 || values.some((value) => selected.includes(value));

export function matchesFilters(project: ProjectView, filters: FilterState): boolean {
  if (!matchesQuery(project, filters.q)) return false;
  if (!hitsAny(filters.category, project.category)) return false;
  if (!hitsAny(filters.source, project.source)) return false;
  if (!hitsAny(filters.tier, project.tier)) return false;
  if (!hitsAnyOf(filters.resources, project.resources)) return false;
  if (!hitsAny(filters.difficulty, String(project.difficulty))) return false;
  if (!hitsAny(filters.free, project.freeTier)) return false;
  return true;
}

const DEFAULT_SORT: SortKey = 'default';
const SORT_VALUES = new Set<string>(SORT_OPTIONS.map((option) => option.value));

/** 排序用的「最近更新」键：自动字段缺失时降级为收录日期（§8.2，不许报错） */
function updatedKey(project: ProjectView): string {
  return project.updatedAt ?? project.addedAt;
}

/**
 * §8.2 排序：
 * - 默认：官方置顶 → 精选 → 收录日期倒序
 * - star 降序（star 缺失排末尾）
 * - 最近更新（自动字段缺失 → 降级为收录日期）
 * - 名称
 * - 收录日期倒序（默认排序里被置顶/精选遮蔽时，仍可单独查看新收录）
 * 相同键一律用 slug 兜底，保证服务端与浏览器结果完全一致。
 */
export function sortProjects(projects: ProjectView[], sort: SortKey): ProjectView[] {
  const bySlug = (a: ProjectView, b: ProjectView) => a.slug.localeCompare(b.slug);

  return [...projects].sort((a, b) => {
    switch (sort) {
      case 'stars': {
        const aStars = a.stars;
        const bStars = b.stars;
        if (aStars === null && bStars !== null) return 1;
        if (bStars === null && aStars !== null) return -1;
        if (aStars !== null && bStars !== null && aStars !== bStars) return bStars - aStars;
        return b.addedAt.localeCompare(a.addedAt) || bySlug(a, b);
      }
      case 'updated': {
        const delta = updatedKey(b).localeCompare(updatedKey(a));
        return delta !== 0 ? delta : bySlug(a, b);
      }
      case 'name':
        return a.name.localeCompare(b.name, 'zh-Hans-CN') || bySlug(a, b);
      case 'added':
        return b.addedAt.localeCompare(a.addedAt) || bySlug(a, b);
      case 'default':
      default: {
        const officialDelta = Number(b.source === 'official') - Number(a.source === 'official');
        if (officialDelta !== 0) return officialDelta;
        const featuredDelta = Number(b.featured) - Number(a.featured);
        if (featuredDelta !== 0) return featuredDelta;
        return b.addedAt.localeCompare(a.addedAt) || bySlug(a, b);
      }
    }
  });
}

export function selectProjects(projects: ProjectView[], filters: FilterState): ProjectView[] {
  return sortProjects(
    projects.filter((project) => matchesFilters(project, filters)),
    filters.sort,
  );
}

/** URL query 参数名（可分享、可回退，§8.2） */
const QUERY_KEYS = {
  q: 'q',
  category: 'cat',
  source: 'src',
  tier: 'tier',
  resources: 'res',
  difficulty: 'diff',
  free: 'free',
  sort: 'sort',
} as const;

/** 维度 → 该维度合法取值（用于丢弃 URL 里的脏值，不报错） */
export type FilterOptions = Record<
  'category' | 'source' | 'tier' | 'resources' | 'difficulty' | 'free',
  string[]
>;

function readList(
  params: URLSearchParams,
  key: string,
  allowed: string[],
  { locked }: { locked: boolean },
): string[] {
  if (locked) return [];
  const raw = params.get(key);
  if (!raw) return [];
  const allowedSet = new Set(allowed);
  return [
    ...new Set(
      raw
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0 && allowedSet.has(value)),
    ),
  ].sort();
}

/**
 * URL query → FilterState。非法取值（不在 schema 枚举内）直接丢弃、不报错；
 * 合法但当前 0 条结果的取值必须保留，保证分享/刷新后的状态与页面一致。
 */
export function parseFilters(
  params: URLSearchParams,
  { lockedCategory = false }: { lockedCategory?: boolean } = {},
): FilterState {
  const sort = params.get(QUERY_KEYS.sort);
  return {
    q: params.get(QUERY_KEYS.q) ?? '',
    category: readList(params, QUERY_KEYS.category, VALID_FILTER_VALUES.category, {
      locked: lockedCategory,
    }),
    source: readList(params, QUERY_KEYS.source, VALID_FILTER_VALUES.source, { locked: false }),
    tier: readList(params, QUERY_KEYS.tier, VALID_FILTER_VALUES.tier, { locked: false }),
    resources: readList(params, QUERY_KEYS.resources, VALID_FILTER_VALUES.resources, {
      locked: false,
    }),
    difficulty: readList(params, QUERY_KEYS.difficulty, VALID_FILTER_VALUES.difficulty, {
      locked: false,
    }),
    free: readList(params, QUERY_KEYS.free, VALID_FILTER_VALUES.free, { locked: false }),
    sort: sort && SORT_VALUES.has(sort) ? (sort as SortKey) : DEFAULT_SORT,
  };
}

/** FilterState → 查询串（省略空值与默认排序，URL 尽量短且可分享） */
export function toSearchParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set(QUERY_KEYS.q, filters.q.trim());
  for (const dimension of [
    'category',
    'source',
    'tier',
    'resources',
    'difficulty',
    'free',
  ] as const) {
    const values = filters[dimension];
    if (values.length > 0) params.set(QUERY_KEYS[dimension], [...values].sort().join(','));
  }
  if (filters.sort !== DEFAULT_SORT) params.set(QUERY_KEYS.sort, filters.sort);
  return params;
}

/** 当前筛选是否等于空状态（用于「清空筛选」按钮的可用性） */
export function isFilterEmpty(filters: FilterState): boolean {
  return (
    filters.q.trim() === '' &&
    filters.category.length === 0 &&
    filters.source.length === 0 &&
    filters.tier.length === 0 &&
    filters.resources.length === 0 &&
    filters.difficulty.length === 0 &&
    filters.free.length === 0 &&
    filters.sort === EMPTY_FILTERS.sort
  );
}

/** 选中项数量（工具栏徽标用） */
export function activeFilterCount(filters: FilterState): number {
  return (
    filters.category.length +
    filters.source.length +
    filters.tier.length +
    filters.resources.length +
    filters.difficulty.length +
    filters.free.length
  );
}
