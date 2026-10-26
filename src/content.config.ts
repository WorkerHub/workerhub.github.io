/**
 * Astro Content Collections 定义（SPEC §4.1：数据文件是唯一真源）。
 *
 * schema 与 scripts/validate-data.ts 共用 src/lib/project-schema.ts，
 * 因此「Astro 构建期校验」与「CI 校验」永远不会分叉。
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { projectSchema } from './lib/project-schema';

const projects = defineCollection({
  loader: glob({
    pattern: '*.yaml',
    // 默认 src/data/projects；HUB_PROJECTS_DIR 是演练/测试用的目录覆盖开关
    base: process.env.HUB_PROJECTS_DIR ?? './src/data/projects',
  }),
  schema: projectSchema,
});

export const collections = { projects };
