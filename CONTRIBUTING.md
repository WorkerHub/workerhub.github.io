# 向 WorkerHub 投稿收录

WorkerHub（hub）是 Cloudflare Workers 生态的中文精选应用目录：官方自研项目 + 经收录把关的第三方开源项目，每个项目都标清部署方式、所需资源与验证等级。

这份文件是投稿规则的**唯一真源**：站点的 `/submit/` 页面在构建时直接引入本文件渲染，页面与本文不得分叉——要改规则，改这里，不要改页面。数据校验 CI 的每一条规则也都与本文一一对应（见第 8 节）。

- 站点主域名：`https://hub.oneboy.app`
- 仓库：`https://github.com/WorkerHub/workerhub.github.io`
- 投稿方式：**向本仓库提 Pull Request**（没有站内表单、没有后台、没有账号系统）
- 维护者联系方式：GitHub 组织页 <https://github.com/WorkerHub>

---

## 1. 我们收录什么

**收录**：开源、可自部署在 Cloudflare Workers 或 Pages 上的应用/服务。你自己写的、你维护的、或你特别喜欢并愿意长期跟进的项目，都可以提。

**不收录**：

- 没有明确开源许可证的项目（无 LICENSE 一律不收，不开例外）；
- 只能在你自己服务器上跑、或需要 Cloudflare 之外的重型基础设施的项目；
- 「理论上能跑」但没有 wrangler/Pages 配置、没有成型部署文档的项目；
- 商业闭源产品、纯 API 转发壳、纯演示页（无实际可部署代码）；
- 已归档或被证实无法部署且作者不维护的项目。

本站不是托管平台，不代跑任何人的项目，也不持有访客的 Cloudflare 凭证：部署入口一律指向 Cloudflare 官方 Deploy Button、目标仓库的 GitHub Actions 或其部署文档。

---

## 2. 收录门槛（五条，全部通过才可收录）

投稿 PR 里按模板逐项勾选，并**为每一条附上证据链接**。CI 会机械校验其中可校验的部分，人工评审核验其余部分。

| #   | 门槛                                         | 判定方式                                                                                           | 你需要在 PR 里给出的证据                                                   |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | **开源且许可证明确**                         | 仓库根目录有 LICENSE 文件，且 GitHub 能识别出许可证类型                                            | 许可证文件链接（如 `.../blob/main/LICENSE`）                               |
| 2   | **真实可部署在 Cloudflare Workers 或 Pages** | 有 `wrangler.toml`/`wrangler.json(c)`、Pages 配置，或明确的部署文档；仅「理论上能跑」不算          | 配置文件路径 / 部署文档章节链接                                            |
| 3   | **近 12 个月内有代码更新**                   | 构建时自动字段 `pushed_at` 判定，无需你手写                                                        | 无需提供（构建自动判定）。官方特批的老牌稳定项目在 PR 说明里写理由后可豁免 |
| 4   | **部署步骤可复现**                           | README 或文档含完整部署章节（资源创建 → 绑定 → 变量 → 部署 → 首次初始化）                          | 部署章节链接 + 你自己跑通的步骤摘要                                        |
| 5   | **免费层可跑，或付费要求写在明处**           | 数据字段 `free_tier` / `pricing_note` 与仓库文档一致；免费层受限的具体限制要在 `pricing_note` 写明 | 文档中价格/免费层限制说明的链接                                            |

补充说明：

- 门槛 5 里「免费层可跑」指 Workers **Free** 计划下能完整跑通核心功能。只能部分跑通就填 `free_tier: partial` 并在 `pricing_note` 写清限制；必须付费才能跑就填 `no`，同样必须写 `pricing_note`。
- 部署方式宁可**低标不高标**（见 4.3）：仓库还没适配 Deploy Button 就别填 `deploy-button`。

---

## 3. 验证等级（三级）

