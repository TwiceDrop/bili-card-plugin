import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const template = fs.readFileSync(path.join(root, 'resources', 'bilibili', 'card.html'), 'utf8')
const dynamicTemplate = fs.readFileSync(
  path.join(root, 'resources', 'bilibili', 'dynamic.html'),
  'utf8',
)
const liveTemplate = fs.readFileSync(path.join(root, 'resources', 'bilibili', 'live.html'), 'utf8')
const pushService = fs.readFileSync(path.join(root, 'lib', 'push.js'), 'utf8')
const app = fs.readFileSync(path.join(root, 'apps', 'BiliCard.js'), 'utf8')

test('封面只显示 B站原图，不创建标题覆盖层', () => {
  assert.doesNotMatch(template, /class=["']headline/)
  assert.doesNotMatch(template, /headlineLines|headlineSize|headlineFirstSize/)
  assert.doesNotMatch(app, /headlineLines|headlineSize|headlineFirstSize|buildHeadline/)
})

test('顶部昵称和头像来自视频 UP 主', () => {
  assert.match(app, /ownerDisplayName:\s*truncateText\(video\.owner\?\.name/)
  assert.match(app, /fetchImageAsDataUrl\(video\.owner\?\.face/)
  assert.doesNotMatch(app, /sender\?\.|member\?\.|qlogo/)
})

test('视频顶部显示 B站发布时间，不使用消息发送时间', () => {
  assert.match(app, /formatDateTime\(video\.pubdate\s*\|\|\s*video\.ctime\)/)
  assert.doesNotMatch(app, /shareTime:\s*formatDateTime\(this\.e\.time/)
})

test('动态顶部使用动态 UP 主，不读取 QQ 发送人', () => {
  assert.match(app, /renderDynamicCardForPush\(dynamicId/)
  assert.match(pushService, /authorName:\s*truncateText\(dynamic\.authorName/)
  assert.match(pushService, /fetchImageAsDataUrl\(dynamic\.authorFaceUrl/)
  assert.match(dynamicTemplate, /class=["']author-name["']>{{authorName}}/)
  assert.doesNotMatch(`${dynamicTemplate}\n${pushService}`, /sender|member|qlogo|user_id/)
})

test('开播卡使用真实 UP 主与直播封面', () => {
  assert.match(pushService, /liveInfo\.uname/)
  assert.match(pushService, /liveInfo\.face/)
  assert.match(pushService, /liveInfo\.keyframe\s*\|\|\s*liveInfo\.cover_from_user/)
  assert.match(liveTemplate, /class=["']author-name["']>{{authorName}}/)
  assert.match(liveTemplate, /class=["']cover["'] src=["']{{coverDataUrl}}/)
})
