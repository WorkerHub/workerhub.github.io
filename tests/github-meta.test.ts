/**
 * GitHub 自动字段抓取与缓存降级的单测（SPEC §9.2 硬性容错路径）。
 * 全部用注入的 fetchImpl，不打真实网络。
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  emptyCache,
  emptyRepoMeta,
  findAnomalies,
  readMetaCache,
  resolveRepoMeta,
  serializeMetaCache,
  writeMetaCacheIfChanged,
  type MetaCache,
} from '../src/lib/github-meta.js';

const TMP_ROOT = join(process.cwd(), 'tests', '.tmp');
const tmpDir = (): string => {
  mkdirSync(TMP_ROOT, { recursive: true });
  return mkdtempSync(join(TMP_ROOT, 'meta-'));
};

const jsonResponse = (
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

const repoJson = {
  stargazers_count: 1234,
  forks_count: 56,
  language: 'TypeScript',
  license: { spdx_id: 'MIT' },
  pushed_at: '2026-10-20T00:00:00Z',
  archived: false,
};

const releaseJson = { tag_name: 'v1.2.3', published_at: '2026-10-19T00:00:00Z' };

/** 按 URL 分派的 fetch 桩 */
const okFetch =
  (options: { releaseStatus?: number } = {}): typeof fetch =>
  async (input) => {
    const url = String(input);
    if (url.endsWith('/releases/latest')) {
      return options.releaseStatus === 404
        ? jsonResponse({ message: 'Not Found' }, { status: 404 })
        : jsonResponse(releaseJson);
    }
    return jsonResponse(repoJson);
  };

const failingFetch: typeof fetch = async () => {
  throw new TypeError('fetch failed');
};

const statusFetch =
  (status: number, headers: Record<string, string> = {}): typeof fetch =>
  async () =>
    jsonResponse({ message: 'nope' }, { status, headers });

const cachedMeta = (overrides: Partial<ReturnType<typeof emptyRepoMeta>> = {}) => ({
  ...emptyRepoMeta('2026-10-01T00:00:00.000Z'),
  stargazersCount: 999,
  language: 'Go',
  ...overrides,
});

test('抓取成功时写入缓存并返回 ok', async () => {
  const { cache, outcomes, dataErrors } = await resolveRepoMeta(['example-org/demo'], {
    cache: emptyCache(),
    fetchImpl: okFetch(),
  });

  assert.equal(dataErrors.length, 0);
  assert.equal(outcomes[0]!.status, 'ok');
  assert.equal(outcomes[0]!.meta.stargazersCount, 1234);
  assert.equal(outcomes[0]!.meta.license, 'MIT');
  assert.equal(outcomes[0]!.meta.latestRelease?.tag, 'v1.2.3');
  assert.match(outcomes[0]!.meta.openGraphImage ?? '', /opengraph\.githubassets\.com/);
  assert.equal(cache.repos['example-org/demo']!.stargazersCount, 1234);
});

test('仓库没有 release（404）不算失败，latestRelease 为 null', async () => {
  const { outcomes, dataErrors } = await resolveRepoMeta(['example-org/demo'], {
    cache: emptyCache(),
    fetchImpl: okFetch({ releaseStatus: 404 }),
  });
  assert.equal(dataErrors.length, 0);
  assert.equal(outcomes[0]!.status, 'ok');
  assert.equal(outcomes[0]!.meta.latestRelease, null);
  assert.equal(outcomes[0]!.meta.stargazersCount, 1234);
});

test('§9.2 抓取失败但缓存存在 → 用缓存兜底，不失败', async () => {
  const cache: MetaCache = {
    schemaVersion: 1,
    repos: { 'example-org/demo': cachedMeta() },
  };
  const warnings: string[] = [];
  const { outcomes, dataErrors } = await resolveRepoMeta(['example-org/demo'], {
    cache,
    fetchImpl: failingFetch,
    warn: (message) => warnings.push(message),
  });

  assert.equal(dataErrors.length, 0);
  assert.equal(outcomes[0]!.status, 'cached');
  assert.equal(outcomes[0]!.meta.stargazersCount, 999);
  assert.equal(warnings.length, 1);
});

test('§9.2 抓取失败且无缓存 → 自动字段置空，不失败', async () => {
  const { outcomes, cache, dataErrors } = await resolveRepoMeta(['example-org/demo'], {
    cache: emptyCache(),
    fetchImpl: failingFetch,
  });

  assert.equal(dataErrors.length, 0);
  assert.equal(outcomes[0]!.status, 'empty');
  assert.equal(outcomes[0]!.meta.stargazersCount, null);
  assert.equal(cache.repos['example-org/demo'], undefined);
});

