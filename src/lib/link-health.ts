/**
 * 外链健康检查（SPEC §9.3）。
 *
 * 「每日重建时对全部外链做可达性检查并出摘要报告（GitHub Actions summary）；
 *   连续失败的项目在摘要中点名，是否下架/修正走人工数据 PR，不自动改数据。」
 *
 * 与投稿 CI（S2-B 的 `src/lib/submission-checks.ts`）的分工：
 *   - 投稿 CI：拦新数据（error/warning 分级、可硬拦 PR）；
 *   - 本模块：巡检既有数据（永不硬拦、永不改数据，只出摘要 + 连续失败点名）。
 * 因此这里的严重级别只有「成功 / 失败 / 受限」，且退出码恒为 0（除非数据文件本身非法）。
 *
 * 网络与磁盘都在边界上：`runLinkHealth` 注入 fetch 与上一次状态，纯逻辑可单测。
 */
import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';

/** 巡检的外链字段（§9.3「全部外链」：仓库入口 + 数据文件里的全部人工外链） */
export const LINK_FIELDS = [
  'repo',
  'homepage',
  'docs_url',
  'deploy.url',
  'deploy.guide_url',
] as const;
export type LinkField = (typeof LINK_FIELDS)[number];

export const LINK_HEALTH_STATE_VERSION = 1;
/** 连续失败达到该次数即在摘要中点名（本次 + 上一次都失败 = 2） */
export const CHRONIC_FAILURE_THRESHOLD = 2;
export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_RETRIES = 1;
export const DEFAULT_CONCURRENCY = 6;

const USER_AGENT = 'workerhub-hub-link-health (+https://hub.oneboy.app)';

/** 巡检输入所需的最小项目形状（`ProjectInput` 满足它） */
export interface LinkSourceProject {
  slug: string;
  data: {
    repo: string;
    homepage?: string | undefined;
    docs_url?: string | undefined;
    deploy: { url?: string | undefined; guide_url?: string | undefined };
  };
}

export interface ProjectLinkRef {
  slug: string;
  field: LinkField;
  url: string;
}

/** 收集全部外链（按项目去重，同一 URL 只查一次由调用方合并） */
export function collectProjectLinks(projects: readonly LinkSourceProject[]): ProjectLinkRef[] {
  const refs: ProjectLinkRef[] = [];
  for (const project of projects) {
    const { data } = project;
    refs.push({ slug: project.slug, field: 'repo', url: `https://github.com/${data.repo}` });
    if (data.homepage) refs.push({ slug: project.slug, field: 'homepage', url: data.homepage });
    if (data.docs_url) refs.push({ slug: project.slug, field: 'docs_url', url: data.docs_url });
    if (data.deploy.url)
      refs.push({ slug: project.slug, field: 'deploy.url', url: data.deploy.url });
    if (data.deploy.guide_url) {
      refs.push({ slug: project.slug, field: 'deploy.guide_url', url: data.deploy.guide_url });
    }
  }
  return refs;
}

export type LinkOutcome = 'ok' | 'failed' | 'blocked';

export interface LinkCheckOptions {
  /** 便于测试注入 */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
}

export interface LinkCheckResult {
  url: string;
  outcome: LinkOutcome;
  /** HTTP 状态码；网络层失败时为 null */
  status: number | null;
  detail: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 反爬 / 限流 / 不接受该方法的响应：结论不确定，交人工确认，不算「坏链」 */
const BLOCKED_STATUSES = new Set([401, 403, 405, 406, 429, 503]);

/**
 * 检查单个外链是否可达。
 *
 * - 2xx / 3xx（跟随重定向）→ ok
 * - 4xx / 5xx → failed（5xx 与网络错误重试一次）
 * - 反爬/限流类状态码 → blocked：只提示人工确认，不计入连续失败
 */
export async function checkLink(
  url: string,
  options: LinkCheckOptions = {},
): Promise<LinkCheckResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = Math.max(0, options.retries ?? DEFAULT_RETRIES);

  let lastDetail = '';
  let lastStatus: number | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(300 * attempt);
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      // 只关心状态码，不下载正文
      await response.body?.cancel();

