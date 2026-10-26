/**
 * 投稿 PR 变更范围校验（SPEC §7：投稿 PR 只新增/修改 `src/data/projects/<slug>.yaml`
 * 及可选截图，「不许在投稿 PR 中改代码」）。
 *
 * 生效条件：PR 描述里带投稿标记 `<!-- hub-submission-pr -->`
 * （`.github/PULL_REQUEST_TEMPLATE.md` 自带该标记，投稿者无需自己写）。
 * 维护者自己的数据 PR / 代码 PR 不写标记即不受此限制——这条规则是为外部投稿者划边界，
 * 不是给仓库常规开发加锁。
 *
 * 纯函数在这里（便于单测），git 调用在 scripts/check-pr-scope.ts。
 */

/** 投稿标记：PR 描述中**单独占一行**时生效（模板把标记放在首行） */
export const SUBMISSION_PR_MARKER = '<!-- hub-submission-pr -->';

/** 允许的变更路径：数据文件与截图（§7 + §4.1 固定路径） */
export const ALLOWED_SUBMISSION_PATHS = [
  /^src\/data\/projects\/[a-z0-9-]+\.ya?ml$/,
  /^public\/screenshots\/[a-z0-9-]+\.webp$/,
] as const;

export const isSubmissionPr = (body: string | undefined | null): boolean =>
  typeof body === 'string' &&
  body.split(/\r?\n/).some((line) => line.trim().toLowerCase() === SUBMISSION_PR_MARKER);

export const isAllowedSubmissionPath = (path: string): boolean =>
  ALLOWED_SUBMISSION_PATHS.some((pattern) => pattern.test(path));

export interface ScopeResult {
  /** 不在允许范围内的文件 */
  outOfScope: string[];
  /** 允许范围内的文件 */
  inScope: string[];
}

/** 拆分变更文件列表，区分允许 / 越界 */
export function classifySubmissionPaths(paths: string[]): ScopeResult {
  const outOfScope: string[] = [];
  const inScope: string[] = [];
  for (const path of paths.map((value) => value.trim()).filter(Boolean)) {
    if (isAllowedSubmissionPath(path)) inScope.push(path);
    else outOfScope.push(path);
  }
  return { outOfScope, inScope };
}
