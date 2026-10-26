/**
 * 外链健康巡检的单测（SPEC §9.3：只出摘要、连续失败点名、不硬拦、不改数据）。
 * 全部用注入的 fetchImpl，不打真实网络。
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  CHRONIC_FAILURE_THRESHOLD,
  collectProjectLinks,
  emptyLinkHealthState,
  readLinkHealthState,
  runLinkHealth,
  serializeLinkHealthState,
  type LinkSourceProject,
} from '../src/lib/link-health.js';

const TMP_ROOT = join(process.cwd(), 'tests', '.tmp');
const tmpDir = (): string => {
  mkdirSync(TMP_ROOT, { recursive: true });
  return mkdtempSync(join(TMP_ROOT, 'links-'));
};

const project = (slug: string, overrides: Partial<LinkSourceProject['data']> = {}) =>
  ({
    slug,
    data: {
      repo: `WorkerHub/${slug}`,
      homepage: `https://${slug}.oneboy.app`,
      docs_url: `https://github.com/WorkerHub/${slug}#deploy`,
      deploy: {
        url: `https://deploy.workers.cloudflare.com/?url=https://github.com/WorkerHub/${slug}`,
      },
      ...overrides,
    },
  }) satisfies LinkSourceProject;

const fetchStub = (statuses: Record<string, number>, fallback = 200): typeof fetch =>
  (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return new Response(null, { status: statuses[url] ?? fallback });
  }) as typeof fetch;

test('collectProjectLinks 收集仓库入口与数据文件里的全部外链', () => {
  const refs = collectProjectLinks([
    project('enotify'),
    project('waker', { homepage: undefined, docs_url: undefined, deploy: {} }),
  ]);

  assert.deepEqual(
    refs.map((ref) => `${ref.slug}:${ref.field}`),
    ['enotify:repo', 'enotify:homepage', 'enotify:docs_url', 'enotify:deploy.url', 'waker:repo'],
  );
  assert.equal(refs[0]!.url, 'https://github.com/WorkerHub/enotify');
});

test('同一 URL 只检查一次，并合并引用它的项目', async () => {
  const shared = 'https://demo.example.org';
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    calls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  const { report } = await runLinkHealth(
    [
      { slug: 'alpha', field: 'homepage', url: shared },
      { slug: 'beta', field: 'homepage', url: shared },
    ],
    { fetchImpl },
  );

  assert.deepEqual(calls, [shared]);
  assert.equal(report.totals.links, 1);
  assert.deepEqual(report.rows[0]!.slugs, ['alpha', 'beta']);
});

test('连续失败累计到阈值后点名，恢复可达后计数清零', async () => {
  const bad = 'https://broken.example.org';
  const good = 'https://ok.example.org';
  const refs = [
    { slug: 'alpha', field: 'homepage' as const, url: bad },
    { slug: 'beta', field: 'homepage' as const, url: good },
  ];

  const first = await runLinkHealth(refs, {
    fetchImpl: fetchStub({ [bad]: 404 }),
    previous: emptyLinkHealthState(),
  });
  assert.equal(first.report.totals.failed, 1);
  assert.equal(first.report.totals.chronic, 0, '首次失败不点名');
  assert.equal(first.state.links[bad]!.consecutiveFailures, 1);
  assert.equal(first.report.rows.find((row) => row.url === bad)!.chronic, false);

  const second = await runLinkHealth(refs, {
    fetchImpl: fetchStub({ [bad]: 404 }),
    previous: first.state,
  });
  assert.equal(second.state.links[bad]!.consecutiveFailures, CHRONIC_FAILURE_THRESHOLD);
  assert.equal(second.report.totals.chronic, 1);
  assert.deepEqual(second.report.chronicFailures[0]!.slugs, ['alpha']);

  const recovered = await runLinkHealth(refs, {
    fetchImpl: fetchStub({}),
    previous: second.state,
  });
  assert.equal(recovered.state.links[bad]!.consecutiveFailures, 0);
  assert.equal(recovered.report.totals.chronic, 0);
  assert.equal(recovered.report.totals.ok, 2);
  assert.ok(recovered.state.links[bad]!.lastOkAt, '恢复后记录最近可达时间');
});

test('反爬/限流类状态码归入「需人工确认」，不计入连续失败', async () => {
  const limited = 'https://protected.example.org';
  const { report, state } = await runLinkHealth(
    [{ slug: 'alpha', field: 'homepage', url: limited }],
    {
      fetchImpl: fetchStub({ [limited]: 403 }),
      previous: emptyLinkHealthState(),
    },
  );

  assert.equal(report.totals.blocked, 1);
  assert.equal(report.totals.failed, 0);
  assert.equal(report.totals.chronic, 0);
  assert.equal(state.links[limited]!.consecutiveFailures, 0);
  assert.deepEqual(
    report.needsReview.map((item) => item.url),
    [limited],
  );
});

test('网络异常不会让巡检抛错，而是记为失败', async () => {
  const down = 'https://unreachable.example.org';
  const fetchImpl = (async () => {
    throw new Error('ECONNREFUSED');
  }) as typeof fetch;

  const { report } = await runLinkHealth([{ slug: 'alpha', field: 'homepage', url: down }], {
    fetchImpl,
    retries: 0,
  });

  assert.equal(report.totals.failed, 1);
  assert.match(report.rows[0]!.detail, /ECONNREFUSED/);
});

test('状态文件缺失或损坏时按空状态处理并告警，不阻塞巡检', () => {
  const dir = tmpDir();
  const missing = join(dir, 'nope.json');
  const warnings: string[] = [];
  assert.deepEqual(
    readLinkHealthState(missing, (message) => warnings.push(message)),
    {
      schemaVersion: 1,
      links: {},
    },
  );
  assert.equal(warnings.length, 0);

  const corrupt = join(dir, 'corrupt.json');
  writeFileSync(corrupt, '{ not json', 'utf8');
  assert.deepEqual(
    readLinkHealthState(corrupt, (message) => warnings.push(message)),
    {
      schemaVersion: 1,
      links: {},
    },
  );
  assert.equal(warnings.length, 1);
});

test('状态序列化稳定（键排序，便于跨运行比对）', () => {
  const state = {
    schemaVersion: 1 as const,
    links: {
      'https://b.example.org': {
        consecutiveFailures: 2,
        lastOutcome: 'failed' as const,
        lastDetail: 'HTTP 404',
        lastCheckedAt: '2026-10-26T00:00:00.000Z',
        lastOkAt: null,
      },
      'https://a.example.org': {
        consecutiveFailures: 0,
        lastOutcome: 'ok' as const,
        lastDetail: 'HTTP 200',
        lastCheckedAt: '2026-10-26T00:00:00.000Z',
        lastOkAt: '2026-10-26T00:00:00.000Z',
      },
    },
  };

  const text = serializeLinkHealthState(state);
  assert.ok(text.indexOf('a.example.org') < text.indexOf('b.example.org'));
  assert.deepEqual(JSON.parse(text), state);
});