test('§9.2 限流（403 + remaining=0）按基础设施故障降级', async () => {
  const { outcomes, dataErrors } = await resolveRepoMeta(['example-org/demo'], {
    cache: emptyCache(),
    fetchImpl: statusFetch(403, { 'x-ratelimit-remaining': '0' }),
  });
  assert.equal(dataErrors.length, 0);
  assert.equal(outcomes[0]!.status, 'empty');
});

test('§7 仓库 404（不存在或私有）判为数据错误，交给调用方失败构建', async () => {
  const { outcomes, dataErrors } = await resolveRepoMeta(['example-org/missing'], {
    cache: { schemaVersion: 1, repos: { 'example-org/missing': cachedMeta() } },
    fetchImpl: statusFetch(404),
  });
  assert.equal(dataErrors.length, 1);
  assert.equal(dataErrors[0]!.repo, 'example-org/missing');
  assert.equal(outcomes[0]!.status, 'empty');
});

test('HUB_SKIP_FETCH 关闭抓取时：有缓存走缓存、无缓存置空', async () => {
  const { outcomes, dataErrors } = await resolveRepoMeta(['example-org/demo', 'example-org/none'], {
    cache: { schemaVersion: 1, repos: { 'example-org/demo': cachedMeta() } },
    skipFetch: true,
    fetchImpl: failingFetch,
  });
  assert.equal(dataErrors.length, 0);
  assert.deepEqual(
    outcomes.map((outcome) => [outcome.repo, outcome.status]),
    [
      ['example-org/demo', 'cached'],
      ['example-org/none', 'empty'],
    ],
  );
});

test('重复 repo 只抓一次', async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async (input) => {
    calls += 1;
    return okFetch()(input, {});
  };
  await resolveRepoMeta(['example-org/demo', 'example-org/demo'], {
    cache: emptyCache(),
    fetchImpl,
  });
  // 一次 repo + 一次 releases/latest
  assert.equal(calls, 2);
});

test('缓存序列化稳定：键排序且内容不变时不重复写盘', () => {
  const dir = tmpDir();
  const path = join(dir, 'github-meta.json');
  const cache: MetaCache = {
    schemaVersion: 1,
    repos: {
      'z-org/z': cachedMeta({ stargazersCount: 1 }),
      'a-org/a': cachedMeta({ stargazersCount: 2 }),
    },
  };

  assert.equal(writeMetaCacheIfChanged(path, cache), true);
  const first = readFileSync(path, 'utf8');
  assert.ok(first.indexOf('a-org/a') < first.indexOf('z-org/z'), '缓存键应排序');
  assert.equal(writeMetaCacheIfChanged(path, cache), false);
  assert.equal(readFileSync(path, 'utf8'), first);
  assert.equal(serializeMetaCache(cache), first);

  rmSync(dir, { recursive: true, force: true });
});

test('缓存文件缺失 → 空缓存；损坏 → 警告后按空缓存处理', () => {
  const dir = tmpDir();
  const missing = readMetaCache(join(dir, 'nope.json'));
  assert.deepEqual(missing, emptyCache());

  const brokenPath = join(dir, 'broken.json');
  writeFileSync(brokenPath, '{ not json');
  const warnings: string[] = [];
  const broken = readMetaCache(brokenPath, (message) => warnings.push(message));
  assert.deepEqual(broken, emptyCache());
  assert.equal(warnings.length, 1);

  const wrongShapePath = join(dir, 'wrong.json');
  writeFileSync(wrongShapePath, JSON.stringify({ schemaVersion: 99 }));
  assert.deepEqual(readMetaCache(wrongShapePath), emptyCache());

  rmSync(dir, { recursive: true, force: true });
});

test('§6.3 archive 与超过 12 个月未更新的异常清单', () => {
  const now = new Date('2026-10-26T00:00:00Z');
  const cache: MetaCache = {
    schemaVersion: 1,
    repos: {
      'org/archived': cachedMeta({ archived: true, pushedAt: '2026-10-25T00:00:00Z' }),
      'org/stale': cachedMeta({ pushedAt: '2024-01-01T00:00:00Z' }),
      'org/fresh': cachedMeta({ pushedAt: '2026-10-25T00:00:00Z' }),
      'org/unknown': cachedMeta({ pushedAt: null }),
    },
  };

  const anomalies = findAnomalies(
    ['org/archived', 'org/stale', 'org/fresh', 'org/unknown'],
    cache,
    now,
  );
  assert.deepEqual(
    anomalies.map((anomaly) => anomaly.repo),
    ['org/archived', 'org/stale'],
  );
  assert.match(anomalies[0]!.reasons.join(), /archive/);
  assert.match(anomalies[1]!.reasons.join(), /365 天/);
});
