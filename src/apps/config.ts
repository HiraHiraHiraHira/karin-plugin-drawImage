import { karin, type SendMessage } from 'node-karin'

import {
  getDrawProfileIds,
  getDrawSettings,
  saveDrawConfig,
  switchDrawProfile,
  type DrawProfileId,
  type DrawSettings,
} from '@/utils/config'
import { DRAW_SIZE_PRESETS, type DrawConfig } from '@/utils/draw'

export const DRAW_HELP_REG = /^#help$/i
export const SHOW_DRAW_CONFIG_REG = /^#配置$/
export const SWITCH_DRAW_CONFIG_REG = /^#切换配置\s*(\d+)$/
export const SHOW_DRAW_SIZE_REG = /^#分辨率$/
export const SWITCH_DRAW_SIZE_REG = /^#切换分辨率\s*(\d+)$/

interface ConfigEvent {
  /** 原始消息文本 */
  msg: string
  /** Karin 权限判断函数 */
  hasPermission?: (role: 'group.admin') => boolean
  /** 回复消息 */
  reply: (message: SendMessage) => unknown
}

interface ConfigDeps {
  /** 获取完整绘图设置 */
  getSettings: () => DrawSettings
  /** 切换当前绘图配置档 */
  switchProfile: (profileId: DrawProfileId) => Promise<DrawSettings>
  /** 保存当前配置档的部分绘图配置 */
  saveConfig: (input: { size: string }) => Promise<DrawConfig>
}

const defaultDeps: ConfigDeps = {
  getSettings: () => getDrawSettings(),
  switchProfile: async (profileId) => switchDrawProfile(profileId),
  saveConfig: async (input) => saveDrawConfig(input),
}

const CONFIG_AUTH_FAIL_TEXT = '只有管理员或群主可以使用绘图配置命令'

/**
 * 判断事件触发者是否可以管理绘图配置。
 *
 * @param e - 配置命令事件。
 * @returns 是否拥有管理权限。
 */
function canManageDrawConfig (e: ConfigEvent): boolean {
  return e.hasPermission?.('group.admin') === true
}

/**
 * 权限不足时回复统一提示。
 *
 * @param e - 配置命令事件。
 * @returns Karin 命令处理完成标记。
 */
async function replyNoPermission (e: ConfigEvent): Promise<true> {
  await e.reply(CONFIG_AUTH_FAIL_TEXT)
  return true
}

/**
 * 将固定配置档编号转换为配置档 ID。
 *
 * @param index - 从 1 开始的配置编号。
 * @returns 对应的配置档 ID；编号非法时返回 undefined。
 */
function profileIdFromIndex (index: number): DrawProfileId | undefined {
  return getDrawProfileIds()[index - 1]
}

/**
 * 将固定分辨率编号转换为分辨率预设。
 *
 * @param index - 从 1 开始的分辨率编号。
 * @returns 对应分辨率预设；编号非法时返回 undefined。
 */
function sizePresetFromIndex (index: number) {
  return DRAW_SIZE_PRESETS[index - 1]
}

/**
 * 格式化插件命令帮助菜单。
 *
 * @returns 用户可读的命令菜单。
 */
export function formatDrawHelpMenu (): string {
  return [
    'AI 绘图命令：',
    '#draw 提示词 - 文生图',
    '#draw 提示词 + 附带/引用图片 - 图生图',
    '#tpdraw 提示词 - 临时透明背景绘图',
    '#配置 - 查看配置档',
    '#切换配置1 - 切换配置档',
    '#分辨率 - 查看分辨率预设',
    '#切换分辨率1 - 切换当前配置档分辨率',
    '#help - 查看本菜单',
  ].join('\n')
}

/**
 * 格式化配置档列表。
 *
 * @param settings - 当前绘图设置。
 * @returns 用户可读的配置档列表文本。
 */
export function formatDrawProfileList (settings: DrawSettings): string {
  const lines = getDrawProfileIds().map((profileId, index) => {
    const marker = settings.activeProfile === profileId ? ' #' : ''
    return `${index + 1}. ${settings.profiles[profileId].name}${marker}`
  })

  return ['绘图配置：', ...lines].join('\n')
}

/**
 * 格式化分辨率预设列表。
 *
 * @param settings - 当前绘图设置。
 * @returns 用户可读的分辨率列表文本。
 */
export function formatDrawSizeList (settings: DrawSettings): string {
  const currentSize = settings.profiles[settings.activeProfile].size
  const lines = DRAW_SIZE_PRESETS.map((preset, index) => {
    const marker = currentSize === preset.value ? ' #' : ''
    return `${index + 1}. ${preset.label} ${preset.description}${marker}`
  })

  return ['绘图分辨率：', ...lines].join('\n')
}

