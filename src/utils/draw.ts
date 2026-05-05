import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { logger } from 'node-karin'

import { post, postWithStream, type ApiResponse } from './http'

const HTTP_URL_REG = /^https?:\/\//i
const DATA_URL_REG = /^data:image\//i
const BASE64_PREFIX = 'base64://'
const IMAGE_GENERATIONS_ENDPOINT = '/v1/images/generations'
const CHAT_COMPLETIONS_ENDPOINT = '/v1/chat/completions'
const MARKDOWN_IMAGE_URL_REG = /!\[[^\]]*]\((https?:\/\/[^)\s]+|data:image\/[^)\s]+|base64:\/\/[^)\s]+)\)/gi
const MARKDOWN_LINK_REG = /\[[^\]]*]\(([^)\s]+)\)/gi
const TEXT_IMAGE_URL_REG = /(https?:\/\/[^\s"'<>)]*\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>)]*)?|data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+|base64:\/\/[a-z0-9+/=]+)/gi

export const DRAW_API_MODES = ['images', 'chatCompletions', 'custom'] as const
export type DrawApiMode = typeof DRAW_API_MODES[number]

export const IMAGE_DETAIL_OPTIONS = ['auto', 'low', 'high', 'original'] as const
export type ImageDetail = typeof IMAGE_DETAIL_OPTIONS[number]
export const DISABLED_DRAW_OPTION_VALUE = '__disabled__'

export const DRAW_COMMAND_REG = /^#draw(?:\s+([\s\S]*))?$/i
export const DRAW_USAGE_TEXT = [
  '用法：',
  '#draw 提示词',
  '#draw 提示词 + 附带/引用图片（图生图）',
].join('\n')

export interface DrawConfigSource {
  name?: unknown
  apiMode?: unknown
  apiKey?: unknown
  baseUrl?: unknown
  endpoint?: unknown
  model?: unknown
  imageDetail?: unknown
  cooldownSeconds?: unknown
  requestTimeoutSeconds?: unknown
  moderation?: unknown
  background?: unknown
  outputFormat?: unknown
  quality?: unknown
  size?: unknown
  n?: unknown
}

export interface DrawConfig {
  name: string
  apiMode: DrawApiMode
  apiKey: string
  baseUrl: string
  endpoint: string
  model: string
  imageDetail: ImageDetail
  cooldownSeconds: number
  requestTimeoutSeconds: number
  moderation?: string
  background?: string
  outputFormat?: string
  quality?: string
  size?: string
  n?: number
}

export const DRAW_CONFIG_KEYS = [
  'name',
  'apiMode',
  'apiKey',
  'baseUrl',
  'endpoint',
  'model',
  'imageDetail',
  'cooldownSeconds',
  'requestTimeoutSeconds',
  'moderation',
  'background',
  'outputFormat',
  'quality',
  'size',
  'n',
] as const

export const DEFAULT_DRAW_CONFIG: Readonly<Required<Pick<DrawConfig, 'name' | 'apiMode' | 'apiKey' | 'baseUrl' | 'endpoint' | 'model' | 'imageDetail' | 'cooldownSeconds' | 'requestTimeoutSeconds'>> & {
  moderation: string
  background: string
  outputFormat: string
  quality: string
  size: string
  n: number
}> = {
  name: '配置一',
  apiMode: 'images',
  apiKey: '',
  baseUrl: 'https://example.com',
  endpoint: IMAGE_GENERATIONS_ENDPOINT,
  model: 'gpt-image-2',
  imageDetail: 'high',
  cooldownSeconds: 180,
  requestTimeoutSeconds: 600,
  moderation: 'auto',
  background: 'auto',
  outputFormat: 'png',
  quality: 'high',
  size: '2160x3840',
  n: 1,
}

function stringOrDefault (value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

function toPositiveInteger (value: unknown, fallback = 1): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed
    }
  }

  return fallback
}

