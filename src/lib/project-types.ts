/**
 * 展示层字典与视图模型类型（纯数据 + 纯函数，客户端 island 与服务端渲染共用）。
 *
 * 这里不允许 import node:fs / astro:content——`Explorer.tsx` 会把它打进浏览器包。
 * 构建期才需要的判断（截图是否存在、OG 图是否已本地化）放在 `project-view.ts`。
 *
 * 全部文案对齐 SPEC v1.4：§4.2 分类、§4.1 resources、§5 部署方式、§6.2 验证等级。
 */
import { FREE_TIERS, RESOURCES, SOURCES, TIERS } from './project-schema';
import type {
  Category,
  DeployMethod,
  ProjectSource,
  ProjectStatus,
  Resource,
  VerificationTier,
} from './project-schema';

/** §4.2 分类标签（v1 定版 10 类） */
export const CATEGORY_LABELS: Record<Category, string> = {
  productivity: '效率工具',
  notification: '通知与消息',
  content: '内容与博客',
  email: '邮箱',
  'files-media': '文件与媒体',
  devops: '开发与运维',
  data: '数据与数据库',
  ai: 'AI 应用',
  life: '生活服务',
  other: '其他',
};

/** 分类页/分类入口的一句话说明（分类页副标题用） */
export const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
  productivity: '笔记、知识库、起始页等日常提效工具',
  notification: '提醒、推送、聊天与消息桥接',
  content: '博客、CMS 与内容管理',
  email: '自建邮箱服务与邮件收发',
  'files-media': '文件存储、图床与媒体同步',
  devops: '监控、状态页、调度与运维工具',
  data: '数据库管理、查询与数据处理',
  ai: '接入 Workers AI / MCP 的 AI 应用',
  life: '面向个人生活的自托管服务',
  other: '暂未归入以上分类的项目',
};

/** §8.3 回退图：按分类着色的首字图色板（静态类名，Tailwind 才能扫到） */
export const CATEGORY_THUMB_CLASSES: Record<Category, string> = {
  productivity: 'from-sky-500/25 to-sky-600/10 text-sky-700 dark:text-sky-300',
  notification: 'from-violet-500/25 to-violet-600/10 text-violet-700 dark:text-violet-300',
  content: 'from-amber-500/25 to-amber-600/10 text-amber-700 dark:text-amber-300',
  email: 'from-rose-500/25 to-rose-600/10 text-rose-700 dark:text-rose-300',
  'files-media': 'from-teal-500/25 to-teal-600/10 text-teal-700 dark:text-teal-300',
  devops: 'from-emerald-500/25 to-emerald-600/10 text-emerald-700 dark:text-emerald-300',
  data: 'from-indigo-500/25 to-indigo-600/10 text-indigo-700 dark:text-indigo-300',
  ai: 'from-fuchsia-500/25 to-fuchsia-600/10 text-fuchsia-700 dark:text-fuchsia-300',
  life: 'from-orange-500/25 to-orange-600/10 text-orange-700 dark:text-orange-300',
  other: 'from-slate-500/25 to-slate-600/10 text-slate-700 dark:text-slate-300',
};

/** §4.1 resources 短名（资源徽章带图标 + 短名，>3 个折叠为 +n） */
export const RESOURCE_LABELS: Record<Resource, string> = {
  'workers-only': 'Workers',
  pages: 'Pages',
  d1: 'D1',
  kv: 'KV',
  r2: 'R2',
  'durable-objects': 'Durable Objects',
  queues: 'Queues',
  cron: 'Cron',
  'workers-ai': 'Workers AI',
  vectorize: 'Vectorize',
  hyperdrive: 'Hyperdrive',
  'email-workers': 'Email Workers',
  external: '外部服务',
};

/** §5 部署方式文案与按钮文案（宁可低标，不许高标） */
export const DEPLOY_METHOD_META: Record<
  DeployMethod,
  { label: string; actionLabel: string; description: string }
> = {
  'deploy-button': {
    label: '一键部署（Deploy Button）',
    actionLabel: 'Deploy to Cloudflare',
    description: '仓库已适配 Cloudflare 官方 Deploy Button，可直接在自己的账户创建资源并部署。',
  },
  'git-integration': {
    label: 'Git 集成导入',
    actionLabel: '导入到 Cloudflare',
    description: '通过 Cloudflare Pages / Workers 的 Git 集成从仓库导入部署，按部署文档操作即可。',
  },
  'github-actions': {
    label: 'GitHub Actions 自动部署',
    actionLabel: 'Fork 后部署',
    description: 'Fork 仓库并启用仓库自带的 GitHub Actions，填入账号与资源信息后由工作流自动部署。',
  },
  wrangler: {
    label: 'wrangler 手动部署',
    actionLabel: '部署指南',
    description: '需要本地使用 wrangler 命令行手动部署，按部署指南执行。',
  },
  'docs-only': {
    label: '仅文档说明',
    actionLabel: '查看仓库',
    description: '暂无成型的一键部署路径，需要按项目文档自行搭建。',
  },
};

/** §6.2 验证等级（金 / 绿 / 灰，永远带文字，不只靠颜色） */
export const TIER_META: Record<
  VerificationTier,
  { label: string; description: string; badgeClassName: string }
> = {
  official: {
    label: '自研',
    description: 'WorkerHub 自研项目，由 WorkerHub 团队维护。',
    badgeClassName: 'bg-tier-official-bg text-tier-official-fg border-tier-official-border',
  },
  verified: {
    label: '已验证',
    description: '本站维护者按其文档实际完成过一次部署并留有验证记录。',
    badgeClassName: 'bg-tier-verified-bg text-tier-verified-fg border-tier-verified-border',
  },
  listed: {
    label: '已收录',
    description: '仅通过收录门槛审核，未做部署实测。',
    badgeClassName: 'bg-tier-listed-bg text-tier-listed-fg border-tier-listed-border',
  },
};

