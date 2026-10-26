/**
 * 版本号与构建时间（SPEC §0 / §12 第 8 条：页脚版本号由构建时注入，仓库源码里不写死）。
 *
 * 版本号取 `git describe --tags --always --dirty`；CI 可用 HUB_VERSION 覆盖
 * （浅克隆场景下由工作流带 fetch-depth: 0 保证 describe 可用）。
 */
import { execFileSync } from 'node:child_process';

const UNKNOWN_VERSION = 'v0.0.0-dev';

function readGitDescribe(): string {
  const injected = process.env.HUB_VERSION?.trim();
  if (injected) return injected;
  try {
    return execFileSync('git', ['describe', '--tags', '--always', '--dirty'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return UNKNOWN_VERSION;
  }
}

let cached: { version: string; builtAt: string } | undefined;

export function getBuildInfo(): { version: string; builtAt: string } {
  cached ??= {
    version: readGitDescribe(),
    builtAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
  };
  return cached;
}
