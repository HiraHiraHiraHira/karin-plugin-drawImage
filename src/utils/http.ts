import axios, { AxiosError } from 'axios'
import { createParser, type EventSourceMessage } from 'eventsource-parser'
import type { Readable } from 'node:stream'

export interface ApiResponse {
  /** HTTP 状态是否在 2xx 范围内 */
  ok: boolean
  /** HTTP 状态码 */
  status: number
  /** HTTP 状态文本 */
  statusText: string
  /** 响应 Content-Type */
  contentType: string
  /** 原始响应文本，流式响应会被转换为兼容 Chat Completions 的 JSON 文本 */
  text: string
}

/**
 * 创建统一的请求超时错误。
 *
 * @param timeoutSeconds - 请求超时时间，单位秒。
 * @returns 用户可读的超时错误对象。
 */
function timeoutError (timeoutSeconds: number): Error {
  return new Error(`接口请求超时：${timeoutSeconds} 秒内没有返回结果，请稍后重试或调大 requestTimeoutSeconds`)
}

/**
 * 将 axios 的超时错误统一转换成用户能看懂的插件错误。
 *
 * @param error - axios 抛出的原始错误。
 * @param timeoutSeconds - 请求超时时间，单位秒。
 * @throws 超时时抛出用户可读错误；非超时错误原样抛出。
 */
function normalizeAxiosError (error: unknown, timeoutSeconds: number): never {
  if (error instanceof AxiosError && (
    error.code === AxiosError.ETIMEDOUT ||
    error.code === 'ECONNABORTED' ||
    error.message.includes('timeout')
  )) {
    throw timeoutError(timeoutSeconds)
  }

  throw error
}

/**
 * 将 axios 返回体统一转成字符串，避免后续 JSON/SSE 解析层关心 Buffer 或对象。
 *
 * @param data - axios 返回的响应体。
 * @returns 转换后的字符串响应体。
 */
function toText (data: unknown): string {
  if (typeof data === 'string') return data
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (data === undefined || data === null) return ''
  return JSON.stringify(data)
}

/**
 * 兼容 axios headers 的大小写访问。
 *
 * @param headers - axios 响应头对象。
 * @returns Content-Type 字符串；不存在时返回空字符串。
 */
function getContentType (headers: Record<string, unknown>): string {
  return String(headers['content-type'] ?? headers['Content-Type'] ?? '')
}

/**
 * 从常见的模型流式片段里递归提取文本。
 *
 * 不同上游可能把文本放在 text/content/output_text/message 等字段里，
 * 这里尽量宽松地收集，避免因为兼容服务字段差异导致流式结果为空。
 *
 * @param value - 任意上游返回片段。
 * @returns 从片段中递归收集到的文本数组。
 */
function collectText (value: unknown): string[] {
  if (typeof value === 'string' && value) return [value]
  if (!value || typeof value !== 'object') return []

  if (Array.isArray(value)) {
    return value.flatMap(item => collectText(item))
  }

  const record = value as Record<string, unknown>
  return [
    ...collectText(record.text),
    ...collectText(record.content),
    ...collectText(record.output_text),
    ...collectText(record.message),
  ]
}

/**
 * 发送普通 JSON POST 请求。
 *
 * 返回原始文本，不在网络层提前解析 JSON，方便上层保留更清晰的错误信息。
 *
 * @param url - 请求地址。
 * @param apiKey - Bearer API Key。
 * @param payload - JSON 请求体。
 * @param timeoutSeconds - 请求超时时间，单位秒。
 * @returns 归一化后的接口响应。
 */
export async function post (
  url: string,
  apiKey: string,
  payload: Record<string, unknown>,
  timeoutSeconds: number,
): Promise<ApiResponse> {
  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      responseType: 'text',
      timeout: timeoutSeconds * 1000,
      transitional: {
        forcedJSONParsing: false,
      },
      validateStatus: () => true,
    })

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.statusText,
      contentType: getContentType(response.headers),
      text: toText(response.data),
    }
  } catch (error) {
    normalizeAxiosError(error, timeoutSeconds)
  }
}

/**
 * 从单条 SSE event 中提取模型输出文本。
 *
 * @param message - eventsource-parser 解析出的 SSE 消息。
 * @param textParts - 收集文本片段的可变数组。
 */
function appendMessageContent (message: EventSourceMessage, textParts: string[]): void {
  if (message.data === '[DONE]') return

  try {
    const json = JSON.parse(message.data)
    const choices = Array.isArray(json?.choices) ? json.choices : []

    for (const choice of choices) {
      textParts.push(
        ...collectText(choice?.delta),
        ...collectText(choice?.message),
        ...collectText(choice?.content),
      )
    }

    if (choices.length === 0) {
      textParts.push(...collectText(json))
    }
  } catch {}
}

/**
 * 将 text/event-stream 响应转换成 Chat Completions 风格的 JSON 文本。
 *
 * @param text - 原始 SSE 响应文本。
 * @returns 兼容 Chat Completions choices[].message.content 的 JSON 字符串。
 */
function streamTextToChatJson (text: string): string {
  const textParts: string[] = []
  const parser = createParser({
    onEvent: (event) => appendMessageContent(event, textParts),
  })

  parser.feed(text)
  // 如果结构化字段没读到，保留原始 SSE 文本，让上层还能提取 URL 或 error。
  const content = textParts.join('').trim() || text.trim()

  return JSON.stringify({
    choices: [
      {
        message: {
          content,
        },
      },
    ],
  })
}

/**
 * 读取 axios stream 响应体。
 *
 * @param stream - axios 在 Node.js 下返回的可读流。
 * @returns 完整响应体文本。
 */
function readStreamText (stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []

    stream.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    stream.on('error', reject)
  })
}

/**
 * 发送流式 POST 请求，并把 SSE 聚合为上层可复用的 JSON 文本。
 *
 * @param url - 请求地址。
 * @param apiKey - Bearer API Key。
 * @param payload - JSON 请求体。
 * @param timeoutSeconds - 请求超时时间，单位秒。
 * @returns 归一化后的接口响应；SSE 会转换为 Chat Completions 风格 JSON 文本。
 */
export async function postWithStream (
  url: string,
  apiKey: string,
  payload: Record<string, unknown>,
  timeoutSeconds: number,
): Promise<ApiResponse> {
  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      responseType: 'stream',
      timeout: timeoutSeconds * 1000,
      transitional: {
        forcedJSONParsing: false,
      },
      validateStatus: () => true,
    })
    const contentType = getContentType(response.headers)
    const text = await readStreamText(response.data as Readable)

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.statusText,
      contentType,
      text: contentType.includes('text/event-stream') ? streamTextToChatJson(text) : text,
    }
  } catch (error) {
    normalizeAxiosError(error, timeoutSeconds)
  }
}
