import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  extractBiliTarget,
  extractVideoId,
  fetchDynamicInfo,
  formatDuration,
  formatNumber,
  readBiliDynamicPushCookie,
  resolveBiliInput,
  truncateText,
} from '../lib/bilibili.js'

test('识别 B23、完整链接、BV 和 AV', () => {
  assert.deepEqual(extractVideoId('https://b23.tv/CkBsIWR'), {
    type: 'short',
    url: 'https://b23.tv/CkBsIWR',
  })
  assert.deepEqual(extractVideoId('https://www.bilibili.com/video/BV1sbgG6MEgp?p=1'), {
    type: 'bvid',
    bvid: 'BV1sbgG6MEgp',
  })
  assert.deepEqual(extractVideoId('看看 BV1sbgG6MEgp 这个'), {
    type: 'bvid',
    bvid: 'BV1sbgG6MEgp',
  })
  assert.deepEqual(extractVideoId('av123456'), { type: 'aid', aid: '123456' })
})

test('自动读取 bili-dynamic-push 登录 Cookie 并用于动态请求', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bili-card-cookie-'))
  const dataDir = path.join(root, 'data', 'bili-dynamic-push')
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(
    path.join(dataDir, 'config.json'),
    JSON.stringify({ biliCookie: 'SESSDATA=test-session; bili_jct=test-csrf; DedeUserID=10001' }),
  )

  const originalFetch = globalThis.fetch
  let sentCookie = ''
  globalThis.fetch = async (_url, options) => {
    sentCookie = new Headers(options?.headers).get('cookie') || ''
    return new Response(
      JSON.stringify({ code: 0, data: { item: { id_str: '1135409428313407505' } } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }
  try {
    assert.equal(
      readBiliDynamicPushCookie(root),
      'SESSDATA=test-session; bili_jct=test-csrf; DedeUserID=10001',
    )
    await fetchDynamicInfo('1135409428313407505', 1000, { rootDir: root })
    assert.equal(sentCookie, 'SESSDATA=test-session; bili_jct=test-csrf; DedeUserID=10001')
  } finally {
    globalThis.fetch = originalFetch
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('动态 API 触发风控时从 Opus 页面读取真实数据', async () => {
  const dynamicId = '1135409428313407505'
  const detail = { id_str: dynamicId, type: 0, modules: [] }
  const originalFetch = globalThis.fetch
  let requests = 0
  globalThis.fetch = async () => {
    requests++
    if (requests === 1) {
      return new Response(JSON.stringify({ code: -352, message: '风控校验失败' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(
      `<html><script>window.__INITIAL_STATE__=${JSON.stringify({ detail })};(function(){})();</script></html>`,
      { status: 200, headers: { 'content-type': 'text/html' } },
    )
  }
  try {
    assert.deepEqual(await fetchDynamicInfo(dynamicId), detail)
    assert.equal(requests, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('识别 Opus、旧动态链接并解析动态短链', async () => {
  assert.deepEqual(extractBiliTarget('https://www.bilibili.com/opus/1138686642968592392'), {
    kind: 'dynamic',
    dynamicId: '1138686642968592392',
  })
  assert.deepEqual(extractBiliTarget('https://t.bilibili.com/1134962906338689047'), {
    kind: 'dynamic',
    dynamicId: '1134962906338689047',
  })

  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(null, {
      status: 302,
      headers: { location: 'https://www.bilibili.com/opus/1134962906338689047' },
    })
  try {
    assert.deepEqual(await resolveBiliInput('https://b23.tv/AbCd123'), {
      kind: 'dynamic',
      dynamicId: '1134962906338689047',
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('格式化统计与时长', () => {
  assert.equal(formatNumber(101234), '10.1万')
  assert.equal(formatNumber(100000000), '1亿')
  assert.equal(formatDuration(1617), '26:57')
  assert.equal(formatDuration(3661), '1:01:01')
})

test('按 Unicode 字符安全截断', () => {
  assert.equal(truncateText('你好世界测试', 5), '你好世界…')
})
