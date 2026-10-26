/**
 * 投稿校验逻辑单测（SPEC §7）：repo 核验 / 外链可达性与分级 / 截图规格。
 * 网络一律用注入的 fetchImpl，不打真实网络；截图用仓库内夹具文件。
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { projectSchema, type ProjectInput } from '../src/lib/project-schema.js';
import {
  SCREENSHOT_MAX_BYTES,
  checkLinks,
  checkRepoAccess,
  checkRepos,
  checkScreenshots,
  collectLinks,
  formatFindings,
  linkFailureSeverity,
  probeUrl,
  screenshotFileName,
  summarize,
  type CheckTarget,
} from '../src/lib/submission-checks.js';

const SCREENSHOTS_DIR = join(process.cwd(), 'tests', 'fixtures', 'screenshots');

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const baseProject = (overrides: Record<string, unknown> = {}): ProjectInput =>
  projectSchema.parse({
    slug: 'demo-project',
    name: 'Demo Project',
    repo: 'maillab/cloud-mail',
    source: 'third-party',
    tagline_zh: '中文一句话介绍用于校验流程是否合法',
    description_zh: '第一条说明句。第二条说明句。',
    features: ['特性一', '特性二', '特性三'],
    tags: ['demo'],
    category: 'email',
    deploy: { method: 'wrangler' },
    resources: ['d1'],
    difficulty: 2,
    free_tier: 'yes',
    tier: 'listed',
    added_at: '2026-10-26',
    ...overrides,
  });

const target = (overrides: Record<string, unknown> = {}): CheckTarget => ({
  slug: String(overrides.slug ?? 'demo-project'),
  file: `${String(overrides.slug ?? 'demo-project')}.yaml`,
  data: baseProject(overrides),
});

// ---------------------------------------------------------------------------
// repo 核验
// ---------------------------------------------------------------------------

test('§7 public 仓库 → ok', async () => {
  const result = await checkRepoAccess('maillab/cloud-mail', {
    fetchImpl: async () => jsonResponse({ full_name: 'maillab/cloud-mail', private: false }),
  });
  assert.equal(result.kind, 'ok');
  assert.match(result.detail, /public/);
});

test('§7 私有仓库（有 token 时返回 200 + private:true）→ private', async () => {
  const result = await checkRepoAccess('someone/private-repo', {
    fetchImpl: async () => jsonResponse({ full_name: 'someone/private-repo', private: true }),
  });
  assert.equal(result.kind, 'private');
  assert.match(result.detail, /private/);
});

test('§7 仓库不存在（404）→ not-found', async () => {
  const result = await checkRepoAccess('WorkerHub/no-such-repo', {
    fetchImpl: async () => jsonResponse({ message: 'Not Found' }, 404),
  });
  assert.equal(result.kind, 'not-found');
  assert.match(result.detail, /404/);
});

test('§7 GitHub API 不可达 → infra（无法核验也要硬拦，提示重跑）', async () => {
  const result = await checkRepoAccess('maillab/cloud-mail', {
    retries: 0,
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
  });
  assert.equal(result.kind, 'infra');
  assert.match(result.detail, /重跑 CI/);
});

test('§7 限流（403）→ infra，不误判成仓库不存在', async () => {
  const result = await checkRepoAccess('maillab/cloud-mail', {
    fetchImpl: async () => jsonResponse({ message: 'rate limited' }, 403),
  });
  assert.equal(result.kind, 'infra');
  assert.match(result.detail, /403/);
});

test('瞬时 5xx 会重试一次后成功', async () => {
  let calls = 0;
  const result = await checkRepoAccess('maillab/cloud-mail', {
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse({ message: 'boom' }, 502)
        : jsonResponse({ full_name: 'maillab/cloud-mail', private: false });
    },
  });
  assert.equal(result.kind, 'ok');
  assert.equal(calls, 2);
});

test('§7 同一 repo 只查一次，错误按条目分别报告', async () => {
  let calls = 0;
  const findings = await checkRepos(
    [
      target({ slug: 'one', repo: 'WorkerHub/missing' }),
      target({ slug: 'two', repo: 'WorkerHub/missing' }),
    ],
    {
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({ message: 'Not Found' }, 404);
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(findings.length, 2);
  assert.ok(findings.every((finding) => finding.severity === 'error'));
  assert.ok(findings.every((finding) => finding.check === 'repos'));
});

test('repo 全部通过时不产出 findings', async () => {
  const findings = await checkRepos([target()], {
    fetchImpl: async () => jsonResponse({ full_name: 'maillab/cloud-mail', private: false }),
  });
  assert.deepEqual(findings, []);
});

// ---------------------------------------------------------------------------
// 外链可达性与严重级别
// ---------------------------------------------------------------------------

test('§7 外链分级：官方项目全部硬拦、任何项目的演示站（homepage）硬拦、其余仅警告', () => {
  const thirdParty = baseProject();
  assert.equal(linkFailureSeverity(thirdParty, 'docs_url'), 'warning');
  assert.equal(linkFailureSeverity(thirdParty, 'deploy.url'), 'warning');
  assert.equal(linkFailureSeverity(thirdParty, 'deploy.guide_url'), 'warning');
  assert.equal(linkFailureSeverity(thirdParty, 'homepage'), 'error');

  const official = baseProject({
    source: 'official',
    repo: 'WorkerHub/eNotify',
    tier: 'official',
  });
  assert.equal(linkFailureSeverity(official, 'docs_url'), 'error');
  assert.equal(linkFailureSeverity(official, 'homepage'), 'error');
});

test('§7 只收集实际填写的字段（含 deploy.url / guide_url）', () => {
  const links = collectLinks(
    baseProject({
      homepage: 'https://example.com',
      docs_url: 'https://example.com/docs',
      deploy: {
        method: 'deploy-button',
        url: 'https://deploy.workers.cloudflare.com/?url=https://github.com/a/b',
        guide_url: 'https://example.com/guide',
      },
    }),
  );
  assert.deepEqual(
    links.map((link) => link.field),
    ['homepage', 'docs_url', 'deploy.url', 'deploy.guide_url'],
  );
  assert.deepEqual(collectLinks(baseProject()), []);
});

test('probeUrl：2xx 视为可达，404 视为不可达', async () => {
  const ok = await probeUrl('https://example.com', {
    fetchImpl: async () => new Response('ok', { status: 200 }),
  });
  assert.equal(ok.ok, true);

  const missing = await probeUrl('https://example.com/gone', {
    fetchImpl: async () => new Response('nope', { status: 404 }),
  });
  assert.equal(missing.ok, false);
  assert.match(missing.detail, /404/);
});

test('§7 第三方外链失败 → warning（不阻断 CI）', async () => {
  const findings = await checkLinks(
    [
      target({
        docs_url: 'https://broken.example.com/docs',
        deploy: { method: 'wrangler', guide_url: 'https://broken.example.com/guide' },
      }),
    ],
    {
      fetchImpl: async () => new Response('down', { status: 503 }),
      retries: 0,
    },
  );
  // docs_url 与 deploy.guide_url 各一条，均为警告
  assert.equal(findings.length, 2);
  assert.ok(findings.every((finding) => finding.severity === 'warning'));
  assert.equal(summarize(findings).errors.length, 0);
});

test('§7 官方项目 / 演示站链接失败 → error（硬拦）', async () => {
  const findings = await checkLinks(
    [
      target({ slug: 'demo-official', homepage: 'https://demo.example.com' }),
      target({
        slug: 'demo-official-2',
        repo: 'WorkerHub/eNotify',
        source: 'official',
        tier: 'official',
        docs_url: 'https://docs.example.com',
        homepage: undefined,
      }),
    ],
    {
      fetchImpl: async () => new Response('down', { status: 500 }),
      retries: 0,
    },
  );
  assert.equal(findings.length, 2);
  assert.ok(findings.every((finding) => finding.severity === 'error'));
});

// ---------------------------------------------------------------------------
// 截图规格
// ---------------------------------------------------------------------------

test('§7 截图合规（1200px webp / ≤300KB）→ 无 findings', () => {
  const findings = checkScreenshots(
    [target({ screenshot: 'public/screenshots/fixture-ok-1200.webp', slug: 'fixture-ok-1200' })],
    {
      screenshotsDir: SCREENSHOTS_DIR,
    },
  );
  assert.deepEqual(findings, []);
});

test('§7 未填 screenshot 的条目走前端回退链，不报错', () => {
  assert.deepEqual(checkScreenshots([target()], { screenshotsDir: SCREENSHOTS_DIR }), []);
});

test('§7 截图宽度不足 1200px → error 并给出实际宽度', () => {
  const findings = checkScreenshots(
    [
      target({
        slug: 'fixture-narrow-800',
        screenshot: 'public/screenshots/fixture-narrow-800.webp',
      }),
    ],
    { screenshotsDir: SCREENSHOTS_DIR },
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.severity, 'error');
  assert.match(findings[0]!.message, /800px/);
});

test('§7 截图体积超过 300KB → error', () => {
  const findings = checkScreenshots(
    [target({ slug: 'fixture-oversize', screenshot: 'public/screenshots/fixture-oversize.webp' })],
    { screenshotsDir: SCREENSHOTS_DIR },
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, new RegExp(`${SCREENSHOT_MAX_BYTES / 1024}KB`));
});

test('§7 改后缀的 PNG 不算 webp → error', () => {
  const findings = checkScreenshots(
    [target({ slug: 'fixture-fake', screenshot: 'public/screenshots/fixture-fake.webp' })],
    { screenshotsDir: SCREENSHOTS_DIR },
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /webp/);
  assert.match(findings[0]!.message, /png/);
});

test('§7 截图文件缺失 → error 并提示可删除字段走回退链', () => {
  const findings = checkScreenshots(
    [target({ slug: 'ghost', screenshot: 'public/screenshots/ghost.webp' })],
    { screenshotsDir: SCREENSHOTS_DIR },
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /不存在/);
  assert.match(findings[0]!.message, /回退链/);
});

test('§7 截图文件名与 slug 不一致 → error', () => {
  const findings = checkScreenshots(
    [target({ slug: 'wrong-name', screenshot: 'public/screenshots/fixture-ok-1200.webp' })],
    { screenshotsDir: SCREENSHOTS_DIR },
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /wrong-name\.webp/);
});

test('screenshotFileName 只取文件名（忽略数据文件里的目录写法）', () => {
  assert.equal(screenshotFileName(baseProject({ screenshot: '/screenshots/a.webp' })), 'a.webp');
  assert.equal(
    screenshotFileName(baseProject({ screenshot: 'public/screenshots/b.webp' })),
    'b.webp',
  );
});

// ---------------------------------------------------------------------------
// 汇总输出
// ---------------------------------------------------------------------------

test('汇总区分硬拦与警告，并可渲染成 CI 日志', () => {
  const summary = summarize([
    {
      check: 'repos',
      severity: 'error',
      slug: 'a',
      file: 'a.yaml',
      target: 'WorkerHub/a',
      message: '仓库不存在',
    },
    {
      check: 'links',
      severity: 'warning',
      slug: 'b',
      file: 'b.yaml',
      target: 'https://x.example.com',
      message: '外链不可达',
    },
  ]);
  assert.equal(summary.errors.length, 1);
  assert.equal(summary.warnings.length, 1);
  const text = formatFindings(summary);
  assert.match(text, /✗ \[repos\] a\.yaml（a）/);
  assert.match(text, /⚠ \[links\] b\.yaml（b）/);
});