| 等级       | 徽章 | 含义                                                                | 取得方式                                                                                                    |
| ---------- | ---- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **官方**   | 金色 | WorkerHub 自研项目                                                  | `source: official` 时自动取得（第三方条目不能用这一级）                                                     |
| **已验证** | 绿色 | 本站维护者按项目文档**实际完成过一次部署**，并留有记录              | 在数据 PR 中附 `verified_at`（验证日期）与 `verified_note_url`（记录链接：issue/PR/文档），经评审合入后生效 |
| **已收录** | 灰色 | 仅通过第 2 节五条门槛审核，**未做部署实测**（第三方条目的默认等级） | 无需额外字段：`tier: listed`                                                                                |

规则：

- 第三方投稿**默认等级就是「已收录」**。请不要自己填 `tier: verified`——那是维护者实测后才能给的等级。
- `tier: verified` 时 `verified_at` 与 `verified_note_url` **必填**，缺一项 CI 直接失败。
- 「已收录」条目的详情页会固定显示一句声明，这是站点行为，不需要你在数据文件里写：**「本站尚未实测部署，部署体验以项目文档为准」**。
- 「已验证」只代表**验证日期当天**的部署实测结论，不构成对项目后续版本、质量或安全性的担保。

---

## 4. 数据文件：位置与字段

### 4.1 位置与基本约定

一个项目一个文件：`src/data/projects/<slug>.yaml`。

- `slug` 只允许小写字母、数字与连字符（`^[a-z0-9-]+$`），**必须与文件名一致**（`cloud-mail.yaml` → `slug: cloud-mail`）。
- `slug` 与 `repo` 都是全站唯一的：CI 同时按这两个维度查重，重复直接失败。
- 数据文件是**唯一真源**，页面全部由它生成；不允许在别处写死项目信息。

### 4.2 字段说明

`?` 表示可选。写错字段名（拼写错误）会直接报错，不会静默丢弃。

| 字段                | 类型        | 必填     | 说明                                                                                          |
| ------------------- | ----------- | -------- | --------------------------------------------------------------------------------------------- |
| `slug`              | string      | ✓        | 全站唯一，`^[a-z0-9-]+$`，与文件名一致                                                        |
| `name`              | string      | ✓        | 展示名：用项目官方名，不自行翻译改名                                                          |
| `repo`              | string      | ✓        | GitHub `owner/repo`；官方项目 owner 恒为 `WorkerHub`；**指向上游原仓库**，不要指向组织内 fork |
| `source`            | enum        | ✓        | `official` / `third-party`                                                                    |
| `tagline_zh`        | string      | ✓        | 中文一句话介绍，≤40 字，人工撰写，不要机翻仓库描述                                            |
| `description_zh`    | string      | ✓        | 中文长介绍（详情页用），2–4 句（以 `。！？` 计句）                                            |
| `description_en`    | string      | ?        | 预留字段，v1 不渲染                                                                           |
| `features`          | string[]    | ✓        | 特性 3–5 条（详情页列表）；卡片只显示 tagline                                                 |
| `category`          | enum        | ✓        | 主分类，取值见 4.4                                                                            |
| `tags`              | string[]    | ✓        | 自由标签 ≤5 个，不得重复                                                                      |
| `homepage`          | string(url) | ?        | 项目官网 / 在线演示站（官方项目填各自 `oneboy.app` 域名）；**演示站不可达会被 CI 硬拦**       |
| `docs_url`          | string(url) | ?        | 部署/使用文档链接；缺省时页面取仓库 README                                                    |
| `deploy`            | object      | ✓        | 部署信息，见 4.3                                                                              |
| `resources`         | enum[]      | ✓        | 部署所需 Cloudflare 资源，≥1 个且不重复，见 4.5                                               |
| `difficulty`        | int         | ✓        | 部署难度 1–3，见 4.6                                                                          |
| `free_tier`         | enum        | ✓        | `yes` / `partial` / `no`                                                                      |
| `pricing_note`      | string      | 条件必填 | `free_tier != yes` 时**必填**，写清限制或价格                                                 |
| `tier`              | enum        | ✓        | 验证等级 `official` / `verified` / `listed`，见第 3 节                                        |
| `verified_at`       | date        | 条件必填 | `tier: verified` 时必填，格式 `YYYY-MM-DD`                                                    |
| `verified_note_url` | string(url) | 条件必填 | `tier: verified` 时必填，验证记录链接                                                         |
| `screenshot`        | string      | ?        | `public/screenshots/<slug>.webp`；不填则走前端回退链，见第 6 节                               |
| `featured`          | bool        | ?        | 是否进首页精选推荐位（**仅第三方**，默认 `false`）                                            |
| `added_at`          | date        | ✓        | 收录日期 `YYYY-MM-DD`，「最新收录」排序依据                                                   |
| `status`            | enum        | ?        | `active`（默认）/ `coming-soon`（仅官方预告位）/ `delisted`（下架保留记录）                   |

