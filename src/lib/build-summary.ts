/**
 * 双线重建的构建摘要（SPEC §9.2 / §9.3 / §12 第 7 条）。
 *
 * 摘要必须含：自动字段刷新结果 + archive/久未更新异常项目清单 + 链接健康（连续失败点名）
 * + 两侧发布结果（一侧失败不影响另一侧，各自独立报错）。
 *
 * 渲染是纯函数，CI 侧只负责把报告文件读进来、把 Markdown 写进 `$GITHUB_STEP_SUMMARY`。
 */
import { z } from 'zod';

import { linkHealthReportSchema, type LinkHealthReport } from './link-health.js';

// ---------------------------------------------------------------------------
// 输入：抓取报告（由 scripts/fetch-github-meta.ts 产出）
// ---------------------------------------------------------------------------

export const metaReportSchema = z.strictObject({
  generatedAt: z.string(),
  apiBase: z.string(),
  authenticated: z.boolean(),
  fetchSkipped: z.boolean(),
  cachePath: z.string(),
  cacheChanged: z.boolean(),
  counts: z.strictObject({
    repos: z.number().int().nonnegative(),
    fetched: z.number().int().nonnegative(),
    fromCache: z.number().int().nonnegative(),
    degradedToEmpty: z.number().int().nonnegative(),
    dataErrors: z.number().int().nonnegative(),
  }),
  projects: z.array(
    z.strictObject({
      slug: z.string(),
      repo: z.string(),
      metaStatus: z.enum(['ok', 'cached', 'empty']),
      metaReason: z.string().nullable(),
      stars: z.number().int().nonnegative().nullable(),
      pushedAt: z.string().nullable(),
      archived: z.boolean().nullable(),
    }),
  ),
  anomalies: z.array(z.strictObject({ repo: z.string(), reasons: z.array(z.string()) })),
  warnings: z.array(z.string()),
});

export type MetaReport = z.infer<typeof metaReportSchema>;

export type PublishSide = 'github-pages' | 'cloudflare-pages';

export interface PublishOutcome {
  side: PublishSide;
  /** 该 job 的 `needs.<job>.result`：success / failure / cancelled / skipped */
  result: string;
  /** 人类可读的一句话说明（演练模式、未配置 secret 等） */
  detail: string;
}

export interface BuildSummaryContext {
  /** 触发事件：push / schedule / workflow_dispatch */
  event: string;
  ref: string;
  sha: string;
  /** git describe 注入的版本号（与页脚一致） */
  version: string;
  generatedAt: string;
  /** 演练模式：只构建 + 出摘要，不实际发布 */
  dryRun: boolean;
  /** 演练注入的失败侧（none / pages / cloudflare） */
  simulateFailure: string;
  runUrl?: string | undefined;
}

export interface BuildSummaryInput {
  context: BuildSummaryContext;
  meta: MetaReport | null;
  links: LinkHealthReport | null;
  /** 链接健康是否本次运行（推送构建不跑巡检，§9.3 只在每日重建执行） */
  linksExpected: boolean;
  publishing: PublishOutcome[];
}

// ---------------------------------------------------------------------------
// 报告解析（跨 job 传文件，损坏时降级为「未取得」而不是让摘要步骤失败）
// ---------------------------------------------------------------------------

