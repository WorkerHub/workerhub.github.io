/**
 * GitHub 自动字段抓取 + 缓存降级（SPEC §9.2 硬性要求）。
 *
 * 设计要点：
 * - 只读公开 GitHub REST API，字段严格限定在 §9.2 白名单内；不需要任何 PAT。
 * - 单个项目抓取失败绝不让整站构建失败：
 *   · 网络 / 超时 / 5xx / 限流 → 回退 `src/data/cache/github-meta.json` 上次结果
 *   · 缓存也没有 → 该项目自动字段全部置 null，页面正常渲染
 * - 仓库 404（不存在或私有）属于数据错误而非基础设施故障 → 直接失败（§7 CI 要求）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

export const META_CACHE_SCHEMA_VERSION = 1;
export const DEFAULT_API_BASE = 'https://api.github.com';
export const DEFAULT_TIMEOUT_MS = 8_000;
/** 超过该天数未 push 即视为「长期未更新」（§6.3，仅标记不下架） */
export const STALE_DAYS = 365;

const nullableString = z.string().nullable();
const nullableInt = z.number().int().nonnegative().nullable();

export const repoMetaSchema = z.strictObject({
  stargazersCount: nullableInt,
  forksCount: nullableInt,
  language: nullableString,
  license: nullableString,
  pushedAt: nullableString,
  archived: z.boolean().nullable(),
  latestRelease: z.strictObject({ tag: z.string(), publishedAt: nullableString }).nullable(),
  openGraphImage: nullableString,
  /** 本次成功抓取的时刻；缓存回退时保留上次成功时间 */
  fetchedAt: z.string(),
});

export type RepoMeta = z.infer<typeof repoMetaSchema>;

export const metaCacheSchema = z.strictObject({
  schemaVersion: z.literal(META_CACHE_SCHEMA_VERSION),
  repos: z.record(z.string(), repoMetaSchema),
});

export type MetaCache = z.infer<typeof metaCacheSchema>;

/** 自动字段全空的项目（抓取与缓存都不可用时使用） */
export function emptyRepoMeta(fetchedAt = new Date().toISOString()): RepoMeta {
  return {
    stargazersCount: null,
    forksCount: null,
    language: null,
    license: null,
    pushedAt: null,
    archived: null,
    latestRelease: null,
    openGraphImage: null,
    fetchedAt,
  };
}

export const emptyCache = (): MetaCache => ({
  schemaVersion: META_CACHE_SCHEMA_VERSION,
  repos: {},
});

/** §9.2 仓库社交预览图地址（GitHub 官方 opengraph 图，非临时上传 URL） */
export const openGraphImageUrl = (repo: string): string =>
  `https://opengraph.githubassets.com/1/${repo}`;

export function emptyMetaCacheText(): string {
  return `${JSON.stringify(emptyCache(), null, 2)}\n`;
}

/**
 * 读取缓存文件。文件缺失 → 空缓存；文件损坏 → 空缓存并给出警告（不阻塞构建）。
 */
export function readMetaCache(path: string, warn: (message: string) => void = () => {}): MetaCache {
  if (!existsSync(path)) return emptyCache();
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    warn(`缓存文件无法解析（${path}）：${(error as Error).message}；按空缓存处理`);
    return emptyCache();
  }
  const parsed = metaCacheSchema.safeParse(raw);
  if (!parsed.success) {
    warn(`缓存文件 schema 不合法（${path}）；按空缓存处理`);
    return emptyCache();
  }
  return parsed.data;
}

