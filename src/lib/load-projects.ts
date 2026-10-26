/** 从磁盘读取并校验数据文件（脚本共用，不参与页面渲染） */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatIssues, validateProjectFiles, type ValidatedProject } from './validate-projects.js';

const DATA_FILE = /\.ya?ml$/i;

export interface LoadProjectsResult {
  ok: boolean;
  projects: ValidatedProject[];
  message: string;
}

/** 读取目录下全部 YAML 数据文件并做集合级校验 */
export function loadProjects(dir: string): LoadProjectsResult {
  let entries: string[];
  try {
    entries = readdirSync(dir)
      .filter((name) => DATA_FILE.test(name))
      .sort();
  } catch {
    return { ok: false, projects: [], message: `数据目录不存在：${dir}` };
  }

  const files = entries.map((name) => ({
    file: name,
    contents: readFileSync(join(dir, name), 'utf8'),
  }));

  const result = validateProjectFiles(files);
  if (!result.ok) {
    return { ok: false, projects: [], message: formatIssues(result.issues) };
  }

  return {
    ok: true,
    projects: result.projects,
    message: `数据文件校验通过：${result.projects.length} 个项目（目录 ${dir}）`,
  };
}
