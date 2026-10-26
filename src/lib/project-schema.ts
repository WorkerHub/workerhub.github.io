/**
 * hub 数据文件 schema（唯一真源）。
 *
 * 覆盖 SPEC v1.4 §4.1 全部人工字段、§4.2 分类枚举、§5 deploy 枚举、§6 tier 枚举。
 * 同一份 schema 同时被：
 *   - Astro Content Collections（src/content.config.ts）用于构建期校验
 *   - scripts/validate-data.ts 与 scripts/fetch-github-meta.ts 用于构建前快速失败
 * 任何字段定义变更都必须先走父单 ONE-411 评论裁决（冻结契约），不得私下改。
 */
import { z } from 'zod';

/** §4.2 分类（v1 定版，新增须改规格或经用户批准） */
export const CATEGORIES = [
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
] as const;

/** §4.1 resources 枚举 */
export const RESOURCES = [
  'workers-only',
  'pages',
  'd1',
  'kv',
  'r2',
  'durable-objects',
  'queues',
  'cron',
  'workers-ai',
  'vectorize',
  'hyperdrive',
  'email-workers',
  'external',
] as const;

/** §5 部署方式枚举 */
export const DEPLOY_METHODS = [
  'deploy-button',
  'git-integration',
  'github-actions',
  'wrangler',
  'docs-only',
] as const;

/** §4.1 free_tier 枚举 */
export const FREE_TIERS = ['yes', 'partial', 'no'] as const;

/** §6 验证等级枚举 */
export const TIERS = ['official', 'verified', 'listed'] as const;

/** §4.1 来源枚举 */
export const SOURCES = ['official', 'third-party'] as const;

/** §4.1 状态枚举 */
export const STATUSES = ['active', 'coming-soon', 'delisted'] as const;

/** 官方项目 owner 恒为 WorkerHub（§3.1 / §4.1） */
export const OFFICIAL_REPO_OWNER = 'WorkerHub';

export const SLUG_PATTERN = /^[a-z0-9-]+$/;
export const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
/** §8.3 / §4.1：截图路径固定落 public/screenshots/<slug>.webp */
export const SCREENSHOT_PATTERN = /^(?:\/?public)?\/?screenshots\/[a-z0-9-]+\.webp$/;
/** §5 Deploy Button URL 规范 */
export const DEPLOY_BUTTON_PREFIX =
  'https://deploy.workers.cloudflare.com/?url=https://github.com/';

/**
 * §4.1 明令禁止手写自动字段（§9.2 构建时抓取）。
 * 数据文件为 strictObject，出现任何未知键即失败，因此自动字段写进 YAML 会直接报错。
 */
export const FORBIDDEN_AUTO_FIELDS = [
  'stars',
  'stargazers_count',
  'forks',
  'forks_count',
  'language',
  'license',
  'pushed_at',
  'archived',
  'latest_release',
  'release',
  'open_graph_image',
] as const;

const charCount = (value: string): number => [...value].length;

/** 中文句子数：以句末标点计（§4.1 description_zh 2–4 句） */
export const countSentences = (value: string): number => (value.match(/[。！？!?]/g) ?? []).length;

/**
 * 日期字段：YAML 里推荐写不带引号的 `2026-10-26`（ISO date）。
 * 不同 YAML 解析器可能把裸日期解析成 Date 对象，这里统一归一化为 `YYYY-MM-DD` 字符串。
 */
const isoDate = z
  .union([z.iso.date(), z.date()])
  .transform((value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value));

export const deploySchema = z.strictObject({
  /** §5 部署方式 */
  method: z.enum(DEPLOY_METHODS),
  /** Deploy Button / 部署入口，可空（docs-only、coming-soon 时通常为空） */
  url: z.url().optional(),
  /** 部署指南链接，可空 */
  guide_url: z.url().optional(),
});

