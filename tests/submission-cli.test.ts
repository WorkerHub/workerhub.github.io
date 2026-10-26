/**
 * 投稿校验 CLI 的进程级测试（SPEC §7 验收 3：故意提交违规数据 → CI 明确失败并指出原因）。
 * 全部走真实 `tsx scripts/validate-submission.ts` 进程，只把网络与目录换成夹具/不可达地址。
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOT = process.cwd();
const UNREACHABLE = 'http://127.0.0.1:9';
const FIXTURES = join(ROOT, 'tests', 'fixtures');

interface RunResult {
  status: number | null;
  output: string;
}

const run = (args: string[], env: Record<string, string> = {}): RunResult => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/validate-submission.ts', ...args],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_TOKEN: '', ...env },
    },
  );
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};

/** 异步版：需要本地 HTTP 服务在 CLI 子进程运行期间保持可响应时用（spawnSync 会堵死父进程事件循环） */
const runAsync = (args: string[], env: Record<string, string> = {}): Promise<RunResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'scripts/validate-submission.ts', ...args],
      { cwd: ROOT, env: { ...process.env, GITHUB_TOKEN: '', ...env } },
    );
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      output += chunk;
    });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, output }));
  });

test('§7 截图不合规 → CLI 失败并逐条点名原因（宽不足 / 超体积 / 假 webp）', () => {
  const result = run(['--checks=screenshots'], {
    HUB_PROJECTS_DIR: join(FIXTURES, 'submission', 'screenshots'),
    HUB_SCREENSHOTS_DIR: join(FIXTURES, 'screenshots'),
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /宽度不足：800px/);
  assert.match(result.output, /体积超标/);
  assert.match(result.output, /检测到 png/);
  // 合规的那条不应被点名
  assert.doesNotMatch(result.output, /fixture-ok-1200\.yaml（fixture-ok-1200）/);
});

test('§7 第三方外链失败 → 警告不阻断（退出码 0）', () => {
  const result = run(['--checks=links'], {
    HUB_PROJECTS_DIR: join(FIXTURES, 'submission', 'links', 'third-party'),
  });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /警告 2 项/);
  assert.match(result.output, /docs_url/);
});

test('§7 官方 / 演示站外链失败 → CLI 失败（硬拦）', () => {
  const result = run(['--checks=links'], {
    HUB_PROJECTS_DIR: join(FIXTURES, 'submission', 'links', 'official'),
  });
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /homepage/);
});

test('§7 GitHub API 不可达 → repo 核验失败（无法核验也硬拦并提示重跑）', () => {
  const result = run(['--checks=repos'], {
    HUB_PROJECTS_DIR: join(FIXTURES, 'submission', 'repos'),
    GITHUB_API_BASE: UNREACHABLE,
    HUB_LINK_TIMEOUT_MS: '1000',
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /repo 核验失败/);
  assert.match(result.output, /重跑 CI/);
});

test('§7 --fail-on-warnings 把外链警告升级为失败（维护者本地复核用）', () => {
  const result = run(['--checks=links', '--fail-on-warnings'], {
    HUB_PROJECTS_DIR: join(FIXTURES, 'submission', 'links', 'third-party'),
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /警告 2 项/);
});

test('ONE-449 官方演示站 403（bot 防护）→ CLI 退出码 0，日志可见站点名与 403', async () => {
  // 本地服务固定回 403，模拟 Cloudflare bot 防护对 CI runner 出口 IP 的拒绝
  const server = createServer((_request, response) => {
    response.writeHead(403, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<html><body>error 403</body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  const projectsDir = join(ROOT, 'tests', '.tmp', 'bot-protected');
  try {
    mkdirSync(projectsDir, { recursive: true });
    writeFileSync(
      join(projectsDir, 'drill-bot-protected.yaml'),
      [
        'slug: drill-bot-protected',
        'name: Drill Bot Protected',
        'repo: WorkerHub/hub-drill-official',
        'source: official',
        'tagline_zh: 演练用官方条目，演示站被 bot 防护拦截。',
        'description_zh: 第一条说明句。第二条说明句。',
        'features:',
        '  - 特性一',
        '  - 特性二',
        '  - 特性三',
        'tags:',
        '  - drill',
        'category: notification',
        `homepage: http://127.0.0.1:${port}/demo`,
        'deploy:',
        '  method: docs-only',
        'resources:',
        '  - d1',
        'difficulty: 2',
        'free_tier: yes',
        'tier: official',
        'added_at: 2026-10-26',
        '',
      ].join('\n'),
      'utf8',
    );

    const result = await runAsync(['--checks=links'], { HUB_PROJECTS_DIR: projectsDir });
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /警告 1 项/);
    assert.match(result.output, /Drill Bot Protected/);
    assert.match(result.output, /403/);
    assert.match(result.output, /降级为警告/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(projectsDir, { recursive: true, force: true });
  }
});

test('未知检查项 → 退出码 2（参数错误，不误报成数据错误）', () => {
  const result = run(['--checks=nope'], {
    HUB_PROJECTS_DIR: join(FIXTURES, 'submission', 'repos'),
  });
  assert.equal(result.status, 2);
  assert.match(result.output, /未知检查项/);
});