/** 稳定序列化缓存（键排序 + 固定字段顺序），便于「有变化才写」与 diff 阅读 */
export function serializeMetaCache(cache: MetaCache): string {
  const repos: Record<string, RepoMeta> = {};
  for (const repo of Object.keys(cache.repos).sort()) {
    const meta = cache.repos[repo]!;
    repos[repo] = {
      stargazersCount: meta.stargazersCount,
      forksCount: meta.forksCount,
      language: meta.language,
      license: meta.license,
      pushedAt: meta.pushedAt,
      archived: meta.archived,
      latestRelease: meta.latestRelease
        ? { tag: meta.latestRelease.tag, publishedAt: meta.latestRelease.publishedAt }
        : null,
      openGraphImage: meta.openGraphImage,
      fetchedAt: meta.fetchedAt,
    };
  }
  return `${JSON.stringify({ schemaVersion: META_CACHE_SCHEMA_VERSION, repos }, null, 2)}\n`;
}

/** 只在内容真的变化时写盘，避免每次构建都产生无意义 diff */
export function writeMetaCacheIfChanged(path: string, cache: MetaCache): boolean {
  const next = serializeMetaCache(cache);
  const previous = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (next === previous) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next, 'utf8');
  return true;
}

export type FetchFailureKind = 'not-found' | 'network' | 'rate-limited' | 'http' | 'skipped';

export class RepoFetchError extends Error {
  constructor(
    readonly repo: string,
    readonly kind: FetchFailureKind,
    message: string,
  ) {
    super(message);
    this.name = 'RepoFetchError';
  }
}

export interface FetchOptions {
  /** CI 用工作流自带 GITHUB_TOKEN；本地可缺省走未认证额度 */
  token?: string | undefined;
  apiBase?: string;
  timeoutMs?: number;
  /** 便于测试注入 */
  fetchImpl?: typeof fetch;
}

interface GitHubRepoJson {
  stargazers_count?: number;
  forks_count?: number;
  language?: string | null;
  license?: { spdx_id?: string | null } | null;
  pushed_at?: string | null;
  archived?: boolean;
}

interface GitHubReleaseJson {
  tag_name?: string;
  published_at?: string | null;
}

async function getJson(url: string, repo: string, options: FetchOptions): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'workerhub-hub-build (+https://hub.oneboy.app)',
  };
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    throw new RepoFetchError(repo, 'network', `请求失败：${(error as Error).message}`);
  }

  if (response.ok) return response.json();

  if (response.status === 404) {
    throw new RepoFetchError(repo, 'not-found', `GitHub 返回 404（仓库不存在或为私有）`);
  }
  const remaining = response.headers.get('x-ratelimit-remaining');
  if (response.status === 403 && remaining === '0') {
    throw new RepoFetchError(repo, 'rate-limited', `GitHub API 限流（403，remaining=0）`);
  }
  throw new RepoFetchError(repo, 'http', `GitHub 返回 ${response.status}`);
}

/** 抓取单个仓库的 §9.2 白名单字段（不含缓存逻辑） */
export async function fetchRepoMeta(repo: string, options: FetchOptions = {}): Promise<RepoMeta> {
  const apiBase = options.apiBase ?? DEFAULT_API_BASE;
  const repoJson = (await getJson(`${apiBase}/repos/${repo}`, repo, options)) as GitHubRepoJson;

  let latestRelease: RepoMeta['latestRelease'] = null;
  try {
    const releaseJson = (await getJson(
      `${apiBase}/repos/${repo}/releases/latest`,
      repo,
      options,
    )) as GitHubReleaseJson;
    if (releaseJson.tag_name) {
      latestRelease = {
        tag: releaseJson.tag_name,
        publishedAt: releaseJson.published_at ?? null,
      };
    }
  } catch (error) {
    // 无 release 是常态（404）；其它错误也只是本次没拿到，不影响仓库主体字段
    if (!(error instanceof RepoFetchError)) throw error;
  }

  return {
    stargazersCount:
      typeof repoJson.stargazers_count === 'number' ? repoJson.stargazers_count : null,
    forksCount: typeof repoJson.forks_count === 'number' ? repoJson.forks_count : null,
    language: repoJson.language ?? null,
    license: repoJson.license?.spdx_id ?? null,
    pushedAt: repoJson.pushed_at ?? null,
    archived: typeof repoJson.archived === 'boolean' ? repoJson.archived : null,
    latestRelease,
    openGraphImage: openGraphImageUrl(repo),
    fetchedAt: new Date().toISOString(),
  };
}

