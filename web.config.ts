import { components, defineConfig, divider, input, type ComponentConfig } from 'node-karin'

import { getDrawConfig, getDrawTemplateFieldKeys, saveDrawConfig } from './src/utils/config'
import type { DrawConfig } from './src/utils/draw'

const radio = components.radio

function fieldId (key: string): string {
  return `draw-${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`
}

type RadioOption = {
  value: string
  label: string
}

type ComponentFactory = (id: string, value: unknown) => ComponentConfig[]

const FULL_WIDTH_CLASS = 'col-span-12'
const HALF_WIDTH_CLASS = 'col-span-12 md:col-span-6'
const THIRD_WIDTH_CLASS = 'col-span-12 md:col-span-4'
const FIELD_GAP_CLASS = 'mb-4'
const RADIO_FIELD_CLASS = '[&_[data-slot=label]]:text-small [&_[data-slot=label]]:font-medium [&_[data-slot=label]]:text-primary'
const RADIO_ITEMS_CLASS = 'gap-x-3 gap-y-2 text-sm'

const CUSTOM_OPTION_VALUE = '__custom__'

const radioFieldOptions: Partial<Record<string, RadioOption[]>> = {
  moderation: [
    { value: 'auto', label: '自动' },
    { value: 'low', label: '低' },
  ],
  background: [
    { value: 'auto', label: '自动' },
    { value: 'transparent', label: '透明' },
    { value: 'opaque', label: '不透明' },
  ],
  outputFormat: [
    { value: 'png', label: 'PNG' },
    { value: 'jpeg', label: 'JPEG' },
    { value: 'webp', label: 'WebP' },
  ],
  quality: [
    { value: 'auto', label: '自动' },
    { value: 'high', label: '高' },
    { value: 'medium', label: '中' },
    { value: 'low', label: '低' },
  ],
  size: [
    { value: 'auto', label: '自动' },
    { value: '1024x1024', label: '1024x1024' },
    { value: '1536x1024', label: '1536x1024' },
    { value: '1024x1536', label: '1024x1536' },
  ],
}

function customFieldId (key: string): string {
  return `${fieldId(key)}-custom`
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

function createSectionTitle (key: string, title: string) {
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
    className: `${FULL_WIDTH_CLASS} mt-2 mb-3`,
    componentClassName: 'pointer-events-none h-8 min-h-8 rounded-md bg-white/[0.07] px-3 text-sm font-semibold tracking-normal text-white/95',
  })
}

const fieldLayouts: Partial<Record<string, string>> = {
  baseUrl: THIRD_WIDTH_CLASS,
  apiKey: THIRD_WIDTH_CLASS,
  endpoint: THIRD_WIDTH_CLASS,
  model: HALF_WIDTH_CLASS,
  size: FULL_WIDTH_CLASS,
  quality: HALF_WIDTH_CLASS,
  outputFormat: HALF_WIDTH_CLASS,
  moderation: HALF_WIDTH_CLASS,
  background: HALF_WIDTH_CLASS,
  n: HALF_WIDTH_CLASS,
  cooldownSeconds: HALF_WIDTH_CLASS,
}

