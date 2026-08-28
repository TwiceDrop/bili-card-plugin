import assert from 'node:assert/strict'
import test from 'node:test'
import { dynamicGalleryClass, normalizeDynamicItem } from '../lib/dynamic.js'

test('规范化图文动态、UP资料、统计、图片和附加卡片', () => {
  const result = normalizeDynamicItem(
    {
      id_str: '1134962906338689047',
      type: 'DYNAMIC_TYPE_DRAW',
      modules: {
        module_author: {
          name: '测试UP主',
          face: 'https://i0.hdslb.com/avatar.jpg',
          pub_time: '刚刚',
          pub_ts: 1787412345,
        },
        module_dynamic: {
          topic: { name: '原神' },
          major: {
            type: 'MAJOR_TYPE_OPUS',
            opus: {
              title: '动态标题',
              summary: {
                paragraphs: [
                  {
                    text: {
                      nodes: [
                        { word: { words: '第一段文字' } },
                        { rich: { text: '#原神#' } },
                      ],
                    },
                  },
                  { text: { nodes: [{ word: { words: '第二段文字' } }] } },
                ],
              },
              pics: [
                { url: 'http://i0.hdslb.com/1.jpg' },
                { url: 'http://i0.hdslb.com/2.jpg' },
              ],
            },
          },
          additional: {
            type: 'ADDITIONAL_TYPE_UPOWER_LOTTERY',
            upower_lottery: {
              title: '互动抽奖',
              desc: { text: '随机周边' },
              hint: { text: '关注并转发' },
            },
          },
        },
        module_stat: {
          like: { count: 123 },
          comment: { count: 45 },
          forward: { count: 67 },
        },
      },
    },
    { contentMaxLength: 5000, imageLimit: 9 },
  )

  assert.equal(result.authorName, '测试UP主')
  assert.equal(result.title, '动态标题')
  assert.equal(result.content, '第一段文字#原神#\n\n第二段文字')
  assert.deepEqual(result.pictureUrls, [
    'http://i0.hdslb.com/1.jpg',
    'http://i0.hdslb.com/2.jpg',
  ])
  assert.equal(result.additional.label, '互动抽奖')
  assert.equal(result.likeCount, 123)
  assert.equal(dynamicGalleryClass(result.pictureUrls.length), 'count-2')
})

test('规范化 Opus 页面的模块数组、段落图片与预约卡', () => {
  const result = normalizeDynamicItem({
    id_str: '1135409428313407505',
    type: 0,
    modules: [
      { module_title: { text: '页面动态标题' } },
      {
        module_author: {
          name: '真实UP主',
          face: 'https://i0.hdslb.com/face.jpg',
          pub_ts: '1787412345',
        },
      },
      {
        module_content: {
          paragraphs: [
            { text: { nodes: [{ word: { words: '第一段' } }, { rich: { text: '@好友 ' } }] } },
            {
              pic: {
                pics: [
                  { url: 'http://i0.hdslb.com/a.jpg' },
                  { url: 'http://i0.hdslb.com/b.jpg' },
                ],
              },
            },
            {
              link_card: {
                card: {
                  reserve: {
                    title: '直播预约',
                    desc1: { text: '今晚 8 点' },
                    desc2: { text: '100人预约' },
                  },
                },
              },
            },
          ],
        },
      },
      {
        module_stat: {
          like: { count: 9 },
          comment: { count: 8 },
          forward: { count: 7 },
        },
      },
    ],
  })

  assert.equal(result.authorName, '真实UP主')
  assert.equal(result.title, '页面动态标题')
  assert.equal(result.content, '第一段@好友')
  assert.deepEqual(result.pictureUrls, [
    'http://i0.hdslb.com/a.jpg',
    'http://i0.hdslb.com/b.jpg',
  ])
  assert.equal(result.additional.label, '预约')
  assert.equal(result.additional.title, '直播预约')
  assert.equal(result.typeLabel, '图文动态')
  assert.deepEqual([result.likeCount, result.commentCount, result.forwardCount], [9, 8, 7])
})
