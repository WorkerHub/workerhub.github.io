/**
 * 投稿文档守卫（SPEC §7 验收 1、2）：
 *   - `CONTRIBUTING.md` 必须在仓库根，且覆盖 §4.1 字段、§4.2/§5/§6 枚举、§6.1 五条门槛、§6.3 下架与异议通道
 *   - 文档里的数据文件模板必须真的能过 schema（防止文档与 schema 分叉）
 *   - `/submit/` 页同源契约必须写进文件（S2-A 构建时引入本文件）
 *   - PR 模板必须逐项对应五条门槛并含证据栏
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { parse as parseYaml } from 'yaml';
import {
  CATEGORIES,
  DEPLOY_METHODS,
  FREE_TIERS,
  RESOURCES,
  TIERS,
  projectSchema,
} from '../src/lib/project-schema.js';
import { SUBMISSION_PR_MARKER } from '../src/lib/pr-scope.js';

const ROOT = process.cwd();
const contributing = readFileSync(join(ROOT, 'CONTRIBUTING.md'), 'utf8');
const prTemplate = readFileSync(join(ROOT, '.github', 'PULL_REQUEST_TEMPLATE.md'), 'utf8');

/** §4.1 全部人工字段 */
const MANUAL_FIELDS = [
  'slug',
  'name',
  'repo',
  'source',
  'tagline_zh',
  'description_zh',
  'description_en',
  'features',
  'category',
  'tags',
  'homepage',
  'docs_url',
  'deploy',
  'resources',
  'difficulty',
  'free_tier',
  'pricing_note',
  'tier',
  'verified_at',
  'verified_note_url',
  'screenshot',
  'featured',
  'added_at',
  'status',
];

/** §6.1 五条门槛的关键措辞 */
const GATES = [
  '开源且许可证明确',
  '真实可部署在 Cloudflare Workers 或 Pages',
  '近 12 个月内有代码更新',
  '部署步骤可复现',
  '免费层可跑',
];

test('§7 CONTRIBUTING.md 位于仓库根', () => {
  assert.ok(contributing.length > 2000, 'CONTRIBUTING.md 内容过短，可能被误删或截断');
});

test('§7 CONTRIBUTING.md 覆盖 §4.1 全部人工字段', () => {
  for (const field of MANUAL_FIELDS) {
    assert.ok(contributing.includes(`\`${field}\``), `CONTRIBUTING 缺字段说明：${field}`);
  }
});

test('§7 CONTRIBUTING.md 覆盖 §4.2 / §4.5 / §5 / §6 全部枚举值', () => {
  for (const value of [...CATEGORIES, ...RESOURCES, ...DEPLOY_METHODS, ...FREE_TIERS, ...TIERS]) {
    assert.ok(contributing.includes(value), `CONTRIBUTING 缺枚举值：${value}`);
  }
});

test('§7 CONTRIBUTING.md 覆盖 §6.1 五条门槛与证据要求', () => {
  for (const gate of GATES) {
    assert.ok(contributing.includes(gate), `CONTRIBUTING 缺门槛：${gate}`);
  }
  assert.match(contributing, /证据/);
});

test('§7 CONTRIBUTING.md 写明禁止手写自动字段与投稿 PR 只改数据文件', () => {
  for (const field of ['stargazers_count', 'forks_count', 'pushed_at', 'archived']) {
    assert.ok(contributing.includes(field), `CONTRIBUTING 缺自动字段禁写清单：${field}`);
  }
  assert.match(contributing, /只新增\/修改 `src\/data\/projects\/<slug>\.yaml`/);
});

test('§7 CONTRIBUTING.md 写明截图三条硬规格', () => {
  assert.match(contributing, /webp/);
  assert.match(contributing, /1200px/);
  assert.match(contributing, /300KB/);
});

test('§7 CONTRIBUTING.md 写明验证等级与「已收录」固定声明', () => {
  assert.match(contributing, /已验证/);
  assert.match(contributing, /本站尚未实测部署，部署体验以项目文档为准/);
  assert.match(contributing, /verified_note_url/);
});

test('§6.3 CONTRIBUTING.md 写下架通道与作者异议通道', () => {
  assert.match(contributing, /delisted/);
  assert.match(contributing, /下架/);
  assert.match(contributing, /在本仓库开 issue/);
});

test('§7 CONTRIBUTING.md 声明与 /submit/ 页同源、不得分叉（S2-A 对接契约）', () => {
  assert.match(contributing, /`\/submit\/`/);
  assert.match(contributing, /不得分叉/);
});

test('§7 CONTRIBUTING.md 的 YAML 模板能通过 schema（文档与 schema 不分叉）', () => {
  const blocks = [...contributing.matchAll(/```yaml\n([\s\S]*?)```/g)].map((match) => match[1]!);
  const templates = blocks.filter((block) => /^slug:/m.test(block));
  assert.ok(templates.length >= 1, 'CONTRIBUTING 里找不到可复制的数据文件模板');
  for (const template of templates) {
    const parsed = projectSchema.safeParse(parseYaml(template));
    assert.ok(
      parsed.success,
      `模板不符合 schema：${parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2)}\n${template}`,
    );
  }
});

test('§7 PR 模板存在、带投稿标记，并逐项对应五条门槛与证据栏', () => {
  assert.ok(prTemplate.includes(SUBMISSION_PR_MARKER), 'PR 模板缺少投稿标记');
  for (const gate of GATES) {
    assert.ok(prTemplate.includes(gate), `PR 模板缺门槛勾选项：${gate}`);
  }
  const gateBoxes = prTemplate.match(/- \[ \] \*{0,2}\d\./g);
  assert.equal(gateBoxes?.length ?? 0, 5, 'PR 模板应恰好有 5 条门槛勾选框');
  const evidenceLines = prTemplate.match(/证据/g) ?? [];
  assert.ok(evidenceLines.length >= 5, 'PR 模板每条门槛都应留证据栏');
});

test('§7 PR 模板含数据合规自查（自动字段 / 变更范围 / 截图 / 验证等级）', () => {
  assert.match(prTemplate, /自动字段/);
  assert.match(prTemplate, /src\/data\/projects\/<slug>\.yaml/);
  assert.match(prTemplate, /webp/);
  assert.match(prTemplate, /listed/);
  assert.match(prTemplate, /verified_note_url/);
});

test('§7 PR 模板提示异议通道与免责声明', () => {
  assert.match(prTemplate, /issue/);
  assert.match(prTemplate, /版权与责任归项目作者/);
});
