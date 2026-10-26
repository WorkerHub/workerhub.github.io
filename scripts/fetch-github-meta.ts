#!/usr/bin/env tsx
/**
 * 构建期 GitHub 自动字段抓取（SPEC §9.2）。
 *
 * 流程：校验数据文件 → 逐仓库抓取白名单字段 → 失败回退缓存 → 写回缓存 → 输出构建报告。
 * 顺序由 `pnpm build`（fetch-github-meta.ts && astro build）保证：页面渲染时缓存已是本次结果。
 *
 * 退出码：
 *   0  抓取成功，或抓取失败但已用缓存/空值降级（构建继续）
 *   1  数据文件非法，或仓库 404（不存在/私有）——这是数据错误，必须人工修
 */
import { loadProjects } from '../src/lib/load-projects.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  GITHUB_API_BASE,
  GITHUB_TOKEN,
  META_CACHE_PATH,
  META_REPORT_PATH,
  PROJECTS_DIR,
  SKIP_FETCH,
} from '../src/lib/build-config.js';
import {
  findAnomalies,
  readMetaCache,
  resolveRepoMeta,
  writeMetaCacheIfChanged,
  type RepoOutcome,
} from '../src/lib/github-meta.js';

const warnings: string[] = [];
const warn = (message: string) => {
  warnings.push(message);
  console.warn(`⚠ ${message}`);
};

const loaded = loadProjects(PROJECTS_DIR);
if (!loaded.ok) {
  console.error(loaded.message);
  process.exit(1);
}
console.log(loaded.message);

const repos = [...new Set(loaded.projects.map((project) => project.data.repo))];
const cacheBefore = readMetaCache(META_CACHE_PATH, warn);

const { cache, outcomes, dataErrors } = await resolveRepoMeta(repos, {
  cache: cacheBefore,
  token: GITHUB_TOKEN,
  apiBase: GITHUB_API_BASE,
  skipFetch: SKIP_FETCH,
  warn,
});

const cacheChanged = writeMetaCacheIfChanged(META_CACHE_PATH, cache);
const anomalies = findAnomalies(repos, cache);

const outcomeOf = (repo: string): RepoOutcome | undefined =>
  outcomes.find((outcome) => outcome.repo === repo);

const report = {
  generatedAt: new Date().toISOString(),
  apiBase: GITHUB_API_BASE,
  authenticated: Boolean(GITHUB_TOKEN),
  fetchSkipped: SKIP_FETCH,
  cachePath: META_CACHE_PATH,
  cacheChanged,
  counts: {
    repos: repos.length,
    fetched: outcomes.filter((o) => o.status === 'ok').length,
    fromCache: outcomes.filter((o) => o.status === 'cached').length,
    degradedToEmpty: outcomes.filter((o) => o.status === 'empty').length,
    dataErrors: dataErrors.length,
  },
  projects: loaded.projects.map((project) => {
    const outcome = outcomeOf(project.data.repo);
    return {
      slug: project.slug,
      repo: project.data.repo,
      metaStatus: outcome?.status ?? 'empty',
      metaReason: outcome?.reason ?? null,
      stars: outcome?.meta.stargazersCount ?? null,
      pushedAt: outcome?.meta.pushedAt ?? null,
      archived: outcome?.meta.archived ?? null,
    };
  }),
  anomalies,
  warnings,
};

mkdirSync(dirname(META_REPORT_PATH), { recursive: true });
writeFileSync(META_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(
  `GitHub 自动字段：抓取成功 ${report.counts.fetched} / 缓存兜底 ${report.counts.fromCache} / 降级置空 ${report.counts.degradedToEmpty}（共 ${report.counts.repos} 个仓库）`,
);
console.log(`缓存文件：${META_CACHE_PATH}${cacheChanged ? '（已更新）' : '（无变化）'}`);
console.log(`构建报告：${META_REPORT_PATH}`);
if (anomalies.length > 0) {
  console.log(`异常项目（archive / 超过 365 天未更新）：${anomalies.length} 个`);
  for (const anomaly of anomalies) {
    console.log(`  - ${anomaly.repo}：${anomaly.reasons.join('；')}`);
  }
}

if (dataErrors.length > 0) {
  console.error('\n以下仓库在 GitHub 上不存在或为私有（§7 要求 CI 失败）：');
  for (const error of dataErrors) {
    console.error(`  ✗ ${error.repo}：${error.message}`);
  }
  process.exit(1);
}