function normalizeEndpoint (value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function enumOrDefault<T extends readonly string[]> (value: unknown, options: T, fallback: T[number]): T[number] {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return options.includes(trimmed) ? trimmed : fallback
}

function optionalStringOrDefault (value: unknown, fallback: string): string | undefined {
  if (value === DISABLED_DRAW_OPTION_VALUE) {
    return undefined
  }

  const normalized = stringOrDefault(value, fallback)
  return normalized || undefined
}

function getDefaultEndpoint (apiMode: DrawApiMode): string {
  return apiMode === 'chatCompletions' ? CHAT_COMPLETIONS_ENDPOINT : IMAGE_GENERATIONS_ENDPOINT
}

function endpointOrDefault (source: DrawConfigSource, apiMode: DrawApiMode): string {
  if (apiMode !== 'custom') {
    return getDefaultEndpoint(apiMode)
  }

  return stringOrDefault(source.endpoint, DEFAULT_DRAW_CONFIG.endpoint)
}

/**
 * 提取 #draw 后面的提示词。
 *
 * @param message - 原始消息文本。
 * @returns 提取出的提示词；没有提示词时返回空字符串。
 */
export function parseDrawPrompt (message: string): string {
  return message.match(DRAW_COMMAND_REG)?.[1]?.trim() ?? ''
}

/**
 * 将 yaml/web 面板里的松散配置转换成运行时可直接使用的配置。
 *
 * @param source - 来自 yaml 或 Web 配置面板的原始配置。
 * @returns 归一化后的绘图配置。
 */
export function toDrawConfig (source: DrawConfigSource): DrawConfig {
  const apiMode = enumOrDefault(source.apiMode, DRAW_API_MODES, DEFAULT_DRAW_CONFIG.apiMode)

  return {
    name: stringOrDefault(source.name, DEFAULT_DRAW_CONFIG.name),
    apiMode,
    apiKey: stringOrDefault(source.apiKey, DEFAULT_DRAW_CONFIG.apiKey),
    baseUrl: stringOrDefault(source.baseUrl, DEFAULT_DRAW_CONFIG.baseUrl).replace(/\/+$/, ''),
    endpoint: normalizeEndpoint(endpointOrDefault(source, apiMode)),
    model: stringOrDefault(source.model, DEFAULT_DRAW_CONFIG.model),
    imageDetail: enumOrDefault(source.imageDetail, IMAGE_DETAIL_OPTIONS, DEFAULT_DRAW_CONFIG.imageDetail),
    cooldownSeconds: toPositiveInteger(source.cooldownSeconds, DEFAULT_DRAW_CONFIG.cooldownSeconds),
    requestTimeoutSeconds: toPositiveInteger(source.requestTimeoutSeconds, DEFAULT_DRAW_CONFIG.requestTimeoutSeconds),
    moderation: optionalStringOrDefault(source.moderation, DEFAULT_DRAW_CONFIG.moderation),
    background: optionalStringOrDefault(source.background, DEFAULT_DRAW_CONFIG.background),
    outputFormat: optionalStringOrDefault(source.outputFormat, DEFAULT_DRAW_CONFIG.outputFormat),
    quality: optionalStringOrDefault(source.quality, DEFAULT_DRAW_CONFIG.quality),
    size: optionalStringOrDefault(source.size, DEFAULT_DRAW_CONFIG.size),
    n: source.n === undefined || source.n === null || source.n === ''
      ? DEFAULT_DRAW_CONFIG.n
      : toPositiveInteger(source.n, DEFAULT_DRAW_CONFIG.n),
  }
}

/**
 * 根据接口模式构建上游请求体。
 *
 * images/custom 模式使用 Images API 风格，chatCompletions 模式使用
 * messages[].content 的图像输入格式。
 *
 * @param input - 请求体构建参数。
 * @param input.prompt - 绘图提示词。
 * @param input.images - 图生图输入图片列表。
 * @param input.options - 当前绘图配置。
 * @returns 上游接口请求体。
 */
export function buildImageRequestPayload ({
  prompt,
  images = [],
  options,
}: {
  prompt: string
  images?: string[]
  options: DrawConfig
}) {
  if (usesChatCompletionsApi(options)) {
    return {
      model: options.model,
      stream: true,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...images.map((image) => ({
              type: 'image_url',
              image_url: {
                url: image,
                detail: options.imageDetail,
              },
            })),
          ],
        },
      ],
    }
  }

  const payload: Record<string, unknown> = {
    model: options.model,
    prompt,
  }

  // 可选参数选择“关闭”时会在 toDrawConfig 中变成 undefined，这里自然跳过。
  if (images.length > 0) payload.image = images
  if (options.moderation) payload.moderation = options.moderation
  if (options.background) payload.background = options.background
  if (options.outputFormat) payload.output_format = options.outputFormat
  if (options.quality) payload.quality = options.quality
  if (options.size) payload.size = options.size
  if (options.n && options.n !== 1) payload.n = options.n

  return payload
}