export function parseMetaReport(raw: unknown): MetaReport | null {
  const parsed = metaReportSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseLinkHealthReport(raw: unknown): LinkHealthReport | null {
  const parsed = linkHealthReportSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

const cell = (value: string): string => value.replaceAll('|', '\\|');

/** 摘要里展示仓库内相对路径（CI 绝对路径冗长且无意义） */
const shortPath = (path: string): string => {
  const marker = '/src/';
  const index = path.indexOf(marker);
  return index >= 0 ? `src/${path.slice(index + marker.length)}` : path;
};
const table = (header: string[], rows: string[][]): string =>
  [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`]
    .concat(rows.map((row) => `| ${row.map(cell).join(' | ')} |`))
    .join('\n');

const PUBLISH_LABELS: Record<PublishSide, string> = {
  'github-pages': 'GitHub Pages 镜像（workerhub.github.io）',
  'cloudflare-pages': 'Cloudflare Pages 主站（hub.oneboy.app）',
};

const RESULT_LABELS: Record<string, string> = {
  success: '✅ 成功',
  failure: '❌ 失败',
  cancelled: '⏹ 已取消',
  skipped: '⏭ 已跳过',
};

const statusLabel = (status: string): string => RESULT_LABELS[status] ?? status;

/**
 * 由 job 结果 + 运行模式推导一句话说明（§0 / §9.2：两侧各自独立报错）。
 * 纯函数：摘要里「一侧失败、另一侧照常」的结论就靠它落到文字上。
 */
export function describePublishOutcome(
  side: PublishSide,
  result: string,
  options: { dryRun: boolean; simulateFailure: string },
): string {
  const injected = options.simulateFailure === (side === 'github-pages' ? 'pages' : 'cloudflare');
  if (result === 'skipped') {
    return options.dryRun ? '演练模式未执行' : '本次未执行（构建未成功）';
  }
  if (options.dryRun) {
    if (result === 'success') return '演练：模拟发布成功（未实际发布）';
    if (result === 'failure') {
      return injected
        ? '演练注入失败：本侧按预期失败，另一侧独立执行不受影响'
        : '演练：本侧执行失败（未注入）';
    }
    return `演练：${statusLabel(result)}`;
  }
  if (result === 'success') return '已发布（同一提交、同一份 dist/）';
  if (result === 'failure') return '发布失败：见本 job 日志（另一侧独立执行）';
  return statusLabel(result);
}

function renderContext(context: BuildSummaryContext): string {
  const mode = context.dryRun
    ? `演练（dry_run，不实际发布${context.simulateFailure !== 'none' ? `；注入失败侧 = ${context.simulateFailure}` : ''}）`
    : '正式（真实发布）';
  return table(
    ['项', '值'],
    [
      ['触发', `\`${context.event}\``],
      ['分支', `\`${context.ref}\``],
      ['提交', `\`${context.sha.slice(0, 12)}\``],
      ['版本号（git describe）', `\`${context.version}\``],
      ['模式', mode],
      ['生成时间', `${context.generatedAt}（UTC）`],
      ...(context.runUrl ? [['运行记录', context.runUrl]] : []),
    ],
  );
}

function renderMeta(meta: MetaReport | null): string {
  if (!meta) {
    return '未取得自动字段抓取报告（`github-meta-report.json` 缺失或损坏）——本次构建的自动字段结果未知。';
  }
  const { counts } = meta;
  const lines: string[] = [
    `- 仓库数：**${counts.repos}**；抓取成功 **${counts.fetched}**；缓存兜底 **${counts.fromCache}**；降级置空 **${counts.degradedToEmpty}**；数据错误 **${counts.dataErrors}**`,
    `- API：\`${meta.apiBase}\`（${meta.authenticated ? '工作流自带 token' : '未认证额度'}）${meta.fetchSkipped ? '；本次跳过抓取（HUB_SKIP_FETCH=1）' : ''}`,
    `- 缓存文件：\`${shortPath(meta.cachePath)}\`（${meta.cacheChanged ? '**本次有变化**，已作为运行产物上传，由维护者随数据 PR 提交；工作流不向 main 写提交' : '无变化'}）`,
  ];

  const degraded = meta.projects.filter((project) => project.metaStatus !== 'ok');
  if (degraded.length > 0) {
    lines.push(
      '',
      '自动字段未直连成功的项目（走缓存/置空，页面正常渲染，§9.2 降级路径）：',
      '',
      table(
        ['项目', '仓库', '结果', '原因'],
        degraded.map((project) => [
          project.slug,
          `\`${project.repo}\``,
          project.metaStatus === 'cached' ? '缓存兜底' : '置空',
          project.metaReason ?? '—',
        ]),
      ),
    );
  }

  if (meta.warnings.length > 0) {
    lines.push('', '<details><summary>抓取警告（' + meta.warnings.length + ' 条）</summary>', '');
    for (const warning of meta.warnings) lines.push(`- ${warning}`);
    lines.push('', '</details>');
  }

  return lines.join('\n');
}

function renderAnomalies(meta: MetaReport | null): string {
  if (!meta) return '未取得抓取报告，无法判断 archive / 久未更新。';
  if (meta.anomalies.length === 0) {
    return '无：本次没有任何项目被 archive 或超过 365 天未更新（§6.3 / §9.2）。';
  }
  return [
    `以下 **${meta.anomalies.length}** 个项目需要维护者判断是否下架或修正（**本工作流不自动改数据**，下架走人工数据 PR）：`,
    '',
    table(
      ['仓库', '异常'],
      meta.anomalies.map((anomaly) => [`\`${anomaly.repo}\``, anomaly.reasons.join('；')]),
    ),
  ].join('\n');
}

