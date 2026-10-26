/**
 * 数据文件 schema 单测：覆盖 SPEC §4.1 全字段、§4.2/§5/§6 枚举与全部条件必填规则。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stringify } from 'yaml';
import { validateProjectFiles, type ValidationResult } from '../src/lib/validate-projects.js';

type Project = Record<string, unknown>;

/** 一份完全合法的第三方 listed 条目；各用例只在它上面做单点破坏 */
const baseProject = (): Project => ({
  slug: 'demo',
  name: 'Demo',
  repo: 'example-org/demo',
  source: 'third-party',
  tagline_zh: '示例一句话介绍，用于校验',
  description_zh: '第一句说明。第二句说明。',
  features: ['特性之一', '特性之二', '特性之三'],
  category: 'devops',
  tags: ['one', 'two'],
  deploy: { method: 'wrangler' },
  resources: ['workers-only'],
  difficulty: 2,
  free_tier: 'yes',
  tier: 'listed',
  added_at: '2026-10-26',
});

const run = (project: Project, file = 'demo.yaml'): ValidationResult =>
  validateProjectFiles([{ file, contents: stringify(project) }]);

const issuePaths = (result: ValidationResult): string[] =>
  result.ok ? [] : result.issues.map((issue) => issue.path);

const issueMessages = (result: ValidationResult): string =>
  result.ok ? '' : result.issues.map((issue) => issue.message).join(' | ');

/** 断言「某字段被点名」；zod 对数组元素会给出 features.0 这类子路径，故按前缀匹配 */
const assertFieldFlagged = (result: ValidationResult, field: string): void => {
  assert.equal(result.ok, false, `${field} 应校验失败`);
  const paths = issuePaths(result);
  assert.ok(
    paths.some((path) => path === field || path.startsWith(`${field}.`)),
    `报错应点名字段 ${field}，实际：${paths.join(', ')}`,
  );
};

test('合法的第三方 listed 条目通过校验', () => {
  const result = run(baseProject());
  assert.equal(result.ok, true, issueMessages(result));
});

test('合法的官方条目通过校验（tier 恒为 official）', () => {
  const result = run({
    ...baseProject(),
    repo: 'WorkerHub/demo',
    source: 'official',
    tier: 'official',
  });
  assert.equal(result.ok, true, issueMessages(result));
});

test('§4.1 缺少必填字段时指出该字段名', () => {
  const project = baseProject();
  delete project.name;
  assertFieldFlagged(run(project), 'name');

  const noTags = baseProject();
  delete noTags.tags;
  assertFieldFlagged(run(noTags), 'tags');
});

test('§4.2 分类枚举非法时指出 category', () => {
  assertFieldFlagged(run({ ...baseProject(), category: 'not-a-category' }), 'category');
});

test('§4.1 tagline_zh 不得超过 40 字', () => {
  const ok = run({ ...baseProject(), tagline_zh: '字'.repeat(40) });
  assert.equal(ok.ok, true, issueMessages(ok));
  assertFieldFlagged(run({ ...baseProject(), tagline_zh: '字'.repeat(41) }), 'tagline_zh');
});

test('§4.1 description_zh 必须为 2–4 句', () => {
  assertFieldFlagged(run({ ...baseProject(), description_zh: '只有一句话。' }), 'description_zh');
  assertFieldFlagged(
    run({ ...baseProject(), description_zh: '第一句。第二句。第三句。第四句。第五句。' }),
    'description_zh',
  );
});

test('§4.1 features 必须 3–5 条', () => {
  assertFieldFlagged(run({ ...baseProject(), features: ['特性之一', '特性之二'] }), 'features');
  assertFieldFlagged(
    run({
      ...baseProject(),
      features: ['特性一', '特性二', '特性三', '特性四', '特性五', '特性六'],
    }),
    'features',
  );
});

test('§4.1 tags 不得超过 5 个且不得重复', () => {
  assertFieldFlagged(run({ ...baseProject(), tags: ['a', 'b', 'c', 'd', 'e', 'f'] }), 'tags');
  assertFieldFlagged(run({ ...baseProject(), tags: ['same', 'same'] }), 'tags');
});

test('§4.1 resources 必须是已知枚举且不重复', () => {
  assertFieldFlagged(run({ ...baseProject(), resources: ['nope'] }), 'resources');
  assertFieldFlagged(run({ ...baseProject(), resources: ['d1', 'd1'] }), 'resources');
});

test('§4.1 difficulty 只允许 1–3 的整数', () => {
  assertFieldFlagged(run({ ...baseProject(), difficulty: 0 }), 'difficulty');
  assertFieldFlagged(run({ ...baseProject(), difficulty: 4 }), 'difficulty');
  assertFieldFlagged(run({ ...baseProject(), difficulty: 1.5 }), 'difficulty');
});

test('§4.1 source=official 时 tier 必须为 official', () => {
  assertFieldFlagged(
    run({ ...baseProject(), repo: 'WorkerHub/demo', source: 'official', tier: 'listed' }),
    'tier',
  );
});

test('§4.1 第三方项目不得使用 official 等级', () => {
  assertFieldFlagged(run({ ...baseProject(), tier: 'official' }), 'tier');
});

test('§3.1 官方项目 repo owner 必须为 WorkerHub', () => {
  assertFieldFlagged(
    run({ ...baseProject(), repo: 'someone-else/demo', source: 'official', tier: 'official' }),
    'repo',
  );
});

