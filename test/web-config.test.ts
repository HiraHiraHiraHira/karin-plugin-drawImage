import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

import webConfig from '../web.config'
import { dir } from '../src/dir'

type LooseComponent = {
  [key: string]: any
}

test('web config uses fixed draw fields and saves runtime yaml', async () => {
  const baselineComponents = await webConfig.components?.()
  const baselineKeys = (baselineComponents ?? []).map(item => item.key)

  assert.deepEqual(baselineKeys, [
    'draw-title-connection',
    'draw-base-url',
    'draw-api-key',
    'draw-endpoint',
    'draw-divider-generation',
    'draw-title-generation',
    'draw-model',
    'draw-size',
    'draw-size-custom',
    'draw-quality',
    'draw-output-format',
    'draw-divider-runtime',
    'draw-title-runtime',
    'draw-moderation',
    'draw-background',
    'draw-n',
    'draw-cooldown-seconds',
    'draw-request-timeout-seconds',
  ])

  const refreshedComponents = await webConfig.components?.()
  const componentTypes = Object.fromEntries((refreshedComponents ?? []).map((item: any) => [item.key, item.componentType]))
  assert.equal(componentTypes['draw-moderation'], 'radio-group')
  assert.equal(componentTypes['draw-background'], 'radio-group')
  assert.equal(componentTypes['draw-output-format'], 'radio-group')
  assert.equal(componentTypes['draw-quality'], 'radio-group')
  assert.equal(componentTypes['draw-size'], 'radio-group')
  assert.equal(componentTypes['draw-size-custom'], 'input')
  assert.equal(componentTypes['draw-moderation-custom'], undefined)
  assert.equal(componentTypes['draw-background-custom'], undefined)
  assert.equal(componentTypes['draw-output-format-custom'], undefined)
  assert.equal(componentTypes['draw-quality-custom'], undefined)

  const findComponent = (key: string): LooseComponent | undefined => {
    return refreshedComponents?.find(item => item.key === key) as LooseComponent | undefined
  }

  const moderationField = findComponent('draw-moderation')
  assert.equal(moderationField?.label, '审核级别')
  assert.deepEqual(moderationField?.radio?.map((item: any) => item.value), ['auto', 'low'])

  const sizeField = findComponent('draw-size')
  const sizeCustomField = findComponent('draw-size-custom')
  const connectionTitle = findComponent('draw-title-connection')
  const generationTitle = findComponent('draw-title-generation')
  const runtimeTitle = findComponent('draw-title-runtime')
  assert.equal(sizeField?.label, '尺寸')
  assert.deepEqual(sizeField?.radio?.map((item: any) => item.value), ['auto', '1024x1024', '1536x1024', '1024x1536', '__custom__'])
  assert.equal(sizeCustomField?.label, '自定义尺寸')
  assert.equal(connectionTitle?.defaultValue, '基础连接')
  assert.equal(generationTitle?.defaultValue, '生成参数')
  assert.equal(runtimeTitle?.defaultValue, '高级选项')
  assert.equal(connectionTitle?.label, '')
  assert.equal(connectionTitle?.isClearable, false)
  assert.match(String(connectionTitle?.className), /col-span-12/)
  assert.match(String(connectionTitle?.className), /mb-3/)
  assert.match(String(connectionTitle?.componentClassName), /text-sm/)
  assert.match(String(sizeField?.className), /col-span-12/)
  assert.match(String(sizeField?.className), /mb-4/)
  assert.match(String(sizeField?.componentClassName), /gap-x-3/)
  assert.doesNotMatch(String(sizeField?.componentClassName), /border/)
  assert.match(String(sizeCustomField?.className), /md:col-span-6/)
  assert.match(String(sizeCustomField?.className), /mb-4/)
  assert.match(String(findComponent('draw-base-url')?.className), /md:col-span-4/)
  assert.match(String(findComponent('draw-model')?.className), /md:col-span-6/)
  assert.match(String(findComponent('draw-output-format')?.className), /md:col-span-6/)
  assert.match(String(findComponent('draw-cooldown-seconds')?.className), /md:col-span-6/)
  assert.match(String(findComponent('draw-request-timeout-seconds')?.className), /md:col-span-6/)

  const originalRuntime = await fs.readFile(dir.configFile, 'utf8').catch(() => '')
  try {
    const result = await webConfig.save?.({
      'draw-base-url': 'https://example.com',
      'draw-api-key': 'sk-panel',
      'draw-endpoint': '/v1/images/generations',
      'draw-model': 'gpt-image-2',
      'draw-cooldown-seconds': '180',
      'draw-request-timeout-seconds': '600',
      'draw-moderation': 'low',
      'draw-background': 'auto',
      'draw-output-format': 'png',
      'draw-quality': 'high',
      'draw-size': '__custom__',
      'draw-size-custom': '2048x2048',
      'draw-n': '2',
    })

    const next = await fs.readFile(dir.configFile, 'utf8')
    assert.equal(result?.success, true)
    assert.match(next, /apiKey: sk-panel/)
    assert.match(next, /moderation: low/)
    assert.match(next, /size: 2048x2048/)
    assert.match(next, /n: 2/)
  } finally {
    if (originalRuntime) {
      await fs.writeFile(dir.configFile, originalRuntime, 'utf8')
    }
  }
})
