import path from 'node:path'
import QRCode from 'qrcode'
import { getConfig, isAvailableFont, listFonts, updateConfig } from '../lib/config.js'
import {
  fetchImageAsDataUrl,
  fetchVideoInfo,
  formatDateTime,
  formatDuration,
  formatNumber,
  readBiliDynamicPushCookie,
  resolveBiliInput,
  truncateText,
} from '../lib/bilibili.js'
import { renderDynamicCardForPush } from '../lib/push.js'

const recentParses = new Map()

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

function parseKey(event, bvid) {
  const conversation = event.isGroup ? `g:${event.group_id}` : `u:${event.user_id}`
  return `${event.self_id || 'bot'}:${conversation}:${bvid}`
}

function isCoolingDown(key, seconds) {
  if (!seconds) return false
  const now = Date.now()
  const last = recentParses.get(key) || 0
  for (const [entry, timestamp] of recentParses) {
    if (now - timestamp > Math.max(300000, seconds * 2000)) recentParses.delete(entry)
  }
  if (now - last < seconds * 1000) return true
  recentParses.set(key, now)
  return false
}

export default class BiliCard extends plugin {
  constructor() {
    super({
      name: 'B站高清卡片',
      dsc: '把 B23、Bilibili 视频和动态链接渲染为高清卡片',
      event: 'message',
      priority: 1800,
      rule: [
        {
          reg: '^#?(?:B站|b站|哔哩|哔哩哔哩)卡片设置$',
          fnc: 'showSettings',
          permission: 'master',
        },
        {
          reg: '^#?(?:B站|b站|哔哩|哔哩哔哩)卡片(?:标题|正文)?字体(?:\\s+.*)?$',
          fnc: 'setFont',
          permission: 'master',
        },
        {
          reg: '^#?(?:B站|b站|哔哩|哔哩哔哩)卡片(?:清晰度|分辨率|高清)(?:\\s*\\d+)?$',
          fnc: 'setResolution',
          permission: 'master',
        },
        {
          reg: '^#?(?:B站|b站|哔哩|哔哩哔哩)卡片开关$',
          fnc: 'togglePlugin',
          permission: 'master',
        },
        {
          reg: '^#?(?:B站|b站|哔哩|哔哩哔哩)动态卡片开关$',
          fnc: 'toggleDynamic',
          permission: 'master',
        },
        {
          reg: '(?:https?:\\/\\/)?(?:www\\.)?b23\\.tv\\/[a-zA-Z0-9]+|(?:https?:\\/\\/)?(?:www\\.|m\\.)?bilibili\\.com\\/(?:video\\/(?:BV[a-zA-Z0-9]{10,18}|av\\d+)|(?:opus|dynamic)\\/\\d{6,24})|(?:https?:\\/\\/)?t\\.bilibili\\.com\\/\\d{6,24}|(?:^|\\s)(?:BV[a-zA-Z0-9]{10,18}|av\\d+)(?:$|\\s)',
          fnc: 'parseBiliLink',
          log: false,
        },
      ],
    })
  }

  async showSettings() {
    const config = getConfig()
    const fonts = listFonts()
    await this.reply(
      [
        'B站高清卡片设置',
        `状态：${config.enabled ? '开启' : '关闭'}`,
        `动态卡片：${config.dynamicEnabled ? '开启' : '关闭'}`,
        `B站登录 Cookie（视频/动态共用）：${readBiliDynamicPushCookie() ? '已从 bili-dynamic-push 读取' : '未发现'}`,
        `输出：${config.cardWidth}px PNG`,
        `标题字体：${config.titleFontFile || `系统字体（${config.titleFontFamily}）`}`,
        `正文字体：${config.bodyFontFile || `系统字体（${config.bodyFontFamily}）`}`,
        `解析提示：${config.showParsingMessage ? config.parsingMessage || '开启' : '关闭'}`,
        `字体目录已发现：${fonts.length ? fonts.join('、') : '暂无'}`,
        '',
        '命令：',
        '#B站卡片字体 文件名.ttf',
        '#B站卡片标题字体 文件名.ttf',
        '#B站卡片正文字体 文件名.ttf',
        '#B站卡片字体 默认',
        '#B站卡片清晰度 1080',
        '#B站卡片开关',
        '#B站动态卡片开关',
      ].join('\n'),
    )
    return true
  }