      if (response.status < 400) {
        return { url, outcome: 'ok', status: response.status, detail: `HTTP ${response.status}` };
      }
      if (BLOCKED_STATUSES.has(response.status)) {
        return {
          url,
          outcome: 'blocked',
          status: response.status,
          detail: `HTTP ${response.status}（疑似反爬/限流，需人工确认）`,
        };
      }
      lastStatus = response.status;
      lastDetail = `HTTP ${response.status}`;
      if (response.status < 500) break; // 4xx 是确定性结论，重试无意义
    } catch (error) {
      lastStatus = null;
      lastDetail = `请求失败：${(error as Error).message}`;
    }
  }

  return { url, outcome: 'failed', status: lastStatus, detail: lastDetail || '请求失败' };
}

// ---------------------------------------------------------------------------
// 连续失败状态（跨运行持久化，CI 侧用 actions/cache 保存，不写入仓库）
// ---------------------------------------------------------------------------

const linkHealthStateEntrySchema = z.strictObject({
  consecutiveFailures: z.number().int().nonnegative(),
  lastOutcome: z.enum(['ok', 'failed', 'blocked']),
  lastDetail: z.string(),
  lastCheckedAt: z.string(),
  lastOkAt: z.string().nullable(),
});

export const linkHealthStateSchema = z.strictObject({
  schemaVersion: z.literal(LINK_HEALTH_STATE_VERSION),
  links: z.record(z.string(), linkHealthStateEntrySchema),
});

export type LinkHealthStateEntry = z.infer<typeof linkHealthStateEntrySchema>;
export type LinkHealthState = z.infer<typeof linkHealthStateSchema>;

export const emptyLinkHealthState = (): LinkHealthState => ({
  schemaVersion: LINK_HEALTH_STATE_VERSION,
  links: {},
});

/** 读取上次状态：缺失 → 空状态；损坏 → 空状态 + 警告（不阻塞巡检） */
export function readLinkHealthState(
  path: string,
  warn: (message: string) => void = () => {},
): LinkHealthState {
  if (!existsSync(path)) return emptyLinkHealthState();
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    warn(`链接健康状态文件无法解析（${path}）：${(error as Error).message}；按空状态处理`);
    return emptyLinkHealthState();
  }
  const parsed = linkHealthStateSchema.safeParse(raw);
  if (!parsed.success) {
    warn(`链接健康状态文件 schema 不合法（${path}）；按空状态处理`);
    return emptyLinkHealthState();
  }
  return parsed.data;
}

