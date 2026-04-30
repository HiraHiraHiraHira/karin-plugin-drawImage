import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('config helpers use code defaults and save runtime yaml without example sync', async () => {
  process.env.KARIN_SKIP_CONFIG_WATCH = '1'
  const {
    getDrawConfig,
    saveDrawConfig,
  } = await import('../src/utils/config')

  {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'draw-config-defaults-'))
    const missingFile = path.join(tempDir, 'missing.yaml')
    const config = getDrawConfig(missingFile)

    assert.equal(config.apiKey, '')
    assert.equal(config.baseUrl, 'https://example.com')
    assert.equal(config.endpoint, '/v1/images/generations')
    assert.equal(config.model, 'gpt-image-2')
    assert.equal(config.cooldownSeconds, 180)
    assert.equal(config.requestTimeoutSeconds, 600)
    assert.equal(config.moderation, 'auto')
    assert.equal(config.background, 'auto')
    assert.equal(config.outputFormat, 'png')
    assert.equal(config.quality, 'high')
    assert.equal(config.size, '2160x3840')
    assert.equal(config.n, 1)
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
      '  cooldownSeconds: 240',
      '  requestTimeoutSeconds: 900',
      '  moderation: low',
      '  background: transparent',
      '  outputFormat: jpeg',
      '  quality: medium',
      '  size: 1024x1024',
      '  n: 2',
      'legacyRoot: true',
      '',
    ].join('\n'), 'utf8')

    const config = getDrawConfig(configFile)

    assert.equal(config.apiKey, 'sk-runtime')
    assert.equal(config.model, 'custom-model')
    assert.equal(config.baseUrl, 'https://runtime.example.com')
    assert.equal(config.cooldownSeconds, 240)
    assert.equal(config.requestTimeoutSeconds, 900)
    assert.equal(config.moderation, 'low')
    assert.equal(config.background, 'transparent')
    assert.equal(config.outputFormat, 'jpeg')
    assert.equal(config.quality, 'medium')
    assert.equal(config.size, '1024x1024')
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
      endpoint: 'v1/images/generations',
      model: 'gpt-image-2',
      cooldownSeconds: '240',
      requestTimeoutSeconds: '900',
      moderation: 'low',
      background: 'auto',
      outputFormat: 'png',
      quality: 'high',
      size: '1024x1024',
      n: '3',
    }, configFile)

    const content = await fs.readFile(configFile, 'utf8')

    assert.equal(saved.baseUrl, 'https://example.com')
    assert.equal(saved.endpoint, '/v1/images/generations')
    assert.equal(saved.cooldownSeconds, 240)
    assert.equal(saved.requestTimeoutSeconds, 900)
    assert.equal(saved.moderation, 'low')
    assert.equal(saved.n, 3)
    assert.match(content, /cooldownSeconds: '240'|cooldownSeconds: 240/)
    assert.match(content, /requestTimeoutSeconds: '900'|requestTimeoutSeconds: 900/)
    assert.match(content, /moderation: low/)
    assert.match(content, /baseUrl: https:\/\/example\.com/)
    assert.match(content, /n: '3'|n: 3/)
    assert.match(content, /legacyRoot: true/)
    assert.doesNotMatch(content, /Keys not in config\.yaml\.example/)
  }
})
