/**
 * 徽章体系（SPEC §4.3 / §6.2 / §8.3）：来源+等级、资源、难度、免费层、状态。
 *
 * 立规：卡片、列表、详情三处必须由这里同一套组件渲染，不许各页各写一套；
 * 一律走 shadcn/ui `Badge` + Lucide 图标，且「不只靠颜色」——每个徽章都带文字。
 */
import {
  Archive,
  BadgeCheck,
  Cable,
  CircleAlert,
  CircleCheck,
  CircleDollarSign,
  Clock,
  Clock4,
  Crown,
  Database,
  ExternalLink,
  Gauge,
  KeyRound,
  ListOrdered,
  Mail,
  Network,
  PanelsTopLeft,
  HardDrive,
  Sparkles,
  Star,
  Tag,
  Timer,
  Zap,
  Boxes,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  DIFFICULTY_HINTS,
  DIFFICULTY_LABELS,
  FREE_TIER_META,
  RESOURCE_BADGE_VISIBLE,
  RESOURCE_LABELS,
  TIER_META,
  type ProjectView,
} from '@/lib/project-types';
import type { Resource, VerificationTier } from '@/lib/project-schema';

/** 资源徽章图标（§4.1 resources 全枚举） */
const RESOURCE_ICONS: Record<Resource, LucideIcon> = {
  'workers-only': Zap,
  pages: PanelsTopLeft,
  d1: Database,
  kv: KeyRound,
  r2: HardDrive,
  'durable-objects': Boxes,
  queues: ListOrdered,
  cron: Timer,
  'workers-ai': Sparkles,
  vectorize: Network,
  hyperdrive: Cable,
  'email-workers': Mail,
  external: ExternalLink,
};

const TIER_ICONS: Record<VerificationTier, LucideIcon> = {
  official: Crown,
  verified: BadgeCheck,
  listed: Tag,
};

/** 来源 + 等级徽章：金（官方）/ 绿（已验证）/ 灰（已收录），文字写明来源与等级 */
export function TierBadge({
  source,
  tier,
  className,
}: {
  source: ProjectView['source'];
  tier: VerificationTier;
  className?: string;
}) {
  const meta = TIER_META[tier];
  const Icon = TIER_ICONS[tier];
  const label = source === 'official' ? meta.label : `第三方 · ${meta.label}`;

  return (
    <Badge
      variant="outline"
      className={cn('gap-1 border font-medium', meta.badgeClassName, className)}
      title={meta.description}
    >
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}
TierBadge.displayName = 'TierBadge';

/** 资源徽章：图标 + 短名，超过 visible 个折叠为「+n」（§4.3） */
export function ResourceBadges({
  resources,
  visible = RESOURCE_BADGE_VISIBLE,
  className,
}: {
  resources: Resource[];
  visible?: number;
  className?: string;
}) {
  const shown = resources.slice(0, Math.max(visible, 0));
  const hidden = resources.slice(shown.length);

  return (
    <ul className={cn('flex flex-wrap items-center gap-1', className)} aria-label="部署所需资源">
      {shown.map((resource) => {
        const Icon = RESOURCE_ICONS[resource];
        return (
          <li key={resource}>
            <Badge variant="secondary" className="gap-1 font-normal">
              <Icon aria-hidden="true" />
              {RESOURCE_LABELS[resource]}
            </Badge>
          </li>
        );
      })}
      {hidden.length > 0 && (
        <li>
          <Badge
            variant="outline"
            className="font-normal"
            title={`还有 ${hidden.length} 项：${hidden.map((r) => RESOURCE_LABELS[r]).join('、')}`}
            aria-label={`还有 ${hidden.length} 项资源：${hidden.map((r) => RESOURCE_LABELS[r]).join('、')}`}
          >
            +{hidden.length}
          </Badge>
        </li>
      )}
    </ul>
  );
}
ResourceBadges.displayName = 'ResourceBadges';

/** 难度（§4.3：文字「快速/标准/进阶」） */
export function DifficultyBadge({ difficulty }: { difficulty: number }) {
  const label = DIFFICULTY_LABELS[difficulty] ?? '标准';
  return (
    <Badge variant="outline" className="gap-1 font-normal" title={DIFFICULTY_HINTS[difficulty]}>
      <Gauge aria-hidden="true" />
      难度：{label}
    </Badge>
  );
}
DifficultyBadge.displayName = 'DifficultyBadge';

/** 免费层标记（§4.3） */
export function FreeTierBadge({ freeTier }: { freeTier: ProjectView['freeTier'] }) {
  const meta = FREE_TIER_META[freeTier];
  const Icon =
    freeTier === 'yes' ? CircleCheck : freeTier === 'partial' ? CircleAlert : CircleDollarSign;
  return (
    <Badge variant="outline" className="gap-1 font-normal" title={meta.description}>
      <Icon aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}
FreeTierBadge.displayName = 'FreeTierBadge';

/** 即将推出（§3.1 waker 预告位） */
export function ComingSoonBadge() {
  return (
    <Badge variant="secondary" className="gap-1 font-normal" title="开发中，暂不提供部署入口">
      <Clock4 aria-hidden="true" />
      即将推出
    </Badge>
  );
}
ComingSoonBadge.displayName = 'ComingSoonBadge';

/** 长期未更新 / 已归档标记（§6.3：只标记，不自动下架） */
export function StaleBadge({ archived }: { archived: boolean }) {
  return (
    <Badge
      variant="outline"
      className="gap-1 border-dashed font-normal text-muted-foreground"
      title={
        archived ? '上游仓库已 archive，收录条目保留但不再更新' : '上游仓库超过 12 个月没有新的提交'
      }
    >
      <Archive aria-hidden="true" />
      {archived ? '仓库已归档' : '长期未更新'}
    </Badge>
  );
}
StaleBadge.displayName = 'StaleBadge';

/** 自动字段：star 数与最近更新时间（缺失时显示占位符，不许报错，§4.3/§8.2） */
export function AutoMeta({ project }: { project: ProjectView }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span
        className="inline-flex items-center gap-1"
        title={project.stars === null ? '自动字段暂缺（GitHub API 未取到）' : 'GitHub star 数'}
      >
        <Star aria-hidden="true" className="size-3.5 text-yellow-500" />
        {project.starsLabel ? `${project.starsLabel} star` : 'star —'}
      </span>
      <span
        className="inline-flex items-center gap-1"
        title={project.updatedAt ? '上游仓库最近一次 push' : '自动字段暂缺（GitHub API 未取到）'}
      >
        <Clock aria-hidden="true" className="size-3.5" />
        最近更新 {project.updatedAt ?? '—'}
      </span>
    </div>
  );
}
AutoMeta.displayName = 'AutoMeta';
