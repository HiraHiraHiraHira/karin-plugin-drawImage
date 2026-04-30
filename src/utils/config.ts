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

interface PluginConfig {
  draw?: DrawConfigSource
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

export function getDrawConfig (filePath = dir.configFile): DrawConfig {
  return toDrawConfig(readPluginConfig(filePath).draw ?? {})
}

export async function saveDrawConfig (input: DrawConfigSource, filePath = dir.configFile): Promise<DrawConfig> {
  const current = readPluginConfig(filePath)
  const normalized = toDrawConfig({
    ...(current.draw ?? {}),
    ...input,
  })
  const next: PluginConfig = {
    ...current,
    draw: {
      ...normalized,
    },
  }

  writeYaml(filePath, next)
  return toDrawConfig((readYaml(filePath).draw ?? {}) as DrawConfigSource)
}

export const config = () => {
  return { draw: getDrawConfig() }
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
