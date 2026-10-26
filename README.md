# WorkerHub hub · 首页/目录站

Cloudflare Workers 生态的中文精选应用目录：官方自研项目 + 经收录把关的第三方开源项目，每个项目标清部署方式、所需资源与验证等级。

**本站是纯静态站点**：无后端、无数据库、无鉴权、无站点级 secret（SPEC v1.4 §0 明示例外项）。构建产物是纯静态 HTML，同时发布到主站 `hub.oneboy.app`（Cloudflare Pages）与镜像 `workerhub.github.io`（GitHub Pages），canonical 恒写主域名。

> 当前进度：S1-A 脚手架与数据管线、S1-B 内容数据（官方 7 + 第三方 4）、S2-A 页面与组件（页面 / 统一卡片 / 搜索筛选排序 / 主题三档 / SEO）、S2-B 投稿基建（CONTRIBUTING / PR 模板 / 投稿数据校验）、S3 双线部署（GitHub Actions 工作流 + CF deploy hook + 每日重建 + 本文件两份核对表）均已交付；**上线关口（CF Pages 建项、域名绑定、GitHub Pages 启用）归用户**，团队交付停在 PR，见文末「范围」。

## 技术栈（SPEC §8.1）

- **Astro 7 + TypeScript**，`output: 'static'`（SSG），零默认 JS，interactive 部分后续用 Astro islands
- **Tailwind CSS 4**（`@tailwindcss/vite`）
- 包管理 **pnpm**；Node 版本由 `.nvmrc` + `engines` 锁定为 **24**，CI 与本地一致

## 常用命令

```bash
pnpm install            # 安装依赖
pnpm dev                # 本地开发（http://localhost:4321）
pnpm build              # 构建：读数据 → schema 校验 → 抓取/合并自动字段 → 输出 dist/
pnpm preview            # 预览 dist/
pnpm validate:data      # 只跑数据文件 schema 校验
pnpm validate:submission # 投稿校验三项：repo 存在且 public / 外链可达性 / 截图规格（§7）
pnpm check:repos        # 只跑 repo 核验
pnpm check:links        # 只跑外链可达性
pnpm check:screenshots  # 只跑截图规格
pnpm check:pr-scope     # 投稿 PR 变更范围（只允许数据文件与截图）
pnpm fetch:meta         # 只跑 GitHub 自动字段抓取
pnpm health:links       # 外链健康巡检（§9.3，每日重建跑的那一步；只出报告不硬拦）
pnpm summary:build      # 生成构建摘要 Markdown（§9.2/§9.3，写进 GitHub Actions summary）
pnpm lint               # astro check（类型检查）+ prettier --check
pnpm format             # prettier 自动格式化
pnpm test               # 单元 + 集成测试（node:test）
```

- **构建产物目录：`dist/`**（双线部署都从这里取；CF Pages 构建命令 `pnpm build`，输出目录 `dist`）
- **构建命令：`pnpm build`**（本地与 CI 同一条命令、同一份产物，SPEC §9.1）

## 数据管线（SPEC §4.1 / §9）

```
src/data/projects/<slug>.yaml        人工字段（唯一真源，内容子单维护）
        │  schema 校验（zod，src/lib/project-schema.ts）
        ▼
scripts/fetch-github-meta.ts         GitHub API 抓自动字段（§9.2 白名单）
        │  失败 → 回退缓存 → 无缓存则置空
        ▼
src/data/cache/github-meta.json      自动字段缓存（随构建滚动更新并提交）
        ▼
astro build                         每项目详情页 / 列表页读「人工字段 + 自动字段」
```

- 数据文件是按 §4.1 定义的 `zod` strict 对象：**字段非法、枚举越界、出现未知键或手写自动字段 → 构建失败并点名文件与字段**，不会静默跳过坏数据上线。
- 同一份 schema 同时被 Astro Content Collections（`src/content.config.ts`）与 CI 校验脚本使用，两层都拦，不会分叉。
- 自动字段只取 §9.2 白名单：`stargazers_count`、`forks_count`、`language`、`license.spdx_id`、`pushed_at`、`archived`、`releases/latest`、`open_graph_image`。

### 自动字段容错（§9.2 硬性）

| 情况                         | 行为                                                        |
| ---------------------------- | ----------------------------------------------------------- |
| 抓取成功                     | 写回缓存                                                    |
| 网络故障 / 超时 / 5xx / 限流 | 用 `src/data/cache/github-meta.json` 上次结果兜底，构建继续 |
| 抓取失败且无缓存             | 该项目自动字段置空，页面正常渲染（排序降级为收录日期）      |
| 仓库 404（不存在或私有）     | **判为数据错误 → 构建失败**（§7 要求 CI 明确失败）          |

