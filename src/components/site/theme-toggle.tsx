/**
 * 主题三档单击循环切换：自动 → 亮色 → 暗色 → 自动。
 *
 * - 偏好只存浏览器本地（localStorage `hub-theme`），本站无登录、无后端。
 * - 首屏防闪烁由 BaseLayout `<head>` 里的内联脚本完成（先于绘制应用 class）；
 *   本 island 只负责交互与「自动档跟随系统实时变化」。
 * - 单击图标按钮直接前进一档，无下拉菜单与浮层；Enter / Space 原生键盘支持。
 */
import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';

export const THEME_STORAGE_KEY = 'hub-theme';
export type ThemeMode = 'system' | 'light' | 'dark';

export const NEXT_THEME_MODE: Record<ThemeMode, ThemeMode> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

export const THEME_LABELS: Record<ThemeMode, string> = {
  system: '自动',
  light: '亮色',
  dark: '暗色',
};

export const THEME_ICONS: Record<ThemeMode, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

export function getNextMode(mode: ThemeMode): ThemeMode {
  return NEXT_THEME_MODE[mode] ?? 'system';
}

export function getThemeAriaLabel(currentMode: ThemeMode): string {
  const nextMode = getNextMode(currentMode);
  return `主题：${THEME_LABELS[currentMode]}，点击切换到${THEME_LABELS[nextMode]}`;
}

export function readStoredMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // 隐私模式等场景禁用 localStorage：按自动处理，不报错
  }
  return 'system';
}

/** 把模式应用到 <html>（class + color-scheme），与 BaseLayout 内联脚本保持同一套规则 */
export function applyTheme(mode: ThemeMode): void {
  const dark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  root.dataset.themeMode = mode;
}

export default function ThemeToggle() {
  // 服务端与首次客户端渲染都按「自动」输出，读 localStorage 放到 effect 里，避免 hydration 不一致
  const [mode, setMode] = useState<ThemeMode>('system');

  useEffect(() => {
    const stored = readStoredMode();
    setMode(stored);
    applyTheme(stored);
  }, []);

  // 自动档：系统主题实时变化时立刻跟随
  useEffect(() => {
    if (mode !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [mode]);

  const handleToggle = () => {
    const next = getNextMode(mode);
    setMode(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // 存不了就只在本次会话生效，不阻塞交互
    }
    applyTheme(next);
  };

  const currentMode = mode in NEXT_THEME_MODE ? mode : 'system';
  const Icon = THEME_ICONS[currentMode];
  const label = getThemeAriaLabel(currentMode);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      aria-label={label}
      title={label}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
