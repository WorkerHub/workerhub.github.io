#!/usr/bin/env tsx
/**
 * 外链健康巡检 CLI（SPEC §9.3，每日重建时由 deploy 工作流调用）。
 *
 * 用法：`pnpm health:links`
 *
 * 输入：`src/data/projects/*.yaml` 里的全部外链（仓库入口 + homepage / docs_url / deploy url / guide）。
 * 输出：
 *   - `link-health-report.json`（默认，已在 .gitignore）—— 摘要报告，工作流写进 GitHub Actions summary
 *   - `link-health-state.json`（默认，已在 .gitignore）—— 连续失败计数，CI 侧用 actions/cache 持久化
 *
 * 退出码：
 *   0  巡检完成（无论有没有坏链）—— §9.3 只出摘要、不硬拦、不改数据
 *   1  数据文件本身非法（连数据都读不出来，没什么可巡检的）
 *   2  `HUB_LINK_STRICT=1` 且存在连续失败项目（仅供人工本地排查使用，CI 不开启）
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { PROJECTS_DIR } from '../src/lib/build-config.js';
import {
  CHRONIC_FAILURE_THRESHOLD,
  collectProjectLinks,
  readLinkHealthState,
  runLinkHealth,
  serializeLinkHealthState,
} from '../src/lib/link-health.js';
import { loadProjects } from '../src/lib/load-projects.js';

const env = process.env;
const REPORT_PATH = resolve(env.HUB_LINK_REPORT ?? 'link-health-report.json');
const STATE_PATH = resolve(env.HUB_LINK_STATE ?? 'link-health-state.json');
const CONCURRENCY = Number.parseInt(env.HUB_LINK_CONCURRENCY ?? '6', 10);
const THRESHOLD = Number.parseInt(env.HUB_LINK_THRESHOLD ?? String(CHRONIC_FAILURE_THRESHOLD), 10);
const STRICT = env.HUB_LINK_STRICT === '1';

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

const refs = collectProjectLinks(loaded.projects);
const previous = readLinkHealthState(STATE_PATH, warn);
console.log(
  `外链：${refs.length} 条引用 / ${new Set(refs.map((ref) => ref.url)).size} 个唯一 URL；` +
    `上次状态 ${Object.keys(previous.links).length} 条记录（${STATE_PATH}）`,
);

const { state, report } = await runLinkHealth(refs, {
  previous,
  concurrency: Number.isFinite(CONCURRENCY) && CONCURRENCY > 0 ? CONCURRENCY : 6,
  threshold: Number.isFinite(THRESHOLD) && THRESHOLD > 0 ? THRESHOLD : CHRONIC_FAILURE_THRESHOLD,
  warn,
});

mkdirSync(dirname(REPORT_PATH), { recursive: true });
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
mkdirSync(dirname(STATE_PATH), { recursive: true });
writeFileSync(STATE_PATH, serializeLinkHealthState(state), 'utf8');

console.log(
  `链接健康：可达 ${report.totals.ok} / 失败 ${report.totals.failed} / 需人工确认 ${report.totals.blocked}` +
    `（共 ${report.totals.links} 条，连续失败 ${report.totals.chronic} 条，阈值 ${report.threshold} 次）`,
);
for (const failure of report.chronicFailures) {
  console.warn(
    `  ✗ 连续失败 ${failure.consecutiveFailures} 次：${failure.url}（${failure.slugs.join('、')}）${failure.detail}`,
  );
}
for (const row of report.rows.filter((item) => item.outcome === 'failed' && !item.chronic)) {
  console.warn(`  · 本次失败：${row.url}（${row.slugs.join('、')}）${row.detail}`);
}
for (const item of report.needsReview) {
  console.log(`  ? 需人工确认：${item.url}（${item.slugs.join('、')}）${item.detail}`);
}
console.log(`报告：${REPORT_PATH}；状态：${STATE_PATH}`);

if (STRICT && report.chronicFailures.length > 0) {
  console.error('\nHUB_LINK_STRICT=1：存在连续失败项目，按严格模式退出 2');
  process.exit(2);
}
