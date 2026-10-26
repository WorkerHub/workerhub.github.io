/**
 * 入口按钮的唯一真源（SPEC §4.3 卡片主入口 + §5 详情页按钮呈现）。
 *
 * 卡片与详情页都从这里取链接与文案，避免「同一项目在两个页面按钮不一致」。
 * 判定依据只有数据字段：第三方 = 仓库；官方 = 在线演示（有 homepage）或仓库；
 * coming-soon（waker 预告位）= 不给部署入口，只给仓库。
 */
import { DEPLOY_METHOD_META, type ProjectView } from './project-types';

export interface EntryLink {
  href: string;
  label: string;
  kind: 'repo' | 'demo' | 'deploy' | 'docs';
  /** 外部链接（新标签打开） */
  external: boolean;
}

const isExternal = (href: string): boolean => /^https?:\/\//.test(href);

const link = (href: string, label: string, kind: EntryLink['kind']): EntryLink => ({
  href,
  label,
  kind,
  external: isExternal(href),
});

/** 卡片主入口（§4.3）：官方=在线演示或仓库；第三方=仓库 */
export function primaryEntry(project: ProjectView): EntryLink {
  if (project.source === 'official' && project.homepage) {
    return link(project.homepage, '在线演示', 'demo');
  }
  return link(project.repoUrl, '查看仓库', 'repo');
}

/** §5 部署动作按钮：按 deploy.method 如实呈现，宁可低标不许高标 */
export function deployAction(project: ProjectView): EntryLink {
  const meta = DEPLOY_METHOD_META[project.deploy.method];
  switch (project.deploy.method) {
    case 'deploy-button':
      return link(project.deploy.url ?? project.repoUrl, meta.actionLabel, 'deploy');
    case 'git-integration':
    case 'github-actions':
    case 'wrangler':
      return link(
        project.deploy.guideUrl ?? project.docsUrl ?? project.repoUrl,
        meta.actionLabel,
        'deploy',
      );
    case 'docs-only':
    default:
      return link(project.repoUrl, meta.actionLabel, 'repo');
  }
}

/** 详情页的补充入口：在线演示 / 部署文档 / 仓库（去重、去空） */
export function secondaryEntries(project: ProjectView): EntryLink[] {
  const candidates: EntryLink[] = [];
  if (project.homepage) candidates.push(link(project.homepage, '在线演示', 'demo'));
  if (project.docsUrl) candidates.push(link(project.docsUrl, '部署文档', 'docs'));
  candidates.push(link(project.repoUrl, 'GitHub 仓库', 'repo'));

  const primary = deployAction(project).href;
  const seen = new Set<string>([primary]);
  return candidates.filter((entry) => {
    if (seen.has(entry.href)) return false;
    seen.add(entry.href);
    return true;
  });
}