缓存文件只记录既有事实，缺失/损坏时按空缓存处理并打警告，不会阻塞构建。

### 环境变量

生产构建无需任何变量。以下只用于本地调试、演练与 CI：

| 变量                     | 默认                              | 说明                                                                               |
| ------------------------ | --------------------------------- | ---------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`           | 空                                | CI 用工作流自带只读 token；本地缺省走未认证额度。**不要求、也不允许任何 PAT 入仓** |
| `GITHUB_API_BASE`        | `https://api.github.com`          | 演练时指向不可达地址即可模拟 API 故障                                              |
| `HUB_SKIP_FETCH`         | 空                                | 置 `1` 完全跳过抓取，只用缓存/空值                                                 |
| `HUB_PROJECTS_DIR`       | `src/data/projects`               | 数据文件目录（演练/测试用）                                                        |
| `HUB_META_CACHE`         | `src/data/cache/github-meta.json` | 自动字段缓存位置                                                                   |
| `HUB_META_REPORT`        | `github-meta-report.json`         | 本次抓取报告（未入库，CI 可取用）                                                  |
| `HUB_VERSION`            | 空                                | 覆盖页脚版本号；缺省现场取 `git describe --tags --always --dirty`                  |
| `HUB_SKIP_OG`            | 空                                | 置 `1` 跳过 OG 图本地化（离线构建/演练用；缺图自动回退首字图）                     |
| `HUB_OG_FORCE`           | 空                                | 置 `1` 强制重新抓取仓库 OG 图                                                      |
| `HUB_OG_REPORT`          | `og-report.json`                  | 本次 OG 图本地化报告（未入库）                                                     |
| `HUB_CF_ANALYTICS_TOKEN` | 空                                | 配置后构建才注入 Cloudflare Web Analytics（无 cookie，§10）；缺省不接统计          |

### 降级演练（SPEC §12 第 3 条）

```bash
# 演练 A：API 不可达 + 有缓存 → 走缓存兜底，构建成功
GITHUB_API_BASE=http://127.0.0.1:9 HUB_PROJECTS_DIR=tests/fixtures/projects-run \
HUB_META_CACHE=tests/.tmp/cache.json pnpm build

# 演练 B：API 不可达 + 无缓存 → 自动字段置空，构建成功
GITHUB_API_BASE=http://127.0.0.1:9 HUB_PROJECTS_DIR=tests/fixtures/projects-run \
HUB_META_CACHE=tests/.tmp/empty.json pnpm build

# 演练 C：非法数据 → 构建失败并点名字段
HUB_PROJECTS_DIR=<放了一个坏文件的目录> pnpm build
```

`tests/fixtures/projects-run/` 是演练夹具（指向两个真实 public 仓库），`tests/fixtures/projects/` 是 schema 夹具。两者都不是正式内容。

## 页面与组件（SPEC §2 / §4.3 / §8.2 / §8.3 / §10）

| 路径                         | 说明                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `/`                          | Hero（搜索框 + 官方/第三方/总数统计）、官方项目区（waker 预告位置末位）、精选推荐（第三方 ≤6）、分类快捷入口、最新收录（≤8） |
| `/projects/`                 | 全量目录：搜索 + 六维筛选 + 五种排序，全部在浏览器本地完成                                                                   |
| `/p/<slug>/`                 | 项目详情：截图、长介绍、特性、部署信息全表、自动元数据、入口按钮组、同类推荐 ≤4                                              |
| `/categories/<slug>/`        | 分类页：预置并锁定分类过滤，复用 `Explorer` 与卡片                                                                           |
| `/submit/`                   | 构建时读取仓库根 `CONTRIBUTING.md` 同源渲染（文件缺失时显示占位说明，合入后自动接线）                                        |
| `/about/`                    | 定位、官方与第三方区别、三级验证等级定义与免责声明、异议/下架通道                                                            |
| `404`                        | 回首页与全部项目                                                                                                             |
| `/sitemap.xml` `/robots.txt` | 构建时生成，绝对地址恒写 `https://hub.oneboy.app`                                                                            |

