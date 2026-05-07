import fs from 'node:fs'
import path from 'node:path'
import { dir } from '@/dir'
import {
  watch,
  logger,
  filesByExt,
  yaml,
} from 'node-karin'
import {
  DRAW_CONFIG_KEYS,
  toDrawConfig,
  type DrawConfig,
  type DrawConfigSource,
} from './draw'

export const DRAW_PROFILE_IDS = ['profile1', 'profile2', 'profile3'] as const
export type DrawProfileId = typeof DRAW_PROFILE_IDS[number]

const DRAW_PROFILE_NAMES: Record<DrawProfileId, string> = {
  profile1: '配置一',
  profile2: '配置二',
  profile3: '配置三',
}

interface DrawProfilesConfigSource {
  /** 当前启用的配置档 ID */
  activeProfile?: unknown
  /** 全局默认配置 */
  global?: DrawConfigSource
  /** 三组配置档的原始配置 */
  profiles?: Partial<Record<DrawProfileId, DrawConfigSource>>
}

export interface DrawSettings {
  /** 当前启用的配置档 ID */
  activeProfile: DrawProfileId
  /** 归一化后的全局配置 */
  global: DrawConfig
  /** 归一化后的配置档 */
  profiles: Record<DrawProfileId, DrawConfig>
  /** 未合并默认值的全局原始配置 */
  rawGlobal: DrawConfigSource
  /** 未合并全局配置的配置档原始配置 */
  rawProfiles: Record<DrawProfileId, DrawConfigSource>
}

interface PluginConfig {
  draw?: DrawConfigSource & DrawProfilesConfigSource
  [key: string]: unknown
}

/**
 * 读取文本文件，文件不存在时返回空字符串。
 *
 * @param filePath - 文件路径。
 * @returns 文件内容或空字符串。
 */
function readText (filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return ''
  }
}

/**
 * 读取 yaml 配置。
 *
 * @param filePath - yaml 文件路径。
 * @returns 插件配置对象；解析失败时返回空对象。
 */
function readYaml (filePath: string): PluginConfig {
  try {
    return (yaml.parse(readText(filePath)) ?? {}) as PluginConfig
  } catch {
    return {}
  }
}

/**
 * 写入 yaml 配置，内容未变化时不会触发文件写入。
 *
 * @param filePath - yaml 文件路径。
 * @param content - 要写入的插件配置。
 */
function writeYaml (filePath: string, content: PluginConfig): void {
  const next = `${yaml.stringify(content).trimEnd()}\n`
  const current = readText(filePath)

  if (current === next) {
    return
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, next, 'utf8')
}

/**
 * 将未知值归一化为合法配置档 ID。
 *
 * @param value - 原始配置档 ID。
 * @returns 合法配置档 ID，非法时返回 profile1。
 */
function normalizeProfileId (value: unknown): DrawProfileId {
  return typeof value === 'string' && DRAW_PROFILE_IDS.includes(value as DrawProfileId)
    ? value as DrawProfileId
    : 'profile1'
}

/**
 * 判断配置是否使用了 profiles 新结构。
 *
 * @param draw - draw 配置节点。
 * @returns 是否存在 profiles 配置。
 */
function hasProfiles (draw: PluginConfig['draw']): boolean {
  return Boolean(draw && typeof draw.profiles === 'object' && draw.profiles)
}

/**
 * 获取指定配置档的原始配置。
 *
 * @param draw - draw 配置节点。
 * @param profileId - 配置档 ID。
 * @returns 配置档原始配置。
 */
function getProfileSource (draw: PluginConfig['draw'], profileId: DrawProfileId): DrawConfigSource {
  if (hasProfiles(draw)) {
    return (draw?.profiles?.[profileId] ?? {}) as DrawConfigSource
  }

  return profileId === 'profile1' ? (draw ?? {}) : {}
}

/**
 * 判断配置值是否为空值。
 *
 * @param value - 任意配置值。
 * @returns 是否应当继承全局配置。
 */