function renderLinks(links: LinkHealthReport | null, expected: boolean): string {
  if (!links) {
    return expected
      ? '未取得链接健康报告（`link-health-report.json` 缺失或损坏）。'
      : '本次不是每日重建，未跑外链巡检（§9.3 只在每日重建执行）。';
  }
  const lines: string[] = [
    `- 外链 **${links.totals.links}** 条：可达 **${links.totals.ok}**；失败 **${links.totals.failed}**；需人工确认 **${links.totals.blocked}**；连续失败 **${links.totals.chronic}**（阈值：连续 ${links.threshold} 次）`,
  ];

  if (links.chronicFailures.length > 0) {
    lines.push(
      '',
      `**连续失败点名（${links.chronicFailures.length} 条）** —— 是否下架/修正走人工数据 PR，本工作流不改数据：`,
      '',
      table(
        ['链接', '连续失败', '涉及项目', '最近一次结果'],
        links.chronicFailures.map((failure) => [
          failure.url,
          `${failure.consecutiveFailures} 次`,
          failure.slugs.join('、'),
          failure.detail,
        ]),
      ),
    );
  } else {
    lines.push('', '无连续失败项目。');
  }

  if (links.needsReview.length > 0) {
    lines.push(
      '',
      `<details><summary>需人工确认（反爬/限流，未计入失败，${links.needsReview.length} 条）</summary>`,
      '',
      ...links.needsReview.map(
        (item) => `- ${item.url}（${item.slugs.join('、')}）：${item.detail}`,
      ),
      '',
      '</details>',
    );
  }

  const failedNow = links.rows.filter((row) => row.outcome === 'failed' && !row.chronic);
  if (failedNow.length > 0) {
    lines.push(
      '',
      `本次首次失败（尚未达到点名阈值，${failedNow.length} 条）：`,
      '',
      table(
        ['链接', '涉及项目', '结果'],
        failedNow.map((row) => [row.url, row.slugs.join('、'), row.detail]),
      ),
    );
  }

  return lines.join('\n');
}

function renderPublishing(publishing: PublishOutcome[], context: BuildSummaryContext): string {
  if (publishing.length === 0) return '未取得发布结果。';
  const lines: string[] = [
    table(
      ['一侧', '结果', '说明'],
      publishing.map((outcome) => [
        PUBLISH_LABELS[outcome.side],
        statusLabel(outcome.result),
        outcome.detail,
      ]),
    ),
  ];
  const failed = publishing.filter((outcome) => outcome.result === 'failure');
  if (failed.length > 0) {
    lines.push(
      '',
      `**独立报错**：${failed.map((outcome) => PUBLISH_LABELS[outcome.side]).join('、')} 失败；另一侧${failed.length === publishing.length ? '（同样失败）' : '按独立 job 正常执行，不受影响'}（§0 / §9.2：一侧失败不阻塞另一侧）。`,
    );
  }
  if (context.dryRun) {
    lines.push(
      '',
      '> 演练模式（`dry_run=true`）：构建与摘要真实执行，**未调用 GitHub Pages 发布动作、未调用 Cloudflare deploy hook**。',
    );
  }
  return lines.join('\n');
}

/** 渲染完整摘要（Markdown，直接写进 GitHub Actions summary） */
export function renderBuildSummary(input: BuildSummaryInput): string {
  const { context, meta, links, linksExpected, publishing } = input;
  return [
    '## 双线重建摘要（hub）',
    '',
    '同一提交 → 同一份 `dist/` 产物 → 双线发布：GitHub Pages 镜像 + Cloudflare Pages 主站（SPEC §0 / §8.1 / §9.2）。',
    '',
    '### 本次运行',
    '',
    renderContext(context),
    '',
    '### 自动字段刷新结果（§9.2）',
    '',
    renderMeta(meta),
    '',
    '### 异常项目清单：archive / 超过 365 天未更新（§6.3 / §9.2）',
    '',
    renderAnomalies(meta),
    '',
    '### 链接健康（§9.3）',
    '',
    renderLinks(links, linksExpected),
    '',
    '### 双线发布结果（§0 / §9.2）',
    '',
    renderPublishing(publishing, context),
    '',
    '---',
    '',
    '维护者提示：本工作流只构建、发布与出摘要，**不自动改数据、不自动下架、不向 main 写提交**；异常项目与坏链的处置走人工数据 PR。',
    '',
  ].join('\n');
}
