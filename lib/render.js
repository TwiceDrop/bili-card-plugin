import fs from 'node:fs/promises'
import path from 'node:path'

const pluginName = 'bili-card-plugin'

/**
 * 调用 TRSS-Yunzai 渲染卡片，并在结束后删除本次生成的临时 HTML。
 *
 * TRSS-Yunzai 会把模板写到 temp/html/<插件>/<模板>/<saveId>.html 且从不清理；
 * 卡片的 saveId 每次都带时间戳、图片又以 base64 内嵌，不删的话磁盘会被很快占满。
 */
export async function renderCardImage(runtime, templateName, data, { cwd = process.cwd() } = {}) {
  const tpl = `bilibili/${templateName}`
  try {
    return await runtime.render(pluginName, tpl, data, { retType: 'base64' })
  } finally {
    await removeRenderedHtml(cwd, tpl, data?.saveId)
  }
}

async function removeRenderedHtml(cwd, tpl, saveId) {
  if (!saveId) return
  const dir = path.resolve(cwd, 'temp', 'html', pluginName, tpl)
  const file = path.resolve(dir, `${saveId}.html`)
  if (path.dirname(file) !== dir) return
  await fs.rm(file, { force: true }).catch(error => {
    globalThis.logger?.warn?.(`[${pluginName}] 删除临时 HTML 失败：${error?.message || error}`)
  })
}
