# karin-plugin-drawImages

Karin 的 `#draw` AI 绘图插件，支持文生图和带图/引用图片的图生图。

接口按 OpenAI Images API 兼容格式请求，适合搭配 New API 或其他兼容服务使用。

## 安装

将插件放入 Karin 的 `plugins` 目录后安装依赖并构建：

```bash
pnpm install
pnpm build
```

构建完成后重启 Karin。

## Usage

- `#draw 提示词`：文生图
- `#draw 提示词` 并附带或引用图片：图生图

## 配置

插件包内提供 `config/config.yaml.example` 作为配置示例。

Web 配置面板会保存到运行时的 `@karinjs/karin-plugin-drawImages/config/config.yaml`。

主要配置项：

| 字段 | 说明 | 默认值 |
| --- | --- | --- |
| `baseUrl` | API 服务地址，不包含末尾 `/` | `https://example.com` |
| `apiKey` | API 密钥 | 空 |
| `endpoint` | 图片生成接口路径 | `/v1/images/generations` |
| `model` | 绘图模型 | `gpt-image-2` |
| `cooldownSeconds` | 每个用户绘图冷却时间，单位秒 | `180` |
| `requestTimeoutSeconds` | 请求超时时间，单位秒 | `600` |
| `moderation` | 审核级别 | `auto` |
| `background` | 背景模式 | `auto` |
| `outputFormat` | 输出格式 | `png` |
| `quality` | 图片质量 | `high` |
| `size` | 图片尺寸 | `2160x3840` |
| `n` | 生成数量 | `1` |

## 常见问题

### 当前模型负载较高

如果日志或聊天回复出现类似：

```text
当前模型负载较高，请稍候重试，或者切换其他模型
```

说明请求已经到达上游服务，插件本身工作正常。可以稍后重试，或在配置里切换 `model`。

### 接口返回非 JSON 响应

如果提示 `接口返回非 JSON 响应`，通常是 `baseUrl + endpoint` 指向了网页、404 页面、反代错误页或网关错误页。检查：

- `baseUrl` 是否为 API 地址
- `endpoint` 是否为 `/v1/images/generations`
- 反向代理是否正确转发接口
- 服务端是否返回了 502/503 等错误页

### 接口请求超时

如果提示 `接口请求超时`，说明上游在配置时间内没有返回结果。可以稍后重试，或调大 `requestTimeoutSeconds`。
