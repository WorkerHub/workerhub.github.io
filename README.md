# WorkerHub

Cloudflare Workers 生态的中文精选应用目录：自研项目 + 经收录把关的第三方开源项目，每个项目标清部署方式、所需资源与验证等级。

## 在线访问

- 主站：<https://workerhub.github.io>
- 副线：<https://hub.oneboy.app>

## 收录什么

本站收录两类项目，条目一律指向上游原仓库；本站不托管、不代跑任何项目，部署入口只指向目标仓库的 Deploy Button、GitHub Actions 或其部署文档。

- **自研项目**：WorkerHub 自研、自己维护的项目，仓库在 GitHub 的 WorkerHub 组织下。
- **第三方项目**：别人开发、可自部署在 Cloudflare Workers / Pages 上的开源项目，经收录门槛审核后收录。

每个项目标注一个验证等级：

- **自研**：WorkerHub 自研项目，由 WorkerHub 团队维护。
- **已验证**：本站维护者按其文档实际完成过一次部署并留有验证记录。
- **已收录**：仅通过收录门槛审核，未做部署实测。

## 如何提交你的项目

1. 读 [CONTRIBUTING.md](CONTRIBUTING.md) 的收录范围与五条门槛，确认项目符合。
2. 在 `src/data/projects/<slug>.yaml` 新增一个数据文件，模板见 CONTRIBUTING.md 第 5 节。
3. 可选：把截图放到 `public/screenshots/<slug>.webp`。
4. 向本仓库提 Pull Request，按 PR 模板逐项勾选门槛并附证据链接。
5. 等 CI 校验与人工评审，合并后自动上线。

字段说明、分类与部署方式枚举、截图规格、下架与异议通道都在 [CONTRIBUTING.md](CONTRIBUTING.md) 里，这里不重复。

## 本地运行

需要 Node 24 与 pnpm：

```bash
pnpm install
pnpm dev     # http://localhost:4321
pnpm build
```

## 声明

本站为独立项目，与 Cloudflare, Inc. 无隶属或背书关系；Cloudflare、Workers 为 Cloudflare, Inc. 的商标。第三方项目的版权与责任归其作者。

GitHub 组织：<https://github.com/WorkerHub>
