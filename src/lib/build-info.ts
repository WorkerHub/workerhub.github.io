/**
 * 版本号与构建时间（SPEC §0 / §12 第 8 条：页脚版本号由构建时注入，仓库源码里不写死）。
 *
 * 版本号取 `git describe --tags --always`；CI 可用 HUB_VERSION 覆盖
 * （浅克隆场景下由工作流带 fetch-depth: 0 保证 describe 可用）。
 *
 * 刻意**不带 `--dirty`**（双线部署需要）：构建本身会改写自动字段缓存
 * `src/data/cache/github-meta.json`，带 `--dirty` 会让每次 CI 构建都得到
 * `<sha>-dirty`，主站与镜像两侧、两次构建之间都无法比较，页脚也难看。
 * 版本号只标识「哪一次提交的源码」，构建产物差异由构建时间承担。
 */
import { execFileSync } from 'node:child_process';

const UNKNOWN_VERSION = 'v0.0.0-dev';

function readGitDescribe(): string {
  const injected = process.env.HUB_VERSION?.trim();
  if (injected) return injected;
  try {
    return execFileSync('git', ['describe', '--tags', '--always'], {
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
