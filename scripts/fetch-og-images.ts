#!/usr/bin/env tsx
/**
 * 构建期把仓库 OG 图本地化（SPEC §8.3 截图回退链第 2 级）。
 *
 * 「构建时抓取并本地化缓存」= 落盘到 public/og/github/<owner>-<repo>.png，随构建产物一起发布；
 * 页面只引用本站路径，**禁止**详情页/卡片热链 GitHub（含 repository-images / opengraph 临时地址）。
 *
 * 容错与 §9.2 一致：单张图下载失败不许让构建失败——已存在的旧图保留，没有就退到「分类着色首字图」。
 * 出于构建时长与礼貌，只在缺图时下载；`HUB_OG_FORCE=1` 可强制刷新。
 *
 * 退出码：恒为 0（除数据文件非法，那由前面的 fetch-github-meta.ts 拦住）。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { loadProjects } from '../src/lib/load-projects.js';
import {
  GITHUB_TOKEN,
  META_CACHE_PATH,
  PROJECTS_DIR,
  SKIP_FETCH,
} from '../src/lib/build-config.js';
import { readMetaCache } from '../src/lib/github-meta.js';
import { OG_IMAGE_PUBLIC_DIR, ogImageFileName } from '../src/lib/og-path.js';

const PUBLIC_DIR = resolve('public');
const OG_DIR = resolve(PUBLIC_DIR, OG_IMAGE_PUBLIC_DIR);
const REPORT_PATH = resolve(process.env.HUB_OG_REPORT ?? 'og-report.json');
const FORCE = process.env.HUB_OG_FORCE === '1';
const SKIP = SKIP_FETCH || process.env.HUB_SKIP_OG === '1';
const TIMEOUT_MS = 10_000;
const CONCURRENCY = 4;

interface OgOutcome {
  repo: string;
  file: string;
  status: 'downloaded' | 'cached' | 'failed' | 'skipped';
  source?: string;
  reason?: string;
}

const loaded = loadProjects(PROJECTS_DIR);
if (!loaded.ok) {
  // 数据文件非法时由 fetch-github-meta.ts 先行失败并给出字段级报错；这里只提醒、不重复阻断
  console.warn('⚠ 数据文件校验未通过，跳过 OG 图本地化');
  process.exit(0);
}

const repos = [...new Set(loaded.projects.map((project) => project.data.repo))];
const cache = readMetaCache(META_CACHE_PATH);

async function download(repo: string): Promise<OgOutcome> {
  const fileName = ogImageFileName(repo);
  const filePath = resolve(OG_DIR, fileName);
  const publicPath = `/${OG_IMAGE_PUBLIC_DIR}/${fileName}`;

  if (existsSync(filePath) && !FORCE) {
    return { repo, file: publicPath, status: 'cached' };
  }
  if (SKIP) {
    return existsSync(filePath)
      ? { repo, file: publicPath, status: 'cached', reason: '抓取已禁用' }
      : { repo, file: publicPath, status: 'skipped', reason: '抓取已禁用' };
  }

  // 优先用抓取结果里的 OG 地址；缓存里没有就按 §9.2 的规范地址拼（非临时 URL）
  const source =
    cache.repos[repo]?.openGraphImage ?? `https://opengraph.githubassets.com/1/${repo}`;
  const headers: Record<string, string> = {
    'user-agent': 'workerhub-hub-build (+https://hub.oneboy.app)',
  };
  if (GITHUB_TOKEN) headers.authorization = `Bearer ${GITHUB_TOKEN}`;

  try {
    const response = await fetch(source, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        repo,
        file: publicPath,
        status: 'failed',
        source,
        reason: `HTTP ${response.status}`,
      };
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      return {
        repo,
        file: publicPath,
        status: 'failed',
        source,
        reason: `内容类型异常：${contentType}`,
      };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength < 512) {
      return { repo, file: publicPath, status: 'failed', source, reason: '图片体积异常' };
    }
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, buffer);
    return { repo, file: publicPath, status: 'downloaded', source };
  } catch (error) {
    return {
      repo,
      file: publicPath,
      status: 'failed',
      source,
      reason: (error as Error).message,
    };
  }
}

const outcomes: OgOutcome[] = [];
for (let index = 0; index < repos.length; index += CONCURRENCY) {
  const batch = repos.slice(index, index + CONCURRENCY);
  const results = await Promise.all(batch.map((repo) => download(repo)));
  outcomes.push(...results);
}

for (const outcome of outcomes) {
  if (outcome.status === 'failed') {
    console.warn(`⚠ ${outcome.repo} OG 图本地化失败（${outcome.reason}）；回退到分类着色首字图`);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  force: FORCE,
  skipped: SKIP,
  counts: {
    repos: repos.length,
    downloaded: outcomes.filter((outcome) => outcome.status === 'downloaded').length,
    cached: outcomes.filter((outcome) => outcome.status === 'cached').length,
    failed: outcomes.filter((outcome) => outcome.status === 'failed').length,
    skipped: outcomes.filter((outcome) => outcome.status === 'skipped').length,
  },
  outcomes,
};
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

console.log(
  `OG 图本地化完成：${report.counts.repos} 个仓库（新下载 ${report.counts.downloaded}，已有 ${report.counts.cached}，失败 ${report.counts.failed}）`,
);
