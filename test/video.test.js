import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fetchVideoInfo } from '../lib/bilibili.js'

const video = {
  bvid: 'BV1sbgG6MEgp',
  aid: 123456,
  title: '原视频标题 } 和 "引号"',
  pic: 'https://i0.hdslb.com/bfs/archive/test.jpg',
  owner: { name: '视频UP', face: 'https://i0.hdslb.com/bfs/face/test.jpg' },
  pubdate: 1787543379,
  duration: 1617,
  stat: { view: 12345, danmaku: 211, like: 1000 },
}
const videoId = { type: 'bvid', bvid: video.bvid }
const cookie = 'SESSDATA=test-session; bili_jct=test-csrf'

function page(data = video) {
  return new Response(
    `<script>window.__INITIAL_STATE__ = \n${JSON.stringify({ videoData: data })};throw new Error('不得执行网页脚本');</script>`,
    { headers: { 'content-type': 'text/html' } },
  )
}

function sharedRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bili-video-cookie-'))
  const dir = path.join(root, 'data', 'bili-dynamic-push')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ biliCookie: cookie }))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

test('视频接口成功时复用共享 Cookie，且不额外访问网页', async t => {
  const rootDir = sharedRoot(t)
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(String(url))
    assert.equal(new Headers(options.headers).get('cookie'), cookie)
    return Response.json({ code: 0, data: video })
  })
  assert.deepEqual(await fetchVideoInfo(videoId, 1000, { rootDir }), video)
  assert.deepEqual(requests, [`https://api.bilibili.com/x/web-interface/view?bvid=${video.bvid}`])
})

test('HTTP 412 后使用同一登录 Cookie 读取原视频网页，保留标题、封面、UP和发布时间', async t => {
  const rootDir = sharedRoot(t)
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(String(url))
    assert.equal(new Headers(options.headers).get('cookie'), cookie)
    return requests.length === 1 ? new Response('', { status: 412 }) : page()
  })
  assert.deepEqual(await fetchVideoInfo(videoId, 1000, { rootDir }), video)
  assert.equal(requests[1], `https://www.bilibili.com/video/${video.bvid}/`)
  assert.equal(requests.length, 2)
})

test('业务风控码 -352 和 -412 均会尝试网页备用解析', async t => {
  for (const code of [-352, -412]) {
    await t.test(String(code), async child => {
      let requests = 0
      child.mock.method(globalThis, 'fetch', async () => {
        requests++
        return requests === 1 ? Response.json({ code }) : page()
      })
      assert.deepEqual(await fetchVideoInfo(videoId, 1000, { cookie: '' }), video)
      assert.equal(requests, 2)
    })
  }
})

test('AV 网页跳转到对应 BV 页面后仍按 aid 校验原视频', async t => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(String(url))
    assert.equal(options.redirect, 'manual')
    if (requests.length === 1) return new Response('', { status: 412 })
    if (requests.length === 2) {
      return new Response(null, { status: 302, headers: { location: `/video/${video.bvid}/` } })
    }
    return page()
  })
  assert.deepEqual(await fetchVideoInfo({ type: 'aid', aid: '123456' }, 1000, { cookie }), video)
  assert.deepEqual(requests, [
    'https://api.bilibili.com/x/web-interface/view?aid=123456',
    'https://www.bilibili.com/video/av123456/',
    `https://www.bilibili.com/video/${video.bvid}/`,
  ])
})

test('不接受其他 BV 的页面数据或缺失 UP 资料的不完整数据', async t => {
  for (const data of [{ ...video, bvid: 'BV19s8Y6FEr6' }, { ...video, owner: {} }]) {
    await t.test(JSON.stringify(data.owner), async child => {
      let requests = 0
      child.mock.method(globalThis, 'fetch', async () => {
        requests++
        return requests === 1 ? new Response('', { status: 412 }) : page(data)
      })
      await assert.rejects(fetchVideoInfo(videoId, 1000, { cookie: '' }), /网页备用解析也未成功/)
    })
  }
})

test('接口和网页同时 412 时区分 Cookie 状态，错误消息不包含 Cookie', async t => {
  for (const value of ['', cookie]) {
    await t.test(value ? '已登录' : '未登录', async child => {
      child.mock.method(globalThis, 'fetch', async () => new Response('', { status: 412 }))
      await assert.rejects(fetchVideoInfo(videoId, 1000, { cookie: value }), error => {
        assert.match(error.message, /触发风控/)
        assert.match(error.message, value ? /已复用/ : /未发现登录 Cookie/)
        assert.equal(error.message.includes('test-session'), false)
        return true
      })
    })
  }
})

test('视频不存在、审核中和权限错误直接提示，不发起网页备用请求', async t => {
  for (const code of [-403, -404, 62002, 62004, 62012]) {
    await t.test(String(code), async child => {
      let requests = 0
      child.mock.method(globalThis, 'fetch', async () => {
        requests++
        return Response.json({ code })
      })
      await assert.rejects(fetchVideoInfo(videoId, 1000, { cookie: '' }))
      assert.equal(requests, 1)
    })
  }
})

test('不携带登录 Cookie 跟随网页的非 B站跳转', async t => {
  let requests = 0
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests++
    assert.equal(options.redirect, 'manual')
    assert.equal(new URL(url).hostname.endsWith('.bilibili.com'), true)
    return requests === 1
      ? new Response('', { status: 412 })
      : new Response(null, { status: 302, headers: { location: 'https://example.com/' } })
  })
  await assert.rejects(fetchVideoInfo(videoId, 1000, { cookie }), /网页备用解析也未成功/)
  assert.equal(requests, 2)
})
