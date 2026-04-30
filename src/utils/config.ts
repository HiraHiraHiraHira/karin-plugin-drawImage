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
  activeProfile?: unknown
  global?: DrawConfigSource
  profiles?: Partial<Record<DrawProfileId, DrawConfigSource>>
}

export interface DrawSettings {
  activeProfile: DrawProfileId
  global: DrawConfig
  profiles: Record<DrawProfileId, DrawConfig>
  rawGlobal: DrawConfigSource
  rawProfiles: Record<DrawProfileId, DrawConfigSource>
}

interface PluginConfig {
  draw?: DrawConfigSource & DrawProfilesConfigSource
  [key: string]: unknown
}

function readText (filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return ''
  }
}

/**
 * @description 读取 yaml 配置
 */
function readYaml (filePath: string): PluginConfig {
  try {
    return (yaml.parse(readText(filePath)) ?? {}) as PluginConfig
  } catch {
    return {}
  }
}

function writeYaml (filePath: string, content: PluginConfig): void {
  const next = `${yaml.stringify(content).trimEnd()}\n`
  const current = readText(filePath)

  if (current === next) {
    return
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, next, 'utf8')
}

function normalizeProfileId (value: unknown): DrawProfileId {
  return typeof value === 'string' && DRAW_PROFILE_IDS.includes(value as DrawProfileId)
    ? value as DrawProfileId
    : 'profile1'
}

function hasProfiles (draw: PluginConfig['draw']): boolean {
  return Boolean(draw && typeof draw.profiles === 'object' && draw.profiles)
}

function getProfileSource (draw: PluginConfig['draw'], profileId: DrawProfileId): DrawConfigSource {
  if (hasProfiles(draw)) {
    return (draw?.profiles?.[profileId] ?? {}) as DrawConfigSource
  }

  return profileId === 'profile1' ? (draw ?? {}) : {}
}

function isBlankValue (value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

function mergeGlobalConfig (global: DrawConfig, profile: DrawConfigSource): DrawConfigSource {
  return Object.fromEntries(DRAW_CONFIG_KEYS.map((key) => {
    const value = profile[key]
    return [key, isBlankValue(value) ? global[key] : value]
  })) as DrawConfigSource
}

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

export function readPluginConfig (filePath = dir.configFile): PluginConfig {
  const current = readYaml(filePath)

  return {
    ...current,
    draw: {
      ...(current.draw ?? {}),
    },
  }
}

export function getDrawTemplateFieldKeys (): string[] {
  return [...DRAW_CONFIG_KEYS]
}

export function getDrawProfileIds (): DrawProfileId[] {
  return [...DRAW_PROFILE_IDS]
}

export function getDrawSettings (filePath = dir.configFile): DrawSettings {
  return normalizeProfiles(readPluginConfig(filePath).draw)
}

export function getDrawConfig (filePath = dir.configFile): DrawConfig {
  const settings = getDrawSettings(filePath)
  return settings.profiles[settings.activeProfile]
}

export async function saveDrawConfig (input: DrawConfigSource, filePath = dir.configFile): Promise<DrawConfig> {
  const current = readPluginConfig(filePath)
  const settings = normalizeProfiles(current.draw)
  const activeProfile = normalizeProfileId(current.draw?.activeProfile)
  const rawProfile = getProfileSource(current.draw, activeProfile)
  const nextProfile: DrawConfigSource = {
    ...rawProfile,
    ...input,
  }
  const next: PluginConfig = {
    ...current,
    draw: {
      activeProfile,
      global: hasProfiles(current.draw) ? current.draw?.global ?? settings.global : settings.global,
      profiles: {
        profile1: getProfileSource(current.draw, 'profile1'),
        profile2: getProfileSource(current.draw, 'profile2'),
        profile3: getProfileSource(current.draw, 'profile3'),
        [activeProfile]: nextProfile,
      },
    },
  }

  writeYaml(filePath, next)
  return getDrawConfig(filePath)
}

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
    {
      ...getProfileSource(current.draw, profileId),
      ...(inputProfiles[profileId] ?? {}),
    },
  ])) as Partial<Record<DrawProfileId, DrawConfigSource>>
  const next: PluginConfig = {
    ...current,
    draw: {
      activeProfile,
      global,
      profiles,
    },
  }

  writeYaml(filePath, next)
  return getDrawSettings(filePath)
}

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
