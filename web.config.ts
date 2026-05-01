import { components, defineConfig, divider, input, type ComponentConfig } from 'node-karin'

import {
  getDrawProfileIds,
  getDrawSettings,
  getDrawTemplateFieldKeys,
  saveDrawSettings,
  type DrawProfileId,
} from './src/utils/config'
import { DISABLED_DRAW_OPTION_VALUE, type DrawConfigSource } from './src/utils/draw'

const radio = components.radio
const PROFILE_HIDDEN_FIELD_KEYS = new Set(['cooldownSeconds', 'requestTimeoutSeconds', 'n'])

function fieldId (key: string, profileId?: string): string {
  const kebabKey = key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)
  return profileId ? `draw-${profileId}-${kebabKey}` : `draw-${kebabKey}`
}

type RadioOption = {
  value: string
  label: string
  description?: string
}

type ComponentFactory = (id: string, value: unknown, profileId?: string) => ComponentConfig[]

const FULL_WIDTH_CLASS = 'col-span-12'
const HALF_WIDTH_CLASS = 'col-span-12 md:col-span-6'
const THIRD_WIDTH_CLASS = 'col-span-12 md:col-span-4'
const FIELD_GAP_CLASS = 'mb-4'
const RADIO_FIELD_CLASS = '[&_[data-slot=label]]:text-small [&_[data-slot=label]]:font-medium [&_[data-slot=label]]:text-primary'
const RADIO_ITEMS_CLASS = 'gap-x-3 gap-y-2 text-sm'

const CUSTOM_OPTION_VALUE = '__custom__'
const INHERIT_OPTION: RadioOption = { value: '', label: '继承全局', description: '留空时使用全局配置中的值' }
const DISABLED_OPTION: RadioOption = { value: DISABLED_DRAW_OPTION_VALUE, label: '关闭', description: '不发送这个参数' }

const radioFieldOptions: Partial<Record<string, RadioOption[]>> = {
  apiMode: [
    { value: 'images', label: '图片接口', description: '固定使用 /v1/images/generations' },
    { value: 'chatCompletions', label: '聊天接口', description: '固定使用 /v1/chat/completions' },
    { value: 'custom', label: '自定义', description: '使用自定义请求路径' },
  ],
  imageDetail: [
    { value: 'auto', label: '自动', description: '由模型自动选择细节级别' },
    { value: 'low', label: '低', description: '更快、成本更低，适合粗略理解图片' },
    { value: 'high', label: '高', description: '高精度图像理解，推荐图生图使用' },
    { value: 'original', label: '原始', description: '保留原始细节，适合密集或空间敏感图片' },
  ],
  moderation: [
    DISABLED_OPTION,
    { value: 'auto', label: '自动' },
    { value: 'low', label: '低' },
  ],
  background: [
    DISABLED_OPTION,
    { value: 'auto', label: '自动' },
    { value: 'transparent', label: '透明' },
    { value: 'opaque', label: '不透明' },
  ],
  outputFormat: [
    DISABLED_OPTION,
    { value: 'png', label: 'PNG' },
    { value: 'jpeg', label: 'JPEG' },
    { value: 'webp', label: 'WebP' },
  ],
  quality: [
    DISABLED_OPTION,
    { value: 'auto', label: '自动' },
    { value: 'high', label: '高' },
    { value: 'medium', label: '中' },
    { value: 'low', label: '低' },
  ],
  size: [
    DISABLED_OPTION,
    { value: 'auto', label: '自动' },
    { value: '1024x1024', label: '1024x1024' },
    { value: '1536x1024', label: '1536x1024' },
    { value: '1024x1536', label: '1024x1536' },
  ],
}

function customFieldId (key: string, profileId?: string): string {
  return `${fieldId(key, profileId)}-custom`
}

