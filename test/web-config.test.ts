import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

import webConfig from '../web.config'
import { dir } from '../src/dir'
import { DISABLED_DRAW_OPTION_VALUE } from '../src/utils/draw'

type LooseComponent = {
  [key: string]: any
}

test('web config uses fixed draw fields and saves runtime yaml', async () => {
  const baselineComponents = await webConfig.components?.()
  const baselineKeys = (baselineComponents ?? []).map(item => item.key)

  assert.equal(baselineKeys[0], 'draw-title-switch')
  assert.equal(baselineKeys[1], 'draw-active-profile')
  assert.ok(baselineKeys.includes('draw-title-global'))
  assert.ok(baselineKeys.includes('draw-global-api-key'))
  assert.ok(baselineKeys.includes('draw-profile1-api-mode'))
  assert.ok(baselineKeys.includes('draw-profile1-api-key'))
  assert.ok(baselineKeys.includes('draw-profile1-image-detail'))
  assert.ok(baselineKeys.includes('draw-profile1-size-custom'))
  assert.ok(baselineKeys.includes('draw-profile2-api-key'))
  assert.ok(baselineKeys.includes('draw-profile2-image-detail'))
  assert.ok(baselineKeys.includes('draw-profile2-size-custom'))
  assert.ok(baselineKeys.includes('draw-profile3-api-key'))
  assert.ok(baselineKeys.includes('draw-global-task-lock-enabled'))
  assert.ok(!baselineKeys.includes('draw-global-cooldown-seconds'))
  assert.ok(baselineKeys.includes('draw-global-request-timeout-seconds'))
  assert.ok(baselineKeys.includes('draw-global-n'))
  assert.ok(!baselineKeys.includes('draw-profile1-task-lock-enabled'))
  assert.ok(!baselineKeys.includes('draw-profile1-cooldown-seconds'))
  assert.ok(!baselineKeys.includes('draw-profile1-request-timeout-seconds'))
  assert.ok(!baselineKeys.includes('draw-profile1-n'))

  const refreshedComponents = await webConfig.components?.()
  const componentTypes = Object.fromEntries((refreshedComponents ?? []).map((item: any) => [item.key, item.componentType]))
  assert.equal(componentTypes['draw-active-profile'], 'radio-group')
  assert.equal(componentTypes['draw-profile1-api-mode'], 'radio-group')
  assert.equal(componentTypes['draw-profile1-image-detail'], 'radio-group')
  assert.equal(componentTypes['draw-profile1-moderation'], 'radio-group')
  assert.equal(componentTypes['draw-profile1-background'], 'radio-group')
  assert.equal(componentTypes['draw-profile1-output-format'], 'radio-group')
  assert.equal(componentTypes['draw-profile1-quality'], 'radio-group')
  assert.equal(componentTypes['draw-profile1-size'], 'radio-group')
  assert.equal(componentTypes['draw-profile1-size-custom'], 'input')
  assert.equal(componentTypes['draw-global-task-lock-enabled'], 'switch')
  assert.equal(componentTypes['draw-profile1-moderation-custom'], undefined)
  assert.equal(componentTypes['draw-profile1-background-custom'], undefined)
  assert.equal(componentTypes['draw-profile1-output-format-custom'], undefined)
  assert.equal(componentTypes['draw-profile1-quality-custom'], undefined)

  const findComponent = (key: string): LooseComponent | undefined => {
    return refreshedComponents?.find(item => item.key === key) as LooseComponent | undefined
  }

  const activeProfileField = findComponent('draw-active-profile')
  assert.equal(activeProfileField?.label, '当前配置')
  assert.deepEqual(activeProfileField?.radio?.map((item: any) => item.value), ['profile1', 'profile2', 'profile3'])

  const apiModeField = findComponent('draw-profile1-api-mode')
  assert.equal(apiModeField?.label, '接口模式')
  assert.deepEqual(apiModeField?.radio?.map((item: any) => item.value), ['', 'images', 'chatCompletions', 'responses', 'custom'])
  assert.match(String(apiModeField?.description), /留空时继承全局配置/)
  assert.match(String(apiModeField?.radio?.[0]?.description), /全局配置/)
  assert.match(String(apiModeField?.radio?.[1]?.description), /\/v1\/images\/generations/)
  assert.match(String(apiModeField?.radio?.[3]?.description), /\/v1\/responses/)

  const imageDetailField = findComponent('draw-profile1-image-detail')
  assert.equal(imageDetailField?.label, '图像细节')
  assert.deepEqual(imageDetailField?.radio?.map((item: any) => item.value), ['', 'auto', 'low', 'high', 'original'])
  assert.match(String(imageDetailField?.description), /responses/)

  const moderationField = findComponent('draw-profile1-moderation')
  assert.equal(moderationField?.label, '审核级别')
  assert.deepEqual(moderationField?.radio?.map((item: any) => item.value), ['', DISABLED_DRAW_OPTION_VALUE, 'auto', 'low'])

  const sizeField = findComponent('draw-profile1-size')
  const sizeCustomField = findComponent('draw-profile1-size-custom')
  const connectionTitle = findComponent('draw-title-profile1-connection')
  const profileTitle = findComponent('draw-title-profile1')
  const generationTitle = findComponent('draw-title-profile1-generation')
  const runtimeTitle = findComponent('draw-title-profile1-runtime')
  assert.equal(sizeField?.label, '尺寸')
  assert.deepEqual(sizeField?.radio?.map((item: any) => item.value), ['', DISABLED_DRAW_OPTION_VALUE, 'auto', '1024x1024', '1536x1024', '1024x1536', '2560x1440', '3840x2160', '2160x3840', '__custom__'])
  assert.match(String(sizeField?.radio?.[3]?.label), /头像 \/ 主图/)
  assert.match(String(sizeField?.radio?.[3]?.description), /1024x1024/)
  assert.match(String(sizeField?.radio?.[6]?.label), /电脑壁纸/)
  assert.match(String(sizeField?.radio?.[8]?.description), /4K/)
  assert.equal(sizeCustomField?.label, '自定义尺寸')
  assert.match(String(sizeCustomField?.placeholder), /留空继承全局配置/)
  assert.match(String(findComponent('draw-profile1-base-url')?.placeholder), /留空继承全局配置/)
  assert.equal(findComponent('draw-profile1-base-url')?.isRequired, false)
  assert.equal(findComponent('draw-profile1-base-url')?.required, false)
  assert.notEqual(findComponent('draw-global-base-url')?.isRequired, false)
  assert.match(String(findComponent('draw-global-base-url')?.placeholder), /https:\/\/example\.com/)
  assert.match(String(findComponent('draw-global-base-url')?.description), /API 服务地址/)
  assert.match(String(findComponent('draw-profile1-endpoint')?.description), /custom 模式/)
  assert.equal(findComponent('draw-profile1-endpoint')?.isRequired, false)
  assert.equal(findComponent('draw-profile1-size-custom')?.isRequired, false)
  assert.equal(connectionTitle?.defaultValue, '基础连接')
  assert.equal(profileTitle?.defaultValue, '配置一')
  assert.equal(generationTitle?.defaultValue, '生成参数')
  assert.equal(runtimeTitle?.defaultValue, '高级选项')
  assert.equal(connectionTitle?.label, '')
  assert.equal(connectionTitle?.isClearable, false)
  assert.match(String(connectionTitle?.className), /col-span-12/)
  assert.match(String(connectionTitle?.className), /mb-2/)
  assert.match(String(connectionTitle?.componentClassName), /text-sm/)
  assert.match(String(connectionTitle?.componentClassName), /max-w-fit/)
  assert.match(String(profileTitle?.componentClassName), /text-sky-400/)
  assert.match(String(profileTitle?.componentClassName), /border-sky-500/)
  assert.doesNotMatch(String(connectionTitle?.componentClassName), /text-sky-400/)
  assert.match(String(sizeField?.className), /col-span-12/)
  assert.match(String(sizeField?.className), /mb-4/)
  assert.match(String(sizeField?.componentClassName), /gap-x-3/)
  assert.doesNotMatch(String(sizeField?.componentClassName), /border/)
  assert.match(String(sizeCustomField?.className), /md:col-span-6/)
  assert.match(String(sizeCustomField?.className), /mb-4/)
  assert.match(String(findComponent('draw-profile1-base-url')?.className), /md:col-span-4/)
  assert.match(String(findComponent('draw-profile1-model')?.className), /md:col-span-6/)
  assert.match(String(findComponent('draw-profile1-output-format')?.className), /md:col-span-6/)
  assert.equal(findComponent('draw-global-task-lock-enabled')?.label, '绘图任务限制')
  assert.equal(findComponent('draw-global-task-lock-enabled')?.defaultSelected, true)
  assert.match(String(findComponent('draw-global-task-lock-enabled')?.description), /上一张完成/)
  assert.match(String(findComponent('draw-global-request-timeout-seconds')?.className), /md:col-span-6/)
  assert.match(String(findComponent('draw-global-n')?.className), /md:col-span-6/)
  assert.equal(findComponent('draw-profile1-task-lock-enabled'), undefined)
  assert.equal(findComponent('draw-profile1-cooldown-seconds'), undefined)
  assert.equal(findComponent('draw-profile1-request-timeout-seconds'), undefined)
  assert.equal(findComponent('draw-profile1-n'), undefined)

  const originalRuntime = await fs.readFile(dir.configFile, 'utf8').catch(() => '')
  try {
    const result = await webConfig.save?.({
      'draw-active-profile': 'profile2',
      'draw-global-api-mode': 'images',
      'draw-global-base-url': 'https://global.example.com',
      'draw-global-api-key': 'sk-global',
      'draw-global-endpoint': '/v1/images/generations',
      'draw-global-model': 'global-model',
      'draw-global-image-detail': 'high',
      'draw-global-task-lock-enabled': 'true',
      'draw-global-request-timeout-seconds': '600',
      'draw-global-moderation': 'auto',
      'draw-global-background': 'auto',
      'draw-global-output-format': 'png',
      'draw-global-quality': 'high',
      'draw-global-size': '1024x1024',
      'draw-global-size-custom': '',
      'draw-global-n': '1',
      'draw-profile1-name': '配置一',
      'draw-profile1-api-mode': 'images',
      'draw-profile1-base-url': 'https://one.example.com',
      'draw-profile1-api-key': 'sk-one',
      'draw-profile1-endpoint': '/v1/images/generations',
      'draw-profile1-model': 'gpt-image-2',
      'draw-profile1-image-detail': 'high',
      'draw-profile1-moderation': 'low',
      'draw-profile1-background': 'auto',
      'draw-profile1-output-format': 'png',
      'draw-profile1-quality': 'high',
      'draw-profile1-size': DISABLED_DRAW_OPTION_VALUE,
      'draw-profile1-size-custom': '2048x2048',
      'draw-profile2-name': '配置二',
      'draw-profile2-api-mode': 'chatCompletions',
      'draw-profile2-base-url': '',
      'draw-profile2-api-key': '',
      'draw-profile2-endpoint': '',
      'draw-profile2-model': 'gpt-5.4',
      'draw-profile2-image-detail': 'original',
      'draw-profile2-moderation': DISABLED_DRAW_OPTION_VALUE,
      'draw-profile2-background': DISABLED_DRAW_OPTION_VALUE,
      'draw-profile2-output-format': DISABLED_DRAW_OPTION_VALUE,
      'draw-profile2-quality': DISABLED_DRAW_OPTION_VALUE,
      'draw-profile2-size': DISABLED_DRAW_OPTION_VALUE,
      'draw-profile2-size-custom': '',
      'draw-profile3-name': '配置三',
      'draw-profile3-api-mode': 'images',
      'draw-profile3-base-url': 'https://three.example.com',
      'draw-profile3-api-key': '',
      'draw-profile3-endpoint': '/v1/images/generations',
      'draw-profile3-model': 'gpt-image-2',
      'draw-profile3-image-detail': 'high',
      'draw-profile3-moderation': 'auto',
      'draw-profile3-background': 'auto',
      'draw-profile3-output-format': 'png',
      'draw-profile3-quality': 'high',
      'draw-profile3-size': '1024x1024',
      'draw-profile3-size-custom': '',
    })

    const next = await fs.readFile(dir.configFile, 'utf8')
    assert.equal(result?.success, true)
    assert.match(next, /activeProfile: profile2/)
    assert.match(next, /global:/)
    assert.match(next, /apiKey: sk-global/)
    assert.match(next, /profile1:/)
    assert.match(next, /apiKey: sk-one/)
    assert.match(next, /moderation: low/)
    assert.match(next, /size: __disabled__/)
    assert.match(next, /profile2:/)
    assert.match(next, /apiKey: ""/)
    assert.match(next, /apiMode: chatCompletions/)
    assert.match(next, /endpoint: ""/)
    assert.match(next, /imageDetail: original/)
    assert.match(next, /taskLockEnabled: ['"]true['"]|taskLockEnabled: true/)
    assert.doesNotMatch(next, /cooldownSeconds:/)
    assert.match(next, /requestTimeoutSeconds: ['"]600['"]|requestTimeoutSeconds: 600/)
    assert.match(next, /n: ['"]1['"]|n: 1/)

    const missingCustomSize = await webConfig.save?.({
      ...baseSaveConfig(),
      'draw-global-size': '__custom__',
      'draw-global-size-custom': '',
    })
    assert.equal(missingCustomSize?.success, false)
    assert.match(String(missingCustomSize?.message), /自定义尺寸/)

    const missingCustomEndpoint = await webConfig.save?.({
      ...baseSaveConfig(),
      'draw-profile1-api-mode': 'custom',
      'draw-profile1-endpoint': '',
    })
    assert.equal(missingCustomEndpoint?.success, false)
    assert.match(String(missingCustomEndpoint?.message), /自定义请求路径/)
  } finally {
    if (originalRuntime) {
      await fs.writeFile(dir.configFile, originalRuntime, 'utf8')
    }
  }
})

function baseSaveConfig (): Record<string, string> {
  return {
    'draw-active-profile': 'profile1',
    'draw-global-api-mode': 'images',
    'draw-global-base-url': 'https://global.example.com',
    'draw-global-api-key': 'sk-global',
    'draw-global-endpoint': '/v1/images/generations',
    'draw-global-model': 'global-model',
    'draw-global-image-detail': 'high',
    'draw-global-task-lock-enabled': 'true',
    'draw-global-request-timeout-seconds': '600',
    'draw-global-moderation': 'auto',
    'draw-global-background': 'auto',
    'draw-global-output-format': 'png',
    'draw-global-quality': 'high',
    'draw-global-size': '1024x1024',
    'draw-global-size-custom': '',
    'draw-global-n': '1',
    'draw-profile1-name': '配置一',
    'draw-profile1-api-mode': 'images',
    'draw-profile1-base-url': 'https://one.example.com',
    'draw-profile1-api-key': 'sk-one',
    'draw-profile1-endpoint': '/v1/images/generations',
    'draw-profile1-model': 'gpt-image-2',
    'draw-profile1-image-detail': 'high',
    'draw-profile1-moderation': 'low',
    'draw-profile1-background': 'auto',
    'draw-profile1-output-format': 'png',
    'draw-profile1-quality': 'high',
    'draw-profile1-size': '1024x1024',
    'draw-profile1-size-custom': '',
    'draw-profile2-name': '配置二',
    'draw-profile2-api-mode': 'chatCompletions',
    'draw-profile2-base-url': '',
    'draw-profile2-api-key': '',
    'draw-profile2-endpoint': '',
    'draw-profile2-model': 'gpt-5.4',
    'draw-profile2-image-detail': 'original',
    'draw-profile2-moderation': DISABLED_DRAW_OPTION_VALUE,
    'draw-profile2-background': DISABLED_DRAW_OPTION_VALUE,
    'draw-profile2-output-format': DISABLED_DRAW_OPTION_VALUE,
    'draw-profile2-quality': DISABLED_DRAW_OPTION_VALUE,
    'draw-profile2-size': DISABLED_DRAW_OPTION_VALUE,
    'draw-profile2-size-custom': '',
    'draw-profile3-name': '配置三',
    'draw-profile3-api-mode': 'images',
    'draw-profile3-base-url': 'https://three.example.com',
    'draw-profile3-api-key': '',
    'draw-profile3-endpoint': '/v1/images/generations',
    'draw-profile3-model': 'gpt-image-2',
    'draw-profile3-image-detail': 'high',
    'draw-profile3-moderation': 'auto',
    'draw-profile3-background': 'auto',
    'draw-profile3-output-format': 'png',
    'draw-profile3-quality': 'high',
    'draw-profile3-size': '1024x1024',
    'draw-profile3-size-custom': '',
  }
}