/** §6.2 fixed 未实测声明文案（listed 项目详情页必须有） */
export const LISTED_DISCLAIMER = '本站尚未实测部署，部署体验以项目文档为准。';

/** §4.1 difficulty 1–3 文案 */
export const DIFFICULTY_LABELS: Record<number, string> = {
  1: '快速',
  2: '标准',
  3: '进阶',
};

export const DIFFICULTY_HINTS: Record<number, string> = {
  1: '≤10 分钟、近零配置',
  2: '需自建 D1/KV 等绑定 + 少量环境变量',
  3: '多绑定 / 多密钥 / 依赖外部服务',
};

/** §4.1 free_tier 文案 */
export const FREE_TIER_META: Record<
  'yes' | 'partial' | 'no',
  { label: string; description: string }
> = {
  yes: { label: '免费层可跑', description: '全部功能可在 Cloudflare 免费额度内运行。' },
  partial: { label: '免费层受限', description: '可在免费额度内运行，部分能力有额度限制。' },
  no: { label: '需付费', description: '必须使用付费计划才能运行。' },
};

export const SOURCE_LABELS: Record<ProjectSource, string> = {
  official: '自研项目',
  'third-party': '第三方项目',
};

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: '已上架',
  'coming-soon': '即将推出',
  delisted: '已下架',
};

/** 资源徽章最多显示 3 个，其余折叠为 +n（§4.3） */
export const RESOURCE_BADGE_VISIBLE = 3;

/** 长期未更新阈值（§6.3，与 github-meta.ts 的 STALE_DAYS 一致） */
export const STALE_DAYS = 365;

/**
 * 卡片 / 列表 / 详情共用的项目视图模型。
 * 所有字段都是可序列化的纯数据：静态页面直接渲染，Explorer island 通过 props 拿同一份。
 */
export interface ProjectView {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  features: string[];
  category: Category;
  tags: string[];
  source: ProjectSource;
  tier: VerificationTier;
  resources: Resource[];
  difficulty: number;
  freeTier: 'yes' | 'partial' | 'no';
  pricingNote: string | null;
  status: ProjectStatus;
  featured: boolean;

  repo: string;
  repoUrl: string;
  homepage: string | null;
  docsUrl: string | null;
  deploy: { method: DeployMethod; url: string | null; guideUrl: string | null };

  /** 项目截图（public 下路径），无则 null */
  screenshot: string | null;
  /** 已本地化的仓库 OG 图（public 下路径），无则 null；禁止热链 GitHub 临时 URL */
  ogImage: string | null;

  stars: number | null;
  starsLabel: string | null;
  forks: number | null;
  language: string | null;
  license: string | null;
  updatedAt: string | null;
  archived: boolean;
  stale: boolean;
  latestRelease: { tag: string; publishedAt: string | null } | null;

  addedAt: string;
  verifiedAt: string | null;
  verifiedNoteUrl: string | null;
}

/** 千分位/千位缩写：12400 → 12.4k（构建期与客户端都要确定性输出） */
export function formatCount(value: number | null): string | null {
  if (value === null) return null;
  if (value < 1000) return String(value);
  const rounded = Math.round((value / 1000) * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}k`;
}

/** ISO 时间 → YYYY-MM-DD（不依赖本地时区与 locale，避免 hydration 不一致） */
export function isoDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
  return match ? match[0] : null;
}

/** 列表按分类分组的稳定顺序（§4.2 定义顺序） */
export const CATEGORY_ORDER: Category[] = [
  'productivity',
  'notification',
  'content',
  'email',
  'files-media',
  'devops',
  'data',
  'ai',
  'life',
  'other',
];

export const VALID_FILTER_VALUES: Record<
  'category' | 'source' | 'tier' | 'resources' | 'difficulty' | 'free',
  string[]
> = {
  category: [...CATEGORY_ORDER],
  source: [...SOURCES],
  tier: [...TIERS],
  resources: [...RESOURCES],
  difficulty: ['1', '2', '3'],
  free: [...FREE_TIERS],
};

/** §8.2 排序键；默认排序 = 官方置顶 → 精选 → 收录日期倒序 */
export const SORT_OPTIONS = [
  { value: 'default', label: '默认（自研置顶 → 精选 → 收录日期）' },
  { value: 'stars', label: 'star 数降序' },
  { value: 'updated', label: '最近更新' },
  { value: 'name', label: '名称' },
  { value: 'added', label: '收录日期倒序' },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]['value'];

/**
 * 筛选维度的合法取值（来自 §4.1/§4.2/§5/§6 的 schema 枚举，而不是「当前数据里出现过的值」）。
 *
 * 差别很重要：数据里暂时没有 difficulty=1 的项目时，`?diff=1` 仍应被接受并如实显示 0 条结果，
 * 而不是被静默丢掉——否则分享出去/刷新后的筛选状态会和原页面不一致。
 */

/** 六维筛选（§8.2）：分类 / 来源 / 验证等级 / 所需资源 / 难度 / 免费层 */
export const FILTER_DIMENSIONS = [
  'category',
  'source',
  'tier',
  'resources',
  'difficulty',
  'free',
] as const;
export type FilterDimension = (typeof FILTER_DIMENSIONS)[number];

export interface FilterState {
  q: string;
  category: string[];
  source: string[];
  tier: string[];
  resources: string[];
  difficulty: string[];
  free: string[];
  sort: SortKey;
}

export const EMPTY_FILTERS: FilterState = {
  q: '',
  category: [],
  source: [],
  tier: [],
  resources: [],
  difficulty: [],
  free: [],
  sort: 'default',
};
