/**
 * 投稿数据的三类必检项（SPEC §7「CI 自动校验」，投稿 PR 与官方数据 PR 同等适用）：
 *
 *   1. `repo` 真实存在且为 public（GitHub REST API 核验）
 *   2. 外链可达性（homepage / docs_url / deploy.url / deploy.guide_url）
 *   3. 截图规格（webp、宽 ≥1200px、体积 ≤300KB）
 *
 * 严重级别严格照抄 §7 原文：
 *   - `repo` 不存在 / 私有 / 无法核验 → **硬拦**（error）
 *   - 外链失败 → **默认只警告**，由评审人人工确认；
 *     但「官方项目的全部外链」与「任何项目的演示站（homepage）」失败 → **硬拦**（error）
 *   - 例外（返工口径，见 ONE-449）：外链返回 **HTTP 403** 时一律降级为 warning。
 *     CDN（Cloudflare Pages 等）的 bot 防护会拒绝 CI runner 出口 IP，403 说明站点在线、
 *     只是不许探针访问，不构成「不可达」结论；输出保留站点名与状态码供人眼复核。
 *     真不可达（DNS / 连接失败 / 超时）与 404 仍按上面的分级判 fail。
 *   - 截图不合规 → **硬拦**（error）
 *
 * 校验函数全部是「注入 fetch / 注入目录」的纯逻辑，磁盘与网络都在边界上，便于单测与演练。
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { imageSize } from 'image-size';
import type { ProjectInput } from './project-schema.js';

/** §7 截图规格：webp、宽 ≥1200px、体积 ≤300KB */
export const SCREENSHOT_MIN_WIDTH = 1200;
export const SCREENSHOT_MAX_BYTES = 300 * 1024;
export const SCREENSHOT_REQUIRED_EXT = '.webp';

export const DEFAULT_LINK_TIMEOUT_MS = 8_000;
export const DEFAULT_LINK_CONCURRENCY = 6;
/** CDN bot 防护拒绝 CI 探针时返回的状态码：不判「不可达」，降级为 warning */
export const BOT_PROTECTION_STATUS = 403;
export const DEFAULT_API_BASE = 'https://api.github.com';
const USER_AGENT = 'workerhub-hub-ci (+https://hub.oneboy.app)';

export type CheckName = 'repos' | 'links' | 'screenshots';
export type Severity = 'error' | 'warning';

/** 一条检查结论：硬拦（error）会让 CI 失败，警告（warning）只打印 */
export interface Finding {
  check: CheckName;
  severity: Severity;
  /** 项目 slug（用于日志定位） */
  slug: string;
  /** 数据文件名 */
  file: string;
  /** 出问题的目标：仓库 / 链接 / 截图路径 */
  target: string;
  message: string;
}

/** 校验输入：至少要有 slug 与人工字段 */
export interface CheckTarget {
  slug: string;
  file: string;
  data: ProjectInput;
}

export interface HttpOptions {
  /** 便于测试注入 */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** 额外重试次数（默认 1：瞬时抖动不该误伤投稿者） */
  retries?: number;
  /** GitHub 只读 token（CI 用工作流自带 GITHUB_TOKEN） */
  token?: string;
  apiBase?: string;
}

const errorFinding = (
  check: CheckName,
  target: CheckTarget,
  targetName: string,
  message: string,
): Finding => ({
  check,
  severity: 'error',
  slug: target.slug,
  file: target.file,
  target: targetName,
  message,
});

