#!/usr/bin/env tsx
/**
 * 投稿数据校验 CLI（SPEC §7「CI 自动校验」的联网部分）。
 *
 * 用法：
 *   pnpm validate:submission                 # 三项全跑：repo 核验 + 外链可达性 + 截图规格
 *   pnpm check:repos                         # 只做 repo「存在且 public」核验
 *   pnpm check:links                         # 只做外链可达性
 *   pnpm check:screenshots                   # 只做截图规格
 *   pnpm validate:submission --fail-on-warnings   # 把外链警告也升级为失败（维护者本地复核用）
 *
 * 环境变量（均可缺省，生产 CI 无需额外配置）：
 *   HUB_PROJECTS_DIR     数据文件目录（默认 src/data/projects）
 *   HUB_SCREENSHOTS_DIR  截图目录（默认 public/screenshots）
 *   GITHUB_API_BASE      GitHub API 基址（演练时指向不可达地址）
 *   GITHUB_TOKEN         CI 工作流自带只读 token（可选；不要求任何 PAT 入仓）
 *   HUB_LINK_TIMEOUT_MS  单条外链探测超时（默认 8000）
 *
 * 退出码：
 *   0  没有硬拦问题（允许存在 warning）
 *   1  有硬拦问题（§7：repo 不存在/私有、官方与演示站外链失败、截图不合规…）
 *     传入 --fail-on-warnings 时，warning 也会导致退出码 1
 */
import { resolve } from 'node:path';
import { PROJECTS_DIR, GITHUB_API_BASE, GITHUB_TOKEN } from '../src/lib/build-config.js';
import { loadProjects } from '../src/lib/load-projects.js';
import {
  DEFAULT_LINK_TIMEOUT_MS,
  checkLinks,
  checkRepos,
  checkScreenshots,
  formatFindings,
  summarize,
  type CheckName,
  type Finding,
} from '../src/lib/submission-checks.js';

const ALL_CHECKS: CheckName[] = ['repos', 'links', 'screenshots'];

const parseArgs = (argv: string[]): { checks: CheckName[]; failOnWarnings: boolean } => {
  let checks = ALL_CHECKS;
  let failOnWarnings = false;
  for (const arg of argv) {
    if (arg === '--fail-on-warnings') {
      failOnWarnings = true;
      continue;
    }
    if (arg.startsWith('--checks=')) {
      const requested = arg
        .slice('--checks='.length)
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
      const unknown = requested.filter((name) => !ALL_CHECKS.includes(name as CheckName));
      if (unknown.length > 0) {
        console.error(`未知检查项：${unknown.join(', ')}（可选：${ALL_CHECKS.join(' / ')}）`);
        process.exit(2);
      }
      checks = requested as CheckName[];
    }
  }
  return { checks, failOnWarnings };
};

const screenshotsDir = resolve(process.env.HUB_SCREENSHOTS_DIR ?? 'public/screenshots');
const timeoutMs = Number(process.env.HUB_LINK_TIMEOUT_MS ?? DEFAULT_LINK_TIMEOUT_MS);
const { checks, failOnWarnings } = parseArgs(process.argv.slice(2));

const loaded = loadProjects(PROJECTS_DIR);
if (!loaded.ok) {
  console.error(loaded.message);
  process.exit(1);
}
console.log(loaded.message);
console.log(`检查项：${checks.join(' / ')}`);

const findings: Finding[] = [];
for (const check of checks) {
  if (check === 'repos') {
    findings.push(
      ...(await checkRepos(loaded.projects, {
        apiBase: GITHUB_API_BASE,
        token: GITHUB_TOKEN,
        timeoutMs,
      })),
    );
  } else if (check === 'links') {
    findings.push(...(await checkLinks(loaded.projects, { timeoutMs })));
  } else {
    findings.push(...checkScreenshots(loaded.projects, { screenshotsDir }));
  }
}

const summary = summarize(findings);
const failed = summary.errors.length > 0 || (failOnWarnings && summary.warnings.length > 0);

if (findings.length > 0) {
  console.log(
    `\n投稿校验结果（硬拦 ${summary.errors.length} 项 / 警告 ${summary.warnings.length} 项）：`,
  );
  console.log(formatFindings(summary));
} else {
  console.log('投稿校验通过：repo 均存在且 public、外链可达、截图合规');
}

if (summary.warnings.length > 0) {
  console.log('\n警告不阻断 CI（§7：外链失败给 warning，由评审人人工确认）');
}

process.exit(failed ? 1 : 0);
