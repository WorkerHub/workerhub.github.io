/**
 * 域名单一真源守卫（canonical 收敛定版）：完整 canonical 字面量只许出现在 `src/lib/site.ts` 一处，
 * 页面、端点、库、脚本、构建配置一律从真源派生。
 *
 * 扫描串取自真源本身（`SITE.url`），本文件不写第二份字面量——否则守卫自己就会破坏它守的东西。
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';

import { SITE } from '../src/lib/site.js';

const ROOT = process.cwd();
/** 与验收 grep 的范围一致：src/、scripts/、tests/ + 根目录 astro.config.* */
const SCAN_DIRS = ['src', 'scripts', 'tests'];
const TEXT_FILE = /\.(ts|tsx|astro|mjs|cjs|js|json|ya?ml)$/i;

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return TEXT_FILE.test(entry.name) ? [path] : [];
  });

test('完整 canonical 字面量只出现在真源文件', () => {
  const configs = readdirSync(ROOT)
    .filter((name) => name.startsWith('astro.config.'))
    .map((name) => join(ROOT, name));
  const files = [...SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir))), ...configs];

  const hits = files
    .filter((file) => readFileSync(file, 'utf8').includes(SITE.url))
    .map((file) => relative(ROOT, file).split(sep).join('/'))
    .sort();

  assert.deepEqual(
    hits,
    ['src/lib/site.ts'],
    `完整域名字面量必须只出现在真源 src/lib/site.ts，实际命中：${hits.join('、')}`,
  );
});