**不要手写这些字段**（GitHub API 自动抓取，写进数据文件会直接报错）：`stars` / `stargazers_count`、`forks` / `forks_count`、`language`、`license`、`pushed_at`、`archived`、`latest_release` / `release`、`open_graph_image`。

### 4.3 `deploy` 对象（部署方式）

| `deploy.method`   | 含义                                         | 详情页按钮                                                             |
| ----------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| `deploy-button`   | 仓库已适配 Cloudflare 官方 Deploy Button     | 官方样式「Deploy to Cloudflare」，直达 `deploy.workers.cloudflare.com` |
| `git-integration` | 通过 Pages / Workers 的 Git 集成导入仓库部署 | 「导入到 Cloudflare」，链到文档对应章节                                |
| `github-actions`  | Fork 后启用仓库自带 Actions 部署             | 「Fork 后部署」，链到仓库与指南                                        |
| `wrangler`        | 本地 `wrangler deploy` 手动部署              | 「部署指南」                                                           |
| `docs-only`       | 仅有文档说明，无成型部署路径                 | 「查看仓库」，详情页明示「暂无成型一键部署路径」                       |

- `deploy.url`：Deploy Button 或部署入口，可空。`method: deploy-button` 时必填，且必须形如 `https://deploy.workers.cloudflare.com/?url=https://github.com/<owner>/<repo>`；若仓库 README 的官方按钮带分支/路径参数，以 README 为准原样收录。
- `deploy.guide_url`：部署指南链接，可空。
- **宁可低标，不许高标**：判定以目标仓库**当前实际状态**为准，PR 里给出依据（按钮位置或工作流文件路径）。
- `status: coming-soon`（预告位）的条目不得填 `deploy.url`。

### 4.4 分类（`category`，v1 定版）

| 值             | 中文名       | 值             | 中文名     |
| -------------- | ------------ | -------------- | ---------- |
| `productivity` | 效率工具     | `notification` | 通知与消息 |
| `content`      | 内容与博客   | `email`        | 邮箱       |
| `files-media`  | 文件与媒体   | `devops`       | 开发与运维 |
| `data`         | 数据与数据库 | `ai`           | AI 应用    |
| `life`         | 生活服务     | `other`        | 其他       |

新增分类不在投稿范围内（会失败）：确实需要新分类的，先在本仓库开 issue 讨论，由维护者改规格。

### 4.5 资源（`resources`）

| 值             | 含义                                            | 值                | 含义                      |
| -------------- | ----------------------------------------------- | ----------------- | ------------------------- |
| `workers-only` | 仅 Worker，无额外绑定                           | `pages`           | 需要 Pages                |
| `d1`           | D1 数据库                                       | `kv`              | KV 命名空间               |
| `r2`           | R2 对象存储                                     | `durable-objects` | Durable Objects           |
| `queues`       | Queues 队列                                     | `cron`            | Cron 定时触发             |
| `workers-ai`   | Workers AI                                      | `vectorize`       | Vectorize 向量索引        |
| `hyperdrive`   | Hyperdrive 数据库加速                           | `email-workers`   | Email Workers（收信绑定） |
| `external`     | 依赖 Cloudflare 之外的外部服务（如 SMTP、支付） |                   |                           |

