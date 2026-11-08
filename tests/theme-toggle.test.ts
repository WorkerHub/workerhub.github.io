/**
 * 主题按钮单击循环（SPEC §3B / §8.3）的单元测试。
 *
 * 页面级实测（点击后 html.dark / localStorage / 图标 / aria-label 同步、刷新保持）
 * 由浏览器验收覆盖；这里守住三件能用机器守住的规则：
 * 1. 循环顺序恒为 自动 → 亮色 → 暗色 → 自动，从任意档连点 3 次回到原档；
 * 2. aria-label / title 文案同时点名「当前档」与「下一档」；
 * 3. 该文件不再残留 DropdownMenu 引用（下拉菜单已按要求移除，组件本身保留给筛选/排序）。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  nextThemeMode,
  THEME_CYCLE,
  THEME_STORAGE_KEY,
  themeToggleLabel,
  type ThemeMode,
} from '../src/components/site/theme-toggle.js';

test('三档循环顺序为 自动 → 亮色 → 暗色 → 自动', () => {
  assert.deepEqual([...THEME_CYCLE], ['system', 'light', 'dark']);
  assert.equal(nextThemeMode('system'), 'light');
  assert.equal(nextThemeMode('light'), 'dark');
  assert.equal(nextThemeMode('dark'), 'system');
});

test('从任意档起连点 3 次回到原档，且逐档不重复', () => {
  for (const start of THEME_CYCLE as readonly ThemeMode[]) {
    let mode = start;
    const walked: ThemeMode[] = [mode];
    for (let i = 0; i < 3; i += 1) {
      mode = nextThemeMode(mode);
      walked.push(mode);
    }
    assert.equal(mode, start, `从 ${start} 起 3 次后应回到原档`);
    assert.equal(new Set(walked).size, 3, '一圈应恰好覆盖三档，不跳档不重档');
  }
});

test('aria-label / title 文案同时说明当前档与下一档', () => {
  assert.equal(themeToggleLabel('system'), '主题：自动，点击切换到亮色');
  assert.equal(themeToggleLabel('light'), '主题：亮色，点击切换到暗色');
  assert.equal(themeToggleLabel('dark'), '主题：暗色，点击切换到自动');
});

test('存储键与默认档保持既有契约', () => {
  const source = readFileSync(
    new URL('../src/components/site/theme-toggle.tsx', import.meta.url),
    'utf8',
  );
  assert.equal(THEME_STORAGE_KEY, 'hub-theme');
  assert.match(source, /useState<ThemeMode>\('system'\)/, '首屏默认档必须是自动');
});

test('theme-toggle.tsx 不再残留 DropdownMenu 引用（UI 组件文件本身保留）', () => {
  const source = readFileSync(
    new URL('../src/components/site/theme-toggle.tsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /DropdownMenu/);
  assert.doesNotMatch(source, /dropdown-menu/);

  const dropdownComponent = readFileSync(
    new URL('../src/components/ui/dropdown-menu.tsx', import.meta.url),
    'utf8',
  );
  assert.match(dropdownComponent, /export \{/, 'dropdown-menu.tsx 组件不得随本次改动删除');
});