export type RepoOutcomeStatus = 'ok' | 'cached' | 'empty';

export interface RepoOutcome {
  repo: string;
  status: RepoOutcomeStatus;
  meta: RepoMeta;
  /** 降级原因（status != ok 时给出） */
  reason?: string;
}

export interface ResolveOptions extends FetchOptions {
  /** 缓存（必须包含缓存命中所需的既有值） */
  cache: MetaCache;
  /** 抓取被禁用（演练/离线构建） */
  skipFetch?: boolean;
  /** 并发上限 */
  concurrency?: number;
  warn?: (message: string) => void;
}

/**
 * 抓取全部仓库，逐项决定 ok / cached / empty。
 * 返回更新后的缓存 + 每项结局 + 数据错误（404 等，调用方据此失败构建）。
 */
export async function resolveRepoMeta(
  repos: string[],
  options: ResolveOptions,
): Promise<{
  cache: MetaCache;
  outcomes: RepoOutcome[];
  dataErrors: RepoFetchError[];
}> {
  const warn = options.warn ?? (() => {});
  const cache: MetaCache = {
    schemaVersion: META_CACHE_SCHEMA_VERSION,
    repos: { ...options.cache.repos },
  };
  const outcomes: RepoOutcome[] = [];
  const dataErrors: RepoFetchError[] = [];
  const unique = [...new Set(repos)];
  const concurrency = Math.max(1, options.concurrency ?? 4);

  for (let index = 0; index < unique.length; index += concurrency) {
    const batch = unique.slice(index, index + concurrency);
    const results = await Promise.all(
      batch.map(async (repo): Promise<RepoOutcome> => {
        const cached = cache.repos[repo];
        if (options.skipFetch) {
          const reason = '抓取已禁用（HUB_SKIP_FETCH=1）';
          return cached
            ? { repo, status: 'cached', meta: cached, reason }
            : { repo, status: 'empty', meta: emptyRepoMeta(), reason };
        }
        try {
          const meta = await fetchRepoMeta(repo, options);
          cache.repos[repo] = meta;
          return { repo, status: 'ok', meta };
        } catch (error) {
          if (!(error instanceof RepoFetchError)) throw error;
          if (error.kind === 'not-found') {
            dataErrors.push(error);
            return {
              repo,
              status: 'empty',
              meta: cached ?? emptyRepoMeta(),
              reason: error.message,
            };
          }
          // 基础设施层故障 → 缓存兜底 / 置空降级，绝不失败构建
          warn(`${repo} 自动字段抓取失败（${error.kind}）：${error.message}`);
          return cached
            ? { repo, status: 'cached', meta: cached, reason: error.message }
            : { repo, status: 'empty', meta: emptyRepoMeta(), reason: error.message };
        }
      }),
    );
    outcomes.push(...results);
  }

  return { cache, outcomes, dataErrors };
}

export interface RepoAnomaly {
  repo: string;
  reasons: string[];
}

/** §6.3 / §9.2：archive 与「超过 12 个月未更新」异常清单（只标记，不自动下架） */
export function findAnomalies(
  repos: string[],
  cache: MetaCache,
  now: Date = new Date(),
): RepoAnomaly[] {
  const anomalies: RepoAnomaly[] = [];
  for (const repo of repos) {
    const meta = cache.repos[repo];
    if (!meta) continue;
    const reasons: string[] = [];
    if (meta.archived === true) reasons.push('仓库已 archive');
    if (meta.pushedAt) {
      const pushed = Date.parse(meta.pushedAt);
      if (Number.isFinite(pushed)) {
        const days = Math.floor((now.getTime() - pushed) / 86_400_000);
        if (days > STALE_DAYS) reasons.push(`超过 ${STALE_DAYS} 天未更新（${days} 天）`);
      }
    }
    if (reasons.length > 0) anomalies.push({ repo, reasons });
  }
  return anomalies;
}