function createRadioGroup (
  id: string,
  label: string,
  options: RadioOption[],
  value: unknown,
  allowCustom = false,
  className = FULL_WIDTH_CLASS,
) {
  const currentValue = String(value ?? '').trim()
  const normalizedOptions = allowCustom
    ? [...options, { value: CUSTOM_OPTION_VALUE, label: '自定义' }]
    : [...options]
  const defaultValue = normalizedOptions.some((option) => option.value === currentValue)
    ? currentValue
    : allowCustom ? CUSTOM_OPTION_VALUE : normalizedOptions[0]?.value

  return radio.group(id, {
    label,
    orientation: 'horizontal',
    color: 'primary',
    size: 'sm',
    defaultValue,
    className: `${className} ${FIELD_GAP_CLASS} ${RADIO_FIELD_CLASS}`,
    componentClassName: RADIO_ITEMS_CLASS,
    radio: normalizedOptions.map((option, index) => radio.create(`${id}-${index}`, option)),
  })
}

function withInheritOption (options: RadioOption[], allowInherit: boolean): RadioOption[] {
  return allowInherit ? [INHERIT_OPTION, ...options] : options
}

function withInputStyle<T extends Record<string, unknown>> (config: T, className = FULL_WIDTH_CLASS): T & {
  variant: 'bordered'
  size: 'sm'
  labelPlacement: 'outside'
  className: string
} {
  return {
    ...config,
    variant: 'bordered',
    size: 'sm',
    labelPlacement: 'outside',
    className: `${className} ${FIELD_GAP_CLASS}`,
  }
}

const fieldDescriptions: Partial<Record<string, string>> = {
  name: '只用于面板显示，方便识别配置档',
  apiMode: '切换接口模式会同步切换实际请求路由，custom 模式才使用自定义请求路径',
  baseUrl: 'API 服务地址，不包含末尾斜杠；留空时继承全局配置',
  apiKey: '当前服务的 API 密钥；留空时继承全局配置',
  endpoint: '仅 custom 模式使用；images/chatCompletions 会自动使用固定路由',
  model: '当前配置档使用的模型名称；留空时继承全局配置',
  imageDetail: '仅 chatCompletions 带图请求使用',
  size: '图片尺寸；选自定义时填写下方自定义尺寸',
  quality: '生成质量，具体可用值取决于上游模型',
  outputFormat: '输出图片格式，具体可用值取决于上游模型',
  moderation: '审核级别，具体可用值取决于上游接口',
  background: '背景模式，透明背景通常需要模型支持',
  cooldownSeconds: '每个用户的 #draw 冷却时间，失败请求也会进入冷却',
  requestTimeoutSeconds: '等待上游返回的最长时间，图片生成较慢时可调大',
}

function getDescription (key: string, allowInherit = false): string | undefined {
  const description = fieldDescriptions[key]
  if (!allowInherit || key === 'name') return description
  return description ? `${description}。留空时继承全局配置` : '留空时继承全局配置'
}

function getPlaceholder (key: string, allowInherit = false): string | undefined {
  if (allowInherit) return '留空继承全局配置'

  switch (key) {
    case 'baseUrl':
      return 'https://example.com'
    case 'endpoint':
      return '/v1/custom/path'
    case 'model':
      return 'gpt-image-2'
    case 'size':
      return '1024x1024'
    default:
      return undefined
  }
}

function createSectionTitle (key: string, title: string, tone: 'default' | 'accent' = 'default') {
  const toneClass = tone === 'accent'
    ? 'bg-transparent text-sky-400 dark:text-sky-300 border-l-2 border-sky-500/45 pl-2 rounded-none'
    : 'bg-white/[0.06] text-white/90'

  return input.string(key, {
    label: '',
    defaultValue: title,
    placeholder: '',
    isRequired: false,
    isClearable: false,
    isReadOnly: true,
    color: 'default',
    variant: 'flat',
    size: 'sm',
    labelPlacement: 'inside',
    className: `${FULL_WIDTH_CLASS} mt-2 mb-2`,
    componentClassName: `pointer-events-none inline-flex w-auto max-w-fit h-7 min-h-7 rounded-md px-3 text-sm font-semibold tracking-normal shadow-none ${toneClass}`,
  })
}

