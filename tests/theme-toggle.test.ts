/**
 * 主题切换单元测试（单击循环切换：自动 → 亮色 → 暗色 → 自动）。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Monitor, Moon, Sun } from 'lucide-react';

import {
  NEXT_THEME_MODE,
  THEME_ICONS,
  THEME_LABELS,
  THEME_STORAGE_KEY,
  applyTheme,
  getNextMode,
  getThemeAriaLabel,
  readStoredMode,
  type ThemeMode,
} from '../src/components/site/theme-toggle.js';

test('存储键常量为 hub-theme', () => {
  assert.equal(THEME_STORAGE_KEY, 'hub-theme');
});

test('循环顺序沿用三档：自动(system) → 亮色(light) → 暗色(dark) → 自动(system)', () => {
  assert.equal(NEXT_THEME_MODE.system, 'light');
  assert.equal(NEXT_THEME_MODE.light, 'dark');
  assert.equal(NEXT_THEME_MODE.dark, 'system');

  assert.equal(getNextMode('system'), 'light');
  assert.equal(getNextMode('light'), 'dark');
  assert.equal(getNextMode('dark'), 'system');
  // 未知值防御降级到 system
  assert.equal(getNextMode('unknown' as unknown as ThemeMode), 'system');
});

test('从任意档连续点击 3 次回到原档', () => {
  const modes: ThemeMode[] = ['system', 'light', 'dark'];
  for (const start of modes) {
    const step1 = getNextMode(start);
    const step2 = getNextMode(step1);
    const step3 = getNextMode(step2);
    assert.equal(step3, start, `从 ${start} 起连续点 3 次应回到 ${start}`);
  }
});

test('图标映射与规格一致：自动=Monitor、亮=Sun、暗=Moon', () => {
  assert.equal(THEME_ICONS.system, Monitor);
  assert.equal(THEME_ICONS.light, Sun);
  assert.equal(THEME_ICONS.dark, Moon);
});

test('可达性文案：aria-label 与 title 同时说明当前档与下一档', () => {
  assert.equal(THEME_LABELS.system, '自动');
  assert.equal(THEME_LABELS.light, '亮色');
  assert.equal(THEME_LABELS.dark, '暗色');

  assert.equal(getThemeAriaLabel('system'), '主题：自动，点击切换到亮色');
  assert.equal(getThemeAriaLabel('light'), '主题：亮色，点击切换到暗色');
  assert.equal(getThemeAriaLabel('dark'), '主题：暗色，点击切换到自动');
});

test('readStoredMode：解析合法值，非法值/无值回退 system', () => {
  const originalWindow = globalThis.window;
  try {
    const mockStore: Record<string, string> = {};
    globalThis.window = {
      localStorage: {
        getItem: (k: string) => mockStore[k] ?? null,
      },
    } as unknown as Window & typeof globalThis;

    assert.equal(readStoredMode(), 'system');

    mockStore[THEME_STORAGE_KEY] = 'light';
    assert.equal(readStoredMode(), 'light');

    mockStore[THEME_STORAGE_KEY] = 'dark';
    assert.equal(readStoredMode(), 'dark');

    mockStore[THEME_STORAGE_KEY] = 'system';
    assert.equal(readStoredMode(), 'system');

    mockStore[THEME_STORAGE_KEY] = 'invalid-mode';
    assert.equal(readStoredMode(), 'system');

    // 禁用 localStorage 异常场景（如无痕模式）
    globalThis.window = {
      localStorage: {
        getItem: () => {
          throw new Error('SecurityError');
        },
      },
    } as unknown as Window & typeof globalThis;
    assert.equal(readStoredMode(), 'system');
  } finally {
    globalThis.window = originalWindow;
  }
});

test('applyTheme：设置 dark class、colorScheme 与 dataset.themeMode', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  try {
    const classSet = new Set<string>();
    const rootElement = {
      classList: {
        toggle: (cls: string, force: boolean) => {
          if (force) classSet.add(cls);
          else classSet.delete(cls);
        },
      },
      style: {
        colorScheme: '',
      },
      dataset: {} as Record<string, string>,
    };

    globalThis.document = {
      documentElement: rootElement,
    } as unknown as Document;

    // 1. light 模式
    globalThis.window = {
      matchMedia: () => ({ matches: false }),
    } as unknown as Window & typeof globalThis;
    applyTheme('light');
    assert.equal(classSet.has('dark'), false);
    assert.equal(rootElement.style.colorScheme, 'light');
    assert.equal(rootElement.dataset.themeMode, 'light');

    // 2. dark 模式
    applyTheme('dark');
    assert.equal(classSet.has('dark'), true);
    assert.equal(rootElement.style.colorScheme, 'dark');
    assert.equal(rootElement.dataset.themeMode, 'dark');

    // 3. system 模式（系统为 light）
    globalThis.window = {
      matchMedia: () => ({ matches: false }),
    } as unknown as Window & typeof globalThis;
    applyTheme('system');
    assert.equal(classSet.has('dark'), false);
    assert.equal(rootElement.style.colorScheme, 'light');
    assert.equal(rootElement.dataset.themeMode, 'system');

    // 4. system 模式（系统为 dark）
    globalThis.window = {
      matchMedia: () => ({ matches: true }),
    } as unknown as Window & typeof globalThis;
    applyTheme('system');
    assert.equal(classSet.has('dark'), true);
    assert.equal(rootElement.style.colorScheme, 'dark');
    assert.equal(rootElement.dataset.themeMode, 'system');
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }
});