  async setFont() {
    const message = String(this.e.msg || '').trim()
    const isTitle = /卡片标题字体/i.test(message)
    const isBody = /卡片正文字体/i.test(message)
    const argument = message.replace(/^#?(?:B站|b站|哔哩|哔哩哔哩)卡片(?:标题|正文)?字体\s*/i, '').trim()

    if (!argument) return this.showSettings()
    const reset = /^(?:默认|系统|重置|default)$/i.test(argument)
    let selected = argument
    if (!reset) {
      const matched = listFonts().find(item => item.toLowerCase() === argument.toLowerCase())
      if (!matched || !isAvailableFont(matched)) {
        const available = listFonts()
        await this.reply(
          `没有找到字体“${argument}”。\n请把字体放入 plugins/bili-card-plugin/resources/fonts/\n当前可用：${available.length ? available.join('、') : '暂无'}`,
        )
        return true
      }
      selected = matched
    } else {
      selected = ''
    }

    const patch = isTitle
      ? { titleFontFile: selected }
      : isBody
        ? { bodyFontFile: selected }
        : { titleFontFile: selected, bodyFontFile: selected }
    updateConfig(patch)
    const target = isTitle ? '标题字体' : isBody ? '正文字体' : '标题和正文字体'
    await this.reply(`${target}已切换为：${selected || '系统默认字体'}\n无需重启，下次解析立即生效。`)
    return true
  }

  async setResolution() {
    const match = String(this.e.msg || '').match(/(\d{3,4})/)
    const width = match ? Number(match[1]) : 1080
    if (!Number.isInteger(width) || width < 720 || width > 1600) {
      await this.reply('清晰度请输入 720～1600 之间的宽度，例如：#B站卡片清晰度 1080')
      return true
    }
    updateConfig({ cardWidth: width })
    await this.reply(`B站卡片已设置为 ${width}px 宽 PNG，下一张卡片立即生效。`)
    return true
  }

  async togglePlugin() {
    const config = getConfig()
    const next = updateConfig({ enabled: !config.enabled })
    await this.reply(`B站高清卡片解析已${next.enabled ? '开启' : '关闭'}。`)
    return true
  }

  async toggleDynamic() {
    const config = getConfig()
    const next = updateConfig({ dynamicEnabled: !config.dynamicEnabled })
    await this.reply(`B站动态卡片解析已${next.dynamicEnabled ? '开启' : '关闭'}。`)
    return true
  }

  async parseBiliLink() {
    const config = getConfig()
    if (!config.enabled) return false

    const context = { cacheKey: '' }
    try {
      const target = await resolveBiliInput(this.e.msg, config.requestTimeoutMs)
      if (!target) return false
      if (target.kind === 'dynamic') {
        if (!config.dynamicEnabled) return false
        await this.renderDynamic(target.dynamicId, config, context)
      } else if (target.kind === 'video') {
        await this.renderVideo(target.videoId, config, context)
      } else {
        return false
      }
      return true
    } catch (error) {
      if (context.cacheKey) recentParses.delete(context.cacheKey)
      logger.error(`[bili-card-plugin] ${error?.stack || error}`)
      await this.reply(`[B站卡片] ${error?.message || '解析失败，请稍后再试'}`)
      return true
    }
  }

  async parseVideo() {
    return this.parseBiliLink()
  }

  async renderVideo(videoId, config, context) {
    const sourceId = videoId.type === 'bvid' ? videoId.bvid : `av${videoId.aid}`
    context.cacheKey = parseKey(this.e, sourceId)
    if (isCoolingDown(context.cacheKey, config.cooldownSeconds)) return
    if (config.showParsingMessage && config.parsingMessage) await this.reply(config.parsingMessage)
    const video = await fetchVideoInfo(videoId, config.requestTimeoutMs)

    const canonicalUrl = `https://www.bilibili.com/video/${video.bvid}`
    const [coverDataUrl, avatarDataUrl, qrDataUrl] = await Promise.all([
      fetchImageAsDataUrl(video.pic, config.requestTimeoutMs),
      fetchImageAsDataUrl(video.owner?.face, config.requestTimeoutMs),
      QRCode.toDataURL(canonicalUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 640,
        color: { dark: '#075895ff', light: '#ffffffff' },
      }),
    ])
    const data = {
      saveId: `${video.bvid}-${Date.now()}`,
      imgType: 'png',
      omitBackground: true,
      cardWidth: config.cardWidth,
      accentColor: config.accentColor,
      ...fontRenderData(config),
      ownerDisplayName: truncateText(video.owner?.name || '未知UP主', 24),
      avatarFallback: Array.from(video.owner?.name || 'B')[0] || 'B',
      shareTime:
        video.pubdate || video.ctime ? formatDateTime(video.pubdate || video.ctime) : '发布时间未知',
      avatarDataUrl,
      coverDataUrl,
      qrDataUrl,
      duration: formatDuration(video.duration),
      viewCount: formatNumber(video.stat?.view),
      danmakuCount: formatNumber(video.stat?.danmaku),
      likeCount: formatNumber(video.stat?.like),
      title: truncateText(video.title, 105),
      description: truncateText(video.desc, config.descriptionMaxLength),
      ownerName: truncateText(video.owner?.name || '未知UP主', 24),
      bvid: video.bvid,
    }

    if (!this.e.runtime?.render) throw new Error('当前 TRSS-Yunzai 没有可用的图片渲染器')
    const image = await this.e.runtime.render('bili-card-plugin', 'bilibili/card', data, {
      retType: 'base64',
    })
    if (!image) throw new Error('高清卡片渲染失败，请检查 Chromium 配置')
    await this.reply(image)
  }

  async renderDynamic(dynamicId, config, context) {
    context.cacheKey = parseKey(this.e, `dynamic:${dynamicId}`)
    if (isCoolingDown(context.cacheKey, config.cooldownSeconds)) return
    if (config.showParsingMessage && config.parsingMessage) await this.reply(config.parsingMessage)

    const result = await renderDynamicCardForPush(dynamicId, {
      config,
      event: this.e,
      runtime: this.e.runtime,
    })
    await this.reply(result.image)
  }
}