const fieldLayouts: Partial<Record<string, string>> = {
  name: THIRD_WIDTH_CLASS,
  apiMode: THIRD_WIDTH_CLASS,
  baseUrl: THIRD_WIDTH_CLASS,
  apiKey: THIRD_WIDTH_CLASS,
  endpoint: THIRD_WIDTH_CLASS,
  model: HALF_WIDTH_CLASS,
  imageDetail: HALF_WIDTH_CLASS,
  size: FULL_WIDTH_CLASS,
  quality: HALF_WIDTH_CLASS,
  outputFormat: HALF_WIDTH_CLASS,
  moderation: HALF_WIDTH_CLASS,
  background: HALF_WIDTH_CLASS,
  n: HALF_WIDTH_CLASS,
  cooldownSeconds: HALF_WIDTH_CLASS,
  requestTimeoutSeconds: HALF_WIDTH_CLASS,
}

const componentFactories: Record<string, ComponentFactory> = {
  name: (id, value) => [input.string(id, {
    ...withInputStyle({
      label: '配置名称',
      description: getDescription('name'),
    }, fieldLayouts.name),
    defaultValue: String(value ?? ''),
  })],
  apiMode: (id, value) => [
    createRadioGroup(id, '接口模式', radioFieldOptions.apiMode ?? [], value, false, fieldLayouts.apiMode),
  ],
  baseUrl: (id, value) => [input.url(id, {
    ...withInputStyle({
      label: '接口地址',
      description: getDescription('baseUrl'),
      placeholder: getPlaceholder('baseUrl'),
    }, fieldLayouts.baseUrl),
    defaultValue: String(value ?? ''),
  })],
  apiKey: (id, value) => [input.password(id, {
    ...withInputStyle({
      label: 'API 密钥',
      description: getDescription('apiKey'),
    }, fieldLayouts.apiKey),
    defaultValue: String(value ?? ''),
  })],
  endpoint: (id, value) => [input.string(id, {
    ...withInputStyle({
      label: '自定义请求路径',
      description: getDescription('endpoint'),
      placeholder: getPlaceholder('endpoint'),
    }, fieldLayouts.endpoint),
    defaultValue: String(value ?? ''),
  })],
  model: (id, value) => [input.string(id, {
    ...withInputStyle({
      label: '模型',
      description: getDescription('model'),
      placeholder: getPlaceholder('model'),
    }, fieldLayouts.model),
    defaultValue: String(value ?? ''),
  })],
  moderation: (id, value) => [
    createRadioGroup(id, '审核级别', radioFieldOptions.moderation ?? [], value, false, fieldLayouts.moderation),
  ],
  imageDetail: (id, value) => [
    createRadioGroup(id, '图像细节', radioFieldOptions.imageDetail ?? [], value, false, fieldLayouts.imageDetail),
  ],
  background: (id, value) => [
    createRadioGroup(id, '背景', radioFieldOptions.background ?? [], value, false, fieldLayouts.background),
  ],
  outputFormat: (id, value) => [
    createRadioGroup(id, '输出格式', radioFieldOptions.outputFormat ?? [], value, false, fieldLayouts.outputFormat),
  ],
  quality: (id, value) => [
    createRadioGroup(id, '质量', radioFieldOptions.quality ?? [], value, false, fieldLayouts.quality),
  ],
  size: (id, value, profileId) => [
    createRadioGroup(id, '尺寸', radioFieldOptions.size ?? [], value, true, fieldLayouts.size),
    input.string(customFieldId('size', profileId), {
      ...withInputStyle({
        label: '自定义尺寸',
        description: getDescription('size'),
        placeholder: '例如 1024x1024；选中“自定义”时使用',
      }, HALF_WIDTH_CLASS),
      defaultValue: radioFieldOptions.size?.some((option) => option.value === String(value ?? '').trim())
        || String(value ?? '').trim() === DISABLED_DRAW_OPTION_VALUE
        ? ''
        : String(value ?? ''),
    }),
  ],
}