const warningFinding = (
  check: CheckName,
  target: CheckTarget,
  targetName: string,
  message: string,
): Finding => ({
  check,
  severity: 'warning',
  slug: target.slug,
  file: target.file,
  target: targetName,
  message,
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 带超时与重试的请求；返回响应或抛出最后一次错误 */
async function requestWithRetry(
  url: string,
  init: RequestInit,
  options: HttpOptions,
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_LINK_TIMEOUT_MS;
  const retries = options.retries ?? 1;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(300 * attempt);
    try {
      const response = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      // 5xx 视作可重试的瞬时故障；4xx 是确定性结论
      if (response.status >= 500 && attempt < retries) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ---------------------------------------------------------------------------
// 1. repo 真实存在且为 public（§7）
// ---------------------------------------------------------------------------

export type RepoAccessKind = 'ok' | 'not-found' | 'private' | 'infra';

export interface RepoAccessResult {
  repo: string;
  kind: RepoAccessKind;
  detail: string;
}

/**
 * 核验单个仓库「存在且 public」。
 *
 * - 200 且 `private: false` → ok
 * - 200 且 `private: true`（有 token 时私有库会返回 200）→ private
 * - 404 → not-found（无权限或不存在；两者对投稿者都是同一个结论：必须换成公开仓库）
 * - 其它（网络/超时/限流/5xx/403）→ infra：**同样硬拦**，但提示「无法核验，请重跑 CI」，
 *   因为这项是必检门槛，静默放行等于取消门槛。
 */
export async function checkRepoAccess(
  repo: string,
  options: HttpOptions = {},
): Promise<RepoAccessResult> {
  const apiBase = options.apiBase ?? DEFAULT_API_BASE;
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': USER_AGENT,
  };
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await requestWithRetry(`${apiBase}/repos/${repo}`, { headers }, options);
  } catch (error) {
    return {
      repo,
      kind: 'infra',
      detail: `GitHub API 不可达（${(error as Error).message}），无法核验仓库是否存在且公开，请重跑 CI`,
    };
  }

  if (response.status === 404) {
    return { repo, kind: 'not-found', detail: 'GitHub 返回 404：仓库不存在或不是 public' };
  }
  if (response.status === 403 || response.status === 429) {
    return {
      repo,
      kind: 'infra',
      detail: `GitHub API 拒绝访问（HTTP ${response.status}，可能限流），请重跑 CI`,
    };
  }
  if (!response.ok) {
    return { repo, kind: 'infra', detail: `GitHub API 返回 HTTP ${response.status}，请重跑 CI` };
  }

  let body: { private?: unknown; full_name?: unknown };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    return { repo, kind: 'infra', detail: 'GitHub API 响应无法解析，请重跑 CI' };
  }

  if (body.private === true) {
    return { repo, kind: 'private', detail: '仓库是 private：收录只接受 public 仓库' };
  }
  const resolved = typeof body.full_name === 'string' ? body.full_name : repo;
  return { repo, kind: 'ok', detail: `存在且为 public（${resolved}）` };
}

/** 逐仓库核验（同一 repo 只查一次），返回 findings */
export async function checkRepos(
  targets: CheckTarget[],
  options: HttpOptions = {},
): Promise<Finding[]> {
  const byRepo = new Map<string, CheckTarget[]>();
  for (const target of targets) {
    const list = byRepo.get(target.data.repo) ?? [];
    list.push(target);
    byRepo.set(target.data.repo, list);
  }

  const findings: Finding[] = [];
  for (const [repo, owners] of byRepo) {
    const result = await checkRepoAccess(repo, options);
    if (result.kind === 'ok') continue;
    for (const owner of owners) {
      findings.push(errorFinding('repos', owner, repo, `repo 核验失败：${result.detail}`));
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// 2. 外链可达性（§7）
// ---------------------------------------------------------------------------

export type LinkField = 'homepage' | 'docs_url' | 'deploy.url' | 'deploy.guide_url';

export interface ProjectLink {
  field: LinkField;
  url: string;
}

/** 该项目的全部外链（§7 列举：homepage / docs / deploy url） */
export function collectLinks(data: ProjectInput): ProjectLink[] {
  const links: ProjectLink[] = [];
  if (data.homepage) links.push({ field: 'homepage', url: data.homepage });
  if (data.docs_url) links.push({ field: 'docs_url', url: data.docs_url });
  if (data.deploy.url) links.push({ field: 'deploy.url', url: data.deploy.url });
  if (data.deploy.guide_url) links.push({ field: 'deploy.guide_url', url: data.deploy.guide_url });
  return links;
}

/**
 * 外链失败时的严重级别（§7 原文）：
 * 「失败给 warning 不硬拦（评审人人工确认）；官方项目与演示站链接失败则硬拦」。
 * 即：`source=official` 的任何外链、以及任何项目的 `homepage`（官网/演示站）→ error。
 *
 * 注意：这只是基础分级；HTTP 403（bot 防护）的例外由 `resolveLinkFailureSeverity` 叠加。
 */
export const linkFailureSeverity = (data: ProjectInput, field: LinkField): Severity =>
  data.source === 'official' || field === 'homepage' ? 'error' : 'warning';

export interface LinkProbeResult {
  url: string;
  ok: boolean;
  detail: string;
  /** HTTP 状态码；请求本身失败（DNS / 连接 / 超时）时为 undefined */
  status?: number;
}

/** 是否为 CDN bot 防护产生的 403（站点在线、只是拒绝 CI 探针） */
export const isBotProtectionStatus = (status: number | undefined): boolean =>
  status === BOT_PROTECTION_STATUS;

/**
 * 外链失败后的最终严重级别：§7 基础分级之上叠加 403 例外。
 * 403 → warning（不判 fail），其余状态一律沿用 `linkFailureSeverity`（真不可达 / 404 仍按 §7 判 fail）。
 */
export const resolveLinkFailureSeverity = (
  data: ProjectInput,
  field: LinkField,
  status?: number,
): Severity => (isBotProtectionStatus(status) ? 'warning' : linkFailureSeverity(data, field));

/** 探测单条外链是否可达（2xx/3xx 视为可达；跟随重定向） */
export async function probeUrl(url: string, options: HttpOptions = {}): Promise<LinkProbeResult> {
  const headers: Record<string, string> = {
    accept: 'text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5',
    'user-agent': USER_AGENT,
  };
  let response: Response;
  try {
    response = await requestWithRetry(url, { headers, redirect: 'follow', method: 'GET' }, options);
  } catch (error) {
    return { url, ok: false, detail: `请求失败：${(error as Error).message}` };
  }

  if (response.status >= 200 && response.status < 400) {
    return { url, ok: true, detail: `HTTP ${response.status}`, status: response.status };
  }
  return { url, ok: false, detail: `HTTP ${response.status}`, status: response.status };
}

/** 逐项目逐链接探测（并发受限），按 §7 分级产出 findings */
export async function checkLinks(
  targets: CheckTarget[],
  options: HttpOptions & { concurrency?: number } = {},
): Promise<Finding[]> {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_LINK_CONCURRENCY);
  const jobs: { target: CheckTarget; link: ProjectLink }[] = [];
  for (const target of targets) {
    for (const link of collectLinks(target.data)) jobs.push({ target, link });
  }

  const findings: Finding[] = [];
  for (let index = 0; index < jobs.length; index += concurrency) {
    const batch = jobs.slice(index, index + concurrency);
    const results = await Promise.all(
      batch.map(async ({ target, link }) => {
        const probe = await probeUrl(link.url, options);
        return { target, link, probe };
      }),
    );
    for (const { target, link, probe } of results) {
      if (probe.ok) continue;
      const severity = resolveLinkFailureSeverity(target.data, link.field, probe.status);
      const message = isBotProtectionStatus(probe.status)
        ? `站点 ${target.data.name} 的 ${link.field} 返回 HTTP ${probe.status}（CDN bot 防护拦截 CI 探针，站点在线、不判不可达）：已降级为警告，需人工复核该链接`
        : `外链不可达（${link.field}，${probe.detail}）${
            severity === 'warning' ? '：投稿者可稍后修正，评审人需人工确认链接是否长期失效' : ''
          }`;
      findings.push(
        severity === 'error'
          ? errorFinding('links', target, link.url, message)
          : warningFinding('links', target, link.url, message),
      );
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// 3. 截图规格（§7）
// ---------------------------------------------------------------------------

/** 截图的磁盘路径：数据文件里写路径，这里只取文件名拼到截图目录（§4.1 固定 public/screenshots/） */
export const screenshotFileName = (data: ProjectInput): string => basename(data.screenshot ?? '');

/**
 * 校验已填写 `screenshot` 的项目：
 * - 文件名必须与 slug 一致（`public/screenshots/<slug>.webp`）
 * - 文件必须存在
 * - 必须是 webp（不是改后缀的 png/jpg）
 * - 宽 ≥1200px
 * - 体积 ≤300KB
 * 未填写 `screenshot` 的项目自动走前端回退链（§8.3），这里不报错。
 */
export function checkScreenshots(
  targets: CheckTarget[],
  options: { screenshotsDir: string },
): Finding[] {
  const findings: Finding[] = [];

  for (const target of targets) {
    const { data } = target;
    if (!data.screenshot) continue;

    const fileName = screenshotFileName(data);
    const expected = `${target.slug}${SCREENSHOT_REQUIRED_EXT}`;

    if (fileName !== expected) {
      findings.push(
        errorFinding(
          'screenshots',
          target,
          data.screenshot,
          `截图文件名必须与 slug 一致：应为 public/screenshots/${expected}，实际为 ${fileName}`,
        ),
      );
    }

    const filePath = join(options.screenshotsDir, fileName);
    if (!existsSync(filePath)) {
      findings.push(
        errorFinding(
          'screenshots',
          target,
          data.screenshot,
          `截图文件不存在：${filePath}（若暂不提供截图，请删除数据文件里的 screenshot 字段，前端会自动走回退链）`,
        ),
      );
      continue;
    }

    const bytes = readFileSync(filePath);
    const size = statSync(filePath).size;

    let detected: { width?: number; height?: number; type?: string };
    try {
      detected = imageSize(bytes);
    } catch {
      findings.push(
        errorFinding('screenshots', target, data.screenshot, '截图无法解析：不是有效的图片文件'),
      );
      continue;
    }

    if (detected.type !== 'webp') {
      findings.push(
        errorFinding(
          'screenshots',
          target,
          data.screenshot,
          `截图必须是 webp（检测到 ${detected.type ?? '未知格式'}）；改后缀不算转换`,
        ),
      );
    }

    const width = detected.width ?? 0;
    if (width < SCREENSHOT_MIN_WIDTH) {
      findings.push(
        errorFinding(
          'screenshots',
          target,
          data.screenshot,
          `截图宽度不足：${width}px < ${SCREENSHOT_MIN_WIDTH}px（详情页按 1200px 宽出图）`,
        ),
      );
    }

    if (size > SCREENSHOT_MAX_BYTES) {
      findings.push(
        errorFinding(
          'screenshots',
          target,
          data.screenshot,
          `截图体积超标：${(size / 1024).toFixed(1)}KB > ${SCREENSHOT_MAX_BYTES / 1024}KB（用 cwebp -q 82 -resize 1200 0 压缩）`,
        ),
      );
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// 汇总与输出
// ---------------------------------------------------------------------------

export interface CheckSummary {
  errors: Finding[];
  warnings: Finding[];
}

export function summarize(findings: Finding[]): CheckSummary {
  return {
    errors: findings.filter((finding) => finding.severity === 'error'),
    warnings: findings.filter((finding) => finding.severity === 'warning'),
  };
}

/** 渲染成可直接贴进 CI 日志的文本 */
export function formatFindings(summary: CheckSummary): string {
  const lines: string[] = [];
  for (const finding of summary.errors) {
    lines.push(
      `  ✗ [${finding.check}] ${finding.file}（${finding.slug}）→ ${finding.target}：${finding.message}`,
    );
  }
  for (const finding of summary.warnings) {
    lines.push(
      `  ⚠ [${finding.check}] ${finding.file}（${finding.slug}）→ ${finding.target}：${finding.message}`,
    );
  }
  return lines.join('\n');
}