/**
 * 从上游响应里提取可发送的图片结果。
 *
 * 兼容 Images API 的 data[].b64_json/data[].url，也兼容 Chat Completions
 * 文本里返回的 Markdown 图片、直链、data URL 和 base64://。
 *
 * @param json - 上游响应 JSON。
 * @returns 可直接发送给 Karin 的图片结果列表。
 */
export function extractOutputImages (json: any): string[] {
  const dataImages = Array.isArray(json?.data)
    ? json.data.flatMap((item: any) => {
      if (typeof item?.b64_json === 'string' && item.b64_json) {
        return [`${BASE64_PREFIX}${item.b64_json}`]
      }

      if (typeof item?.url === 'string' && item.url) {
        return [item.url]
      }

      return []
    })
    : []

  const chatImages = Array.isArray(json?.choices)
    ? json.choices.flatMap((choice: any) => extractImagesFromText(choice?.message?.content))
    : []

  return uniqueStrings([...dataImages, ...chatImages])
}

/**
 * 从文本里提取图片链接，同时忽略普通 Markdown 下载链接。
 *
 * @param content - Chat Completions 返回的文本内容。
 * @returns 文本中的图片 URL 或 base64 图片列表。
 */
function extractImagesFromText (content: unknown): string[] {
  if (typeof content !== 'string') return []

  const markdownImages = [...content.matchAll(MARKDOWN_IMAGE_URL_REG)].map(match => match[1])
  const plainText = content
    .replaceAll(MARKDOWN_IMAGE_URL_REG, ' ')
    .replaceAll(MARKDOWN_LINK_REG, ' ')
  const textImages = [...plainText.matchAll(TEXT_IMAGE_URL_REG)].map(match => match[1])
  return uniqueStrings([...markdownImages, ...textImages])
}

function uniqueStrings (values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function getMimeType (filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    default:
      return 'image/png'
  }
}

/**
 * 将 Karin/QQ 得到的图片输入统一转换成上游可接收的 URL 或 data URL。
 *
 * @param images - Karin 事件里提取到的图片地址、file URL 或 base64:// 内容。
 * @returns 上游 API 可读取的图片 URL 或 data URL 列表。
 */
export async function resolveApiImageInputs (images: readonly string[]): Promise<string[]> {
  return Promise.all(images.map(async (input) => {
    if (input.startsWith(BASE64_PREFIX)) {
      return `data:image/png;base64,${input.slice(BASE64_PREFIX.length)}`
    }

    if (HTTP_URL_REG.test(input) || DATA_URL_REG.test(input)) {
      return input
    }

    const filePath = input.startsWith('file://') ? fileURLToPath(input) : input
    const buffer = await fs.readFile(filePath)
    return `data:${getMimeType(filePath)};base64,${buffer.toString('base64')}`
  }))
}

