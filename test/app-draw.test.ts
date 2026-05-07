import test from 'node:test'
import assert from 'node:assert/strict'

import { handleDrawMessage } from '../src/apps/draw'
import type { DrawConfig } from '../src/utils/draw'

function createConfig (overrides: Partial<DrawConfig> = {}): DrawConfig {
  return {
    name: '配置一',
    apiMode: 'images',
    apiKey: 'sk-test',
    baseUrl: 'https://example.com',
    endpoint: '/v1/images/generations',
    model: 'gpt-image-2',
    imageDetail: 'high',
    taskLockEnabled: true,
    cooldownSeconds: 180,
    requestTimeoutSeconds: 600,
    moderation: 'auto',
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

test('handleDrawMessage temporarily uses transparent background for #tpdraw', async () => {
  const replies: unknown[] = []
  let generateArgs: { prompt: string, background?: string } | null = null

  const result = await handleDrawMessage({
    msg: '#tpdraw 透明贴纸',
    image: [],
    reply: async (message: unknown) => {
      replies.push(message)
    },
  }, {
    getConfig: () => createConfig({ background: 'auto' }),
    transformConfig: (config) => ({ ...config, background: 'transparent' }),
    resolveImages: async (images) => [...images],
    generate: async (prompt, _images, config) => {
      generateArgs = { prompt, background: config.background }
      return ['https://cdn.example.com/output.png']
    },
  })

  assert.equal(result, true)
  assert.deepEqual(generateArgs, {
    prompt: '透明贴纸',
    background: 'transparent',
  })
  assert.deepEqual(replies[0], ['https://cdn.example.com/output.png'])
})

test('handleDrawMessage uses images from replied message for image-to-image mode', async () => {
  const replies: unknown[] = []
  let generateArgs: { prompt: string, images: string[] } | null = null

  const result = await handleDrawMessage({
    msg: '#draw 加一顶帽子',
    image: [],
    replyId: 'reply-message-id',
    contact: {
      scene: 'group',
      peer: '10000',
      name: 'test-group',
    },
    bot: {
      getMsg: async (_contact, messageId) => {
        assert.equal(messageId, 'reply-message-id')
        return {
          elements: [
            {
              type: 'image',
              file: 'https://cdn.example.com/replied.png',
            },
          ],
        }
      },
    },
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
    prompt: '加一顶帽子',
    images: ['resolved:https://cdn.example.com/replied.png'],
  })
  assert.deepEqual(replies[0], ['https://cdn.example.com/output.png'])
})

test('handleDrawMessage blocks while another draw task is running', async () => {
  const replies: unknown[] = []
  const taskState = { running: false }
  let releaseGenerate: (() => void) | undefined
  let generateCount = 0

  const firstTask = handleDrawMessage({
    msg: '#draw 第一张',
    image: [],
    reply: async (message: unknown) => {
      replies.push(message)
    },
  }, {
    getConfig: () => createConfig(),
    resolveImages: async (images: readonly string[]) => [...images],
    generate: async () => {
      generateCount += 1
      await new Promise<void>(resolve => {
        releaseGenerate = resolve
      })
      return ['https://cdn.example.com/output.png']
    },
    taskState,
  })

  await handleDrawMessage({
    msg: '#draw 第二张',
    image: [],
    reply: async (message: unknown) => {
      replies.push(message)
    },
  }, {
    getConfig: () => createConfig(),
    resolveImages: async (images: readonly string[]) => [...images],
    generate: async () => {
      generateCount += 1
      return ['https://cdn.example.com/second.png']
    },
    taskState,
  })

  assert.equal(generateCount, 1)
  assert.match(String(replies[0]), /已有绘图任务正在执行/)

  releaseGenerate?.()
  await firstTask

  assert.equal(taskState.running, false)
  assert.deepEqual(replies[1], ['https://cdn.example.com/output.png'])
})

test('handleDrawMessage releases draw task after failure', async () => {
  const replies: unknown[] = []
  const taskState = { running: false }
  let generateCount = 0

  const deps = {
    getConfig: () => createConfig(),
    resolveImages: async (images: readonly string[]) => [...images],
    generate: async () => {
      generateCount += 1
      if (generateCount === 1) {
        throw new Error('boom')
      }

      return ['https://cdn.example.com/output.png']
    },
    taskState,
  }

  await handleDrawMessage({
    msg: '#draw 第一张',
    image: [],
    reply: async (message: unknown) => {
      replies.push(message)
    },
  }, deps)

  assert.equal(taskState.running, false)
  assert.match(String(replies[0]), /绘图失败/)

  await handleDrawMessage({
    msg: '#draw 第二张',
    image: [],
    reply: async (message: unknown) => {
      replies.push(message)
    },
  }, deps)

  assert.equal(generateCount, 2)
  assert.deepEqual(replies[1], ['https://cdn.example.com/output.png'])
})

test('handleDrawMessage allows concurrent draw tasks when task lock is disabled', async () => {
  const replies: unknown[] = []
  const taskState = { running: false }
  let generateCount = 0

  const deps = {
    getConfig: () => createConfig({ taskLockEnabled: false }),
    resolveImages: async (images: readonly string[]) => [...images],
    generate: async () => {
      generateCount += 1
      return ['https://cdn.example.com/output.png']
    },
    taskState,
  }

  await handleDrawMessage({
    msg: '#draw 第一张',
    image: [],
    reply: async (message: unknown) => {
      replies.push(message)
    },
  }, deps)

  taskState.running = true

  await handleDrawMessage({
    msg: '#draw 第二张',
    image: [],
    reply: async (message: unknown) => {
      replies.push(message)
    },
  }, deps)

  assert.equal(generateCount, 2)
  assert.deepEqual(replies, [
    ['https://cdn.example.com/output.png'],
    ['https://cdn.example.com/output.png'],
  ])
})
