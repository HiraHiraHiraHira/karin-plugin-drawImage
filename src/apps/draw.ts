import { karin, logger, segment, type Contact, type Elements, type SendMessage } from 'node-karin'

import { dir } from '@/dir'
import { getDrawConfig } from '@/utils/config'
import {
  DRAW_COMMAND_REG,
  DRAW_USAGE_TEXT,
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
  /** 触发绘图的用户 ID，用于冷却隔离 */
  userId?: string
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
  /** 将上游图片结果映射为 Karin 可发送内容 */
  mapOutput: (image: string) => string | Elements
  /** 当前时间函数，方便测试冷却逻辑 */
  now: () => number
  /** 冷却存储 */
  cooldownStore: Map<string, number>
}

const drawCooldownStore = new Map<string, number>()

const defaultDeps: DrawDeps = {
  getConfig: () => getDrawConfig(),
  resolveImages: async (images) => resolveApiImageInputs(images),
  generate: async (prompt, images, config) => generateImages(prompt, images, config),
  mapOutput: (image) => image,
  now: () => Date.now(),
  cooldownStore: drawCooldownStore,
}

/**
 * 获取用户级冷却键。
 *
 * @param e - 绘图事件。
 * @returns 用户 ID；不存在时返回 undefined。
 */
function getCooldownKey (e: DrawEvent): string | undefined {
  return e.userId?.trim() || undefined
}

/**
 * 计算剩余冷却秒数。
 *
 * @param expiresAt - 冷却结束时间戳，单位毫秒。
 * @param now - 当前时间戳，单位毫秒。
 * @returns 向上取整后的剩余秒数。
 */
function getRemainingCooldownSeconds (expiresAt: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAt - now) / 1000))
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

  const config = runtime.getConfig()
  if (!config.apiKey) {
    await e.reply(`未配置绘图密钥，请填写 ${dir.configFile}`)
    return true
  }

  const cooldownKey = getCooldownKey(e)
  const now = runtime.now()
  if (cooldownKey) {
    const expiresAt = runtime.cooldownStore.get(cooldownKey) ?? 0
    if (expiresAt > now) {
      const remaining = getRemainingCooldownSeconds(expiresAt, now)
      await e.reply(`绘图冷却中，请 ${remaining} 秒后再试`)
      return true
    }

    runtime.cooldownStore.set(cooldownKey, now + (config.cooldownSeconds * 1000))
  }

  try {
    const inputImages = await runtime.resolveImages(await getDrawInputImages(e))
    const generatedImages = await runtime.generate(prompt, inputImages, config)
    await e.reply(generatedImages.map(runtime.mapOutput))
  } catch (error) {
    logger.error('[karin-plugin-drawImages] 绘图失败', error)
    await e.reply(`绘图失败: ${error instanceof Error ? error.message : String(error)}`)
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
