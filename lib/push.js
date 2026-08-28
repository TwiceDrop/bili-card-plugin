import path from 'node:path'
import QRCode from 'qrcode'
import { getConfig, isAvailableFont } from './config.js'
import {
  fetchDynamicInfo,
  fetchImageAsDataUrl,
  formatDateTime,
  formatNumber,
  truncateText,
} from './bilibili.js'
import { dynamicGalleryClass, normalizeDynamicItem } from './dynamic.js'

function fontFormat(fileName) {
  const extension = path.extname(fileName || '').toLowerCase()
  return { '.ttf': 'truetype', '.otf': 'opentype', '.woff': 'woff', '.woff2': 'woff2' }[extension] || ''
}

function fontUrl(fileName) {
  return encodeURIComponent(fileName).replace(/%2F/gi, '').replace(/%5C/gi, '')
}

function fontRenderData(config) {
  const titleFontFile = isAvailableFont(config.titleFontFile) ? config.titleFontFile : ''
  const bodyFontFile = isAvailableFont(config.bodyFontFile) ? config.bodyFontFile : ''
  return {
    bodyFontFile,
    titleFontFile,
    bodyFontUrl: fontUrl(bodyFontFile),
    titleFontUrl: fontUrl(titleFontFile),
    bodyFontFormat: fontFormat(bodyFontFile),
    titleFontFormat: fontFormat(titleFontFile),
    bodyFontFamily: config.bodyFontFamily,
    titleFontFamily: config.titleFontFamily,
    bodyFontWeight: config.bodyFontWeight,
    titleFontWeight: config.titleFontWeight,
  }
}

async function resolveRuntime(options = {}) {
  const runtime = options.runtime || options.event?.runtime
  if (runtime?.render) return runtime

  try {
    const Runtime = (await import('../../../lib/plugins/runtime.js')).default
    return new Runtime(options.event || { reply: async () => false })
  } catch (error) {
    throw new Error(`无法初始化 TRSS-Yunzai 图片渲染器：${error?.message || error}`)
  }
}

async function renderCard(templateName, data, options) {
  const runtime = await resolveRuntime(options)
  const image = await runtime.render('bili-card-plugin', `bilibili/${templateName}`, data, {
    retType: 'base64',
  })
  if (!image) throw new Error(`B站${templateName === 'live' ? '直播' : '动态'} UI 卡片渲染失败`)
  return image
}

export async function renderDynamicCardForPush(dynamicId, options = {}) {
  const config = options.config || getConfig()
  const item =
    options.item || (await fetchDynamicInfo(dynamicId, config.requestTimeoutMs, options.fetchOptions))
  const dynamic = normalizeDynamicItem(item, {
    contentMaxLength: config.dynamicContentMaxLength,
    imageLimit: config.dynamicImageLimit,
  })
  const id = dynamic.id || String(dynamicId)
  const url = `https://www.bilibili.com/opus/${id}`
  const pictureData = await Promise.all(
    dynamic.pictureUrls.map(source => fetchImageAsDataUrl(source, config.requestTimeoutMs)),
  )
  const originalPictureData = dynamic.original
    ? await Promise.all(
        dynamic.original.pictureUrls.map(source =>
          fetchImageAsDataUrl(source, config.requestTimeoutMs),
        ),
      )
    : []
  const [avatarDataUrl, qrDataUrl, additionalCoverData] = await Promise.all([
    fetchImageAsDataUrl(dynamic.authorFaceUrl, config.requestTimeoutMs),
    QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 640,
      color: { dark: '#7650b5ff', light: '#ffffffff' },
    }),
    dynamic.additional?.coverUrl
      ? fetchImageAsDataUrl(dynamic.additional.coverUrl, config.requestTimeoutMs)
      : '',
  ])
  const pictures = pictureData.filter(Boolean)
  const originalPictures = originalPictureData.filter(Boolean)
  const kicker = [
    dynamic.additional?.label,
    dynamic.topicName ? `#${dynamic.topicName.replace(/^#|#$/g, '')}#` : '',
  ]
    .filter(Boolean)
    .join(' ')
  const original = dynamic.original
    ? {
        authorName: dynamic.original.authorName,
        title: dynamic.original.title,
        content: dynamic.original.content,
        pictures: originalPictures,
        galleryClass: dynamicGalleryClass(originalPictures.length),
      }
    : null
  const additional = dynamic.additional
    ? { ...dynamic.additional, coverDataUrl: additionalCoverData }
    : null
  const data = {
    saveId: `dynamic-${id}-${Date.now()}`,
    imgType: 'png',
    omitBackground: true,
    cardWidth: config.cardWidth,
    ...fontRenderData(config),
    authorName: truncateText(dynamic.authorName, 24),
    avatarFallback: Array.from(dynamic.authorName || 'B')[0] || 'B',
    publishTime: dynamic.publishTimestamp
      ? formatDateTime(dynamic.publishTimestamp)
      : dynamic.publishTime,
    avatarDataUrl,
    headerBackground: pictures[0] || avatarDataUrl,
    qrDataUrl,
    kicker,
    title: dynamic.title,
    content: dynamic.content,
    pictures,
    galleryClass: dynamicGalleryClass(pictures.length),
    original,
    additional,
    typeLabel: dynamic.typeLabel,
    dynamicId: id,
    likeCount: formatNumber(dynamic.likeCount),
    commentCount: formatNumber(dynamic.commentCount),
    forwardCount: formatNumber(dynamic.forwardCount),
  }

  return {
    image: await renderCard('dynamic', data, options),
    name: dynamic.authorName || '未知UP主',
    url,
    data,
  }
}

function liveStartTimestamp(value) {
  const numeric = Number(value || 0)
  if (Number.isFinite(numeric) && numeric > 0) return numeric
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export async function renderLiveCardForPush(liveInfo = {}, options = {}) {
  const config = options.config || getConfig()
  const roomId = String(liveInfo.room_id || liveInfo.roomid || '')
  if (!roomId) throw new Error('直播间 ID 不存在')
  const name = String(liveInfo.uname || liveInfo.name || '未知UP主')
  const url = `https://live.bilibili.com/${roomId}`
  const coverUrl = liveInfo.keyframe || liveInfo.cover_from_user || liveInfo.cover || ''
  const [coverDataUrl, avatarDataUrl, qrDataUrl] = await Promise.all([
    fetchImageAsDataUrl(coverUrl, config.requestTimeoutMs),
    fetchImageAsDataUrl(liveInfo.face, config.requestTimeoutMs),
    QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 640,
      color: { dark: '#6f4ab4ff', light: '#ffffffff' },
    }),
  ])
  const startedAt = liveStartTimestamp(liveInfo.live_time)
  const data = {
    saveId: `live-${roomId}-${Date.now()}`,
    imgType: 'png',
    omitBackground: true,
    cardWidth: config.cardWidth,
    ...fontRenderData(config),
    authorName: truncateText(name, 24),
    avatarFallback: Array.from(name)[0] || 'B',
    publishTime: startedAt ? `${formatDateTime(startedAt)} 开播` : '正在直播',
    avatarDataUrl,
    headerBackground: coverDataUrl || avatarDataUrl,
    coverDataUrl,
    qrDataUrl,
    title: truncateText(liveInfo.title || '无标题直播间', 105),
    area: String(liveInfo.area_v2_name || liveInfo.area_name || '未知分区'),
    online: formatNumber(liveInfo.online),
    roomId,
  }

  return {
    image: await renderCard('live', data, options),
    name,
    url,
    data,
  }
}