/**
 * 处理 #help 指令。
 *
 * @param e - 帮助菜单事件。
 * @returns Karin 命令处理完成标记。
 */
export async function handleDrawHelpMessage (e: ConfigEvent): Promise<true> {
  await e.reply(formatDrawHelpMenu())
  return true
}

/**
 * 处理 #配置 指令。
 *
 * @param e - 配置查看事件。
 * @param deps - 可覆盖的运行时依赖，主要用于测试。
 * @returns Karin 命令处理完成标记。
 */
export async function handleShowDrawConfigMessage (
  e: ConfigEvent,
  deps: Partial<ConfigDeps> = {},
): Promise<true> {
  if (!canManageDrawConfig(e)) return replyNoPermission(e)

  const runtime = { ...defaultDeps, ...deps }

  await e.reply(formatDrawProfileList(runtime.getSettings()))
  return true
}

/**
 * 处理 #切换配置 指令。
 *
 * @param e - 配置切换事件。
 * @param deps - 可覆盖的运行时依赖，主要用于测试。
 * @returns Karin 命令处理完成标记。
 */
export async function handleSwitchDrawConfigMessage (
  e: ConfigEvent,
  deps: Partial<ConfigDeps> = {},
): Promise<true> {
  if (!canManageDrawConfig(e)) return replyNoPermission(e)

  const runtime = { ...defaultDeps, ...deps }
  const index = Number.parseInt(e.msg.match(SWITCH_DRAW_CONFIG_REG)?.[1] ?? '', 10)
  const profileId = profileIdFromIndex(index)

  if (!profileId) {
    await e.reply(`配置编号不存在，请输入 1-${getDrawProfileIds().length}`)
    return true
  }

  const settings = await runtime.switchProfile(profileId)
  await e.reply(`已切换到配置${index}：${settings.profiles[profileId].name}`)
  return true
}

/**
 * 处理 #分辨率 指令。
 *
 * @param e - 分辨率查看事件。
 * @param deps - 可覆盖的运行时依赖，主要用于测试。
 * @returns Karin 命令处理完成标记。
 */
export async function handleShowDrawSizeMessage (
  e: ConfigEvent,
  deps: Partial<ConfigDeps> = {},
): Promise<true> {
  if (!canManageDrawConfig(e)) return replyNoPermission(e)

  const runtime = { ...defaultDeps, ...deps }

  await e.reply(formatDrawSizeList(runtime.getSettings()))
  return true
}

/**
 * 处理 #切换分辨率 指令。
 *
 * @param e - 分辨率切换事件。
 * @param deps - 可覆盖的运行时依赖，主要用于测试。
 * @returns Karin 命令处理完成标记。
 */
export async function handleSwitchDrawSizeMessage (
  e: ConfigEvent,
  deps: Partial<ConfigDeps> = {},
): Promise<true> {
  if (!canManageDrawConfig(e)) return replyNoPermission(e)

  const runtime = { ...defaultDeps, ...deps }
  const index = Number.parseInt(e.msg.match(SWITCH_DRAW_SIZE_REG)?.[1] ?? '', 10)
  const preset = sizePresetFromIndex(index)

  if (!preset) {
    await e.reply(`分辨率编号不存在，请输入 1-${DRAW_SIZE_PRESETS.length}`)
    return true
  }

  const config = await runtime.saveConfig({ size: preset.value })
  await e.reply(`已切换分辨率${index}：${preset.label} ${preset.description}（当前配置：${config.name}）`)
  return true
}

export const drawHelp = karin.command(DRAW_HELP_REG, async (e) => {
  return handleDrawHelpMessage(e)
}, {
  name: 'AI 绘图帮助',
  permission: 'all',
  log: true,
  priority: 9998,
})

export const showDrawConfig = karin.command(SHOW_DRAW_CONFIG_REG, async (e) => {
  return handleShowDrawConfigMessage(e)
}, {
  name: '查看绘图配置',
  permission: 'all',
  log: true,
  priority: 9998,
})

export const switchDrawConfig = karin.command(SWITCH_DRAW_CONFIG_REG, async (e) => {
  return handleSwitchDrawConfigMessage(e)
}, {
  name: '切换绘图配置',
  permission: 'all',
  log: true,
  priority: 9998,
})

export const showDrawSize = karin.command(SHOW_DRAW_SIZE_REG, async (e) => {
  return handleShowDrawSizeMessage(e)
}, {
  name: '查看绘图分辨率',
  permission: 'all',
  log: true,
  priority: 9998,
})

export const switchDrawSize = karin.command(SWITCH_DRAW_SIZE_REG, async (e) => {
  return handleSwitchDrawSizeMessage(e)
}, {
  name: '切换绘图分辨率',
  permission: 'all',
  log: true,
  priority: 9998,
})