- **统一卡片**：`src/components/project/project-card.tsx` 一套组件同时用于首页 / 列表（island 内）/ 分类页 / 详情页推荐；静态页里由 Astro 在构建期渲染成 HTML（不下发该组件的 JS），因此三处徽章与入口不可能分叉。
- **徽章**：`src/components/project/badges.tsx` 统一渲染来源+等级（金/绿/灰，均带文字）、资源（>3 折叠为 `+n`）、难度、免费层、长期未更新 / 即将推出。
- **截图回退链**：项目截图 → 仓库 OG 图（构建期抓取并本地化到 `public/og/github/<owner>-<repo>.png`，页面只引用站内路径，绝不热链 GitHub）→ 按分类着色的名称首字图。
- **搜索/筛选/排序**（`src/lib/project-filter.ts`，纯函数，单测覆盖）：搜索命中名称 / tagline / 长介绍 / 标签；六维筛选（分类 / 来源 / 验证等级 / 所需资源 / 难度 / 免费层）；排序 = 默认（官方置顶 → 精选 → 收录日期倒序）/ star 降序 / 最近更新 / 名称 / 收录日期倒序，自动字段缺失时降级为收录日期、不报错。筛选状态写入 URL query：勾选与排序用 `pushState`（浏览器后退可还原），搜索输入防抖后 `replaceState`（不刷历史记录）。
- **主题三档**（`src/components/site/theme-toggle.tsx` + `BaseLayout` 内联脚本）：亮 / 暗 / 自动，默认自动；偏好只存 `localStorage`（无登录、无后端）；首屏绘制前由 `<head>` 内联脚本应用 `dark` class，防闪烁。

## 投稿基建（SPEC §7）

投稿 = 向本仓库提 PR，只新增/修改 `src/data/projects/<slug>.yaml`（及可选截图）。相关文件：

| 文件                               | 作用                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `CONTRIBUTING.md`（仓库根）        | 收录门槛（五条）、字段说明、数据文件模板、验证等级、下架与异议通道。**与 `/submit/` 页同源**：页面构建时引入本文件，二者不得分叉 |
| `.github/PULL_REQUEST_TEMPLATE.md` | 逐项勾选五条门槛 + 证据链接 + 数据合规自查 + 变更范围声明                                                                        |
| `src/lib/submission-checks.ts`     | repo 核验 / 外链可达性 / 截图规格的校验逻辑                                                                                      |
| `src/lib/pr-scope.ts`              | 投稿 PR 变更范围（只允许数据文件与截图）                                                                                         |

投稿数据校验（`pnpm validate:submission`，CI 对投稿 PR 与官方数据 PR 同等适用）：

| 检查                                                           | 失败后果                                     |
| -------------------------------------------------------------- | -------------------------------------------- |
| schema / 枚举 / 未知字段 / 手写自动字段                        | 失败                                         |
| `slug` 与文件名一致、slug 与 repo 双维度查重                   | 失败                                         |
| `repo` 真实存在且为 public（GitHub API）                       | 失败（不存在 / 私有 / 无法核验）             |
| `tier=verified` 凭证书、`free_tier != yes` 时的 `pricing_note` | 失败                                         |
| 第三方外链（`docs_url` / `deploy.*`）不可达                    | **警告**，评审人人工确认                     |
| 官方项目全部外链、任何项目的 `homepage`（演示站）不可达        | 失败                                         |
| 截图（webp / 宽 ≥1200px / ≤300KB）                             | 失败                                         |
| 投稿 PR 改了数据文件与截图之外的文件                           | 失败（PR 描述带 `hub-submission-pr` 标记时） |

演练：`tests/fixtures/submission/` 是投稿校验夹具（不存在的 repo、不可达外链、不合规截图），CI 的 `drills` job 逐项验证「该拦的拦、该放的放」。

## 目录结构