function isBlankValue (value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

/**
 * 将配置档原始配置与全局配置合并。
 *
 * @param global - 归一化后的全局配置。
 * @param profile - 配置档原始配置。
 * @returns 合并后的配置源。
 */
function mergeGlobalConfig (global: DrawConfig, profile: DrawConfigSource): DrawConfigSource {
  return Object.fromEntries(DRAW_CONFIG_KEYS.map((key) => {
    const value = profile[key]
    return [key, isBlankValue(value) ? global[key] : value]
  })) as DrawConfigSource
}

/**
 * 移除已经废弃、但仍可读取兼容的配置字段。
 *
 * @param source - 原始绘图配置。
 * @returns 去掉废弃字段后的绘图配置。
 */
function omitDeprecatedConfigKeys (source: DrawConfigSource): DrawConfigSource {
  const { cooldownSeconds: _cooldownSeconds, ...rest } = source
  return rest
}

/**
 * 归一化 draw 配置节点。
 *
 * @param draw - draw 配置节点。
 * @returns 运行时绘图设置。
 */
function normalizeProfiles (draw: PluginConfig['draw']): DrawSettings {
  const activeProfile = normalizeProfileId(draw?.activeProfile)
  const rawGlobal = hasProfiles(draw) ? draw?.global ?? {} : draw ?? {}
  const global = toDrawConfig({
    name: '全局配置',
    ...rawGlobal,
  })
  const rawProfiles = Object.fromEntries(DRAW_PROFILE_IDS.map((profileId) => [
    profileId,
    getProfileSource(draw, profileId),
  ])) as Record<DrawProfileId, DrawConfigSource>
  const profiles = Object.fromEntries(DRAW_PROFILE_IDS.map((profileId) => {
    const profileSource = rawProfiles[profileId]
    return [
      profileId,
      toDrawConfig({
        ...mergeGlobalConfig(global, profileSource),
        name: isBlankValue(profileSource.name) ? DRAW_PROFILE_NAMES[profileId] : profileSource.name,
        apiMode: isBlankValue(profileSource.apiMode) ? global.apiMode : profileSource.apiMode,
      }),
    ]
  })) as Record<DrawProfileId, DrawConfig>

  return {
    activeProfile,
    global,
    profiles,
    rawGlobal,
    rawProfiles,
  }
}

/**
 * 读取插件配置文件。
 *
 * @param filePath - 配置文件路径，默认使用运行时 config.yaml。
 * @returns 插件配置对象。
 */
export function readPluginConfig (filePath = dir.configFile): PluginConfig {
  const current = readYaml(filePath)

  return {
    ...current,
    draw: {
      ...(current.draw ?? {}),
    },
  }
}

/**
 * 获取绘图配置模板字段列表。
 *
 * @returns 字段名列表。
 */
export function getDrawTemplateFieldKeys (): string[] {
  return [...DRAW_CONFIG_KEYS]
}

/**
 * 获取固定配置档 ID 列表。
 *
 * @returns 配置档 ID 列表。
 */
export function getDrawProfileIds (): DrawProfileId[] {
  return [...DRAW_PROFILE_IDS]
}

/**
 * 获取完整绘图设置。
 *
 * @param filePath - 配置文件路径，默认使用运行时 config.yaml。
 * @returns 归一化后的绘图设置。
 */
export function getDrawSettings (filePath = dir.configFile): DrawSettings {
  return normalizeProfiles(readPluginConfig(filePath).draw)
}

/**
 * 获取当前启用的绘图配置。
 *
 * @param filePath - 配置文件路径，默认使用运行时 config.yaml。
 * @returns 当前配置档归一化配置。
 */
export function getDrawConfig (filePath = dir.configFile): DrawConfig {
  const settings = getDrawSettings(filePath)
  return settings.profiles[settings.activeProfile]
}

/**
 * 切换当前启用的绘图配置档。
 *
 * @param profileId - 目标配置档 ID。
 * @param filePath - 配置文件路径，默认使用运行时 config.yaml。
 * @returns 切换后的完整绘图设置。
 */
export async function switchDrawProfile (profileId: DrawProfileId, filePath = dir.configFile): Promise<DrawSettings> {
  const settings = getDrawSettings(filePath)
  return saveDrawSettings({
    activeProfile: profileId,
    global: settings.rawGlobal,
    profiles: settings.rawProfiles,
  }, filePath)
}

/**
 * 保存当前启用配置档的部分配置。
 *
 * @param input - 要覆盖到当前配置档的配置。
 * @param filePath - 配置文件路径，默认使用运行时 config.yaml。
 * @returns 保存后的当前绘图配置。
 */
export async function saveDrawConfig (input: DrawConfigSource, filePath = dir.configFile): Promise<DrawConfig> {
  const current = readPluginConfig(filePath)
  const settings = normalizeProfiles(current.draw)
  const activeProfile = normalizeProfileId(current.draw?.activeProfile)
  const rawProfile = getProfileSource(current.draw, activeProfile)
  const nextProfile: DrawConfigSource = {
    ...rawProfile,
    ...input,
  }
  const globalSource = hasProfiles(current.draw) ? current.draw?.global ?? settings.rawGlobal : settings.rawGlobal
  const next: PluginConfig = {
    ...current,
    draw: {
      activeProfile,
      global: omitDeprecatedConfigKeys(globalSource),
      profiles: {
        profile1: omitDeprecatedConfigKeys(getProfileSource(current.draw, 'profile1')),
        profile2: omitDeprecatedConfigKeys(getProfileSource(current.draw, 'profile2')),
        profile3: omitDeprecatedConfigKeys(getProfileSource(current.draw, 'profile3')),
        [activeProfile]: omitDeprecatedConfigKeys(nextProfile),
      },
    },
  }

  writeYaml(filePath, next)
  return getDrawConfig(filePath)
}

/**
 * 保存 Web 面板提交的完整绘图设置。
 *
 * @param input - Web 面板提交的配置。
 * @param filePath - 配置文件路径，默认使用运行时 config.yaml。
 * @returns 保存后的完整绘图设置。
 */
export async function saveDrawSettings (input: DrawProfilesConfigSource, filePath = dir.configFile): Promise<DrawSettings> {
  const current = readPluginConfig(filePath)
  const settings = normalizeProfiles(current.draw)
  const activeProfile = normalizeProfileId(input.activeProfile)
  const inputProfiles = input.profiles ?? {}
  const global: DrawConfigSource = {
    ...(hasProfiles(current.draw) ? current.draw?.global ?? {} : settings.global),
    ...(input.global ?? {}),
    name: '全局配置',
  }
  const profiles = Object.fromEntries(DRAW_PROFILE_IDS.map((profileId) => [
    profileId,
    omitDeprecatedConfigKeys({
      ...getProfileSource(current.draw, profileId),
      ...(inputProfiles[profileId] ?? {}),
    }),
  ])) as Partial<Record<DrawProfileId, DrawConfigSource>>
  const next: PluginConfig = {
    ...current,
    draw: {
      activeProfile,
      global: omitDeprecatedConfigKeys(global),
      profiles,
    },
  }

  writeYaml(filePath, next)
  return getDrawSettings(filePath)
}

/**
 * Karin 配置导出入口。
 *
 * @returns 绘图配置面板可读取的数据。
 */
export const config = () => {
  return { draw: getDrawSettings() }
}

/**
 * @description 监听配置文件
 */
if (process.env.KARIN_SKIP_CONFIG_WATCH !== '1') {
  const watcherTimer = setTimeout(() => {
    const list = filesByExt(dir.configDir, '.yaml', 'abs')
    list.forEach(file => watch(file, () => {
      logger.info('检测到绘图插件配置文件更新')
    }))
  }, 2000)

  watcherTimer.unref?.()
}