用了 `external` 的，在 `description_zh` 或 `docs_url` 指向的文档里写清具体是什么外部服务。

### 4.6 难度（`difficulty`）

| 值  | 说明                                     |
| --- | ---------------------------------------- |
| `1` | 快速：≤10 分钟、近零配置                 |
| `2` | 标准：需自建 D1/KV 等绑定 + 少量环境变量 |
| `3` | 进阶：多绑定 / 多密钥 / 依赖外部服务     |

---

## 5. 数据文件模板

复制下面这段到 `src/data/projects/<slug>.yaml`，把值改成你的项目（**删除用不到的可选字段，别留空值**）。模板本身通过 schema 校验，测试会守住这一点，因此它永远是可用的最新字段集。

```yaml
# WorkerHub 收录数据文件模板：文件名必须与 slug 一致（如 cloud-mail.yaml）
slug: your-project
name: Your Project
repo: your-org/your-project
source: third-party
tagline_zh: 中文一句话介绍，不超过四十字
description_zh: 第一句说明它是做什么的。第二句说明部署形态与适用场景。
features:
  - 特性一：具体、可核验
  - 特性二
  - 特性三
tags:
  - 标签一
  - 标签二
category: productivity
homepage: https://example.com
docs_url: https://github.com/your-org/your-project/blob/main/docs/deploy.md
deploy:
  method: git-integration
  guide_url: https://github.com/your-org/your-project/blob/main/docs/deploy.md
resources:
  - d1
  - kv
difficulty: 2
free_tier: yes
tier: listed
# screenshot: public/screenshots/your-project.webp   # 可选，规格见第 6 节
featured: false
added_at: 2026-10-26
status: active
```

如果 `free_tier` 不是 `yes`，加上 `pricing_note`：

```yaml
free_tier: partial
pricing_note: 免费层每日 10 万次请求，超过需 Workers Paid（$5/月起）。
```

如果你是替官方项目补录（维护者），`source: official`、`repo` 的 owner 必须是 `WorkerHub`、`tier: official`。

本地自检（可选，需要 Node 24 + pnpm）：

```bash
pnpm install
pnpm validate:data        # schema、枚举、slug 与文件名一致、slug/repo 查重
pnpm check:repos          # repo 存在且为 public（调 GitHub API）
pnpm check:links          # 外链可达性（官方与演示站链接失败会硬拦）
pnpm check:screenshots    # 截图规格
```

---

## 6. 截图（可选）

- 路径固定 `public/screenshots/<slug>.webp`，**文件名必须与 slug 一致**。
- 格式必须是 **webp**（把 png/jpg 改后缀不算，CI 会检测真实格式）。
- **宽度 ≥1200px**（详情页按 1200px 宽出图，窄图会被拦）。
- **体积 ≤300KB**（307200 字节）。
- 压缩方式参考：`cwebp -q 82 -resize 1200 0 screenshot.png -o public/screenshots/<slug>.webp`。
- 不提供截图完全可以：删掉 `screenshot` 字段即可，前端按「项目截图 → 仓库 Open Graph 图 → 分类着色首字图」回退，不会破图。
- 请只提交**你自己项目的界面截图**，不要放商标、他人作品或不相关内容。

---

## 7. 投稿步骤

1. **Fork** 本仓库，从 `main` 拉一个分支（建议 `contrib/<slug>`）。
2. **只新增/修改 `src/data/projects/<slug>.yaml`**（可选：`public/screenshots/<slug>.webp`）。投稿 PR 不许改代码、依赖、工作流、模板、他人条目——CI 会按投稿标记检查变更范围。
3. **按 PR 模板逐项勾选**第 2 节五条门槛，并在每条的「证据」后填链接。
4. 等 **CI** 跑完（校验项见第 8 节）。
5. 等**人工评审**。评审只审三件事：项目值不值得收（质量与定位）、中文文案是否属实、部署方式与验证等级是否高标。
6. 合并即上架（维护者合并后会构建发布）。