const componentFactories: Record<string, ComponentFactory> = {
  baseUrl: (id, value) => [input.url(id, {
    ...withInputStyle({
      label: '接口地址',
    }, fieldLayouts.baseUrl),
    defaultValue: String(value ?? ''),
  })],
  apiKey: (id, value) => [input.password(id, {
    ...withInputStyle({
      label: 'API 密钥',
    }, fieldLayouts.apiKey),
    defaultValue: String(value ?? ''),
  })],
  endpoint: (id, value) => [input.string(id, {
    ...withInputStyle({
      label: '请求路径',
    }, fieldLayouts.endpoint),
    defaultValue: String(value ?? ''),
  })],
  model: (id, value) => [input.string(id, {
    ...withInputStyle({
      label: '模型',
    }, fieldLayouts.model),
    defaultValue: String(value ?? ''),
  })],
  cooldownSeconds: (id, value) => [input.number(id, {
    ...withInputStyle({
      label: '冷却时间（秒）',
    }, fieldLayouts.cooldownSeconds),
    rules: [
      {
        min: 0,
        error: '请输入大于等于 0 的秒数',
      },
    ],
    defaultValue: value === undefined ? '' : String(value),
  })],
  moderation: (id, value) => [
    createRadioGroup(id, '审核级别', radioFieldOptions.moderation ?? [], value, false, fieldLayouts.moderation),
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
  size: (id, value) => [
    createRadioGroup(id, '尺寸', radioFieldOptions.size ?? [], value, true, fieldLayouts.size),
    input.string(customFieldId('size'), {
      ...withInputStyle({
        label: '自定义尺寸',
        placeholder: '选中“自定义”时使用',
      }, HALF_WIDTH_CLASS),
      defaultValue: radioFieldOptions.size?.some((option) => option.value === String(value ?? '').trim())
        ? ''
        : String(value ?? ''),
    }),
  ],
  n: (id, value) => [input.number(id, {
    ...withInputStyle({
      label: '生成数量',
    }, fieldLayouts.n),
    rules: [
      {
        min: 1,
        error: '请输入大于等于 1 的数量',
      },
    ],
    defaultValue: value === undefined ? '' : String(value),
  })],
}

const componentGroups = [
  {
    key: 'connection',
    title: '基础连接',
    fields: ['baseUrl', 'apiKey', 'endpoint'],
  },
  {
    key: 'generation',
    title: '生成参数',
    fields: ['model', 'size', 'quality', 'outputFormat'],
  },
  {
    key: 'runtime',
    title: '高级选项',
    fields: ['moderation', 'background', 'n', 'cooldownSeconds'],
  },
] as const

function getConfigValue (config: DrawConfig, key: string): unknown {
  return config[key as keyof DrawConfig]
}

function createFieldComponent (key: string, config: DrawConfig) {
  const id = fieldId(key)
  const create = componentFactories[key] ?? ((componentId: string, value: unknown) => [input.string(componentId, {
    ...withInputStyle({
      label: key,
    }, fieldLayouts[key] ?? FULL_WIDTH_CLASS),
    defaultValue: String(value ?? ''),
  })])

  return create(id, getConfigValue(config, key))
}

export default defineConfig({
  info: {
    id: 'karin-plugin-drawImages',
    name: 'karin-plugin-drawImages',
    description: 'Draw image plugin settings',
  },
  components: () => {
    const config = getDrawConfig()
    const fieldKeys = getDrawTemplateFieldKeys()
    const fieldSet = new Set(fieldKeys)
    const usedFields = new Set<string>()
    const groupedItems = componentGroups.flatMap((group, index) => {
      const children = group.fields
        .filter((key) => fieldSet.has(key))
        .flatMap((key) => {
          usedFields.add(key)
          return createFieldComponent(key, config)
        })

      if (children.length === 0) {
        return []
      }

      const items = []
      if (index > 0) {
        items.push(divider.create(`draw-divider-${group.key}`))
      }

      items.push(createSectionTitle(`draw-title-${group.key}`, group.title))

      items.push(...children)
      return items
    })

    const extraChildren = fieldKeys
      .filter((key) => !usedFields.has(key))
      .flatMap((key) => createFieldComponent(key, config))

    if (extraChildren.length > 0) {
      groupedItems.push(divider.create('draw-divider-extra'))
      groupedItems.push(createSectionTitle('draw-title-extra', '其他配置'))
      groupedItems.push(...extraChildren)
    }

    return groupedItems
  },
  save: async (config: Record<string, string>) => {
    const inputConfig = Object.fromEntries(
      getDrawTemplateFieldKeys().map((key) => {
        const value = config[fieldId(key)]
        if (value === CUSTOM_OPTION_VALUE) {
          return [key, config[customFieldId(key)]]
        }

        return [key, value]
      }),
    )

    await saveDrawConfig(inputConfig)

    return {
      success: true,
      message: '保存成功',
    }
  },
})
