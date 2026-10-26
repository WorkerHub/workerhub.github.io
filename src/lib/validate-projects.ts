/**
 * 数据文件集合级校验：单文件 schema（project-schema.ts）+ 跨文件规则（SPEC §7 CI 校验）。
 *
 * 纯函数设计，不读磁盘，便于测试；磁盘读取在 scripts/validate-data.ts 里做。
 */
import { parse as parseYaml } from 'yaml';
import { projectSchema, type ProjectInput } from './project-schema.js';

export interface SourceFile {
  /** 文件名（含扩展名），用于报错定位 */
  file: string;
  /** 文件内容 */
  contents: string;
}

export interface ValidationIssue {
  file: string;
  /** 字段路径，如 `deploy.url`；文件级问题用 `<file>` */
  path: string;
  message: string;
}

export interface ValidatedProject {
  file: string;
  slug: string;
  data: ProjectInput;
}

export type ValidationResult =
  { ok: true; projects: ValidatedProject[] } | { ok: false; issues: ValidationIssue[] };

/** 从文件名推导 slug（`cloud-mail.yaml` → `cloud-mail`） */
export const slugFromFilename = (file: string): string => file.replace(/\.ya?ml$/i, '');

/**
 * 校验一组数据文件。
 * - 单文件字段非法 / 出现未知键 / 出现自动字段 → 报该文件与该字段
 * - slug 与文件名不一致、slug 或 repo 重复 → 跨文件错误
 */
export function validateProjectFiles(files: SourceFile[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  const projects: ValidatedProject[] = [];
  const bySlug = new Map<string, string>();
  const byRepo = new Map<string, string>();

  for (const file of [...files].sort((a, b) => a.file.localeCompare(b.file))) {
    let raw: unknown;
    try {
      raw = parseYaml(file.contents);
    } catch (error) {
      issues.push({
        file: file.file,
        path: '<file>',
        message: `YAML 解析失败：${(error as Error).message}`,
      });
      continue;
    }

    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      issues.push({
        file: file.file,
        path: '<file>',
        message: '数据文件必须是一个 YAML 映射（key: value）',
      });
      continue;
    }

    const parsed = projectSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        // 未知字段（含 §9.2 禁写的自动字段）把字段名放进 path，便于 CI 日志一眼定位
        const unknownKeys =
          issue.code === 'unrecognized_keys'
            ? (issue as unknown as { keys?: string[] }).keys
            : undefined;
        const path =
          unknownKeys && unknownKeys.length > 0
            ? unknownKeys.join(', ')
            : issue.path.length > 0
              ? issue.path.join('.')
              : '<file>';
        issues.push({ file: file.file, path, message: issue.message });
      }
      continue;
    }

    const project = parsed.data;
    const expectedSlug = slugFromFilename(file.file);
    if (project.slug !== expectedSlug) {
      issues.push({
        file: file.file,
        path: 'slug',
        message: `slug（${project.slug}）必须与文件名（${expectedSlug}）一致`,
      });
    }

    const slugOwner = bySlug.get(project.slug);
    if (slugOwner) {
      issues.push({
        file: file.file,
        path: 'slug',
        message: `slug 重复：${project.slug} 已被 ${slugOwner} 使用`,
      });
    } else {
      bySlug.set(project.slug, file.file);
    }

    const repoKey = project.repo.toLowerCase();
    const repoOwner = byRepo.get(repoKey);
    if (repoOwner) {
      issues.push({
        file: file.file,
        path: 'repo',
        message: `repo 重复：${project.repo} 已被 ${repoOwner} 使用（§7 按 slug 与 repo 双维度查重）`,
      });
    } else {
      byRepo.set(repoKey, file.file);
    }

    projects.push({ file: file.file, slug: project.slug, data: project });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, projects };
}

/** 把校验问题渲染成可直接贴进 CI 日志的文本 */
export function formatIssues(issues: ValidationIssue[]): string {
  const lines = issues.map((issue) => `  ✗ ${issue.file} → 字段 ${issue.path}：${issue.message}`);
  return [`数据文件校验失败（${issues.length} 处）：`, ...lines].join('\n');
}
