# karin-plugin-drawImages

Karin 的 `#draw` AI 绘图插件，支持：

- `#draw 提示词` 文生图
- `#draw 提示词` + 附带图片 图生图
- `#draw 提示词` + 引用图片 图生图

接口支持 OpenAI Images API 兼容格式，也支持 Chat Completions 图像输入格式，适合搭配 New API 或其他兼容服务使用。

## 安装

将插件放入 Karin 的 `plugins` 目录后安装依赖并构建：

```bash
pnpm install
pnpm build
```

构建完成后重启 Karin。

如果修改了插件源码，也记得重新执行一次：

```bash
pnpm build
```

否则 Karin 运行的仍然是 `lib/` 里的旧构建产物。

## 指令

- `#draw 提示词`：文生图
- `#draw 提示词` 并附带或引用图片：图生图

## 配置

插件包内提供 `config/config.yaml.example` 作为配置示例。

Web 配置面板会保存到运行时的 `@karinjs/karin-plugin-drawImages/config/config.yaml`。

插件固定提供三组配置档：`配置一`、`配置二`、`配置三`。面板顶部的“当前配置”用于一键切换当前生效的配置档。

配置档会继承“全局配置”：某个字段留空时使用全局值，配置档自己填写时覆盖全局值。这样多个配置可以共用同一个 `baseUrl`、`apiKey`、超时时间等，只在需要时单独覆盖模型或接口模式。

配置结构示例：

```yaml
draw:
  activeProfile: profile1
  global:
    apiMode: images
    baseUrl: https://example.com
    apiKey: ''
    endpoint: /v1/images/generations
    model: gpt-image-2
    imageDetail: high
    cooldownSeconds: 180
    requestTimeoutSeconds: 600
    moderation: auto
    background: auto
    outputFormat: png
    quality: high
    size: 2160x3840
    n: 1
  profiles:
    profile1:
      name: 配置一
      apiMode: ''
      baseUrl: ''
      apiKey: ''
      endpoint: ''
      model: ''
      imageDetail: ''
      cooldownSeconds: ''
      requestTimeoutSeconds: ''
      moderation: ''
      background: ''
      outputFormat: ''
      quality: ''
      size: ''
      n: ''
```

主要配置项：

| 字段 | 说明 | 默认值 |
| --- | --- | --- |
| `activeProfile` | 当前使用的配置档 | `profile1` |
| `global` | 全局默认配置，配置档字段为空时继承这里 | - |
| `profiles.profile1/2/3` | 三组固定配置档 | - |
| `name` | 配置档显示名称 | `配置一` |
| `apiMode` | 接口模式：`images`、`chatCompletions`、`custom` | `images` |
| `baseUrl` | API 服务地址，不包含末尾 `/` | `https://example.com` |
| `apiKey` | API 密钥 | 空 |
| `endpoint` | 自定义请求路径，仅 `custom` 模式使用 | `/v1/images/generations` |
| `model` | 绘图模型 | `gpt-image-2` |
| `imageDetail` | Chat Completions 图像细节：`auto`、`low`、`high`、`original` | `high` |
| `cooldownSeconds` | 每个用户绘图冷却时间，单位秒 | `180` |
| `requestTimeoutSeconds` | 请求超时时间，单位秒 | `600` |
| `moderation` | 审核级别 | `auto` |
| `background` | 背景模式 | `auto` |
| `outputFormat` | 输出格式 | `png` |
| `quality` | 图片质量 | `high` |
| `size` | 图片尺寸 | `2160x3840` |
| `n` | 生成数量 | `1` |

推荐用法：

- `配置一` 放常规 `images` 接口
- `配置二` 放 `chatCompletions` 图生图接口
- `配置三` 留作备用模型或备用渠道

## 接口模式

- `images`：固定使用 `/v1/images/generations`，请求体为 Images API 风格。
- `chatCompletions`：固定使用 `/v1/chat/completions`，请求体为 `messages[].content` 风格，带图时会把图片作为 `image_url` 输入，并携带 `imageDetail`。
- `custom`：保留自定义路由，默认仍按 Images API 风格组织请求体。

`chatCompletions` 模式现在会优先用流式请求聚合结果，再从返回内容中提取图片 URL、Markdown 图片链接、`data:image/...` 或 `base64://...` 图片。

对于这种返回内容也能正常识别：

```md
> 🎨 生成中...

![image](https://example.com/result.png)

[点击下载](https://example.com/download/result.png)
```

## 常见问题

### 当前模型负载较高

如果日志或聊天回复出现类似：

```text
当前模型负载较高，请稍候重试，或者切换其他模型
```

说明请求已经到达上游服务，插件本身工作正常。可以稍后重试，或在配置里切换 `model`。

### 接口返回成功，但没有拿到图片结果

如果出现这个提示，通常是以下几种情况：

- 上游实际返回了成功状态，但内容里没有图片链接
- 上游返回格式发生变化，图片不在文本里
- Karin 正在运行旧的 `lib/` 构建产物

建议按顺序检查：

- 重新执行 `pnpm build`
- 重启 Karin
- 确认当前激活的配置档是否正确
- 确认 `model`、`apiMode` 和 `baseUrl` 是否与上游文档一致

### 接口返回非 JSON 响应

如果提示 `接口返回非 JSON 响应`，通常是 `baseUrl + endpoint` 指向了网页、404 页面、反代错误页或网关错误页。检查：

- `baseUrl` 是否为 API 地址
- `endpoint` 是否与当前 `apiMode` 匹配
- 反向代理是否正确转发接口
- 服务端是否返回了 502/503 等错误页

### 接口请求超时

如果提示 `接口请求超时`，说明上游在配置时间内没有返回结果。可以稍后重试，或调大 `requestTimeoutSeconds`。

### Chat Completions 图生图建议

如果你使用的是 `chatCompletions` 模式：

- 优先确认模型本身支持图像输入
- 不同模型的可用路由和返回格式可能不同
- 建议先用一个已知可用模型测通，再逐步切换
- 当 `openai-image-2-4k` 可用而另一个模型报 500/503 时，通常更像是上游模型或渠道问题，不是插件解析问题