test('§6.2 tier=verified 时 verified_at 与 verified_note_url 必填', () => {
  const missingBoth = run({ ...baseProject(), tier: 'verified' });
  assertFieldFlagged(missingBoth, 'verified_at');
  assertFieldFlagged(missingBoth, 'verified_note_url');

  const ok = run({
    ...baseProject(),
    tier: 'verified',
    verified_at: '2026-10-20',
    verified_note_url: 'https://github.com/WorkerHub/workerhub.github.io/issues/1',
  });
  assert.equal(ok.ok, true, issueMessages(ok));
});

test('§4.1 free_tier 不为 yes 时 pricing_note 必填', () => {
  assertFieldFlagged(run({ ...baseProject(), free_tier: 'partial' }), 'pricing_note');
  assertFieldFlagged(run({ ...baseProject(), free_tier: 'no' }), 'pricing_note');

  const ok = run({ ...baseProject(), free_tier: 'no', pricing_note: '必须 Workers Paid。' });
  assert.equal(ok.ok, true, issueMessages(ok));
});

test('§4.1/§9.2 禁止把自动字段手写进数据文件', () => {
  for (const field of ['stars', 'stargazers_count', 'forks_count', 'pushed_at', 'archived']) {
    const result = run({ ...baseProject(), [field]: 1 });
    assert.equal(result.ok, false, `自动字段 ${field} 应被拒绝`);
    assert.match(issueMessages(result), new RegExp(field), `报错应点名 ${field}`);
  }
});

test('§4.1 未知字段直接失败（防拼写错误静默丢字段）', () => {
  const result = run({ ...baseProject(), tagline: '拼错的字段名' });
  assert.equal(result.ok, false);
  assert.match(issueMessages(result), /tagline/);
});

test('§5 deploy.method 枚举与 Deploy Button URL 规范', () => {
  assertFieldFlagged(run({ ...baseProject(), deploy: { method: 'nope' } }), 'deploy');

  // deploy-button 必须带官方 Deploy Button 链接
  assertFieldFlagged(run({ ...baseProject(), deploy: { method: 'deploy-button' } }), 'deploy.url');
  assertFieldFlagged(
    run({
      ...baseProject(),
      deploy: { method: 'deploy-button', url: 'https://example.com/deploy' },
    }),
    'deploy.url',
  );

  const ok = run({
    ...baseProject(),
    deploy: {
      method: 'deploy-button',
      url: 'https://deploy.workers.cloudflare.com/?url=https://github.com/example-org/demo',
    },
  });
  assert.equal(ok.ok, true, issueMessages(ok));
});

test('§3.1 coming-soon（预告位）不得带部署入口', () => {
  assertFieldFlagged(
    run({
      ...baseProject(),
      status: 'coming-soon',
      deploy: { method: 'docs-only', url: 'https://example.com/deploy' },
    }),
    'deploy.url',
  );
});

test('§4.1 featured 仅第三方可用', () => {
  assertFieldFlagged(
    run({
      ...baseProject(),
      repo: 'WorkerHub/demo',
      source: 'official',
      tier: 'official',
      featured: true,
    }),
    'featured',
  );
});

test('§8.3 screenshot 路径必须是 public/screenshots/<slug>.webp', () => {
  assertFieldFlagged(run({ ...baseProject(), screenshot: 'screenshots/demo.png' }), 'screenshot');

  const ok = run({ ...baseProject(), screenshot: 'public/screenshots/demo.webp' });
  assert.equal(ok.ok, true, issueMessages(ok));
});

test('§4.1 slug 必须与文件名一致', () => {
  const result = run(baseProject(), 'other-name.yaml');
  assertFieldFlagged(result, 'slug');
  assert.match(issueMessages(result), /文件名/);
});

test('§7 按 slug 与 repo 双维度查重', () => {
  const first = { file: 'demo.yaml', contents: stringify(baseProject()) };
  const duplicateSlug = {
    file: 'demo.yaml',
    contents: stringify({ ...baseProject(), repo: 'example-org/other' }),
  };
  const duplicateRepo = {
    file: 'other.yaml',
    contents: stringify({ ...baseProject(), slug: 'other' }),
  };

  const slugResult = validateProjectFiles([first, duplicateSlug]);
  assert.equal(slugResult.ok, false);
  assert.ok(
    !slugResult.ok && slugResult.issues.some((i) => i.path === 'slug' && /重复/.test(i.message)),
  );

  const repoResult = validateProjectFiles([first, duplicateRepo]);
  assert.equal(repoResult.ok, false);
  assert.ok(
    !repoResult.ok && repoResult.issues.some((i) => i.path === 'repo' && /重复/.test(i.message)),
  );
});

test('YAML 语法错误与非映射内容都报文件级错误', () => {
  const broken = validateProjectFiles([{ file: 'broken.yaml', contents: 'slug: [unclosed' }]);
  assert.equal(broken.ok, false);
  assert.ok(!broken.ok && broken.issues.some((i) => i.path === '<file>'));

  const list = validateProjectFiles([{ file: 'list.yaml', contents: '- one\n- two\n' }]);
  assert.equal(list.ok, false);
  assert.ok(!list.ok && list.issues.some((i) => i.path === '<file>'));
});

test('空数据集合法（内容子单尚未落数据时构建不报错）', () => {
  assert.equal(validateProjectFiles([]).ok, true);
});
