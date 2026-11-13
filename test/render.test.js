import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { renderCardImage } from '../lib/render.js'

function yunzaiRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bili-render-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

// 模拟 TRSS-Yunzai：渲染时把 HTML 写到 temp/html/<插件>/<模板>/<saveId>.html，之后不删
function fakeRuntime(root, { fail = false } = {}) {
  const calls = []
  return {
    calls,
    async render(plugin, tpl, data, cfg) {
      calls.push({ plugin, tpl, data, cfg })
      const dir = path.join(root, 'temp', 'html', plugin, tpl)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `${data.saveId}.html`), '<html>data:image/png;base64,AAAA</html>')
      if (fail) throw new Error('截图失败')
      return 'base64://image'
    },
  }
}

const htmlPath = (root, tpl, saveId) =>
  path.join(root, 'temp', 'html', 'bili-card-plugin', 'bilibili', tpl, `${saveId}.html`)

test('渲染成功后删除本次生成的 HTML，并返回图片', async t => {
  const root = yunzaiRoot(t)
  const runtime = fakeRuntime(root)

  const image = await renderCardImage(runtime, 'dynamic', { saveId: 'dynamic-1-100' }, { cwd: root })

  assert.equal(image, 'base64://image')
  assert.deepEqual(runtime.calls[0].cfg, { retType: 'base64' })
  assert.equal(runtime.calls[0].tpl, 'bilibili/dynamic')
  assert.equal(fs.existsSync(htmlPath(root, 'dynamic', 'dynamic-1-100')), false)
})

test('渲染失败时也删除 HTML，并把错误抛出', async t => {
  const root = yunzaiRoot(t)
  const runtime = fakeRuntime(root, { fail: true })

  await assert.rejects(
    renderCardImage(runtime, 'live', { saveId: 'live-9-100' }, { cwd: root }),
    /截图失败/,
  )
  assert.equal(fs.existsSync(htmlPath(root, 'live', 'live-9-100')), false)
})

test('只删本次的 HTML，不碰同目录下其他渲染中的文件', async t => {
  const root = yunzaiRoot(t)
  const other = htmlPath(root, 'card', 'BV1-200')
  fs.mkdirSync(path.dirname(other), { recursive: true })
  fs.writeFileSync(other, '<html></html>')

  await renderCardImage(fakeRuntime(root), 'card', { saveId: 'BV1-100' }, { cwd: root })

  assert.equal(fs.existsSync(other), true)
})

test('saveId 带路径分隔符时不会删到模板目录之外', async t => {
  const root = yunzaiRoot(t)
  const outside = path.join(root, 'temp', 'html', 'bili-card-plugin', 'keep.html')
  fs.mkdirSync(path.dirname(outside), { recursive: true })
  fs.writeFileSync(outside, '<html></html>')
  const runtime = { render: async () => 'base64://image' }

  await renderCardImage(runtime, 'card', { saveId: '../../keep' }, { cwd: root })

  assert.equal(fs.existsSync(outside), true)
})
