import { karin, logger, segment, type Elements, type SendMessage } from 'node-karin'

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
  msg: string
  image: string[]
  userId?: string
  reply: (message: SendMessage) => unknown
}

interface DrawDeps {
  getConfig: () => DrawConfig
  resolveImages: (images: readonly string[]) => Promise<string[]>
  generate: (prompt: string, images: string[], config: DrawConfig) => Promise<string[]>
  mapOutput: (image: string) => string | Elements
  now: () => number
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

function getCooldownKey (e: DrawEvent): string | undefined {
  return e.userId?.trim() || undefined
}

function getRemainingCooldownSeconds (expiresAt: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAt - now) / 1000))
}

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
    const inputImages = await runtime.resolveImages(e.image)
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
