/**
 * 截图回退链（SPEC §8.3）：项目截图 → 仓库 OG 图（已构建期本地化）→ 按分类着色的名称首字图。
 *
 * 前两级由构建期 `project-view.ts` 判定文件是否真的存在，因此运行时不出现破图；
 * 第三级是纯 CSS 渐变 + 首字，任何情况下都能渲染。禁止热链 GitHub 临时 URL。
 */
import { cn } from '@/lib/utils';
import { CATEGORY_LABELS, CATEGORY_THUMB_CLASSES, type ProjectView } from '@/lib/project-types';

export function ProjectThumb({
  project,
  variant = 'card',
  className,
}: {
  project: ProjectView;
  variant?: 'card' | 'detail';
  className?: string;
}) {
  const src = project.screenshot ?? project.ogImage;
  const isOg = !project.screenshot && project.ogImage !== null;
  const alt = isOg
    ? `${project.name} 的仓库预览图`
    : project.screenshot
      ? `${project.name} 项目截图`
      : `${project.name}（${CATEGORY_LABELS[project.category]}）占位图`;

  const frame = cn(
    'relative overflow-hidden rounded-lg border border-border bg-muted',
    variant === 'card' ? 'aspect-[16/9]' : 'aspect-[2/1]',
    className,
  );

  if (src) {
    return (
      <div className={frame}>
        <img
          src={src}
          alt={alt}
          loading={variant === 'detail' ? 'eager' : 'lazy'}
          decoding="async"
          width={1280}
          height={640}
          className="size-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      </div>
    );
  }

  const initial = [...project.name][0] ?? '?';
  return (
    <div
      className={cn(
        frame,
        'flex items-center justify-center bg-gradient-to-br',
        CATEGORY_THUMB_CLASSES[project.category],
      )}
      role="img"
      aria-label={alt}
    >
      <span
        aria-hidden="true"
        className={cn('font-semibold tracking-tight', variant === 'card' ? 'text-5xl' : 'text-7xl')}
      >
        {initial}
      </span>
      <span className="absolute bottom-2 left-3 text-xs font-medium opacity-80">
        {CATEGORY_LABELS[project.category]}
      </span>
    </div>
  );
}
ProjectThumb.displayName = 'ProjectThumb';
