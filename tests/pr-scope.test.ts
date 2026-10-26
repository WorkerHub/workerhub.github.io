/**
 * 投稿 PR 变更范围逻辑单测（SPEC §7：投稿 PR 只改数据文件与截图，不许改代码）。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SUBMISSION_PR_MARKER,
  classifySubmissionPaths,
  isAllowedSubmissionPath,
  isSubmissionPr,
} from '../src/lib/pr-scope.js';

test('§7 带投稿标记的 PR 视为投稿 PR', () => {
  assert.equal(isSubmissionPr(`## 说明\n\n${SUBMISSION_PR_MARKER}\n\n- [x] 开源`), true);
  assert.equal(isSubmissionPr(`无标记的代码 PR`), false);
  assert.equal(isSubmissionPr(undefined), false);
  assert.equal(isSubmissionPr(null), false);
});

test('§7 投稿允许的路径：数据文件与截图', () => {
  assert.equal(isAllowedSubmissionPath('src/data/projects/cloud-mail.yaml'), true);
  assert.equal(isAllowedSubmissionPath('src/data/projects/edge-ever.yml'), true);
  assert.equal(isAllowedSubmissionPath('public/screenshots/cloud-mail.webp'), true);
});

test('§7 投稿越界路径：代码 / 依赖 / 工作流 / 模板 / 他人目录', () => {
  for (const path of [
    'README.md',
    'CONTRIBUTING.md',
    'package.json',
    'pnpm-lock.yaml',
    '.github/workflows/ci.yml',
    '.github/PULL_REQUEST_TEMPLATE.md',
    'src/lib/project-schema.ts',
    'src/pages/index.astro',
    'scripts/validate-data.ts',
    'src/data/cache/github-meta.json',
    'src/data/projects/nested/deep.yaml',
    'src/data/projects/Cloud-Mail.yaml',
    'public/screenshots/cloud-mail.png',
    'public/screenshots/nested/cloud-mail.webp',
    '../src/data/projects/evil.yaml',
  ]) {
    assert.equal(isAllowedSubmissionPath(path), false, `${path} 不应被允许`);
  }
});

test('§7 拆分变更清单时保留允许项并点名越界项', () => {
  const result = classifySubmissionPaths([
    'src/data/projects/cloud-mail.yaml',
    'public/screenshots/cloud-mail.webp',
    'scripts/validate-data.ts',
    '',
  ]);
  assert.deepEqual(result.inScope, [
    'src/data/projects/cloud-mail.yaml',
    'public/screenshots/cloud-mail.webp',
  ]);
  assert.deepEqual(result.outOfScope, ['scripts/validate-data.ts']);
});