export function serializeLinkHealthState(state: LinkHealthState): string {
  const links: Record<string, LinkHealthStateEntry> = {};
  for (const url of Object.keys(state.links).sort()) links[url] = state.links[url]!;
  return `${JSON.stringify({ schemaVersion: LINK_HEALTH_STATE_VERSION, links }, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// 巡检与报告
// ---------------------------------------------------------------------------

export interface LinkHealthRow {
  url: string;
  field: LinkField;
  slugs: string[];
  outcome: LinkOutcome;
  status: number | null;
  detail: string;
  consecutiveFailures: number;
  /** 连续失败达阈值 → 摘要里点名（§9.3） */
  chronic: boolean;
}

export interface LinkHealthReport {
  generatedAt: string;
  threshold: number;
  totals: { links: number; ok: number; failed: number; blocked: number; chronic: number };
  rows: LinkHealthRow[];
  /** 连续失败点名的项目清单（摘要里逐项列出） */
  chronicFailures: { url: string; slugs: string[]; consecutiveFailures: number; detail: string }[];
  /** 需人工确认（反爬/限流，未计入失败） */
  needsReview: { url: string; slugs: string[]; detail: string }[];
}

export interface RunLinkHealthOptions extends LinkCheckOptions {
  /** 上次状态（连续失败计数） */
  previous?: LinkHealthState;
  concurrency?: number;
  threshold?: number;
  now?: Date;
  warn?: (message: string) => void;
}

export interface RunLinkHealthResult {
  state: LinkHealthState;
  report: LinkHealthReport;
}

/** 逐项巡检全部外链，产出新状态与摘要报告（纯逻辑，网络由 fetchImpl 注入） */
export async function runLinkHealth(
  refs: readonly ProjectLinkRef[],
  options: RunLinkHealthOptions = {},
): Promise<RunLinkHealthResult> {
  const now = options.now ?? new Date();
  const checkedAt = now.toISOString();
  const threshold = options.threshold ?? CHRONIC_FAILURE_THRESHOLD;
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const previous = options.previous ?? emptyLinkHealthState();
  const warn = options.warn ?? (() => {});

  // 同一 URL 只查一次，合并引用它的项目
  const byUrl = new Map<string, { field: LinkField; slugs: Set<string> }>();
  for (const ref of refs) {
    const entry = byUrl.get(ref.url) ?? { field: ref.field, slugs: new Set<string>() };
    entry.slugs.add(ref.slug);
    byUrl.set(ref.url, entry);
  }
  const urls = [...byUrl.keys()].sort();

  const results = new Map<string, LinkCheckResult>();
  for (let index = 0; index < urls.length; index += concurrency) {
    const batch = urls.slice(index, index + concurrency);
    const batchResults = await Promise.all(
      batch.map((url) =>
        checkLink(url, options).catch((error: unknown): LinkCheckResult => ({
          url,
          outcome: 'failed',
          status: null,
          detail: `请求失败：${(error as Error).message}`,
        })),
      ),
    );
    for (const result of batchResults) results.set(result.url, result);
  }

  const state: LinkHealthState = { schemaVersion: LINK_HEALTH_STATE_VERSION, links: {} };
  const rows: LinkHealthRow[] = [];

  for (const url of urls) {
    const result = results.get(url)!;
    const meta = byUrl.get(url)!;
    const prior = previous.links[url];
    const consecutiveFailures =
      result.outcome === 'failed' ? (prior?.consecutiveFailures ?? 0) + 1 : 0;

    state.links[url] = {
      consecutiveFailures,
      lastOutcome: result.outcome,
      lastDetail: result.detail,
      lastCheckedAt: checkedAt,
      lastOkAt: result.outcome === 'ok' ? checkedAt : (prior?.lastOkAt ?? null),
    };

    const chronic = consecutiveFailures >= threshold;
    if (chronic) {
      warn(`${url} 已连续 ${consecutiveFailures} 次不可达（${result.detail}）`);
    }

    rows.push({
      url,
      field: meta.field,
      slugs: [...meta.slugs].sort(),
      outcome: result.outcome,
      status: result.status,
      detail: result.detail,
      consecutiveFailures,
      chronic,
    });
  }

  const count = (outcome: LinkOutcome): number =>
    rows.filter((row) => row.outcome === outcome).length;

  const report: LinkHealthReport = {
    generatedAt: checkedAt,
    threshold,
    totals: {
      links: rows.length,
      ok: count('ok'),
      failed: count('failed'),
      blocked: count('blocked'),
      chronic: rows.filter((row) => row.chronic).length,
    },
    rows,
    chronicFailures: rows
      .filter((row) => row.chronic)
      .map((row) => ({
        url: row.url,
        slugs: row.slugs,
        consecutiveFailures: row.consecutiveFailures,
        detail: row.detail,
      })),
    needsReview: rows
      .filter((row) => row.outcome === 'blocked')
      .map((row) => ({ url: row.url, slugs: row.slugs, detail: row.detail })),
  };

  return { state, report };
}

/** 报告 JSON 的解析（CI 跨 job 传文件时用；损坏返回 null，摘要降级显示） */
export const linkHealthReportSchema = z.strictObject({
  generatedAt: z.string(),
  threshold: z.number().int().positive(),
  totals: z.strictObject({
    links: z.number().int().nonnegative(),
    ok: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    chronic: z.number().int().nonnegative(),
  }),
  rows: z.array(
    z.strictObject({
      url: z.string(),
      field: z.enum(LINK_FIELDS),
      slugs: z.array(z.string()),
      outcome: z.enum(['ok', 'failed', 'blocked']),
      status: z.number().int().nullable(),
      detail: z.string(),
      consecutiveFailures: z.number().int().nonnegative(),
      chronic: z.boolean(),
    }),
  ),
  chronicFailures: z.array(
    z.strictObject({
      url: z.string(),
      slugs: z.array(z.string()),
      consecutiveFailures: z.number().int().nonnegative(),
      detail: z.string(),
    }),
  ),
  needsReview: z.array(
    z.strictObject({ url: z.string(), slugs: z.array(z.string()), detail: z.string() }),
  ),
});
