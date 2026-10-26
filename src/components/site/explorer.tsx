/**
 * 搜索 / 六维筛选 / 五种排序工具栏 + 结果网格（SPEC §8.2，Astro island）。
 *
 * - 全部在浏览器本地完成，数据是构建时注入的 JSON 索引，无任何后端请求。
 * - 筛选状态写进 URL query：勾选/排序用 pushState（浏览器后退可还原上一步），
 *   搜索输入 300ms 防抖后 replaceState（避免每敲一个字塞一条历史记录）；
 *   popstate 时从 URL 还原状态。
 * - 卡片复用 `ProjectCard`（与首页 / 分类页 / 详情页推荐同一组件）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, ChevronDown, Funnel, RotateCcw, Search, X } from 'lucide-react';

import { ProjectCard } from '@/components/project/project-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  activeFilterCount,
  isFilterEmpty,
  parseFilters,
  selectProjects,
  toSearchParams,
  type FilterOptions,
} from '@/lib/project-filter';
import {
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  DIFFICULTY_LABELS,
  FREE_TIER_META,
  RESOURCE_LABELS,
  SOURCE_LABELS,
  SORT_OPTIONS,
  TIER_META,
  type FilterDimension,
  type FilterState,
  type ProjectView,
  type SortKey,
} from '@/lib/project-types';
import type { Category, Resource } from '@/lib/project-schema';

type Dimension = Exclude<FilterDimension, 'category'> | 'category';

interface DimensionConfig {
  key: Dimension;
  label: string;
  values: string[];
  labelOf: (value: string) => string;
}

function buildDimensions(options: FilterOptions, lockedCategory: boolean): DimensionConfig[] {
  const dimensions: DimensionConfig[] = [
    {
      key: 'category',
      label: '分类',
      values: [...CATEGORY_ORDER].filter((slug) => options.category.includes(slug)),
      labelOf: (value) => CATEGORY_LABELS[value as Category] ?? value,
    },
    {
      key: 'source',
      label: '来源',
      values: ['official', 'third-party'],
      labelOf: (value) => SOURCE_LABELS[value as ProjectView['source']] ?? value,
    },
    {
      key: 'tier',
      label: '验证等级',
      values: ['official', 'verified', 'listed'],
      labelOf: (value) => TIER_META[value as keyof typeof TIER_META]?.label ?? value,
    },
    {
      key: 'resources',
      label: '所需资源',
      values: options.resources,
      labelOf: (value) => RESOURCE_LABELS[value as Resource] ?? value,
    },
    {
      key: 'difficulty',
      label: '难度',
      values: ['1', '2', '3'],
      labelOf: (value) => `${DIFFICULTY_LABELS[Number(value)] ?? value}（${value}）`,
    },
    {
      key: 'free',
      label: '免费层',
      values: ['yes', 'partial', 'no'],
      labelOf: (value) => FREE_TIER_META[value as 'yes' | 'partial' | 'no']?.label ?? value,
    },
  ];

  return lockedCategory
    ? dimensions.filter((dimension) => dimension.key !== 'category')
    : dimensions;
}

export interface ExplorerProps {
  projects: ProjectView[];
  options: FilterOptions;
  /** 分类页：预置并锁定分类过滤（§2 分类页复用列表筛选组件） */
  lockedCategory?: string;
  /** 初始 query（服务端 `Astro.url.search`，含 `?`） */
  initialSearch?: string;
}