其他约定：

- 一个 PR 一个项目，方便评审与回滚。
- 更新既有条目（改名、迁移、部署方式变化、免费层变化）走同样的 PR 流程，改对应 YAML 即可。
- 官方新项目上架也走同一流程的数据 PR，不开后门。
- 不要手写 GitHub 自动字段（第 4.2 节末尾清单）。
- 收录第三方项目时 `repo` 一律指向上游原仓库，不要指向任何 fork 副本（包括 WorkerHub 组织内用于跟踪的 fork）。

---

## 8. CI 会检查什么（硬拦 vs 仅警告）

投稿 PR 与官方数据 PR 适用完全相同的校验管线。

| 检查项                                                     | 规则               | 失败后果                                       |
| ---------------------------------------------------------- | ------------------ | ---------------------------------------------- |
| schema / 枚举 / 未知字段 / 手写自动字段                    | 字段定义见第 4 节  | **失败**并点名文件与字段                       |
| `slug` 与文件名一致                                        | 见 4.1             | **失败**                                       |
| `slug` / `repo` 双维度查重                                 | 见 4.1             | **失败**                                       |
| `repo` 真实存在且为 public                                 | 调 GitHub API 核验 | **失败**（仓库不存在、私有、或无法核验需重跑） |
| `tier: verified` 的 `verified_at` + `verified_note_url`    | 见第 3 节          | **失败**                                       |
| `free_tier != yes` 时 `pricing_note`                       | 见 4.2             | **失败**                                       |
| 外链可达性（`docs_url`、`deploy.url`、`deploy.guide_url`） | HTTP 探测          | **警告**（不硬拦，评审人人工确认）             |
| 官方项目的全部外链、任何项目的 `homepage`（演示站）        | HTTP 探测          | **失败**                                       |
| 截图规格（webp、宽 ≥1200px、≤300KB）                       | 见第 6 节          | **失败**                                       |
| 投稿 PR 变更范围                                           | 见第 7 节第 2 步   | **失败**                                       |

对应的本地命令：`pnpm validate:data`、`pnpm check:repos`、`pnpm check:links`、`pnpm check:screenshots`、`pnpm check:pr-scope`。

---

## 9. 状态维护、下架与作者异议

**自动检查（只标记，不自动下架）**：构建时若仓库已被 archive，或 `pushed_at` 距今超过 12 个月，卡片会自动加「长期未更新」标记，并在构建摘要中列出异常项目，供维护者判断。

**下架**（`status: delisted`）走人工数据 PR，情形包括：

- 仓库被删除或转为私有；
- 许可证变更为闭源或不可核实；
- 被证实无法部署且作者不修复；
- 作者本人要求移除。

下架后条目保留记录但页面不再渲染入口（详情页返回真实 404），列表与「最新收录」也不再出现。

**作者异议通道**：如果你是被收录项目的作者，且不希望被收录、或认为条目信息有误（名称、简介、部署方式、许可证等），**在本仓库开 issue** 说明条目 slug 与诉求，维护者会处理：

- 要求移除 → 按上架流程同样提数据 PR 下架，不设门槛、不需要理由；
- 信息有误 → 欢迎直接提修正 PR（同样只改 YAML）。

站点 `/about/` 与 `/submit/` 两个页面都会写明这条通道。

---

## 10. 责任与许可

- 第三方项目的**版权与责任归其作者**。本站的收录不构成对项目质量、安全性或商业适用性的担保。
- 「已验证」仅代表验证日期当天的部署实测结论，项目后续版本的行为以项目自身文档为准。
- 本站不代跑、不托管任何人的项目，也不持有访客的 Cloudflare 凭证。
- 投稿即表示你确认所提交内容的准确性，并同意本站按上述规则展示该项目信息。
- 本仓库代码与站点内容的许可见仓库 `LICENSE`；收录的第三方项目沿用其自身许可证。
