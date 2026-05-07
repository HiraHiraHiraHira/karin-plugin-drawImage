import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('config helpers use code defaults and save runtime yaml without example sync', async () => {
  process.env.KARIN_SKIP_CONFIG_WATCH = '1'
  const {
    getDrawConfig,
    getDrawSettings,
    saveDrawConfig,
    switchDrawProfile,
  } = await import('../src/utils/config')

  {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'draw-config-defaults-'))
    const missingFile = path.join(tempDir, 'missing.yaml')
    const config = getDrawConfig(missingFile)

    assert.equal(config.apiKey, '')
    assert.equal(config.baseUrl, 'https://example.com')
    assert.equal(config.endpoint, '/v1/images/generations')
    assert.equal(config.model, 'gpt-image-2')
    assert.equal(config.name, '配置一')
    assert.equal(config.apiMode, 'images')
    assert.equal(config.imageDetail, 'high')
    assert.equal(config.taskLockEnabled, true)
    assert.equal(config.requestTimeoutSeconds, 600)
    assert.equal(config.moderation, 'auto')
    assert.equal(config.background, 'auto')
    assert.equal(config.outputFormat, 'png')
    assert.equal(config.quality, 'high')
    assert.equal(config.size, '2160x3840')
    assert.equal(config.n, 1)
  }

  {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'draw-config-profiles-'))
    const configFile = path.join(tempDir, 'config.yaml')

    await fs.writeFile(configFile, [
      'draw:',
      '  activeProfile: profile2',
      '  global:',
      '    baseUrl: https://global.example.com',
      '    apiKey: sk-global',
      '    model: global-model',
      '    taskLockEnabled: false',
      '    requestTimeoutSeconds: 1200',
      '  profiles:',
      '    profile1:',
      '      name: 配置一',
      '      baseUrl: https://one.example.com',
      '      apiKey: sk-one',
      '      apiMode: images',
      '      model: gpt-image-2',
      '    profile2:',
      '      name: 配置二',
      '      baseUrl: ""',
      '      apiKey: ""',
      '      apiMode: responses',
      '      model: gpt-5.4',
      '      imageDetail: original',
      '',
    ].join('\n'), 'utf8')

    const settings = getDrawSettings(configFile)
    const active = getDrawConfig(configFile)

    assert.equal(settings.activeProfile, 'profile2')
    assert.equal(settings.global.apiKey, 'sk-global')
    assert.equal(settings.profiles.profile1.apiKey, 'sk-one')
    assert.equal(settings.profiles.profile2.apiKey, 'sk-global')
    assert.equal(settings.profiles.profile2.baseUrl, 'https://global.example.com')
    assert.equal(settings.profiles.profile2.taskLockEnabled, false)
    assert.equal(settings.profiles.profile2.requestTimeoutSeconds, 1200)
    assert.equal(settings.profiles.profile3.name, '配置三')
    assert.equal(settings.profiles.profile3.apiKey, 'sk-global')
    assert.equal(settings.profiles.profile3.model, 'global-model')
    assert.equal(active.name, '配置二')
    assert.equal(active.apiMode, 'responses')
    assert.equal(active.endpoint, '/v1/responses')
    assert.equal(active.imageDetail, 'original')
  }

  {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'draw-config-runtime-'))
    const configFile = path.join(tempDir, 'config.yaml')

    await fs.writeFile(configFile, [
      'draw:',
      '  baseUrl: https://runtime.example.com',
      '  apiKey: sk-runtime',
      '  endpoint: /v1/images/generations',
      '  model: custom-model',
      '  taskLockEnabled: false',
      '  requestTimeoutSeconds: 900',
      '  moderation: low',
      '  background: transparent',
      '  outputFormat: jpeg',
      '  quality: medium',
      '  size: __disabled__',
      '  n: 2',
      'legacyRoot: true',
      '',
    ].join('\n'), 'utf8')

    const config = getDrawConfig(configFile)

    assert.equal(config.apiKey, 'sk-runtime')
    assert.equal(config.model, 'custom-model')
    assert.equal(config.baseUrl, 'https://runtime.example.com')
    assert.equal(config.taskLockEnabled, false)
    assert.equal(config.requestTimeoutSeconds, 900)
    assert.equal(config.moderation, 'low')
    assert.equal(config.background, 'transparent')
    assert.equal(config.outputFormat, 'jpeg')
    assert.equal(config.quality, 'medium')
    assert.equal(config.size, undefined)
    assert.equal(config.n, 2)
  }

  {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'draw-config-save-'))
    const configFile = path.join(tempDir, 'config.yaml')

    await fs.writeFile(configFile, [
      'draw:',
      '  apiKey: sk-old',
      'legacyRoot: true',
      '',
    ].join('\n'), 'utf8')

    const saved = await saveDrawConfig({
      baseUrl: ' https://example.com/ ',
      apiKey: 'sk-demo',
      apiMode: 'chatCompletions',
      endpoint: 'v1/images/generations',
      model: 'gpt-image-2',
      imageDetail: 'low',
      taskLockEnabled: 'false',
      requestTimeoutSeconds: '900',
      moderation: 'low',
      background: 'auto',
      outputFormat: 'png',
      quality: 'high',
      size: '__disabled__',
      n: '3',
    }, configFile)

    const content = await fs.readFile(configFile, 'utf8')

    assert.equal(saved.baseUrl, 'https://example.com')
    assert.equal(saved.endpoint, '/v1/chat/completions')
    assert.equal(saved.apiMode, 'chatCompletions')
    assert.equal(saved.imageDetail, 'low')
    assert.equal(saved.taskLockEnabled, false)
    assert.equal(saved.requestTimeoutSeconds, 900)
    assert.equal(saved.moderation, 'low')
    assert.equal(saved.n, 3)
    assert.equal(saved.size, undefined)
    assert.doesNotMatch(content, /cooldownSeconds:/)
    assert.match(content, /requestTimeoutSeconds: ['"]900['"]|requestTimeoutSeconds: 900/)
    assert.match(content, /moderation: low/)
    assert.match(content, /baseUrl: " https:\/\/example\.com\/ "/)
    assert.match(content, /global:/)
    assert.match(content, /activeProfile: profile1/)
    assert.match(content, /profiles:/)
    assert.match(content, /profile1:/)
    assert.match(content, /apiMode: chatCompletions/)
    assert.match(content, /imageDetail: low/)
    assert.match(content, /taskLockEnabled: ['"]false['"]|taskLockEnabled: false/)
    assert.match(content, /n: ['"]3['"]|n: 3/)
    assert.match(content, /size: __disabled__/)
    assert.match(content, /legacyRoot: true/)
    assert.doesNotMatch(content, /Keys not in config\.yaml\.example/)
  }

  {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'draw-config-switch-'))
    const configFile = path.join(tempDir, 'config.yaml')

    await fs.writeFile(configFile, [
      'draw:',
      '  activeProfile: profile1',
      '  global:',
      '    apiKey: sk-global',
      '  profiles:',
      '    profile1:',
      '      name: 配置一',
      '      apiKey: sk-one',
      '    profile2:',
      '      name: 配置二',
      '      model: gpt-5.4',
      'legacyRoot: true',
      '',
    ].join('\n'), 'utf8')

    const settings = await switchDrawProfile('profile2', configFile)
    const content = await fs.readFile(configFile, 'utf8')

    assert.equal(settings.activeProfile, 'profile2')
    assert.match(content, /activeProfile: profile2/)
    assert.match(content, /apiKey: sk-one/)
    assert.match(content, /model: gpt-5\.4/)
    assert.match(content, /legacyRoot: true/)
  }
})
