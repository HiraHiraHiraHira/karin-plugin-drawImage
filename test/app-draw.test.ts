import test from 'node:test'
import assert from 'node:assert/strict'

import { handleDrawMessage } from '../src/apps/draw'
import type { DrawConfig } from '../src/utils/draw'

function createConfig (overrides: Partial<DrawConfig> = {}): DrawConfig {
  return {
    apiKey: 'sk-test',
    baseUrl: 'https://example.com',
    endpoint: '/v1/images/generations',
    model: 'gpt-image-2',
    cooldownSeconds: 180,
    background: 'auto',
    outputFormat: 'png',
    quality: 'high',
    size: '1024x1024',
    n: 1,
    ...overrides,
  }
}

test('handleDrawMessage replies with usage text when prompt is missing', async () => {
  const replies: unknown[] = []

  const result = await handleDrawMessage({
    msg: '#draw   ',
    image: [],
    reply: async (message: unknown) => {
      replies.push(message)
    },
  }, {
    getConfig: () => createConfig(),
    resolveImages: async (images) => [...images],
    generate: async () => [],
  })

  assert.equal(result, true)
  assert.equal(replies.length, 1)
  assert.match(String(replies[0]), /#draw 提示词/)
})

test('handleDrawMessage blocks when apiKey is missing', async () => {
  const replies: unknown[] = []

  const result = await handleDrawMessage({
    msg: '#draw 改成黑发',
    image: [],
    reply: async (message: unknown) => {
      replies.push(message)
    },
  }, {
    getConfig: () => createConfig({ apiKey: '' }),
    resolveImages: async (images) => [...images],
    generate: async () => [],
  })

  assert.equal(result, true)
  assert.equal(replies.length, 1)
  assert.match(String(replies[0]), /未配置绘图密钥/)
})

test('handleDrawMessage sends generated images for image-to-image mode', async () => {
  const replies: unknown[] = []
  let generateArgs: { prompt: string, images: string[] } | null = null

  const result = await handleDrawMessage({
    msg: '#draw 改成黑发',
    image: ['https://cdn.example.com/input.png'],
    reply: async (message: unknown) => {
      replies.push(message)
    },
  }, {
    getConfig: () => createConfig(),
    resolveImages: async (images) => images.map(item => `resolved:${item}`),
    generate: async (prompt, images) => {
      generateArgs = { prompt, images }
      return ['https://cdn.example.com/output.png']
    },
  })

  assert.equal(result, true)
  assert.deepEqual(generateArgs, {
    prompt: '改成黑发',
    images: ['resolved:https://cdn.example.com/input.png'],
  })
  assert.equal(replies.length, 1)
  assert.deepEqual(replies[0], ['https://cdn.example.com/output.png'])
})

test('handleDrawMessage applies per-user cooldown even after failure', async () => {
  const replies: unknown[] = []
  let now = 1_000

  const deps = {
    getConfig: () => createConfig({ cooldownSeconds: 180 }),
    resolveImages: async (images: readonly string[]) => [...images],
    generate: async () => {
      throw new Error('boom')
    },
    now: () => now,
  }

  await handleDrawMessage({
    msg: '#draw 第一张',
    image: [],
    userId: '10001',
    reply: async (message: unknown) => {
      replies.push(message)
    },
  }, deps)

  assert.match(String(replies[0]), /绘图失败/)

  now += 1_000

  await handleDrawMessage({
    msg: '#draw 第二张',
    image: [],
    userId: '10001',
    reply: async (message: unknown) => {
      replies.push(message)
    },
  }, deps)

  assert.match(String(replies[1]), /冷却/)
  assert.match(String(replies[1]), /179/)
})

test('handleDrawMessage cooldown is isolated per user', async () => {
  const repliesA: unknown[] = []
  const repliesB: unknown[] = []
  let generateCount = 0

  const deps = {
    getConfig: () => createConfig({ cooldownSeconds: 180 }),
    resolveImages: async (images: readonly string[]) => [...images],
    generate: async () => {
      generateCount += 1
      return ['https://cdn.example.com/output.png']
    },
    now: () => 10_000,
  }

  await handleDrawMessage({
    msg: '#draw A',
    image: [],
    userId: 'user-a',
    reply: async (message: unknown) => {
      repliesA.push(message)
    },
  }, deps)

  await handleDrawMessage({
    msg: '#draw B',
    image: [],
    userId: 'user-b',
    reply: async (message: unknown) => {
      repliesB.push(message)
    },
  }, deps)

  assert.equal(generateCount, 2)
  assert.equal(repliesA.length, 1)
  assert.equal(repliesB.length, 1)
})
