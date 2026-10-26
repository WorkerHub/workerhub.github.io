/**
 * 搜索 / 六维筛选 / 五种排序 / URL 状态（SPEC §8.2）与入口按钮规则（§4.3 / §5）的单元测试。
 *
 * 这些是「页面与组件」子单里唯一能用机器守住的硬规则：
 * 排序降级不报错、筛选组合正确、URL 往返一致、卡片与详情页入口同源。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  activeFilterCount,
  isFilterEmpty,
  parseFilters,
  selectProjects,
  sortProjects,
  toSearchParams,
} from '../src/lib/project-filter.js';
import {
  DEPLOY_METHOD_META,
  EMPTY_FILTERS,
  type FilterState,
  type ProjectView,
} from '../src/lib/project-types.js';
import { deployAction, primaryEntry, secondaryEntries } from '../src/lib/project-entry.js';
import { ogImageFileName, ogImagePublicPath } from '../src/lib/og-path.js';

function view(overrides: Partial<ProjectView> = {}): ProjectView {
  const base: ProjectView = {
    slug: 'demo',
    name: 'Demo',
    tagline: '演示项目',
    description: '这是一个演示项目。用于测试。',
    features: ['a', 'b', 'c'],
    category: 'productivity',
    tags: ['笔记'],
    source: 'third-party',
    tier: 'listed',
    resources: ['d1'],
    difficulty: 2,
    freeTier: 'yes',
    pricingNote: null,
    status: 'active',
    featured: false,
    repo: 'demo/demo',
    repoUrl: 'https://github.com/demo/demo',
    homepage: null,
    docsUrl: null,
    deploy: { method: 'github-actions', url: null, guideUrl: null },
    screenshot: null,
    ogImage: null,
    stars: null,
    starsLabel: null,
    forks: null,
    language: null,
    license: null,
    updatedAt: null,
    archived: false,
    stale: false,
    latestRelease: null,
    addedAt: '2026-10-01',
    verifiedAt: null,
    verifiedNoteUrl: null,
  };
  return { ...base, ...overrides };
}

const filters = (overrides: Partial<FilterState> = {}): FilterState => ({
  ...EMPTY_FILTERS,
  ...overrides,
});

const slugList = (projects: ProjectView[]): string[] => projects.map((project) => project.slug);

test('§8.2 搜索：命中名称 / tagline / 长介绍 / 标签，大小写不敏感', () => {
  const projects = [
    view({
      slug: 'a',
      name: 'Cloud Mail',
      tagline: '自建邮箱',
      description: '一个邮箱平台。',
      tags: ['自托管'],
    }),
    view({
      slug: 'b',
      name: 'UptimeFlare',
      tagline: '可用性监控',
      description: '状态页监控。',
      tags: ['监控'],
    }),
  ];

  assert.deepEqual(slugList(selectProjects(projects, filters({ q: 'cloud' }))), ['a']);
  assert.deepEqual(slugList(selectProjects(projects, filters({ q: '邮箱' }))), ['a']);
  assert.deepEqual(slugList(selectProjects(projects, filters({ q: '状态页' }))), ['b']);
  assert.deepEqual(slugList(selectProjects(projects, filters({ q: '自托管' }))), ['a']);
  assert.deepEqual(slugList(selectProjects(projects, filters({ q: '   ' }))), ['a', 'b']);
});

test('§8.2 搜索：空格分隔的多关键词按 AND 匹配', () => {
  const projects = [
    view({ slug: 'a', name: 'Cloud Mail', tagline: '自建邮箱服务' }),
    view({ slug: 'b', name: 'Cloud Chat', tagline: '团队聊天' }),
  ];
  assert.deepEqual(slugList(selectProjects(projects, filters({ q: 'cloud 邮箱' }))), ['a']);
  assert.deepEqual(slugList(selectProjects(projects, filters({ q: 'cloud 不存在' }))), []);
});

test('§8.2 六维筛选：分类 / 来源 / 等级 / 资源 / 难度 / 免费层逐维生效', () => {
  const projects = [
    view({
      slug: 'official',
      source: 'official',
      tier: 'official',
      category: 'devops',
      resources: ['cron'],
      difficulty: 1,
    }),
    view({
      slug: 'verified',
      tier: 'verified',
      category: 'email',
      resources: ['kv'],
      difficulty: 3,
      freeTier: 'partial',
    }),
    view({
      slug: 'listed',
      tier: 'listed',
      category: 'productivity',
      resources: ['d1', 'kv'],
      difficulty: 2,
      freeTier: 'no',
    }),
  ];

  // 注意：默认排序下同来源/同收录日期的项目按 slug 兜底，因此这里断言的是真实渲染顺序
  assert.deepEqual(slugList(selectProjects(projects, filters({ category: ['devops'] }))), [
    'official',
  ]);
  assert.deepEqual(slugList(selectProjects(projects, filters({ source: ['third-party'] }))), [
    'listed',
    'verified',
  ]);
  assert.deepEqual(slugList(selectProjects(projects, filters({ tier: ['verified', 'listed'] }))), [
    'listed',
    'verified',
  ]);
  // 资源维度是「命中任一」
  assert.deepEqual(slugList(selectProjects(projects, filters({ resources: ['kv'] }))), [
    'listed',
    'verified',
  ]);
  assert.deepEqual(slugList(selectProjects(projects, filters({ difficulty: ['3'] }))), [
    'verified',
  ]);
  assert.deepEqual(slugList(selectProjects(projects, filters({ free: ['no'] }))), ['listed']);
  // 维度之间是 AND
  assert.deepEqual(
    slugList(selectProjects(projects, filters({ resources: ['kv'], difficulty: ['2'] }))),
    ['listed'],
  );
});

test('§8.2 默认排序：官方置顶 → 精选 → 收录日期倒序', () => {
  const projects = [
    view({ slug: 'old-third', addedAt: '2026-01-01', source: 'third-party' }),
    view({ slug: 'new-third', addedAt: '2026-05-01', source: 'third-party' }),
    view({ slug: 'official-old', addedAt: '2026-02-01', source: 'official', tier: 'official' }),
    view({ slug: 'featured', addedAt: '2026-03-01', featured: true }),
  ];
  assert.deepEqual(slugList(sortProjects(projects, 'default')), [
    'official-old',
    'featured',
    'new-third',
    'old-third',
  ]);
});

test('§8.2 star 降序：自动字段缺失排末尾，不报错', () => {
  const projects = [
    view({ slug: 'no-stars', stars: null }),
    view({ slug: 'low', stars: 10 }),
    view({ slug: 'high', stars: 1000 }),
  ];
  assert.deepEqual(slugList(sortProjects(projects, 'stars')), ['high', 'low', 'no-stars']);
});

test('§8.2 最近更新排序：自动字段缺失时降级为收录日期', () => {
  const projects = [
    view({ slug: 'no-meta-new', updatedAt: null, addedAt: '2026-09-01' }),
    view({ slug: 'no-meta-old', updatedAt: null, addedAt: '2026-01-01' }),
    view({ slug: 'pushed', updatedAt: '2026-08-01', addedAt: '2026-02-01' }),
  ];
  assert.deepEqual(slugList(sortProjects(projects, 'updated')), [
    'no-meta-new',
    'pushed',
    'no-meta-old',
  ]);
});

test('§8.2 名称排序与收录日期排序', () => {
  const projects = [
    view({ slug: 'b', name: 'beta', addedAt: '2026-01-01' }),
    view({ slug: 'a', name: 'Alpha', addedAt: '2026-03-01' }),
    view({ slug: 'c', name: 'gamma', addedAt: '2026-02-01' }),
  ];
  assert.deepEqual(slugList(sortProjects(projects, 'name')), ['a', 'b', 'c']);
  assert.deepEqual(slugList(sortProjects(projects, 'added')), ['a', 'c', 'b']);
});

test('§8.2 URL 状态：解析时丢弃脏值，序列化省略空值与默认排序', () => {
  const parsed = parseFilters(
    new URLSearchParams(
      'q=%E9%82%AE%E7%AE%B1&cat=email,nope&src=official&tier=xx&res=d1,d1&diff=2&free=partial&sort=stars',
    ),
  );
  assert.equal(parsed.q, '邮箱');
  assert.deepEqual(parsed.category, ['email']);
  assert.deepEqual(parsed.source, ['official']);
  assert.deepEqual(parsed.tier, [], '非法等级被丢弃');
  assert.deepEqual(parsed.resources, ['d1'], '重复值被去重');
  assert.deepEqual(parsed.difficulty, ['2']);
  assert.deepEqual(parsed.free, ['partial']);
  assert.equal(parsed.sort, 'stars');

  // 未知排序值回落到默认
  assert.equal(parseFilters(new URLSearchParams('sort=random')).sort, 'default');

  // 空状态序列化后查询串为空
  assert.equal(toSearchParams(EMPTY_FILTERS).toString(), '');
});

test('§8.2 URL 状态：往返一致（筛选 → query → 再解析）', () => {
  const state = filters({
    q: '监控 状态',
    category: ['devops'],
    source: ['third-party'],
    tier: ['listed'],
    resources: ['cron', 'd1'],
    difficulty: ['1', '2'],
    free: ['partial'],
    sort: 'updated',
  });
  const roundTrip = parseFilters(new URLSearchParams(toSearchParams(state).toString()));
  assert.deepEqual(roundTrip, state);
});

test('§8.2 URL 状态：合法但当前 0 条结果的取值必须保留（否则分享链接与原页面不一致）', () => {
  // 数据里暂时没有 difficulty=1 的第三方项目，但 diff=1 仍是合法筛选值
  const parsed = parseFilters(new URLSearchParams('src=third-party&diff=1'));
  assert.deepEqual(parsed.difficulty, ['1']);
  assert.equal(selectProjects([view({ difficulty: 2 })], parsed).length, 0);
});

test('§8.2 分类页：锁定的分类忽略 URL 里的 cat 参数（分类由路由决定）', () => {
  const parsed = parseFilters(new URLSearchParams('cat=email&res=d1'), {
    lockedCategory: true,
  });
  assert.deepEqual(parsed.category, []);
  assert.deepEqual(parsed.resources, ['d1']);
});

test('§8.2 已选数量与空状态判断', () => {
  assert.equal(isFilterEmpty(EMPTY_FILTERS), true);
  assert.equal(isFilterEmpty(filters({ q: 'a' })), false);
  assert.equal(isFilterEmpty(filters({ sort: 'stars' })), false);
  assert.equal(
    activeFilterCount(filters({ category: ['email'], resources: ['d1', 'kv'], free: ['no'] })),
    4,
  );
});

test('§4.3 卡片主入口：官方优先在线演示，第三方一律仓库', () => {
  const official = view({
    source: 'official',
    tier: 'official',
    homepage: 'https://enotify.oneboy.app',
  });
  assert.deepEqual(
    { href: primaryEntry(official).href, label: primaryEntry(official).label },
    { href: 'https://enotify.oneboy.app', label: '在线演示' },
  );

  // 官方没有线上实例（Zeta / hop / lx-music-server / waker）→ 仓库
  const officialNoHome = view({ source: 'official', tier: 'official', homepage: null });
  assert.equal(primaryEntry(officialNoHome).label, '查看仓库');
  assert.equal(primaryEntry(officialNoHome).href, 'https://github.com/demo/demo');

  // 第三方即使有 demo 也以仓库为主入口（§4.3）
  const thirdParty = view({ homepage: 'https://demo.example.org' });
  assert.equal(primaryEntry(thirdParty).label, '查看仓库');
});

test('§5 详情页部署按钮：按 deploy.method 如实呈现，不承诺一键部署', () => {
  const deployButton = view({
    deploy: {
      method: 'deploy-button',
      url: 'https://deploy.workers.cloudflare.com/?url=https://github.com/demo/demo',
      guideUrl: null,
    },
  });
  assert.equal(deployAction(deployButton).label, DEPLOY_METHOD_META['deploy-button'].actionLabel);
  assert.match(deployAction(deployButton).href, /deploy\.workers\.cloudflare\.com/);

  const gitIntegration = view({
    deploy: { method: 'git-integration', url: null, guideUrl: 'https://example.org/deploy' },
  });
  assert.equal(deployAction(gitIntegration).label, '导入到 Cloudflare');
  assert.equal(deployAction(gitIntegration).href, 'https://example.org/deploy');

  const actions = view({
    deploy: { method: 'github-actions', url: null, guideUrl: null },
    docsUrl: 'https://example.org/docs',
  });
  assert.equal(deployAction(actions).label, 'Fork 后部署');
  assert.equal(deployAction(actions).href, 'https://example.org/docs');

  const wrangler = view({ deploy: { method: 'wrangler', url: null, guideUrl: null } });
  assert.equal(deployAction(wrangler).label, '部署指南');
  assert.equal(deployAction(wrangler).href, 'https://github.com/demo/demo');

  const docsOnly = view({ deploy: { method: 'docs-only', url: null, guideUrl: null } });
  assert.equal(deployAction(docsOnly).label, '查看仓库');
});

test('§5 详情页补充入口：与主按钮去重，空链接不出现', () => {
  const project = view({
    homepage: 'https://demo.example.org',
    docsUrl: 'https://demo.example.org/docs',
    deploy: { method: 'git-integration', url: null, guideUrl: 'https://demo.example.org/docs' },
  });
  const entries = secondaryEntries(project);
  const hrefs = entries.map((entry) => entry.href);
  assert.deepEqual(hrefs, ['https://demo.example.org', 'https://github.com/demo/demo']);
  assert.equal(new Set(hrefs).size, hrefs.length);
});

test('§8.3 OG 图本地化路径：owner-repo 归一化为安全文件名', () => {
  assert.equal(ogImageFileName('maillab/cloud-mail'), 'maillab-cloud-mail.png');
  assert.equal(ogImageFileName('WorkerHub/lx-music-server'), 'workerhub-lx-music-server.png');
  assert.equal(ogImagePublicPath('WorkerHub/nav'), '/og/github/workerhub-nav.png');
});
