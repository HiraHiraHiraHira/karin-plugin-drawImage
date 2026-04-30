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

test('buildImageRequestPayload uses chat completions content for chat mode', () => {
  const payload = buildImageRequestPayload({
    prompt: '把这张图改成赛博朋克风格',
    images: ['https://cdn.example.com/input.png'],
    options: toDrawConfig({
      apiMode: 'chatCompletions',
      baseUrl: 'https://example.com',
      apiKey: 'sk-test',
      model: 'gpt-5.4',
      imageDetail: 'high',
    }),
  })

  assert.deepEqual(payload, {
    model: 'gpt-5.4',
    stream: true,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: '把这张图改成赛博朋克风格' },
          {
            type: 'image_url',
            image_url: {
              url: 'https://cdn.example.com/input.png',
              detail: 'high',
            },
          },
        ],
      },
    ],
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

test('extractOutputImages reads chat completion image links', () => {
  const output = extractOutputImages({
    choices: [
      {
        message: {
          content: '完成：![image](https://cdn.example.com/output.png)\nbase64://ZmFrZQ==',
        },
      },
    ],
  })

  assert.deepEqual(output, [
    'https://cdn.example.com/output.png',
    'base64://ZmFrZQ==',
  ])
})

test('extractOutputImages keeps markdown image result and ignores download link', () => {
  const output = extractOutputImages({
    choices: [
      {
        message: {
          content: [
            '> 🎨 生成中...',
            '',
            '![https://pro.filesystem.site/cdn/20260430/demo.png](https://pro.filesystem.site/cdn/20260430/demo.png)',
            '',
            '[点击下载](https://pro.filesystem.site/cdn/download/20260430/demo.png)',
          ].join('\n'),
        },
      },
    ],
  })

  assert.deepEqual(output, [
    'https://pro.filesystem.site/cdn/20260430/demo.png',
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

test('generateImages reports non-json api responses clearly', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end('<html><h1>Bad Gateway</h1></html>')
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo

  try {
    await assert.rejects(
      generateImages('hello', [], toDrawConfig({
        baseUrl: `http://127.0.0.1:${address?.port}`,
        apiKey: 'sk-test',
        endpoint: '/v1/images/generations',
        requestTimeoutSeconds: 3,
      })),
      /接口返回非 JSON 响应: 502 Bad Gateway.*text\/html.*Bad Gateway/,
    )
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('generateImages aggregates streaming chat completion responses', async () => {
  const server = http.createServer((req, res) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', () => {
      const parsed = JSON.parse(body)
      assert.equal(parsed.stream, true)
      assert.equal(parsed.messages?.[0]?.content?.[0]?.type, 'text')
      assert.equal(parsed.messages?.[0]?.content?.[1]?.type, 'image_url')

      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write('data: {"choices":[{"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n')
      res.write('data: {"choices":[{"delta":{"content":"> 🎨 生成中...\\n\\n![image](https://cdn.example.com/stream.png)\\n\\n[点击下载](https://cdn.example.com/download.png)"},"finish_reason":null}]}\n\n')
      res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n')
      res.write('data: [DONE]\n\n')
      res.end()
    })
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo

  try {
    const output = await generateImages('给她换个背景', ['https://cdn.example.com/input.png'], toDrawConfig({
      apiMode: 'chatCompletions',
      baseUrl: `http://127.0.0.1:${address?.port}`,
      apiKey: 'sk-test',
      model: 'openai-image-2-4k',
      requestTimeoutSeconds: 3,
    }))

    assert.deepEqual(output, [
      'https://cdn.example.com/stream.png',
    ])
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
  assert.equal(config.apiMode, 'images')
  assert.equal(config.imageDetail, 'high')
  assert.equal(config.cooldownSeconds, 180)
  assert.equal(config.requestTimeoutSeconds, 600)
  assert.equal(config.moderation, 'auto')
  assert.equal(config.background, 'auto')
  assert.equal(config.outputFormat, 'png')
  assert.equal(config.quality, 'high')
  assert.equal(config.size, '2160x3840')
  assert.equal(config.n, 1)
})

test('toDrawConfig uses chat completions endpoint by mode', () => {
  const config = toDrawConfig({
    apiMode: 'chatCompletions',
    endpoint: '/v1/images/generations',
    model: 'gpt-5.4',
  })

  assert.equal(config.apiMode, 'chatCompletions')
  assert.equal(config.endpoint, '/v1/chat/completions')
  assert.equal(config.imageDetail, 'high')
})

test('toDrawConfig only uses custom endpoint in custom mode', () => {
  const config = toDrawConfig({
    apiMode: 'custom',
    endpoint: 'v1/custom/images',
  })

  assert.equal(config.apiMode, 'custom')
  assert.equal(config.endpoint, '/v1/custom/images')
})