const componentGroups = [
  {
    key: 'connection',
    title: '基础连接',
    fields: ['name', 'apiMode', 'baseUrl', 'apiKey', 'endpoint'],
  },
  {
    key: 'generation',
    title: '生成参数',
    fields: ['model', 'imageDetail', 'size', 'quality', 'outputFormat'],
  },
  {
    key: 'runtime',
    title: '高级选项',
    fields: ['moderation', 'background', 'n', 'cooldownSeconds', 'requestTimeoutSeconds'],
  },
] as const

function getConfigValue (config: Record<string, unknown>, key: string): unknown {
  return config[key]
}

function createFieldComponent (key: string, config: Record<string, unknown>, profileId?: string, allowInherit = false) {
  const id = fieldId(key, profileId)
  const value = getConfigValue(config, key)

  if (allowInherit && radioFieldOptions[key]) {
    return addDescriptionToComponents([
      createRadioGroup(id, getRadioLabel(key), withInheritOption(radioFieldOptions[key] ?? [], true), value, key === 'size', fieldLayouts[key] ?? FULL_WIDTH_CLASS),
      ...(key === 'size'
        ? [input.string(customFieldId('size', profileId), {
            ...withInputStyle({
              label: '自定义尺寸',
              description: getDescription('size', allowInherit),
              placeholder: getPlaceholder('size', allowInherit),
            }, HALF_WIDTH_CLASS),
            defaultValue: radioFieldOptions.size?.some((option) => option.value === String(value ?? '').trim())
              || String(value ?? '').trim() === DISABLED_DRAW_OPTION_VALUE
              ? ''
              : String(value ?? ''),
          })]
        : []),
    ], key, allowInherit)
  }

  if (allowInherit && key !== 'name') {
    const createInheritedInput = componentFactories[key] ?? ((componentId: string, inputValue: unknown) => [input.string(componentId, {
      ...withInputStyle({
        label: key,
      }, fieldLayouts[key] ?? FULL_WIDTH_CLASS),
      defaultValue: String(inputValue ?? ''),
    })])
    return addDescriptionToComponents(createInheritedInput(id, value, profileId), key, allowInherit)
  }

  const create = componentFactories[key] ?? ((componentId: string, inputValue: unknown) => [input.string(componentId, {
    ...withInputStyle({
      label: key,
    }, fieldLayouts[key] ?? FULL_WIDTH_CLASS),
    defaultValue: String(inputValue ?? ''),
  })])
  return addDescriptionToComponents(create(id, value, profileId), key, allowInherit)
}

function getRadioLabel (key: string): string {
  switch (key) {
    case 'apiMode':
      return '接口模式'
    case 'imageDetail':
      return '图像细节'
    case 'moderation':
      return '审核级别'
    case 'background':
      return '背景'
    case 'outputFormat':
      return '输出格式'
    case 'quality':
      return '质量'
    case 'size':
      return '尺寸'
    default:
      return key
  }
}

function addDescriptionToComponents (components: ComponentConfig[], key: string, allowInherit: boolean): ComponentConfig[] {
  return components.map((component) => {
    const description = getDescription(key, allowInherit)
    const placeholder = getPlaceholder(key, allowInherit)
    const inheritProps = allowInherit
      ? {
          isRequired: false,
          required: false,
        }
      : {}

    if (component.componentType === 'radio-group') {
      return {
        ...component,
        ...inheritProps,
        description,
      }
    }

    if ('placeholder' in component || component.componentType === 'input') {
      return {
        ...component,
        ...inheritProps,
        description: allowInherit ? description : component.description ?? description,
        placeholder: allowInherit ? placeholder : component.placeholder ?? placeholder,
      }
    }

    return component
  })
}

