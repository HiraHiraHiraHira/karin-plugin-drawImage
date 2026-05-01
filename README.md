# karin-plugin-drawImages

Karin 的 `#draw` AI 绘图插件，支持文生图和图生图，适配 OpenAI Images API 兼容接口，也支持 Chat Completions 图像输入模式。

## 功能

- `#draw 提示词` 文生图
- `#draw 提示词` + 附带图片 图生图
- `#draw 提示词` + 引用图片 图生图
- 固定三组配置档，可在面板中一键切换
- 子配置留空时继承全局配置
- 支持每用户绘图冷却
- 支持流式聚合 Chat Completions 返回结果

## 安装

将插件放入 Karin 的 `plugins` 目录后执行：

```bash
pnpm install
pnpm build
```

构建完成后重启 Karin。

如果你修改了插件源码，也要重新执行一次：

```bash
pnpm build
```

否则 Karin 继续读取的是 `lib/` 里的旧构建产物。

## 指令

- `#draw 提示词`
- `#draw 提示词` 并附带图片
- `#draw 提示词` 并引用图片

当消息里带图时，会自动进入图生图模式。

## 配置方式

插件包内提供：

- `config/config.yaml.example` 配置示例

运行时实际使用的配置文件通常在：

- `@karinjs/karin-plugin-drawImages/config/config.yaml`

也可以直接通过 Karin Web 配置面板修改。

## 配置结构

插件固定提供三组配置档：

- `配置一`
- `配置二`
- `配置三`

顶部的“当前配置”用于切换当前实际生效的配置档。

配置规则是：

- `全局配置` 作为默认值
- `配置一/二/三` 某项留空时，继承全局配置
- 配置档自己填写后，覆盖全局配置

这比较适合下面这种场景：

- 全局统一填写 `baseUrl`、`apiKey`
- `配置一` 走常规文生图模型
- `配置二` 走图生图模型
- `配置三` 作为备用渠道或备用模型

## 配置示例

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
      moderation: ''
      background: ''
      outputFormat: ''
      quality: ''
      size: ''
    profile2:
      name: 配置二
    profile3:
      name: 配置三
```

## 主要配置项

| 字段 | 说明 | 默认值 |
| --- | --- | --- |
| `activeProfile` | 当前启用的配置档 | `profile1` |
| `apiMode` | 接口模式：`images`、`chatCompletions`、`custom` | `images` |
| `baseUrl` | API 服务地址，不带末尾 `/` | `https://example.com` |
| `apiKey` | API 密钥 | 空 |
| `endpoint` | 自定义请求路径，仅 `custom` 模式使用 | `/v1/images/generations` |
| `model` | 使用的模型名称 | `gpt-image-2` |
| `imageDetail` | Chat Completions 图像细节 | `high` |
| `cooldownSeconds` | 每个用户绘图冷却时间，单位秒 | `180` |
| `requestTimeoutSeconds` | 上游请求超时时间，单位秒 | `600` |
| `moderation` | 审核级别 | `auto` |
| `background` | 背景模式 | `auto` |
| `outputFormat` | 输出格式 | `png` |
| `quality` | 图片质量 | `high` |
| `size` | 图片尺寸 | `2160x3840` |
| `n` | 一次生成的图片数量 | `1` |

说明：

- `cooldownSeconds`、`requestTimeoutSeconds`、`n` 只在全局配置中设置
- 配置一、二、三默认继承这三个值
- `size`、`quality`、`outputFormat`、`moderation`、`background` 可以在面板里选择“关闭”，关闭后请求里不会发送该字段

## 接口模式说明

### 1. images

固定请求：

```text
/v1/images/generations
```

按 Images API 风格发送请求，适合常规文生图，也可以用于部分兼容图生图接口。

### 2. chatCompletions

固定请求：

```text
/v1/chat/completions
```

带图时会把图片放进 `messages[].content` 中，作为 `image_url` 输入，并携带 `imageDetail`。

这个模式会优先走流式请求，再把上游返回内容聚合起来，从里面提取：

- 直链图片 URL
- Markdown 图片链接
- `data:image/...`
- `base64://...`

### 3. custom

自定义请求路径。

适合上游路由不是标准 `/v1/images/generations` 或 `/v1/chat/completions` 的情况。

## Web 面板

Web 配置面板支持：

- 当前配置切换
- 全局配置编辑
- 配置一/二/三单独覆盖
- 单选项切换
- `size` 自定义输入

面板元信息里已经补充：

- 插件名称
- 作者信息
- 图标
- 版本号

## 常见问题

### 1. 提示没有配置 API Key

先确认你改的是运行时配置文件，而不是插件目录里的示例文件。

优先检查：

- `@karinjs/karin-plugin-drawImages/config/config.yaml`
- 当前启用的是不是正确的配置档
- 当前配置档是否留空并正确继承了全局 `apiKey`

### 2. 接口返回非 JSON 响应

如果报：

```text
接口返回非 JSON 响应
```

通常说明 `baseUrl + endpoint` 指向了网页、错误页、反代页或者 404 页面。

建议检查：

- `baseUrl` 是否真的是 API 地址
- `endpoint` 是否和当前 `apiMode` 对应
- 反向代理是否正确转发

### 3. 接口请求超时

如果报：

```text
接口请求超时
```

说明上游在 `requestTimeoutSeconds` 限制内没有返回结果。可以：

- 稍后重试
- 调大 `requestTimeoutSeconds`
- 切换更快的模型或渠道

### 4. 当前模型负载较高

如果报：

```text
当前模型负载较高，请稍候重试，或者切换其他模型
```

一般说明请求已经正常到达上游，问题多半在上游模型负载，不是插件本身异常。

### 5. 接口返回成功，但没有拿到图片结果

如果报：

```text
接口返回成功，但没有拿到图片结果
```

常见原因：

- 上游虽然返回 200，但内容里没有实际图片
- 上游返回格式发生变化
- 当前模型只是返回了文本，没有返回图片
- 你还在运行旧的 `lib/` 构建产物

建议排查：

1. 重新执行 `pnpm build`
2. 重启 Karin
3. 检查当前配置档
4. 检查 `apiMode`、`model`、`baseUrl`

### 6. Chat Completions 图生图没有生效

建议优先检查：

- 模型本身是否支持图像输入
- 上游是否真的兼容 `image_url` 格式
- 当前图片链接是否可被上游访问
- 上游是否更偏好流式返回

## 开发

常用命令：

```bash
pnpm build
pnpm exec tsc --noEmit
```

发布前至少确认：

- 构建通过
- 配置面板能正常打开
- `#draw` 文生图可用
- `#draw` 图生图可用

## 仓库

- GitHub: <https://github.com/Chenyuxin221/karin-plugin-drawImage>
