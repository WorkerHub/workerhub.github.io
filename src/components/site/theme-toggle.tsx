/**
 * 主题三档切换（SPEC §3B / §8.3）：亮 / 暗 / 自动，默认自动。
 *
 * - 偏好只存浏览器本地（localStorage `hub-theme`），本站无登录、无后端。
 * - 首屏防闪烁由 BaseLayout `<head>` 里的内联脚本完成（先于绘制应用 class）；
 *   本 island 只负责交互与「自动档跟随系统实时变化」。
 * - 三段用 shadcn/ui DropdownMenu 单选组，键盘可操作。
 */
import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const THEME_STORAGE_KEY = 'hub-theme';
export type ThemeMode = 'system' | 'light' | 'dark';

const MODES: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: '自动（跟随系统）', icon: Monitor },
  { value: 'light', label: '亮色', icon: Sun },
  { value: 'dark', label: '暗色', icon: Moon },
];

const FALLBACK_MODE = { value: 'system' as ThemeMode, label: '自动（跟随系统）', icon: Monitor };

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

  const handleChange = (value: string) => {
    const next = (value === 'light' || value === 'dark' ? value : 'system') as ThemeMode;
    setMode(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // 存不了就只在本次会话生效，不阻塞交互
    }
    applyTheme(next);
  };

  const current = MODES.find((item) => item.value === mode) ?? FALLBACK_MODE;
  const Icon = current.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`主题：${current.label}`} title="切换主题">
          <Icon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>主题</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={mode} onValueChange={handleChange}>
          {MODES.map((item) => {
            const ItemIcon = item.icon;
            return (
              <DropdownMenuRadioItem key={item.value} value={item.value}>
                <ItemIcon aria-hidden="true" />
                {item.label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