export const projectSchema = z
  .strictObject({
    /** 全站唯一，与文件名一致（跨文件校验在 validate-projects.ts） */
    slug: z.string().regex(SLUG_PATTERN, 'slug 只允许小写字母、数字与连字符（^[a-z0-9-]+$）'),
    name: z.string().min(1).max(60),
    repo: z.string().regex(REPO_PATTERN, 'repo 必须是 owner/repo 形式'),
    source: z.enum(SOURCES),
    /** 中文一句话介绍，≤40 字（§4.1） */
    tagline_zh: z
      .string()
      .min(4)
      .refine((v) => charCount(v) <= 40, { message: 'tagline_zh 不得超过 40 字' }),
    /** 中文长介绍，2–4 句（§4.1） */
    description_zh: z
      .string()
      .min(10)
      .refine(
        (v) => {
          const sentences = countSentences(v);
          return sentences >= 2 && sentences <= 4;
        },
        { message: 'description_zh 必须为 2–4 句（以。！？计句）' },
      ),
    /** 预留，v1 不渲染 */
    description_en: z.string().optional(),
    /** 特性 3–5 条（§4.1） */
    features: z.array(z.string().min(2)).min(3).max(5),
    category: z.enum(CATEGORIES),
    /** 自由标签 ≤5 个（§4.1） */
    tags: z
      .array(z.string().min(1))
      .max(5)
      .refine((v) => new Set(v).size === v.length, { message: 'tags 不得重复' }),
    homepage: z.url().optional(),
    docs_url: z.url().optional(),
    deploy: deploySchema,
    resources: z
      .array(z.enum(RESOURCES))
      .min(1)
      .refine((v) => new Set(v).size === v.length, { message: 'resources 不得重复' }),
    difficulty: z.number().int().min(1).max(3),
    free_tier: z.enum(FREE_TIERS),
    /** free_tier != yes 时必填 */
    pricing_note: z.string().min(4).optional(),
    tier: z.enum(TIERS),
    /** tier=verified 时必填 */
    verified_at: isoDate.optional(),
    /** tier=verified 时必填 */
    verified_note_url: z.url().optional(),
    screenshot: z
      .string()
      .regex(SCREENSHOT_PATTERN, 'screenshot 必须是 public/screenshots/<slug>.webp')
      .optional(),
    /** 是否进首页精选推荐位（仅第三方，§4.1） */
    featured: z.boolean().default(false),
    added_at: isoDate,
    status: z.enum(STATUSES).default('active'),
  })
  .superRefine((project, ctx) => {
    const fail = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });

    // §4.1 官方项目 tier 恒为 official，第三方不得使用 official 等级
    if (project.source === 'official' && project.tier !== 'official') {
      fail('tier', 'source=official 时 tier 必须为 official');
    }
    if (project.source === 'third-party' && project.tier === 'official') {
      fail('tier', 'source=third-party 不得使用 official 等级（只能 verified / listed）');
    }

    // §3.1 官方项目 owner 恒为 WorkerHub
    if (project.source === 'official' && project.repo.split('/')[0] !== OFFICIAL_REPO_OWNER) {
      fail('repo', `source=official 时 repo owner 必须为 ${OFFICIAL_REPO_OWNER}`);
    }

    // §6.2 已验证等级凭证书齐备
    if (project.tier === 'verified') {
      if (!project.verified_at) fail('verified_at', 'tier=verified 时必须填写 verified_at');
      if (!project.verified_note_url) {
        fail('verified_note_url', 'tier=verified 时必须填写 verified_note_url');
      }
    }

    // §4.1 free_tier != yes 时必须说明限制
    if (project.free_tier !== 'yes' && !project.pricing_note) {
      fail('pricing_note', 'free_tier 不为 yes 时必须填写 pricing_note');
    }

    // §4.1 featured 仅第三方（官方区本身置顶）
    if (project.featured && project.source === 'official') {
      fail('featured', 'featured 字段仅第三方项目可用（官方区本身置顶）');
    }

    // §3.1 即将推出形态（waker 预告位）不提供部署入口
    if (project.status === 'coming-soon' && project.deploy.url) {
      fail('deploy.url', 'status=coming-soon 不得填写部署入口 url（无部署入口）');
    }

    // §5 Deploy Button URL 规范
    if (project.deploy.method === 'deploy-button') {
      if (!project.deploy.url) {
        fail('deploy.url', 'deploy.method=deploy-button 时必须填写 url');
      } else if (!project.deploy.url.startsWith(DEPLOY_BUTTON_PREFIX)) {
        fail('deploy.url', `Deploy Button 链接必须形如 ${DEPLOY_BUTTON_PREFIX}<owner>/<repo>`);
      }
    }
  });

/** 单条数据文件的人工字段（不含 GitHub 自动字段，见 github-meta.ts） */
export type ProjectInput = z.infer<typeof projectSchema>;
export type Category = (typeof CATEGORIES)[number];
export type Resource = (typeof RESOURCES)[number];
export type DeployMethod = (typeof DEPLOY_METHODS)[number];
export type VerificationTier = (typeof TIERS)[number];
export type ProjectSource = (typeof SOURCES)[number];
export type ProjectStatus = (typeof STATUSES)[number];
