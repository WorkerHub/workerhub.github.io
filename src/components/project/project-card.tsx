/**
 * 统一项目卡片（SPEC §2 / §4.3）：首页、全部项目页、分类页、详情页底部推荐共用这一个组件。
 *
 * 静态页面里由 Astro 在构建期渲染成 HTML（不挂 client 指令，零 JS）；
 * 列表页的 Explorer island 里复用同一个组件，因此三处徽章与入口不可能不一致。
 */
import { ArrowUpRight, ChevronRight } from 'lucide-react';

import {
  AutoMeta,
  ComingSoonBadge,
  DifficultyBadge,
  FreeTierBadge,
  ResourceBadges,
  StaleBadge,
  TierBadge,
} from '@/components/project/badges';
import { ProjectThumb } from '@/components/project/project-thumb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { primaryEntry } from '@/lib/project-entry';
import { CATEGORY_LABELS, type ProjectView } from '@/lib/project-types';
import { cn } from '@/lib/utils';

export function ProjectCard({ project, className }: { project: ProjectView; className?: string }) {
  const entry = primaryEntry(project);
  const detailHref = `/p/${project.slug}/`;

  return (
    <article
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs transition-shadow hover:shadow-md focus-within:shadow-md',
        className,
      )}
    >
      <a href={detailHref} className="block focus-visible:outline-offset-[-2px]" tabIndex={-1}>
        <ProjectThumb project={project} />
      </a>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <TierBadge source={project.source} tier={project.tier} />
          {project.status === 'coming-soon' && <ComingSoonBadge />}
          {project.status !== 'coming-soon' && project.stale && (
            <StaleBadge archived={project.archived} />
          )}
        </div>

        <h3 className="text-base leading-tight font-semibold tracking-tight">
          <a href={detailHref} className="hover:underline focus-visible:underline">
            {project.name}
          </a>
        </h3>

        <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{project.tagline}</p>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" asChild title={`分类：${CATEGORY_LABELS[project.category]}`}>
            <a href={`/categories/${project.category}/`}>{CATEGORY_LABELS[project.category]}</a>
          </Badge>
          <DifficultyBadge difficulty={project.difficulty} />
          <FreeTierBadge freeTier={project.freeTier} />
        </div>

        <ResourceBadges resources={project.resources} />

        <div className="mt-auto space-y-2.5 pt-1">
          <AutoMeta project={project} />
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <a
                href={entry.href}
                {...(entry.external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
              >
                {entry.label}
                <ArrowUpRight aria-hidden="true" />
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={detailHref}>
                详情
                <ChevronRight aria-hidden="true" />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
export default ProjectCard;