```
astro.config.mjs            site = https://hub.oneboy.app（canonical 恒写主域名）
src/content.config.ts       Content Collections 定义（glob loader + zod schema）
src/data/projects/          项目数据文件（内容子单维护）
src/data/cache/             GitHub 自动字段缓存
src/lib/project-schema.ts   数据字段/枚举定义（冻结契约）
src/lib/validate-projects.ts 集合级校验（slug 与文件名一致、slug/repo 查重）
src/lib/submission-checks.ts 投稿校验（repo public / 外链可达性 / 截图规格）
src/lib/pr-scope.ts         投稿 PR 变更范围判定
src/lib/github-meta.ts      抓取、缓存、降级、异常清单
src/lib/projects.ts         页面侧取数入口（人工字段 + 自动字段合并、默认排序）
src/lib/project-view.ts     构建期视图模型（解析截图/OG 图是否存在、过期标记）
src/lib/project-types.ts    展示字典与视图类型（客户端 island 也能安全引用）
src/lib/project-filter.ts   搜索 / 六维筛选 / 五种排序 / URL 状态同步
src/lib/project-entry.ts    卡片主入口与详情页部署按钮（唯一真源）
src/lib/site.ts             站点常量与绝对地址（canonical 恒写主域名）
src/lib/build-info.ts       版本号 / 构建时间
src/lib/link-health.ts      外链巡检 + 连续失败计数（§9.3）
src/lib/build-summary.ts    构建摘要渲染（§9.2 / §9.3，纯函数）
src/components/ui/          shadcn/ui 组件（Badge / Button / Input / Checkbox / Dialog / Dropdown / Separator）
src/components/project/     统一卡片、徽章、截图回退
src/components/site/        页头页脚、主题切换 island、筛选 island
src/layouts/base-layout.astro  SEO/OG/canonical、主题防闪烁、页头页脚
src/pages/                  首页 / projects / p/<slug> / categories/<slug> / submit / about / 404 / sitemap.xml / robots.txt
public/og/github/           构建期本地化的仓库 OG 图缓存（§8.3，抓取失败则走首字图）
scripts/                    validate-data.ts / validate-submission.ts / check-pr-scope.ts / fetch-github-meta.ts / fetch-og-images.ts / link-health.ts / build-summary.ts
tests/                      单测 + 进程级集成测试 + 夹具
.github/PULL_REQUEST_TEMPLATE.md  投稿 PR 模板（五条门槛逐项勾选 + 证据栏）
.github/workflows/ci.yml    校验与演练（不含发布）
.github/workflows/deploy.yml 双线部署（GitHub Pages 镜像 + CF Pages deploy hook + 每日重建）
```

## 双线部署（SPEC §0 / §8.1 / §9.2 / §9.3）

同一个提交 → **同一份** `dist/` 产物 → 两条**互相独立**的发布通道：

| 一线         | 托管                           | 地址                  | 怎么发                                                              |
| ------------ | ------------------------------ | --------------------- | ------------------------------------------------------------------- |
| 主站         | Cloudflare Pages（Git 集成）   | `hub.oneboy.app`      | CF 自己从 `main` 构建；本工作流另用 **deploy hook** 触发同版重建    |
| 镜像（备用） | GitHub Pages（来源 = Actions） | `workerhub.github.io` | 本工作流构建后用官方 Pages 发布动作上线（不往仓库写 gh-pages 分支） |

### 工作流 `.github/workflows/deploy.yml`

```
触发：push 到 main（有新提交）／ 每日 cron 19:17 UTC（北京 03:17）／ workflow_dispatch（含演练开关）
  │
  ├─ build ──────────── pnpm install → 密钥红线自检 → pnpm build → 产物自检 → 上传 dist/ 与构建报告
  │    │
  │    ├─ link-health ── 仅在定时/手动时跑：全部外链可达性巡检（连续失败计数走 actions/cache，不写仓库）
  │    │
  │    ├─ publish-github-pages ────── 官方 Pages 动作发布镜像（environment: github-pages）
  │    └─ publish-cloudflare-pages ── POST CF Pages deploy hook（URL 只来自 Secrets）
  │
  └─ summary ─────────── 汇总进 GitHub Actions summary + build-summary.md 产物
```

- **一侧失败不阻塞另一侧**（§0 / §9.2）：两个 publish job 只依赖 `build`，彼此**不互为 `needs`**，各自跑、各自红、各自在日志里报错；`summary` 用 `if: always()` 逐侧标注结果。
- **构建摘要必含**（§9.2 / §9.3）：自动字段刷新结果（成功 / 缓存兜底 / 降级置空 / 数据错误 + 逐项降级原因）、archive 与超过 365 天未更新的异常项目清单、外链巡检结果与**连续失败点名**（阈值：连续 2 次）、两侧发布结果。
- **不自动改数据**：异常项目与坏链只进摘要，是否下架/修正走人工数据 PR；工作流**不向 `main` 写提交**（自动字段缓存如有变化，作为 `reports` 产物上传，由维护者随数据 PR 提交）。
- **密钥红线**：CF Pages deploy hook URL 只放 GitHub Secrets，名为 `CLOUDFLARE_PAGES_DEPLOY_HOOK`；`build` 里有一道自检，扫到仓库文件里出现 deploy hook URL 直接失败；日志只打印 HTTP 状态码，不回显 URL。
- **版本号一致性**（§12 第 10 条）：页脚版本号 = 构建时 `git describe --tags --always`（`src/lib/build-info.ts`）。两侧都从同一提交构建，所以值相同；需要固定时可用 `HUB_VERSION` 覆盖。刻意**不用 `--dirty`**：构建本身会改写自动字段缓存文件，带 `--dirty` 会让每次 CI 构建都得到 `<sha>-dirty`，两侧无法比较。