export default function Explorer({
  projects,
  options,
  lockedCategory,
  initialSearch = '',
}: ExplorerProps) {
  const dimensions = useMemo(
    () => buildDimensions(options, Boolean(lockedCategory)),
    [options, lockedCategory],
  );

  const readFromUrl = useCallback(
    () =>
      parseFilters(new URLSearchParams(initialSearch), {
        lockedCategory: Boolean(lockedCategory),
      }),
    [initialSearch, options, lockedCategory],
  );

  const [filters, setFilters] = useState<FilterState>(readFromUrl);
  const [mobileOpen, setMobileOpen] = useState(false);
  const searchTimer = useRef<number | null>(null);

  const results = useMemo(() => selectProjects(projects, filters), [projects, filters]);
  const activeCount = activeFilterCount(filters);

  const syncUrl = useCallback((next: FilterState, mode: 'push' | 'replace') => {
    const query = toSearchParams(next).toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
    if (mode === 'push') window.history.pushState({ hubFilters: true }, '', url);
    else window.history.replaceState({ hubFilters: true }, '', url);
  }, []);

  // 静态站同一份 HTML 服务所有 query（构建期拿不到访客的 query）：
  // 挂载后按 window.location.search 还原一次，深链接与刷新都能保持筛选状态（§8.2 可分享）
  useEffect(() => {
    const fromUrl = parseFilters(new URLSearchParams(window.location.search), {
      lockedCategory: Boolean(lockedCategory),
    });
    setFilters(fromUrl);
  }, [options, lockedCategory]);

  // 浏览器前进/后退 → 从 URL 还原筛选状态（可回退，§8.2）
  useEffect(() => {
    const onPopState = () => {
      setFilters(
        parseFilters(new URLSearchParams(window.location.search), {
          lockedCategory: Boolean(lockedCategory),
        }),
      );
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [options, lockedCategory]);

  useEffect(
    () => () => {
      if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    },
    [],
  );

  const commit = (next: FilterState) => {
    setFilters(next);
    syncUrl(next, 'push');
  };

  const toggleValue = (dimension: Dimension, value: string) => {
    const current = filters[dimension];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    commit({ ...filters, [dimension]: next });
  };

  const handleSearch = (value: string) => {
    const next: FilterState = { ...filters, q: value };
    setFilters(next);
    if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => syncUrl(next, 'replace'), 300);
  };

  const handleSort = (value: string) => {
    commit({ ...filters, sort: value as SortKey });
  };

  const clearAll = () => {
    const next = parseFilters(new URLSearchParams(), {
      lockedCategory: Boolean(lockedCategory),
    });
    setFilters(next);
    syncUrl(next, 'push');
  };

  const activeChips = dimensions.flatMap((dimension) =>
    filters[dimension.key].map((value) => ({
      dimension: dimension.key,
      value,
      label: `${dimension.label}：${dimension.labelOf(value)}`,
    })),
  );

  const sortLabel =
    SORT_OPTIONS.find((option) => option.value === filters.sort)?.label ?? SORT_OPTIONS[0].label;

  return (
    <section aria-label="项目筛选" className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-3 shadow-xs sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <label htmlFor="hub-search" className="sr-only">
              搜索项目
            </label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="hub-search"
              type="search"
              value={filters.q}
              onChange={(event) => handleSearch(event.target.value)}
              placeholder="搜索名称、介绍、标签（中英文均可）"
              className="pl-9"
              autoComplete="off"
            />
          </div>

          {/* 桌面端：六个筛选维度各一个下拉，键盘可达 */}
          <div className="hidden flex-wrap items-center gap-2 lg:flex">
            {dimensions.map((dimension) => (
              <DropdownMenu key={dimension.key}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'gap-1.5',
                      filters[dimension.key].length > 0 && 'border-primary/40 bg-accent',
                    )}
                    aria-label={`${dimension.label}筛选${
                      filters[dimension.key].length > 0
                        ? `，已选 ${filters[dimension.key].length} 项`
                        : ''
                    }`}
                  >
                    {dimension.label}
                    {filters[dimension.key].length > 0 && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                        {filters[dimension.key].length}
                      </Badge>
                    )}
                    <ChevronDown aria-hidden="true" className="size-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-80 w-60 overflow-y-auto">
                  <DropdownMenuLabel>{dimension.label}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {dimension.values.map((value) => (
                    <DropdownMenuCheckboxItem
                      key={value}
                      checked={filters[dimension.key].includes(value)}
                      onCheckedChange={() => toggleValue(dimension.key, value)}
                      onSelect={(event) => event.preventDefault()}
                    >
                      {dimension.labelOf(value)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* 移动端：全部筛选维度收进一个对话框 */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Funnel aria-hidden="true" />
              筛选
              {activeCount > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {activeCount}
                </Badge>
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="max-w-[13rem] gap-1.5">
                  <ArrowUpDown aria-hidden="true" />
                  <span className="truncate">{sortLabel}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>排序</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={filters.sort} onValueChange={handleSort}>
                  {SORT_OPTIONS.map((option) => (
                    <DropdownMenuRadioItem key={option.value} value={option.value}>
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {activeChips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">已选：</span>
            {activeChips.map((chip) => (
              <button
                key={`${chip.dimension}-${chip.value}`}
                type="button"
                onClick={() => toggleValue(chip.dimension, chip.value)}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-label={`移除筛选 ${chip.label}`}
              >
                {chip.label}
                <X aria-hidden="true" className="size-3" />
              </button>
            ))}
            <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs" onClick={clearAll}>
              <RotateCcw aria-hidden="true" className="size-3" />
              清空筛选
            </Button>
          </div>
        )}
      </div>

      <h2 id="hub-results-heading" className="sr-only">
        项目列表
      </h2>
      <p className="text-sm text-muted-foreground" aria-live="polite" id="hub-result-count">
        {isFilterEmpty(filters)
          ? `共 ${results.length} 个项目`
          : `筛选出 ${results.length} / ${projects.length} 个项目`}
      </p>

      {results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium">没有匹配的项目</p>
          <p className="mt-1 text-sm text-muted-foreground">试试减少筛选条件，或者换个关键词。</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={clearAll}>
            <RotateCcw aria-hidden="true" />
            清空筛选
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((project) => (
            <li key={project.slug} className="h-full">
              <ProjectCard project={project} />
            </li>
          ))}
        </ul>
      )}

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>筛选项目</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {dimensions.map((dimension) => (
              <fieldset key={dimension.key}>
                <legend className="text-sm font-semibold">{dimension.label}</legend>
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {dimension.values.map((value) => {
                    const id = `mobile-${dimension.key}-${value}`;
                    const checked = filters[dimension.key].includes(value);
                    return (
                      <div key={value} className="flex items-center gap-2">
                        <Checkbox
                          id={id}
                          checked={checked}
                          onCheckedChange={() => toggleValue(dimension.key, value)}
                        />
                        <label htmlFor={id} className="text-sm leading-6 select-none">
                          {dimension.labelOf(value)}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <RotateCcw aria-hidden="true" />
              清空筛选
            </Button>
            <Button size="sm" onClick={() => setMobileOpen(false)}>
              查看 {results.length} 个结果
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
