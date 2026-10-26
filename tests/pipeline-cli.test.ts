/**
 * 管线集成测试（真实进程，覆盖 SPEC §12 验收 1、3 与 §7 仓库核验）：
 *   1. 非法数据 → 校验脚本与完整构建都必须非零退出并点名字段
 *   2. GitHub API 不可达 → 构建仍成功，自动字段走缓存或留空
 *   3. 仓库不存在/私有 → 判为数据错误，非零退出
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOT = process.cwd();
const TMP_ROOT = join(ROOT, 'tests', '.tmp');
const UNREACHABLE_API = 'http://127.0.0.1:9';

const tmpDir = (): string => {
  mkdirSync(TMP_ROOT, { recursive: true });
  return mkdtempSync(join(TMP_ROOT, 'run-'));
};

interface RunResult {
  status: number | null;
  output: string;
}

const runTsx = (script: string, env: Record<string, string>): RunResult => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env, GITHUB_TOKEN: env.GITHUB_TOKEN ?? '' },
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};

const runAstroBuild = (env: Record<string, string>): RunResult => {
  const result = spawnSync(join(ROOT, 'node_modules', '.bin', 'astro'), ['build'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};

/** 造一份非法数据目录：category 枚举非法 + difficulty 越界 */
const makeBadProjectsDir = (): string => {
  const dir = join(tmpDir(), 'bad-projects');
  cpSync(
    join(ROOT, 'tests', 'fixtures', 'projects', 'example-listed.yaml'),
    join(dir, 'bad-one.yaml'),
    {
      recursive: false,
    },
  );
  const path = join(dir, 'bad-one.yaml');
  const fixed = readFileSync(path, 'utf8')
    .replace('slug: example-listed', 'slug: bad-one')
    .replace('category: devops', 'category: not-a-category')
    .replace('difficulty: 1', 'difficulty: 9');
  writeFileSync(path, fixed);
  return dir;
};

const RUN_FIXTURES = join(ROOT, 'tests', 'fixtures', 'projects-run');

test('§12-1 非法数据：校验脚本非零退出并点名字段', () => {
  const result = runTsx('scripts/validate-data.ts', { HUB_PROJECTS_DIR: makeBadProjectsDir() });
  assert.equal(result.status, 1);
  assert.match(result.output, /bad-one\.yaml/);
  assert.match(result.output, /字段 category/);
  assert.match(result.output, /字段 difficulty/);
});

test('§12-1 非法数据：完整构建（含 Astro Content Collections 层）同样失败并点名字段', () => {
  const result = runAstroBuild({ HUB_PROJECTS_DIR: makeBadProjectsDir() });
  assert.equal(result.status, 1);
  assert.match(result.output, /category/);
  assert.match(result.output, /InvalidContentEntryDataError|Invalid option/);
});

test('合法夹具数据：校验脚本退出 0', () => {
  const result = runTsx('scripts/validate-data.ts', {
    HUB_PROJECTS_DIR: join(ROOT, 'tests', 'fixtures', 'projects'),
  });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /校验通过：3 个项目/);
});

test('§12-3 演练：GitHub API 不可达 + 无缓存 → 自动字段置空，构建脚本退出 0', () => {
  const dir = tmpDir();
  const cachePath = join(dir, 'github-meta.json');
  const reportPath = join(dir, 'report.json');

  const result = runTsx('scripts/fetch-github-meta.ts', {
    HUB_PROJECTS_DIR: RUN_FIXTURES,
    HUB_META_CACHE: cachePath,
    HUB_META_REPORT: reportPath,
    GITHUB_API_BASE: UNREACHABLE_API,
  });

  assert.equal(result.status, 0, result.output);
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  assert.equal(report.counts.repos, 2);
  assert.equal(report.counts.degradedToEmpty, 2);
  assert.equal(report.counts.dataErrors, 0);
  assert.ok(report.projects.every((project: { stars: number | null }) => project.stars === null));
});

test('§12-3 演练：GitHub API 不可达 + 有缓存 → 走缓存兜底，缓存不被清空', () => {
  const dir = tmpDir();
  const cachePath = join(dir, 'github-meta.json');
  const reportPath = join(dir, 'report.json');

  const seeded = {
    schemaVersion: 1,
    repos: {
      'cloudflare/workers-sdk': {
        stargazersCount: 4663,
        forksCount: 1616,
        language: 'TypeScript',
        license: 'Apache-2.0',
        pushedAt: '2026-10-25T14:30:33Z',
        archived: false,
        latestRelease: { tag: 'v1.0.0', publishedAt: '2026-10-23T07:25:28Z' },
        openGraphImage: 'https://opengraph.githubassets.com/1/cloudflare/workers-sdk',
        fetchedAt: '2026-10-01T00:00:00.000Z',
      },
      'maillab/cloud-mail': {
        stargazersCount: 14955,
        forksCount: 22784,
        language: 'JavaScript',
        license: 'MIT',
        pushedAt: '2026-10-25T18:37:03Z',
        archived: false,
        latestRelease: { tag: 'v3.4.0', publishedAt: '2026-10-23T07:23:07Z' },
        openGraphImage: 'https://opengraph.githubassets.com/1/maillab/cloud-mail',
        fetchedAt: '2026-10-01T00:00:00.000Z',
      },
    },
  };
  writeFileSync(cachePath, `${JSON.stringify(seeded, null, 2)}\n`);

  const result = runTsx('scripts/fetch-github-meta.ts', {
    HUB_PROJECTS_DIR: RUN_FIXTURES,
    HUB_META_CACHE: cachePath,
    HUB_META_REPORT: reportPath,
    GITHUB_API_BASE: UNREACHABLE_API,
  });

  assert.equal(result.status, 0, result.output);
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  assert.equal(report.counts.fromCache, 2);
  assert.equal(report.counts.degradedToEmpty, 0);
  assert.equal(report.cacheChanged, false);
  const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
  assert.equal(cache.repos['cloudflare/workers-sdk'].stargazersCount, 4663);
});

test(
  '§7 仓库不存在（404）→ 判为数据错误，脚本非零退出',
  {
    skip:
      !process.env.GITHUB_TOKEN && process.env.HUB_TEST_NETWORK !== '1'
        ? '需要网络与 GITHUB_TOKEN（或 HUB_TEST_NETWORK=1）才跑真实 GitHub API 核验'
        : false,
  },
  () => {
    const dir = join(tmpDir(), 'missing-repo');
    mkdirSync(dir, { recursive: true });
    cpSync(join(RUN_FIXTURES, 'workers-sdk.yaml'), join(dir, 'workers-sdk.yaml'));
    const path = join(dir, 'workers-sdk.yaml');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace(
        'cloudflare/workers-sdk',
        'WorkerHub/definitely-not-a-real-repo-xyz',
      ),
    );

    const result = runTsx('scripts/fetch-github-meta.ts', {
      HUB_PROJECTS_DIR: dir,
      HUB_META_CACHE: join(dir, 'cache.json'),
      HUB_META_REPORT: join(dir, 'report.json'),
    });

    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /不存在或为私有/);
  },
);
