/**
 * 构建期路径与开关（环境变量集中处，方便 CI / 演练注入）。
 *
 * 生产构建不需要设置任何变量；下列变量只用于本地与 CI 演练：
 *   HUB_PROJECTS_DIR  数据文件目录（默认 src/data/projects）
 *   HUB_META_CACHE    GitHub 自动字段缓存（默认 src/data/cache/github-meta.json）
 *   HUB_META_REPORT   抓取报告输出路径（默认 github-meta-report.json，已在 .gitignore）
 *   GITHUB_API_BASE   GitHub API 基址（默认 https://api.github.com；演练时指向不可达地址）
 *   GITHUB_TOKEN      CI 工作流自带只读 token（可选，本地缺省走未认证额度）
 *   HUB_SKIP_FETCH    置 1 时完全跳过抓取，只用缓存/空值（演练降级路径最简方式）
 *   HUB_VERSION       覆盖页脚版本号（CI 注入 git describe；本地缺省现场取）
 */
import { resolve } from 'node:path';

const env = process.env;

export const PROJECTS_DIR = resolve(env.HUB_PROJECTS_DIR ?? 'src/data/projects');
export const META_CACHE_PATH = resolve(env.HUB_META_CACHE ?? 'src/data/cache/github-meta.json');
export const META_REPORT_PATH = resolve(env.HUB_META_REPORT ?? 'github-meta-report.json');
export const GITHUB_API_BASE = env.GITHUB_API_BASE ?? 'https://api.github.com';
export const GITHUB_TOKEN = env.GITHUB_TOKEN;
export const SKIP_FETCH = env.HUB_SKIP_FETCH === '1';
