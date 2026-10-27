/**
 * 版本号与构建时间（SPEC §0 / §12 第 8 条：页脚版本号由构建时注入，仓库源码里不写死）。
 *
 * 主站（Cloudflare Pages）与镜像（GitHub Pages）**共用本文件这一段取值逻辑**，
 * 不各写一套（§12 第 10 条「双线同版」的前提）。回退链优先级固定为：
 *   ① `HUB_VERSION`          仅本地 / 特殊场景覆盖，生产**不**用它钉死版本
 *   ② `git describe --tags --always`
 *   ③ `CF_PAGES_COMMIT_SHA`   Cloudflare Pages 构建环境原生变量，截短为 7 位
 *   ④ `v0.0.0-dev`            以上均不可用时的占位符
 *
 * ②→③ 这一跳是本文件存在的原因：CF Pages 的 Git 集成用浅克隆（shallow clone），
 * 构建环境里没有 tag 也没有完整历史，`git describe` 必然失败；而 CF Pages 自身
 * 提供 `CF_PAGES_COMMIT_SHA`（本次构建对应的完整提交 SHA），截 7 位后与镜像侧
 * `git describe --always` 的无 tag 输出形态一致（短 SHA），两侧页脚即可比对。
 *
 * 刻意**不带 `--dirty`**（双线部署需要）：构建本身会改写自动字段缓存
 * `src/data/cache/github-meta.json`，带 `--dirty` 会让每次 CI 构建都得到
 * `<sha>-dirty`，主站与镜像两侧、两次构建之间都无法比较，页脚也难看。
 * 版本号只标识「哪一次提交的源码」，构建产物差异由构建时间承担。
 */
import { execFileSync } from 'node:child_process';

const UNKNOWN_VERSION = 'v0.0.0-dev';

/** ③ 的截短长度：与 ② 在无 tag 仓库下的短 SHA 形态（默认 7 位）对齐。 */
const SHORT_SHA_LENGTH = 7;

/** ② 的取值器；取不到返回 undefined（而不是抛错），便于回退到 ③。 */
export type DescribeVersion = () => string | undefined;

function readGitDescribe(): string | undefined {
  try {
    const described = execFileSync('git', ['describe', '--tags', '--always'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return described || undefined;
  } catch {
    // 浅克隆 / 无 .git / 非仓库目录：交给回退链的下一级
    return undefined;
  }
}

/**
 * 按冻结契约的回退链解析版本号。纯函数：环境变量与 `git describe` 取值器都可注入，
 * 方便单测覆盖「无 git 元数据 + 有 CF_PAGES_COMMIT_SHA」这类只能在 CI 里复现的分支。
 */
export function resolveVersion(
  env: NodeJS.ProcessEnv = process.env,
  describe: DescribeVersion = readGitDescribe,
): string {
  // ① HUB_VERSION：显式覆盖优先，本地构建与特殊场景用
  const injected = env.HUB_VERSION?.trim();
  if (injected) return injected;

  // ② git describe --tags --always
  const described = describe()?.trim();
  if (described) return described;

  // ③ Cloudflare Pages 构建环境原生变量，截短为 7 位短 SHA
  // 统一转小写：`git describe` 输出的是小写短 SHA，两条线要比对同一个值（§12 第 10 条）
  const commitSha = env.CF_PAGES_COMMIT_SHA?.trim().toLowerCase();
  if (commitSha) return commitSha.slice(0, SHORT_SHA_LENGTH);

  // ④ 全都不可用才回退占位符
  return UNKNOWN_VERSION;
}

let cached: { version: string; builtAt: string } | undefined;

export function getBuildInfo(): { version: string; builtAt: string } {
  cached ??= {
    version: resolveVersion(),
    builtAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
  };
  return cached;
}
