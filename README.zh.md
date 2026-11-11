# Tallyflare

[![访问计数器](https://tally.yuki.sh/counters/github/tallyflare/badge?theme=gelbooru)](https://tally.yuki.sh/)

运行在 Cloudflare Workers 与 D1 SQLite 上的访问计数器，提供 SVG 徽章和 JSON API。

使用其他语言阅读：[English](./README.md) | 中文

## 特性

- SVG 访问徽章。
- 通过 JSON API 记录与读取计数。
- 内置 Moe Counter 主题，可通过 `theme` 参数切换。
- 运行于 Cloudflare Workers 与 D1 SQLite，支持私有部署。

## 使用

以下示例使用线上实例 [tally.yuki.sh](https://tally.yuki.sh)。私有部署时请替换为你的域名。

### 接口

| 方法   | 路径                               | 说明                    |
| ------ | ---------------------------------- | ----------------------- |
| `POST` | `/counters/:namespace/:name`       | 记录一次访问并返回 JSON |
| `GET`  | `/counters/:namespace/:name`       | 读取已有计数器的 JSON   |
| `GET`  | `/counters/:namespace/:name/badge` | 记录一次访问并返回 SVG  |
| `GET`  | `/badges/:visit`                   | 渲染指定数字的 SVG      |

### 嵌入计数器

```md
![访问计数器](https://tally.yuki.sh/counters/github/tallyflare/badge)
```

### 主题

```md
![访问计数器（miku 主题）](https://tally.yuki.sh/counters/github/tallyflare/badge?theme=miku)
```

内置 50 多套主题，默认 `moebooru`，`gelbooru`、`miku` 与 `minecraft` 只是其中几套。主题图片来自 [Moe Counter](https://count.getloli.com)。

### JSON API

记录一次访问：

```http
POST https://tally.yuki.sh/counters/github/tallyflare
```

```json
{
  "visit": 114514,
  "visitor": 1919,
  "digits": "0114514"
}
```

首次请求创建计数器并返回 `201 Created`，之后返回 `200 OK`。读取时使用 `GET`，不记录访问。`digits` 是 `visit` 按 `padding`（默认 7）补零后的字符串：

```http
GET https://tally.yuki.sh/counters/github/tallyflare
```

`visitor` 是计数器自建立以来出现过的独立客户端 IP 数，不等于人数。迁移后的计数器会保留旧 `visitor` 作为历史基数，同时保留全部旧 IP 指纹。历史基数不保证等于指纹数量。JSON 接口支持 `padding` 参数，默认 7，范围 0–16，用来调整 `digits` 的位数。

## 从旧 KV 迁移

旧版使用 Cloudflare KV。新版提供导出、转换和本地验证步骤：

```sh
bun run migrate:kv export --namespace-id <KV_NAMESPACE_ID> --output kv.json
bun run migrate:kv convert kv.json kv-migration --chunk-size 10000
```

完整流程见 [从 KV 迁移](docs/content/zh/migration.mdx)。

## 私有部署

Tallyflare 运行于 Cloudflare Workers，使用 D1 SQLite 存储数据。可以直接一键部署，也可以按下面的步骤手动部署。

### 一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/xueelf/tally-api)

点击按钮后，Cloudflare 会创建 D1 SQLite 数据库，再由 Workers Builds 依次运行 `build` 和 `deploy`。`deploy` 会先应用迁移，再发布 Worker。`database_id` 是 D1 SQLite 数据库的唯一标识。一键部署不需要填写。手动 CLI 首次部署时，需要创建 D1 数据库并把返回的 ID 填入配置。

### 手动部署

手动部署前，需要准备：

- 一个 Cloudflare 账号
- 一个 JavaScript 运行环境，例如 [Bun](https://bun.sh) 或 [Node.js](https://nodejs.org)

下面的命令以 Bun 为例，这是我个人的使用习惯。Worker 本身运行在 Cloudflare Workers 上，不依赖 Bun。仓库里的构建、测试和启动脚本目前使用 Bun，换成其他工具链时需要自行调整。

```sh
git clone https://github.com/xueelf/tally-api.git
cd tally-api
bun install
```

安装依赖后，启动本地服务：

```sh
bun run dev
```

服务启动后会输出实际地址。需要固定端口时，可以在命令前设置 `PORT`，例如 `PORT=3000 bun run dev`。

首次手动部署时，先创建 D1 SQLite 数据库并绑定：

```sh
bun run wrangler d1 create tallyflare
```

把输出的 `database_id` 填入 `wrangler.jsonc` 的 `d1_databases` 配置，然后应用迁移，再构建和发布：

```sh
bun run db:migrate:remote
bun run build
bun run wrangler deploy
```

之后更新时运行 `bun run release`，它会构建、应用远程迁移并部署 Worker。完整步骤见 [私有部署文档](docs/content/zh/deployment.mdx)。

## 文档

完整的使用说明、API 参考、主题与私有部署指南：

[https://tally.yuki.sh/](https://tally.yuki.sh/)

## 鸣谢

主题来自 [Moe Counter](https://github.com/journey-ad/Moe-Counter)，主题图片的版权归相关创作者所有。
