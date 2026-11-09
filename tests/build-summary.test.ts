/**
 * 构建摘要渲染的单测（SPEC §9.2 / §9.3 / §12 第 7 条）：
 * 摘要必须含自动字段刷新结果、异常项目清单、连续失败点名、两侧独立发布结果。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  describePublishOutcome,
  parseLinkHealthReport,
  parseMetaReport,
  renderBuildSummary,
  type BuildSummaryContext,
  type MetaReport,
} from '../src/lib/build-summary.js';
import type { LinkHealthReport } from '../src/lib/link-health.js';
import { SITE } from '../src/lib/site.js';

/** 期望的部署线标签从真源拼出（不在测试里写第二份域名） */
const CANONICAL_HOST = new URL(SITE.url).host;
const GITHUB_PAGES_LABEL = `GitHub Pages 主站（${CANONICAL_HOST}）`;
const CLOUDFLARE_PAGES_LABEL = 'Cloudflare Pages 副线';

const context: BuildSummaryContext = {
  event: 'schedule',
  ref: 'main',
  sha: 'abcdef1234567890abcdef1234567890abcdef12',
  version: 'v1.0.0-3-gabcdef1',
  generatedAt: '2026-10-27 03:17',
  dryRun: false,
  simulateFailure: 'none',
  runUrl: 'https://github.com/WorkerHub/workerhub.github.io/actions/runs/1',
};

const meta: MetaReport = {
  generatedAt: '2026-10-27T03:17:00.000Z',
  apiBase: 'https://api.github.com',
  authenticated: true,
  fetchSkipped: false,
  cachePath: 'src/data/cache/github-meta.json',
  cacheChanged: true,
  counts: { repos: 11, fetched: 9, fromCache: 2, degradedToEmpty: 0, dataErrors: 0 },
  projects: [
    {
      slug: 'enotify',
      repo: 'WorkerHub/enotify',
      metaStatus: 'ok',
      metaReason: null,
      stars: 120,
      pushedAt: '2026-10-20T00:00:00Z',
      archived: false,
    },
    {
      slug: 'cloud-mail',
      repo: 'maillab/cloud-mail',
      metaStatus: 'cached',
      metaReason: 'GitHub API 限流（403，remaining=0）',
      stars: 14954,
      pushedAt: '2026-10-01T00:00:00Z',
      archived: false,
    },
  ],
  anomalies: [{ repo: 'maillab/cloud-mail', reasons: ['超过 365 天未更新（400 天）'] }],
  warnings: ['maillab/cloud-mail 自动字段抓取失败（rate-limited）'],
};

const links: LinkHealthReport = {
  generatedAt: '2026-10-27T03:18:00.000Z',
  threshold: 2,
  totals: { links: 4, ok: 3, failed: 1, blocked: 0, chronic: 1 },
  rows: [
    {
      url: 'https://zeta.oneboy.app',
      field: 'docs_url',
      slugs: ['zeta'],
      outcome: 'failed',
      status: 502,
      detail: 'HTTP 502',
      consecutiveFailures: 3,
      chronic: true,
    },
  ],
  chronicFailures: [
    {
      url: 'https://zeta.oneboy.app',
      slugs: ['zeta'],
      consecutiveFailures: 3,
      detail: 'HTTP 502',
    },
  ],
  needsReview: [],
};

test('摘要含自动字段刷新结果与异常项目清单（§12 第 7 条）', () => {
  const summary = renderBuildSummary({
    context,
    meta,
    links,
    linksExpected: true,
    publishing: [
      { side: 'github-pages', result: 'success', detail: '已发布主站' },
      { side: 'cloudflare-pages', result: 'success', detail: 'deploy hook 已触发（HTTP 200）' },
    ],
  });

  assert.match(summary, /## 双线重建摘要/);
  assert.match(summary, /自动字段刷新结果/);
  assert.match(summary, /抓取成功 \*\*9\*\*；缓存兜底 \*\*2\*\*/);
  assert.match(summary, /异常项目清单/);
  assert.match(summary, /maillab\/cloud-mail/);
  assert.match(summary, /超过 365 天未更新（400 天）/);
  assert.match(summary, /连续失败点名/);
  assert.match(summary, /zeta/);
  assert.match(summary, /本次有变化/);
});

test('一侧失败时摘要逐侧标注并声明独立报错', () => {
  const summary = renderBuildSummary({
    context: { ...context, dryRun: true, simulateFailure: 'pages' },
    meta,
    links,
    linksExpected: true,
    publishing: [
      { side: 'github-pages', result: 'failure', detail: '演练注入失败' },
      { side: 'cloudflare-pages', result: 'success', detail: '演练：模拟触发成功' },
    ],
  });

  assert.ok(
    summary.includes(`${GITHUB_PAGES_LABEL} | ❌ 失败`),
    '摘要应把 GitHub Pages 标为主站（canonical）',
  );
  assert.ok(
    summary.includes(`${CLOUDFLARE_PAGES_LABEL} | ✅ 成功`),
    '摘要应把 Cloudflare 标为副线',
  );
  assert.match(summary, /双线发布：GitHub Pages 主站 \+ Cloudflare Pages 副线/);
  assert.match(summary, /独立报错/);
  assert.match(summary, /未调用 GitHub Pages 发布动作、未调用 Cloudflare deploy hook/);
});

test('报告缺失时摘要降级说明，不抛错', () => {
  const summary = renderBuildSummary({
    context,
    meta: null,
    links: null,
    linksExpected: false,
    publishing: [],
  });

  assert.match(summary, /未取得自动字段抓取报告/);
  assert.match(summary, /本次不是每日重建，未跑外链巡检/);
  assert.match(summary, /未取得发布结果/);
});

test('报告解析对损坏/异构输入返回 null', () => {
  assert.equal(parseMetaReport(null), null);
  assert.equal(parseMetaReport({ generatedAt: 'x' }), null);
  assert.equal(parseLinkHealthReport({ rows: [] }), null);
  assert.ok(parseMetaReport(meta));
  assert.ok(parseLinkHealthReport(links));
});

test('describePublishOutcome 区分演练注入失败与真实发布失败', () => {
  const drill = { dryRun: true, simulateFailure: 'pages' };
  assert.match(describePublishOutcome('github-pages', 'failure', drill), /演练注入失败/);
  assert.match(describePublishOutcome('cloudflare-pages', 'success', drill), /模拟发布成功/);

  const real = { dryRun: false, simulateFailure: 'none' };
  assert.match(describePublishOutcome('github-pages', 'success', real), /已发布/);
  assert.match(describePublishOutcome('github-pages', 'failure', real), /发布失败/);
  assert.match(describePublishOutcome('cloudflare-pages', 'skipped', real), /未执行/);
});