### 演练（不发出真实发布）

`workflow_dispatch` 两个输入：

| 输入               | 值                     | 作用                                                                                    |
| ------------------ | ---------------------- | --------------------------------------------------------------------------------------- |
| `dry_run`          | `true`                 | 只构建 + 出摘要：**不调** Pages 发布动作、**不调** deploy hook（不读也不打印 hook URL） |
| `simulate_failure` | `pages` / `cloudflare` | 演练时故意让一侧失败，验证另一侧照常走完且有独立报错（仅 `dry_run=true` 下允许）        |

等价地可以从仓库里跑：`pnpm build && pnpm health:links && pnpm summary:build`（摘要直接看 `build-summary.md`）。

已知平台限制（不是工作流缺陷）：

1. `workflow_dispatch` 要求该工作流文件已存在于**默认分支**，所以合并进 `main` 之前无法从 UI/API 手动触发；
2. `publish-github-pages` 绑定了 `github-pages` 环境，该环境的部署分支策略只放行 `main`，非 `main` 分支跑真实发布会被环境拦下（演练用 `dry_run=true` 不触碰发布动作，因此不受影响）。

## 上线设置核对表（两平台，逐项确认）

下面这些**全部是用户关口的操作**（团队不代建项目、不绑域名、不启 Pages、不动仓库设置），按顺序打勾即可。

### A. Cloudflare Pages（主站 `hub.oneboy.app`）

- [ ] 创建 Pages 项目，连接 GitHub 仓库 `WorkerHub/workerhub.github.io`
- [ ] 生产分支 = `main`；PR 自动预览开启（预览部署不参与双线同版校验）
- [ ] 构建命令 = `pnpm build`，输出目录 = `dist`（构建镜像的 Node 版本需 ≥ 24，仓库 `.nvmrc` 为 24）
- [ ] 环境变量：无业务变量；如需避免 GitHub API 限流，可加只读 `GITHUB_TOKEN`（可选）
- [ ] Settings → Builds & deployments → **Deploy hooks 生成一条 hook**，把 URL 存进 GitHub Secrets：名称 `CLOUDFLARE_PAGES_DEPLOY_HOOK`（**只进 Secrets，不写进仓库文件、README、评论、工单**）
- [ ] 绑定自定义域名 `hub.oneboy.app`；`workerhub.oneboy.app` 做 301 到主域名
- [ ] （可选，§10）Cloudflare Web Analytics 站点开启后，把 token 作为构建环境变量 `HUB_CF_ANALYTICS_TOKEN` 注入

### B. GitHub Pages（镜像 `workerhub.github.io`）

- [ ] Settings → Pages → **Source = GitHub Actions**（不是 Deploy from a branch）
- [ ] Settings → Pages → **Custom domain 栏必须留空** ← 硬性项：填任何域名都会让镜像变成跳转站，双线即失效（§0）
- [ ] Settings → Environments → `github-pages` 的部署分支策略放行 `main`
- [ ] Actions 权限：仓库允许 Actions 创建 deployment（默认已允许）

### C. 合并后的首次验证

- [ ] 合并本 PR 后，`main` 上触发一次「双线部署」，两侧均为 ✅（首次正式运行前 B 节若未做，Pages 侧会红——属预期，不是工作流问题）
- [ ] 两侧各抽查三页：页脚版本号一致；镜像侧 canonical 指向 `https://hub.oneboy.app`
- [ ] Actions summary 里能看到：自动字段刷新结果、异常项目清单、链接健康（连续失败点名）、两侧发布结果
- [ ] 次日检查定时重建是否自动跑过一次（cron 19:17 UTC）

## 范围（防止顺带扩大，SPEC §11）

- 已交付：S1-A 脚手架与数据管线（schema + 抓取 + 缓存降级 + CI 校验与演练）、S1-B 内容数据（官方 7 + 第三方 4）、S2-A 页面与组件（页面、统一卡片、搜索筛选排序、主题三档、SEO/分享与 sitemap）、S2-B 投稿基建（CONTRIBUTING、PR 模板、投稿数据校验与演练）、S3 双线部署（`.github/workflows/deploy.yml` + 链接健康 + 构建摘要 + 上文两份核对表）。
- 不在这些单里：PR 合并与域名绑定 / Pages 建项 / Pages 启用 / deploy hook 入 Secrets（用户关口）。
- 本站不加后端、不加 D1/KV/DO/R2、不加登录鉴权、不引入任何 secret（SPEC §0）；唯一的 secret 是 CF Pages deploy hook URL，且只存于 GitHub Secrets。
