/**
 * 主题三档单击循环（SPEC §3B / §8.3）：亮 / 暗 / 自动，默认自动。
 *
 * - 偏好只存浏览器本地（localStorage `hub-theme`），本站无登录、无后端。
 * - 首屏防闪烁由 BaseLayout `<head>` 里的内联脚本完成（先于绘制应用 class）；
 *   本 island 只负责交互与「自动档跟随系统实时变化」。
 * - 页头只有一个天然图标按钮：点一次前进一档（自动 → 亮色 → 暗色 → 自动），
 *   不弹菜单/浮层；Enter/Space 即浏览器原生键盘激活，无需额外菜单键盘逻辑。
 */
import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';

export const THEME_STORAGE_KEY = 'hub-theme';
export type ThemeMode = 'system' | 'light' | 'dark';

/** 循环顺序：自动（跟随系统）→ 亮色 → 暗色 → 自动 */
export const THEME_CYCLE = ['system', 'light', 'dark'] as const satisfies readonly ThemeMode[];

const MODE_META: Record<ThemeMode, { label: string; icon: typeof Sun }> = {
  system: { label: '自动', icon: Monitor },
  light: { label: '亮色', icon: Sun },
  dark: { label: '暗色', icon: Moon },
};

/** 下一档：自动 → 亮色 → 暗色 → 自动 */
export function nextThemeMode(mode: ThemeMode): ThemeMode {
  const index = THEME_CYCLE.indexOf(mode);
  return THEME_CYCLE[(index + 1) % THEME_CYCLE.length] ?? 'system';
}

/** 无障碍文案：aria-label 与 title 同源，同时说明当前档与下一档（不给可见文字） */
export function themeToggleLabel(mode: ThemeMode): string {
  return `主题：${MODE_META[mode].label}，点击切换到${MODE_META[nextThemeMode(mode)].label}`;
}

function readStoredMode(): ThemeMode {
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
    const next = nextThemeMode(mode);
    setMode(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // 存不了就只在本次会话生效，不阻塞交互
    }
    applyTheme(next);
  };

  const Icon = MODE_META[mode].icon;
  const label = themeToggleLabel(mode);

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
