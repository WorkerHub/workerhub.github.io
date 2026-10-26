#!/usr/bin/env tsx
/**
 * 构建摘要 CLI（SPEC §9.2 / §9.3 / §12 第 7 条）。
 *
 * 由 deploy 工作流的 `summary` job 调用：把抓取报告 + 链接健康报告 + 两侧发布结果渲染成
 * Markdown，写进 GitHub Actions summary（`$GITHUB_STEP_SUMMARY`）并落一份 `build-summary.md`。
 *
 * 输入（环境变量）：
 *   HUB_META_REPORT        抓取报告路径（默认 github-meta-report.json）
 *   HUB_LINK_REPORT        链接健康报告路径（默认 link-health-report.json）
 *   HUB_LINK_EXPECTED      置 1 表示本次应跑过链接巡检（每日重建 / 演练）
 *   HUB_SUMMARY_PATH       摘要落盘路径（默认 build-summary.md）
 *   HUB_VERSION            版本号（由 build job 的 git describe 输出注入，与页脚一致）
 *   PUBLISH_GITHUB_PAGES_RESULT / PUBLISH_CLOUDFLARE_RESULT   两侧 job 的 result
 *   PUBLISH_GITHUB_PAGES_DETAIL / PUBLISH_CLOUDFLARE_DETAIL   两侧补充说明（可选）
 *   PUBLISH_DRY_RUN        演练模式
 *   PUBLISH_SIMULATE_FAILURE  演练注入的失败侧
 *
 * 退出码恒为 0：摘要步骤本身不该改变两侧的成败结论。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { getBuildInfo } from '../src/lib/build-info.js';
import {
  describePublishOutcome,
  parseLinkHealthReport,
  parseMetaReport,
  renderBuildSummary,
  type BuildSummaryContext,
  type PublishOutcome,
  type PublishSide,
} from '../src/lib/build-summary.js';

const env = process.env;
const META_REPORT_PATH = resolve(env.HUB_META_REPORT ?? 'github-meta-report.json');
const LINK_REPORT_PATH = resolve(env.HUB_LINK_REPORT ?? 'link-health-report.json');
const SUMMARY_PATH = resolve(env.HUB_SUMMARY_PATH ?? 'build-summary.md');
const LINKS_EXPECTED = env.HUB_LINK_EXPECTED === '1';

const readJson = (path: string): unknown => {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.warn(`⚠ 报告文件无法解析（${path}）：${(error as Error).message}`);
    return null;
  }
};

const runUrl =
  env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
    ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
    : undefined;

const context: BuildSummaryContext = {
  event: env.GITHUB_EVENT_NAME ?? 'local',
  ref: env.GITHUB_REF_NAME ?? 'local',
  sha: env.GITHUB_SHA ?? '0000000000000000000000000000000000000000',
  version: getBuildInfo().version,
  generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
  dryRun: env.PUBLISH_DRY_RUN === 'true',
  simulateFailure: env.PUBLISH_SIMULATE_FAILURE ?? 'none',
  runUrl,
};

const publishing: PublishOutcome[] = (
  [
    ['github-pages', 'PUBLISH_GITHUB_PAGES'],
    ['cloudflare-pages', 'PUBLISH_CLOUDFLARE'],
  ] as [PublishSide, string][]
).map(([side, prefix]) => {
  const result = env[`${prefix}_RESULT`] ?? 'skipped';
  return {
    side,
    result,
    detail:
      env[`${prefix}_DETAIL`] ??
      describePublishOutcome(side, result, {
        dryRun: context.dryRun,
        simulateFailure: context.simulateFailure,
      }),
  };
});

const summary = renderBuildSummary({
  context,
  meta: parseMetaReport(readJson(META_REPORT_PATH)),
  links: parseLinkHealthReport(readJson(LINK_REPORT_PATH)),
  linksExpected: LINKS_EXPECTED,
  publishing,
});

mkdirSync(dirname(SUMMARY_PATH), { recursive: true });
writeFileSync(SUMMARY_PATH, summary, 'utf8');
console.log(summary);

if (env.GITHUB_STEP_SUMMARY) {
  writeFileSync(env.GITHUB_STEP_SUMMARY, `${summary}\n`, { flag: 'a' });
  console.log(`摘要已写入 ${env.GITHUB_STEP_SUMMARY}`);
}
console.log(`摘要文件：${SUMMARY_PATH}`);
