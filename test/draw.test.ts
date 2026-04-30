import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

import {
  DRAW_COMMAND_REG,
  DRAW_USAGE_TEXT,
  buildImageRequestPayload,
  extractOutputImages,
  generateImages,
  parseDrawPrompt,
  toDrawConfig,
} from '../src/utils/draw'

test('parseDrawPrompt extracts text after #draw', () => {
  const match = '#draw cat'.match(DRAW_COMMAND_REG)

  assert.equal(match?.[1], 'cat')
  assert.equal(parseDrawPrompt('#draw cat with sunglasses'), 'cat with sunglasses')
  assert.equal(parseDrawPrompt('#draw    '), '')
})

test('buildImageRequestPayload omits image and n when unnecessary', () => {
  const payload = buildImageRequestPayload({
    prompt: 'hello',
    images: [],
    options: toDrawConfig({
      baseUrl: 'https://example.com',
      apiKey: 'sk-test',
      endpoint: '/v1/images/generations',
      model: 'gpt-image-2',
      requestTimeoutSeconds: 600,
      moderation: 'low',
      background: 'auto',
      outputFormat: 'png',
      quality: 'high',
      size: '2160x3840',
      n: 1,
    }),
  })

  assert.deepEqual(payload, {
    model: 'gpt-image-2',
    prompt: 'hello',
    moderation: 'low',
    background: 'auto',
    output_format: 'png',
    quality: 'high',
    size: '2160x3840',
  })
})

test('extractOutputImages prefers b64 then url entries', () => {
  const output = extractOutputImages({
    data: [
      { b64_json: 'ZmFrZQ==' },
      { url: 'https://cdn.example.com/image.png' },
    ],
  })

  assert.deepEqual(output, [
    'base64://ZmFrZQ==',
    'https://cdn.example.com/image.png',
  ])
})

test('generateImages reports a clear timeout error', async () => {
  const server = http.createServer((_req, res) => {
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ data: [{ url: 'https://cdn.example.com/image.png' }] }))
    }, 1500)
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo

  try {
    await assert.rejects(
      generateImages('hello', [], toDrawConfig({
        baseUrl: `http://127.0.0.1:${address?.port}`,
        apiKey: 'sk-test',
        endpoint: '/v1/images/generations',
        requestTimeoutSeconds: 1,
      })),
      /接口请求超时/,
    )
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('DRAW_USAGE_TEXT stays user-facing and compact', () => {
  assert.match(DRAW_USAGE_TEXT, /#draw 提示词/)
  assert.match(DRAW_USAGE_TEXT, /引用图片/)
})

test('toDrawConfig fills missing values from code defaults', () => {
  const config = toDrawConfig({})

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
})
