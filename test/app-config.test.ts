import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatDrawHelpMenu,
  formatDrawProfileList,
  formatDrawSizeList,
  handleDrawHelpMessage,
  handleShowDrawConfigMessage,
  handleShowDrawSizeMessage,
  handleSwitchDrawConfigMessage,
  handleSwitchDrawSizeMessage,
} from '../src/apps/config'
import type { DrawProfileId, DrawSettings } from '../src/utils/config'
import { toDrawConfig, type DrawConfig } from '../src/utils/draw'

function createSettings (activeProfile: DrawProfileId = 'profile2'): DrawSettings {
  return {
    activeProfile,
    global: toDrawConfig({ name: '全局配置' }),
    profiles: {
      profile1: toDrawConfig({ name: '配置一' }),
      profile2: toDrawConfig({ name: '图生图配置', size: '2560x1440' }),
      profile3: toDrawConfig({ name: '备用配置' }),
    },
    rawGlobal: {},
    rawProfiles: {
      profile1: { name: '配置一' },
      profile2: { name: '图生图配置' },
      profile3: { name: '备用配置' },
    },
  }
}

test('formatDrawHelpMenu includes command descriptions', () => {
  const menu = formatDrawHelpMenu()

  assert.match(menu, /#draw 提示词/)
  assert.match(menu, /#tpdraw 提示词/)
  assert.match(menu, /#配置/)
  assert.match(menu, /#切换配置1/)
  assert.match(menu, /#分辨率/)
  assert.match(menu, /#切换分辨率1/)
})

test('formatDrawProfileList marks active profile with hash', () => {
  assert.equal(formatDrawProfileList(createSettings()), [
    '绘图配置：',
    '1. 配置一',
    '2. 图生图配置 #',
    '3. 备用配置',
  ].join('\n'))
})

test('formatDrawSizeList marks active size with hash', () => {
  assert.equal(formatDrawSizeList(createSettings()), [
    '绘图分辨率：',
    '1. 头像 / 主图 1024x1024（1K）',
    '2. 横版封面 / PPT 1536x1024（1.5K）',
    '3. 竖版手机海报 1024x1536（1.5K）',
    '4. 电脑壁纸 2560x1440（2K） #',
    '5. 高清横版海报 3840x2160（4K）',
    '6. 高清竖版海报 2160x3840（4K）',
  ].join('\n'))
})

test('handleDrawHelpMessage replies help menu', async () => {
  const replies: unknown[] = []

  const result = await handleDrawHelpMessage({
    msg: '#help',
    reply: async (message: unknown) => {
      replies.push(message)
    },
  })

  assert.equal(result, true)
  assert.match(String(replies[0]), /AI 绘图命令/)
  assert.match(String(replies[0]), /#切换分辨率1/)
})

test('handleShowDrawConfigMessage replies profile list', async () => {
  const replies: unknown[] = []

  const result = await handleShowDrawConfigMessage({
    msg: '#配置',
    hasPermission: () => true,
    reply: async (message: unknown) => {
      replies.push(message)
    },
  }, {
    getSettings: () => createSettings('profile1'),
  })

  assert.equal(result, true)
  assert.equal(replies.length, 1)
  assert.match(String(replies[0]), /1\. 配置一 #/)
  assert.match(String(replies[0]), /2\. 图生图配置/)
})

test('config management commands reject users without admin permission', async () => {
  const replies: unknown[] = []
  let switchCalled = false

  const result = await handleSwitchDrawConfigMessage({
    msg: '#切换配置1',
    hasPermission: () => false,
    reply: async (message: unknown) => {
      replies.push(message)
    },
  }, {
    switchProfile: async (profileId) => {
      switchCalled = true
      return createSettings(profileId)
    },
  })

  assert.equal(result, true)
  assert.equal(switchCalled, false)
  assert.match(String(replies[0]), /只有管理员或群主/)
})

test('handleShowDrawSizeMessage replies size list', async () => {
  const replies: unknown[] = []

  const result = await handleShowDrawSizeMessage({
    msg: '#分辨率',
    hasPermission: () => true,
    reply: async (message: unknown) => {
      replies.push(message)
    },
  }, {
    getSettings: () => createSettings('profile2'),
  })

  assert.equal(result, true)
  assert.match(String(replies[0]), /绘图分辨率/)
  assert.match(String(replies[0]), /电脑壁纸 2560x1440（2K） #/)
})

test('handleSwitchDrawConfigMessage switches by 1-based index', async () => {
  const replies: unknown[] = []
  let switchedProfile: DrawProfileId | undefined

  const result = await handleSwitchDrawConfigMessage({
    msg: '#切换配置3',
    hasPermission: () => true,
    reply: async (message: unknown) => {
      replies.push(message)
    },
  }, {
    getSettings: () => createSettings('profile1'),
    switchProfile: async (profileId) => {
      switchedProfile = profileId
      return createSettings(profileId)
    },
  })

  assert.equal(result, true)
  assert.equal(switchedProfile, 'profile3')
  assert.equal(replies[0], '已切换到配置3：备用配置')
})

test('handleSwitchDrawSizeMessage switches current profile size by 1-based index', async () => {
  const replies: unknown[] = []
  let savedInput: { size: string } | undefined

  const result = await handleSwitchDrawSizeMessage({
    msg: '#切换分辨率5',
    hasPermission: () => true,
    reply: async (message: unknown) => {
      replies.push(message)
    },
  }, {
    saveConfig: async (input) => {
      savedInput = input
      return toDrawConfig({ name: '图生图配置', size: input.size }) as DrawConfig
    },
  })

  assert.equal(result, true)
  assert.deepEqual(savedInput, { size: '3840x2160' })
  assert.equal(replies[0], '已切换分辨率5：高清横版海报 3840x2160（4K）（当前配置：图生图配置）')
})

test('handleSwitchDrawSizeMessage rejects invalid index', async () => {
  const replies: unknown[] = []
  let saveCalled = false

  const result = await handleSwitchDrawSizeMessage({
    msg: '#切换分辨率9',
    hasPermission: () => true,
    reply: async (message: unknown) => {
      replies.push(message)
    },
  }, {
    saveConfig: async (input) => {
      saveCalled = true
      return toDrawConfig({ size: input.size })
    },
  })

  assert.equal(result, true)
  assert.equal(saveCalled, false)
  assert.match(String(replies[0]), /分辨率编号不存在/)
})

test('handleSwitchDrawConfigMessage rejects invalid index', async () => {
  const replies: unknown[] = []
  let switchCalled = false

  const result = await handleSwitchDrawConfigMessage({
    msg: '#切换配置4',
    hasPermission: () => true,
    reply: async (message: unknown) => {
      replies.push(message)
    },
  }, {
    switchProfile: async (profileId) => {
      switchCalled = true
      return createSettings(profileId)
    },
  })

  assert.equal(result, true)
  assert.equal(switchCalled, false)
  assert.match(String(replies[0]), /配置编号不存在/)
})
