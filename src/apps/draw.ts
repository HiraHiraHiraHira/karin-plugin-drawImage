import { karin, logger, segment, type Contact, type Elements, type SendMessage } from 'node-karin'

import { dir } from '@/dir'
import { getDrawConfig } from '@/utils/config'
import {
  DRAW_COMMAND_REG,
  DRAW_USAGE_TEXT,
  TRANSPARENT_DRAW_COMMAND_REG,
  generateImages,
  parseDrawPrompt,
  resolveApiImageInputs,
  type DrawConfig,
} from '@/utils/draw'

interface DrawEvent {
  /** 原始消息文本 */
  msg: string
  /** 消息中直接携带的图片列表 */
  image: string[]
  /** 被引用消息的 ID */
  replyId?: string
  /** 当前事件来源，用于读取引用消息 */
  contact?: Contact
  /** Karin bot 实例的最小接口，用于读取引用消息 */
  bot?: {
    getMsg: (contact: Contact, messageId: string) => Promise<{ elements: Elements[] }>
  }
  /** 回复消息 */
  reply: (message: SendMessage) => unknown
}

interface DrawDeps {
  /** 获取当前绘图配置 */
  getConfig: () => DrawConfig
  /** 将事件图片转换为上游可读取的图片输入 */
  resolveImages: (images: readonly string[]) => Promise<string[]>
  /** 调用绘图接口 */
  generate: (prompt: string, images: string[], config: DrawConfig) => Promise<string[]>
  /** 对单次请求配置做临时调整，不会写回配置文件 */
  transformConfig: (config: DrawConfig) => DrawConfig
  /** 将上游图片结果映射为 Karin 可发送内容 */
  mapOutput: (image: string) => string | Elements
  /** 当前绘图任务状态 */
  taskState: DrawTaskState
}

interface DrawTaskState {
  /** 是否已有绘图任务正在执行 */
  running: boolean
}

const DRAW_TASK_STATE_KEY = Symbol.for('karin-plugin-drawImages.taskState')

/**
 * 获取跨热重载共享的绘图任务状态。
 *
 * Karin 开发/热重载时可能残留多份命令 handler，使用 globalThis
 * 可以让这些 handler 共用同一份任务状态，避免并发请求上游。
 *
 * @returns 当前进程共享的绘图任务状态。
 */
function getGlobalTaskState (): DrawTaskState {
  const globalStore = globalThis as typeof globalThis & {
    [DRAW_TASK_STATE_KEY]?: DrawTaskState
  }

  globalStore[DRAW_TASK_STATE_KEY] ??= { running: false }
  return globalStore[DRAW_TASK_STATE_KEY]
}

const defaultDeps: DrawDeps = {
  getConfig: () => getDrawConfig(),
  resolveImages: async (images) => resolveApiImageInputs(images),
  generate: async (prompt, images, config) => generateImages(prompt, images, config),
  transformConfig: (config) => config,
  mapOutput: (image) => image,
  taskState: getGlobalTaskState(),
}

/**
 * 从 Karin 消息元素中提取图片文件。
 *
 * @param elements - Karin 消息元素列表。
 * @returns 图片 file 字段列表。
 */
function getImageFilesFromElements (elements: readonly Elements[]): string[] {
  return elements.flatMap(element => {
    if (element.type === 'image' && element.file) {
      return [element.file]
    }

    return []
  })
}

/**
 * 去重并过滤空图片地址。
 *
 * @param images - 原始图片地址列表。
 * @returns 去重后的图片地址列表。
 */
function uniqueImages (images: readonly string[]): string[] {
  return [...new Set(images.filter(Boolean))]
}

/**
 * 创建临时透明背景绘图配置。
 *
 * @param config - 当前生效的绘图配置。
 * @returns background 被临时覆盖为 transparent 的新配置。
 */
function withTransparentBackground (config: DrawConfig): DrawConfig {
  return {
    ...config,
    background: 'transparent',
  }
}

/**
 * 汇总本条消息和引用消息中的图片输入。
 *
 * @param e - 绘图事件。
 * @returns 图片输入地址列表。
 */
async function getDrawInputImages (e: DrawEvent): Promise<string[]> {
  const images = [...e.image]
  const replyId = e.replyId?.trim()

  if (replyId && e.bot && e.contact) {
    try {
      const message = await e.bot.getMsg(e.contact, replyId)
      images.push(...getImageFilesFromElements(message.elements))
    } catch (error) {
      logger.warn('[karin-plugin-drawImages] 获取引用消息图片失败', error)
    }
  }

  return uniqueImages(images)
}

/**
 * 处理 #draw 指令。
 *
 * @param e - 绘图事件。
 * @param deps - 可覆盖的运行时依赖，主要用于测试。
 * @returns Karin 命令处理完成标记。
 */
export async function handleDrawMessage (
  e: DrawEvent,
  deps: Partial<DrawDeps> = {},
): Promise<true> {
  const runtime = { ...defaultDeps, ...deps }
  const prompt = parseDrawPrompt(e.msg)

  if (!prompt) {
    await e.reply(DRAW_USAGE_TEXT)
    return true
  }

  const config = runtime.transformConfig(runtime.getConfig())
  if (!config.apiKey) {
    await e.reply(`未配置绘图密钥，请填写 ${dir.configFile}`)
    return true
  }

  // 任务锁只负责限制同时请求数量，不按用户或固定秒数计算冷却。
  if (config.taskLockEnabled && runtime.taskState.running) {
    await e.reply('已有绘图任务正在执行，请等待上一张图片完成后再试')
    return true
  }

  if (config.taskLockEnabled) {
    runtime.taskState.running = true
  }
  try {
    const inputImages = await runtime.resolveImages(await getDrawInputImages(e))
    const generatedImages = await runtime.generate(prompt, inputImages, config)
    await e.reply(generatedImages.map(runtime.mapOutput))
  } catch (error) {
    logger.error('[karin-plugin-drawImages] 绘图失败', error)
    await e.reply(`绘图失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    if (config.taskLockEnabled) {
      runtime.taskState.running = false
    }
  }

  return true
}

export const draw = karin.command(DRAW_COMMAND_REG, async (e) => {
  return handleDrawMessage(e, {
    mapOutput: (image) => segment.image(image),
  })
}, {
  name: 'AI 绘图',
  permission: 'all',
  log: true,
  priority: 9999,
})

export const transparentDraw = karin.command(TRANSPARENT_DRAW_COMMAND_REG, async (e) => {
  return handleDrawMessage(e, {
    transformConfig: withTransparentBackground,
    mapOutput: (image) => segment.image(image),
  })
}, {
  name: 'AI 透明背景绘图',
  permission: 'all',
  log: true,
  priority: 9999,
})
