import fs from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { URL, fileURLToPath } from 'node:url'

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

export function parseDrawPrompt (message: string): string {
  return message.match(DRAW_COMMAND_REG)?.[1]?.trim() ?? ''
}

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

  if (images.length > 0) payload.image = images
  if (options.moderation) payload.moderation = options.moderation
  if (options.background) payload.background = options.background
  if (options.outputFormat) payload.output_format = options.outputFormat
  if (options.quality) payload.quality = options.quality
  if (options.size) payload.size = options.size
  if (options.n && options.n !== 1) payload.n = options.n

  return payload
}

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

interface ImageApiResponse {
  ok: boolean
  status: number
  statusText: string
  contentType: string
  text: string
}

function compactResponseText (text: string, maxLength = 120): string {
  const compacted = text.replace(/\s+/g, ' ').trim()
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength)}...` : compacted
}

function parseJsonResponse (response: ImageApiResponse): any {
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

function createRequestOptions (url: string, apiKey: string, body: string, accept: string, timeoutSeconds: number) {
  const target = new URL(url)

  return {
    target,
    request: target.protocol === 'http:' ? http.request : https.request,
    options: {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: accept,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: timeoutSeconds * 1000,
    },
  }
}

function postJson (url: string, apiKey: string, payload: Record<string, unknown>, timeoutSeconds: number): Promise<ImageApiResponse> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload)
    const { request, options } = createRequestOptions(url, apiKey, body, 'application/json', timeoutSeconds)

    const req = request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      res.on('end', () => {
        resolve({
          ok: Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300),
          status: res.statusCode ?? 0,
          statusText: res.statusMessage ?? '',
          contentType: String(res.headers['content-type'] ?? ''),
          text: Buffer.concat(chunks).toString('utf8'),
        })
      })
    })

    req.on('timeout', () => {
      req.destroy(new Error(`接口请求超时：${timeoutSeconds} 秒内没有返回结果，请稍后重试或调大 requestTimeoutSeconds`))
    })
    req.on('error', reject)
    req.end(body)
  })
}

function parseEventStreamText (text: string): string {
  const textParts: string[] = []

  for (const rawEvent of text.split('\n\n')) {
    if (!rawEvent.trim()) continue

    const dataLines = rawEvent
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trim())

    if (dataLines.length === 0) continue
    const data = dataLines.join('\n')
    if (data === '[DONE]') continue

    try {
      const json = JSON.parse(data)
      const choices = Array.isArray(json?.choices) ? json.choices : []

      for (const choice of choices) {
        if (typeof choice?.delta?.content === 'string' && choice.delta.content) {
          textParts.push(choice.delta.content)
          continue
        }

        if (typeof choice?.message?.content === 'string' && choice.message.content) {
          textParts.push(choice.message.content)
        }
      }
    } catch {}
  }

  return textParts.join('').trim()
}

function postEventStream (url: string, apiKey: string, payload: Record<string, unknown>, timeoutSeconds: number): Promise<ImageApiResponse> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload)
    const { request, options } = createRequestOptions(url, apiKey, body, 'text/event-stream', timeoutSeconds)

    const req = request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        const contentType = String(res.headers['content-type'] ?? '')

        if (!contentType.includes('text/event-stream')) {
          resolve({
            ok: Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300),
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? '',
            contentType,
            text,
          })
          return
        }

        const content = parseEventStreamText(text)
        resolve({
          ok: Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300),
          status: res.statusCode ?? 0,
          statusText: res.statusMessage ?? '',
          contentType,
          text: JSON.stringify({
            choices: [
              {
                message: {
                  content,
                },
              },
            ],
          }),
        })
      })
    })

    req.on('timeout', () => {
      req.destroy(new Error(`接口请求超时：${timeoutSeconds} 秒内没有返回结果，请稍后重试或调大 requestTimeoutSeconds`))
    })
    req.on('error', reject)
    req.end(body)
  })
}

export async function generateImages (prompt: string, images: string[], config: DrawConfig): Promise<string[]> {
  const payload = buildImageRequestPayload({ prompt, images, options: config })
  const response = usesChatCompletionsApi(config)
    ? await postEventStream(
      `${config.baseUrl}${config.endpoint}`,
      config.apiKey,
      payload,
      config.requestTimeoutSeconds,
    )
    : await postJson(
      `${config.baseUrl}${config.endpoint}`,
      config.apiKey,
      payload,
      config.requestTimeoutSeconds,
    )

  const json = parseJsonResponse(response)

  if (!response.ok) {
    throw new Error(json?.error?.message || json?.message || `接口请求失败: ${response.status} ${response.statusText}`)
  }

  const output = extractOutputImages(json)
  if (output.length === 0) {
    throw new Error('接口返回成功，但没有拿到图片结果')
  }

  return output
}