export default defineConfig({
  info: {
    id: 'karin-plugin-drawImages',
    name: 'karin-plugin-drawImages',
    description: 'AI 绘图插件配置',
  },
  components: () => {
    const settings = getDrawSettings()
    const fieldKeys = getDrawTemplateFieldKeys()
    const fieldSet = new Set(fieldKeys)
    const profileIds = getDrawProfileIds()
    const activeProfileOptions = profileIds.map((profileId, index) => ({
      value: profileId,
      label: settings.profiles[profileId].name || `配置${index + 1}`,
    }))
    const groupedItems: ComponentConfig[] = [
      createSectionTitle('draw-title-switch', '配置切换', 'accent'),
      createRadioGroup('draw-active-profile', '当前配置', activeProfileOptions, settings.activeProfile, false, FULL_WIDTH_CLASS),
      divider.create('draw-divider-global'),
      createSectionTitle('draw-title-global', '全局配置', 'accent'),
    ]

    componentGroups.forEach((group, groupIndex) => {
      const children = group.fields
        .filter((key) => key !== 'name')
        .filter((key) => fieldSet.has(key))
        .flatMap((key) => createFieldComponent(key, settings.global as unknown as Record<string, unknown>, 'global'))

      if (children.length === 0) return
      if (groupIndex > 0) {
        groupedItems.push(divider.create(`draw-divider-global-${group.key}`))
      }
      groupedItems.push(createSectionTitle(`draw-title-global-${group.key}`, group.title))
      groupedItems.push(...children)
    })

    profileIds.forEach((profileId, profileIndex) => {
      const profile = settings.profiles[profileId]
      const rawProfile = {
        ...settings.rawProfiles[profileId],
        name: settings.rawProfiles[profileId].name ?? profile.name,
      } as Record<string, unknown>
      groupedItems.push(divider.create(`draw-divider-${profileId}`))
      groupedItems.push(createSectionTitle(`draw-title-${profileId}`, profile.name || `配置${profileIndex + 1}`, 'accent'))

      const usedFields = new Set<string>()
      componentGroups.forEach((group, groupIndex) => {
        const children = group.fields
          .filter((key) => !PROFILE_HIDDEN_FIELD_KEYS.has(key))
          .filter((key) => fieldSet.has(key))
          .flatMap((key) => {
            usedFields.add(key)
            return createFieldComponent(key, rawProfile, profileId, key !== 'name')
          })

        if (children.length === 0) return

        if (groupIndex > 0) {
          groupedItems.push(divider.create(`draw-divider-${profileId}-${group.key}`))
        }

        groupedItems.push(createSectionTitle(`draw-title-${profileId}-${group.key}`, group.title))
        groupedItems.push(...children)
      })

      fieldKeys
        .filter((key) => !PROFILE_HIDDEN_FIELD_KEYS.has(key))
        .filter((key) => !usedFields.has(key))
        .flatMap((key) => createFieldComponent(key, rawProfile, profileId, key !== 'name'))
        .forEach((component) => groupedItems.push(component))
    })

    return groupedItems
  },
  save: async (config: Record<string, string>) => {
    const settings = getDrawSettings()

    const profiles = Object.fromEntries(getDrawProfileIds().map((profileId) => {
      const rawProfile = settings.rawProfiles[profileId] as Record<string, unknown>
      const profileConfig = Object.fromEntries(
        getDrawTemplateFieldKeys().map((key) => {
          if (PROFILE_HIDDEN_FIELD_KEYS.has(key)) {
            return [key, rawProfile[key]]
          }

          const value = config[fieldId(key, profileId)]
          if (value === CUSTOM_OPTION_VALUE) {
            return [key, config[customFieldId(key, profileId)]]
          }

          return [key, value]
        }),
      )

      return [profileId, profileConfig]
    }))

    const global = Object.fromEntries(
      getDrawTemplateFieldKeys()
        .filter((key) => key !== 'name')
        .map((key) => {
          const value = config[fieldId(key, 'global')]
          if (value === CUSTOM_OPTION_VALUE) {
            return [key, config[customFieldId(key, 'global')]]
          }

          return [key, value]
        }),
    )

    await saveDrawSettings({
      activeProfile: config['draw-active-profile'],
      global,
      profiles,
    })

    return {
      success: true,
      message: '保存成功',
    }
  },
})
