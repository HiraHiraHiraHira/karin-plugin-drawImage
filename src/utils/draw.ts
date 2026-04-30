import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HTTP_URL_REG = /^https?:\/\//i
const DATA_URL_REG = /^data:image\//i
const BASE64_PREFIX = 'base64://'

export const DRAW_COMMAND_REG = /^#draw(?:\s+([\s\S]*))?$/i
export const DRAW_USAGE_TEXT = [
  '用法：',
  '#draw 提示词',
  '#draw 提示词 + 带图消息（图生图）',
].join('\n')

export interface DrawConfigSource {
  apiKey?: unknown
  baseUrl?: unknown
  endpoint?: unknown
  model?: unknown
  cooldownSeconds?: unknown
  moderation?: unknown
  background?: unknown
  outputFormat?: unknown
  quality?: unknown
  size?: unknown
  n?: unknown
}

export interface DrawConfig {
  apiKey: string
  baseUrl: string
  endpoint: string
  model: string
  cooldownSeconds: number
  moderation?: string
  background?: string
  outputFormat?: string
  quality?: string
  size?: string
  n?: number
}

export const DRAW_CONFIG_KEYS = [
  'apiKey',
  'baseUrl',
  'endpoint',
  'model',
  'cooldownSeconds',
  'moderation',
  'background',
  'outputFormat',
  'quality',
  'size',
  'n',
] as const

export const DEFAULT_DRAW_CONFIG: Readonly<Required<Pick<DrawConfig, 'apiKey' | 'baseUrl' | 'endpoint' | 'model' | 'cooldownSeconds'>> & {
  moderation: string
  background: string
  outputFormat: string
  quality: string
  size: string
  n: number
}> = {
  apiKey: '',
  baseUrl: 'https://example.com',
  endpoint: '/v1/images/generations',
  model: 'gpt-image-2',
  cooldownSeconds: 180,
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

export function parseDrawPrompt (message: string): string {
  return message.match(DRAW_COMMAND_REG)?.[1]?.trim() ?? ''
}

export function toDrawConfig (source: DrawConfigSource): DrawConfig {
  return {
    apiKey: stringOrDefault(source.apiKey, DEFAULT_DRAW_CONFIG.apiKey),
    baseUrl: stringOrDefault(source.baseUrl, DEFAULT_DRAW_CONFIG.baseUrl).replace(/\/+$/, ''),
    endpoint: normalizeEndpoint(stringOrDefault(source.endpoint, DEFAULT_DRAW_CONFIG.endpoint)),
    model: stringOrDefault(source.model, DEFAULT_DRAW_CONFIG.model),
    cooldownSeconds: toPositiveInteger(source.cooldownSeconds, DEFAULT_DRAW_CONFIG.cooldownSeconds),
    moderation: stringOrDefault(source.moderation, DEFAULT_DRAW_CONFIG.moderation) || undefined,
    background: stringOrDefault(source.background, DEFAULT_DRAW_CONFIG.background) || undefined,
    outputFormat: stringOrDefault(source.outputFormat, DEFAULT_DRAW_CONFIG.outputFormat) || undefined,
    quality: stringOrDefault(source.quality, DEFAULT_DRAW_CONFIG.quality) || undefined,
    size: stringOrDefault(source.size, DEFAULT_DRAW_CONFIG.size) || undefined,
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
  if (!Array.isArray(json?.data)) return []

  return json.data.flatMap((item: any) => {
    if (typeof item?.b64_json === 'string' && item.b64_json) {
      return [`${BASE64_PREFIX}${item.b64_json}`]
    }

    if (typeof item?.url === 'string' && item.url) {
      return [item.url]
    }

    return []
  })
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

export async function generateImages (prompt: string, images: string[], config: DrawConfig): Promise<string[]> {
  const response = await fetch(`${config.baseUrl}${config.endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(buildImageRequestPayload({ prompt, images, options: config })),
  })

  const text = await response.text()
  const json = text.trim() ? JSON.parse(text) : {}

  if (!response.ok) {
    throw new Error(json?.error?.message || json?.message || `接口请求失败: ${response.status} ${response.statusText}`)
  }

  const output = extractOutputImages(json)
  if (output.length === 0) {
    throw new Error('接口返回成功，但没有拿到图片结果')
  }

  return output
}
