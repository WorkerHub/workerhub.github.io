/**
 * 投稿校验 CLI 的进程级测试（SPEC §7 验收 3：故意提交违规数据 → CI 明确失败并指出原因）。
 * 全部走真实 `tsx scripts/validate-submission.ts` 进程，只把网络与目录换成夹具/不可达地址。
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

test('未知检查项 → 退出码 2（参数错误，不误报成数据错误）', () => {
  const result = run(['--checks=nope'], {
    HUB_PROJECTS_DIR: join(FIXTURES, 'submission', 'repos'),
  });
  assert.equal(result.status, 2);
  assert.match(result.output, /未知检查项/);
});