function compactResponseText (text: string, maxLength = 120): string {
  const compacted = text.replace(/\s+/g, ' ').trim()
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength)}...` : compacted
}

function summarizeImageApiResponse (response: ApiResponse): string {
  return [
    `status=${response.status} ${response.statusText}`.trim(),
    `contentType=${response.contentType || '未知类型'}`,
    `body=${compactResponseText(response.text, 300) || '空响应'}`,
  ].join('，')
}

/**
 * 解析 JSON 响应，并在拿到 HTML/网关错误页时给出更明确的错误片段。
 *
 * @param response - 网络层返回的归一化响应。
 * @returns 解析后的 JSON 对象；空响应返回空对象。
 * @throws 当响应不是合法 JSON 时抛出包含状态码、Content-Type 和响应片段的错误。
 */
function parseJsonResponse (response: ApiResponse): any {
  const text = response.text.trim()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    const status = response.status ? `${response.status} ${response.statusText}`.trim() : '未知状态'
    const contentType = response.contentType || '未知类型'
    const preview = compactResponseText(text)
    throw new Error(`接口返回非 JSON 响应: ${status}，Content-Type: ${contentType}${preview ? `，响应片段: ${preview}` : ''}`)
  }
}

function usesChatCompletionsApi (config: DrawConfig): boolean {
  return config.apiMode === 'chatCompletions' || config.endpoint === CHAT_COMPLETIONS_ENDPOINT
}

/**
 * 递归查找上游返回的 error.message。
 *
 * 一些兼容服务会在 HTTP 200 的 SSE 事件里返回 error，
 * 这里提前识别，避免误报成“成功但没拿到图片”。
 *
 * @param value - 上游响应 JSON 或其中的任意嵌套值。
 * @returns 找到的上游错误消息；没有错误时返回 undefined。
 */
function findApiErrorMessage (value: unknown): string | undefined {
  if (typeof value === 'string') {
    return findApiErrorMessageInText(value)
  }

  if (!value || typeof value !== 'object') return undefined

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = findApiErrorMessage(item)
      if (message) return message
    }

    return undefined
  }

  const record = value as Record<string, unknown>
  const error = record.error
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message
    if (typeof message === 'string' && message.trim()) {
      return message.trim()
    }
  }

  for (const key of ['choices', 'message', 'content']) {
    const message = findApiErrorMessage(record[key])
    if (message) return message
  }

  return undefined
}

/**
 * 从 SSE 原始文本中提取内嵌的 JSON error.message。
 *
 * @param text - SSE 原始文本或包含 SSE 原文的响应字符串。
 * @returns 找到的上游错误消息；没有错误时返回 undefined。
 */
function findApiErrorMessageInText (text: string): string | undefined {
  const matches = text.matchAll(/\{[^\n]*"error"\s*:\s*\{[^\n]*\}[^\n]*\}/g)

  for (const match of matches) {
    try {
      const message = findApiErrorMessage(JSON.parse(match[0]))
      if (message) return message
    } catch {}
  }

  return undefined
}

/**
 * 执行绘图请求并返回图片结果。
 *
 * @param prompt - 绘图提示词。
 * @param images - 已解析成上游可读取格式的输入图片列表。
 * @param config - 当前生效的绘图配置。
 * @returns 上游返回的图片结果列表。
 * @throws 当接口返回错误、非 JSON、超时或没有图片结果时抛出错误。
 */
export async function generateImages (prompt: string, images: string[], config: DrawConfig): Promise<string[]> {
  const payload = buildImageRequestPayload({ prompt, images, options: config })
  const response = usesChatCompletionsApi(config)
    ? await postWithStream(
      `${config.baseUrl}${config.endpoint}`,
      config.apiKey,
      payload,
      config.requestTimeoutSeconds,
    )
    : await post(
      `${config.baseUrl}${config.endpoint}`,
      config.apiKey,
      payload,
      config.requestTimeoutSeconds,
    )

  const json = parseJsonResponse(response)
  const apiErrorMessage = findApiErrorMessage(json) || findApiErrorMessageInText(response.text)

  if (apiErrorMessage) {
    throw new Error(apiErrorMessage)
  }

  if (!response.ok) {
    throw new Error(json?.error?.message || json?.message || `接口请求失败: ${response.status} ${response.statusText}`)
  }

  const output = extractOutputImages(json)
  if (output.length === 0) {
    // 只记录响应摘要，避免日志里泄露完整响应或过长内容。
    logger.warn(`[karin-plugin-drawImages] 接口返回成功但未解析到图片，${summarizeImageApiResponse(response)}`)
    throw new Error('接口返回成功，但没有拿到图片结果')
  }

  return output
}
