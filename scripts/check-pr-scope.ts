#!/usr/bin/env tsx
/**
 * 投稿 PR 变更范围校验 CLI（SPEC §7：投稿 PR 只改数据文件与截图，不许改代码）。
 *
 * 在 GitHub Actions 里由 `.github/workflows/ci.yml` 的 `submission-scope` job 调用：
 *   环境变量 HUB_PR_BODY        PR 描述（github.event.pull_request.body）
 *   环境变量 HUB_PR_BASE_REF    PR 目标分支（github.base_ref）
 * 本地复现：
 *   HUB_PR_BODY="$(cat pr.md)" HUB_PR_BASE_REF=main pnpm check:pr-scope
 *   或直接给变更清单：HUB_PR_CHANGED_FILES=$'src/data/projects/x.yaml\nREADME.md' pnpm check:pr-scope
 *
 * 退出码：
 *   0  非投稿 PR（无标记，跳过），或投稿 PR 只改了允许的文件
 *   1  投稿 PR 改了允许范围外的文件
 */
import { execFileSync } from 'node:child_process';
import {
  SUBMISSION_PR_MARKER,
  classifySubmissionPaths,
  isSubmissionPr,
} from '../src/lib/pr-scope.js';

const body = process.env.HUB_PR_BODY ?? '';
const changedFilesEnv = process.env.HUB_PR_CHANGED_FILES;
const baseRef = process.env.HUB_PR_BASE_REF;

if (!isSubmissionPr(body)) {
  console.log(
    `非投稿 PR（描述里没有 ${SUBMISSION_PR_MARKER} 标记）：跳过投稿范围校验。` +
      '该标记由 .github/PULL_REQUEST_TEMPLATE.md 自带，只有外部投稿 PR 会命中。',
  );
  process.exit(0);
}

let changedFiles: string[];
if (typeof changedFilesEnv === 'string' && changedFilesEnv.length > 0) {
  changedFiles = changedFilesEnv.split('\n');
} else if (baseRef) {
  // 三点 diff：与目标分支的 merge-base 比较，避免把目标分支的新提交算进本 PR
  const output = execFileSync(
    'git',
    ['diff', '--name-only', '--no-renames', `origin/${baseRef}...HEAD`],
    { encoding: 'utf8' },
  );
  changedFiles = output.split('\n');
} else {
  console.error('缺少 HUB_PR_BASE_REF 或 HUB_PR_CHANGED_FILES，无法确定本 PR 的变更文件');
  process.exit(2);
}

const { outOfScope, inScope } = classifySubmissionPaths(changedFiles);

console.log(`投稿 PR 变更文件：${inScope.length + outOfScope.length} 个`);
for (const path of inScope) console.log(`  ✓ ${path}`);
for (const path of outOfScope) console.log(`  ✗ ${path}`);

if (inScope.length === 0) {
  console.error(
    '\n投稿 PR 没有新增或修改任何 src/data/projects/<slug>.yaml：请确认分支是否正确（数据文件与截图是唯一允许的变更）。',
  );
  process.exit(1);
}

if (outOfScope.length > 0) {
  console.error(
    '\n投稿 PR 只允许新增/修改 src/data/projects/<slug>.yaml 与 public/screenshots/<slug>.webp（SPEC §7）。',
  );
  console.error('以下文件超出投稿范围，请从本 PR 撤出（代码/依赖/工作流/模板的改动请另开 PR）：');
  for (const path of outOfScope) console.error(`  ✗ ${path}`);
  process.exit(1);
}

console.log('\n投稿范围校验通过：只改了数据文件与截图。');
