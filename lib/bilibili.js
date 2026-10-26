import fs from 'node:fs'
import path from 'node:path'

const requestHeaders = Object.freeze({
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143.0.0.0 Safari/537.36',
  Referer: 'https://www.bilibili.com/',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'Sec-CH-UA': '"Microsoft Edge";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
  'Sec-CH-UA-Mobile': '?0',
  'Sec-CH-UA-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
})

function normalizeCookie(value) {
  const cookie = String(value || '')
    .replace(/^cookie:\s*/i, '')
    .replace(/[\r\n\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, 16384)
  return cookie.includes('=') ? cookie : ''
}

export function readBiliDynamicPushCookie(rootDir = process.cwd()) {
  try {
    const configPath = path.join(rootDir, 'data', 'bili-dynamic-push', 'config.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    return normalizeCookie(config?.biliCookie)
  } catch {
    return ''
  }
}

function withProtocol(url) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`请求超时（${timeoutMs}ms）`)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export function extractBiliTarget(input = '') {
  const text = String(input)
  const shortMatch = text.match(/(?:https?:\/\/)?(?:www\.)?b23\.tv\/[a-z0-9]+/i)
  if (shortMatch) return { kind: 'short', url: withProtocol(shortMatch[0]) }

  const dynamicMatch = text.match(
    /(?:https?:\/\/)?(?:(?:www\.|m\.)?bilibili\.com\/(?:opus|dynamic)\/|t\.bilibili\.com\/)(\d{6,24})/i,
  )
  if (dynamicMatch) return { kind: 'dynamic', dynamicId: dynamicMatch[1] }

  const fullMatch = text.match(
    /(?:https?:\/\/)?(?:www\.|m\.)?bilibili\.com\/video\/(BV[a-z0-9]{10,18}|av\d+)/i,
  )
  const queryMatch = text.match(/[?&](?:bvid|aid)=(BV[a-z0-9]{10,18}|\d+)/i)
  const bareMatch = text.match(/(?:^|[^a-z0-9])(BV[a-z0-9]{10,18}|av\d+)(?=$|[^a-z0-9])/i)
  const value = fullMatch?.[1] || queryMatch?.[1] || bareMatch?.[1]
  if (!value) return null

  if (/^av/i.test(value) || /^\d+$/.test(value)) {
    return { kind: 'video', videoId: { type: 'aid', aid: String(value).replace(/^av/i, '') } }
  }
  return { kind: 'video', videoId: { type: 'bvid', bvid: `BV${value.slice(2)}` } }
}

export function extractVideoId(input = '') {
  const target = extractBiliTarget(input)
  if (target?.kind === 'short') return { type: 'short', url: target.url }
  return target?.kind === 'video' ? target.videoId : null
}

function isAllowedBiliTarget(value) {
  try {
    const host = new URL(value).hostname.toLowerCase()
    return ['b23.tv', 'bilibili.com'].some(domain => host === domain || host.endsWith(`.${domain}`))
  } catch {
    return false
  }
}

function decodePossibleUrl(value) {
  const unescaped = String(value || '').replace(/\\\//g, '/').replace(/&amp;/g, '&')
  try {
    return decodeURIComponent(unescaped)
  } catch {
    return unescaped
  }
}

export async function resolveBiliInput(input, timeoutMs = 15000) {
  const extracted = extractBiliTarget(input)
  if (!extracted) return null
  if (extracted.kind !== 'short') return extracted

  let currentUrl = extracted.url
  for (let index = 0; index < 5; index++) {
    const response = await fetchWithTimeout(
      currentUrl,
      { headers: requestHeaders, redirect: 'manual' },
      timeoutMs,
    )
    const location = response.headers.get('location')
    if (location) {
      const nextUrl = new URL(location, currentUrl).href
      if (!isAllowedBiliTarget(nextUrl)) throw new Error('B23 短链跳转到了非 B站地址，已拒绝访问')
      const target = extractBiliTarget(decodePossibleUrl(nextUrl))
      if (target && target.kind !== 'short') return target
      currentUrl = nextUrl
      continue
    }

    const responseTarget = extractBiliTarget(decodePossibleUrl(response.url || ''))
    if (responseTarget && responseTarget.kind !== 'short') return responseTarget
    const text = decodePossibleUrl((await response.text()).slice(0, 300000))
    const bodyTarget = extractBiliTarget(text)
    if (bodyTarget && bodyTarget.kind !== 'short') return bodyTarget
    break
  }
  throw new Error('B23 短链已失效，或没有指向可识别的 B站视频/动态')
}

export async function resolveVideoInput(input, timeoutMs = 15000) {
  const target = await resolveBiliInput(input, timeoutMs)
  if (!target) return null
  if (target.kind !== 'video') throw new Error('该链接指向 B站动态，不是视频')
  return target.videoId
}

const biliErrorMessages = Object.freeze({
  '-400': '视频参数错误',
  '-403': 'B站拒绝了本次请求',
  '-404': '视频不存在',
  '-412': '请求触发了 B站风控，请稍后再试',
  '62002': '视频不可见',
  '62004': '视频正在审核',
  '62012': '视频仅 UP 主可见',
})

function isMatchingVideo(video, videoId) {
  if (!video || !/^BV[a-z0-9]{10,18}$/i.test(String(video.bvid || ''))) return false
  if (videoId.type === 'bvid' && video.bvid !== videoId.bvid) return false
  if (videoId.type === 'aid' && String(video.aid) !== String(videoId.aid)) return false
  return Boolean(video.title && video.pic && video.owner?.name)
}

async function fetchVideoPage(pageUrl, headers, timeoutMs) {
  let url = pageUrl
  for (let index = 0; index < 3; index++) {
    const response = await fetchWithTimeout(
      url,
      { headers, redirect: 'manual' },
      timeoutMs,
    )
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    if (!location) return response
    const next = new URL(location, url)
    if (next.protocol !== 'https:' || !['www.bilibili.com', 'bilibili.com'].includes(next.hostname)) {
      throw new Error('视频网页跳转到非 B站地址')
    }
    url = next.href
  }
  throw new Error('视频网页跳转次数过多')
}

export async function fetchVideoInfo(videoId, timeoutMs = 15000, options = {}) {
  const validId = videoId && (
    (videoId.type === 'bvid' && /^BV[a-z0-9]{10,18}$/i.test(String(videoId.bvid || ''))) ||
    (videoId.type === 'aid' && /^\d{1,24}$/.test(String(videoId.aid || '')))
  )
  if (!validId) throw new Error('无效的视频 ID')

  const sharedCookie = options.cookie === undefined
    ? readBiliDynamicPushCookie(options.rootDir)
    : normalizeCookie(options.cookie)
  const sourceId = videoId.type === 'bvid' ? videoId.bvid : `av${videoId.aid}`
  const pageUrl = `https://www.bilibili.com/video/${sourceId}/`
  const headers = {
    ...requestHeaders,
    ...(sharedCookie ? { Cookie: sharedCookie } : {}),
    Referer: pageUrl,
    Origin: 'https://www.bilibili.com',
  }
  const parameter = new URLSearchParams({ [videoId.type]: String(videoId[videoId.type]) })
  let apiError = null
  let definitiveError = null
  let riskControlled = false
  try {
    const response = await fetchWithTimeout(
      `https://api.bilibili.com/x/web-interface/view?${parameter}`,
      { headers, redirect: 'manual' },
      timeoutMs,
    )
    if (!response.ok) {
      riskControlled = [403, 412, 429].includes(response.status)
      apiError = new Error(`B站视频接口请求失败（HTTP ${response.status}）`)
      if ([400, 404].includes(response.status)) definitiveError = apiError
    } else {
      const result = await response.json()
      if (result.code === 0 && isMatchingVideo(result.data, videoId)) return result.data
      const code = Number(result.code)
      riskControlled = [-352, -412].includes(code)
      apiError = new Error(biliErrorMessages[String(code)] || `B站视频接口响应异常（代码 ${code}）`)
      if ([-400, -403, -404, 62002, 62004, 62012].includes(code)) definitiveError = apiError
    }
  } catch {
    apiError = new Error('B站视频接口暂时无法访问或响应异常')
  }
  if (definitiveError) throw definitiveError

  try {
    const response = await fetchVideoPage(
      pageUrl,
      {
        ...headers,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      },
      timeoutMs,
    )
    riskControlled ||= [403, 412, 429].includes(response.status)
    if (response.ok) {
      const state = parseInitialState(await response.text())
      if (isMatchingVideo(state?.videoData, videoId)) return state.videoData
    }
  } catch {
    // Keep a bounded, cookie-free diagnostic when the public video page also fails.
  }

  if (riskControlled) {
    const suggestion = sharedCookie
      ? '已复用 bili-dynamic-push 登录 Cookie，请稍后再试'
      : '未发现登录 Cookie，请主人私聊使用 #动态推送cookie设置 配置后重试'
    throw new Error(`B站视频接口触发风控，网页备用解析也未成功。${suggestion}`)
  }
  throw new Error(`${apiError?.message || 'B站视频详情获取失败'}；网页备用解析也未成功`)
}

export async function fetchDynamicInfo(dynamicId, timeoutMs = 15000, options = {}) {
  if (!/^\d{6,24}$/.test(String(dynamicId))) throw new Error('无效的动态 ID')
  const sharedCookie =
    options.cookie === undefined
      ? readBiliDynamicPushCookie(options.rootDir)
      : normalizeCookie(options.cookie)
  const authenticatedHeaders = sharedCookie ? { Cookie: sharedCookie } : {}
  const url = new URL('https://api.bilibili.com/x/polymer/web-dynamic/v1/detail')
  url.searchParams.set('id', String(dynamicId))
  url.searchParams.set('timezone_offset', '-480')
  url.searchParams.set('platform', 'web')
  url.searchParams.set(
    'features',
    'itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,forwardListHidden,ugcDelete,onlyfansQaCard',
  )
  let apiResult = null
  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          ...requestHeaders,
          ...authenticatedHeaders,
          Referer: `https://www.bilibili.com/opus/${dynamicId}`,
          Origin: 'https://www.bilibili.com',
        },
      },
      timeoutMs,
    )
    if (response.ok) {
      apiResult = await response.json()
      if (apiResult.code === 0 && apiResult.data?.item) return apiResult.data.item
    }
  } catch {
    // The public dynamic API is frequently rate-limited. The public opus page below
    // contains the same display data and is a safe read-only fallback.
  }

  try {
    const pageUrl = `https://www.bilibili.com/opus/${dynamicId}`
    const response = await fetchWithTimeout(
      pageUrl,
      {
        headers: {
          ...requestHeaders,
          ...authenticatedHeaders,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
        },
      },
      timeoutMs,
    )
    if (response.ok) {
      const html = await response.text()
      const state = parseInitialState(html)
      if (state?.detail && String(state.detail.id_str) === String(dynamicId)) return state.detail
    }
  } catch {
    // Report the original API error below when both public sources are unavailable.
  }

  const code = Number(apiResult?.code)
  const message =
    code === 4101152 || code === -404
      ? '动态不存在或已被删除'
      : code === -352 || code === -412
        ? sharedCookie
          ? '已调用 bili-dynamic-push 的登录 Cookie，但 B站仍触发风控，请稍后再试'
          : '未发现 bili-dynamic-push 的登录 Cookie，且 B站动态服务触发风控'
        : apiResult?.message || (code ? `B站动态接口错误 ${code}` : 'B站动态详情获取失败')
  throw new Error(message)
}

function parseInitialState(html) {
  const source = String(html || '')
  const marker = /window\.__INITIAL_STATE__\s*=\s*(?=\{)/.exec(source)
  if (!marker) return null

  let depth = 0
  let quoted = false
  let escaped = false
  const jsonStart = marker.index + marker[0].length
  for (let index = jsonStart; index < source.length; index++) {
    const char = source[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') quoted = true
    else if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(jsonStart, index + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function isAllowedImageUrl(value) {
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol)) return false
    const host = url.hostname.toLowerCase()
    return [
      'hdslb.com',
      'biliimg.com',
      'bilibili.com',
    ].some(domain => host === domain || host.endsWith(`.${domain}`))
  } catch {
    return false
  }
}

export async function fetchImageAsDataUrl(url, timeoutMs = 15000, maxBytes = 8 * 1024 * 1024) {
  if (!url || !isAllowedImageUrl(url)) return ''
  const response = await fetchWithTimeout(url, { headers: requestHeaders }, timeoutMs)
  if (!response.ok) return ''
  const mime = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase()
  if (!mime.startsWith('image/')) return ''
  const declaredSize = Number(response.headers.get('content-length') || 0)
  if (declaredSize > maxBytes) return ''
  const buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.length || buffer.length > maxBytes) return ''
  return `data:${mime};base64,${buffer.toString('base64')}`
}

export function truncateText(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  const chars = Array.from(text)
  return chars.length > maxLength ? `${chars.slice(0, Math.max(1, maxLength - 1)).join('')}…` : text
}

export function formatNumber(value) {
  const number = Number(value || 0)
  if (number >= 100000000) return `${(number / 100000000).toFixed(1).replace(/\.0$/, '')}亿`
  if (number >= 10000) return `${(number / 10000).toFixed(1).replace(/\.0$/, '')}万`
  return String(Math.max(0, number))
}

export function formatDuration(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  const minuteText = hours ? String(minutes).padStart(2, '0') : String(minutes)
  return `${hours ? `${hours}:` : ''}${minuteText}:${String(rest).padStart(2, '0')}`
}

export function formatDateTime(timestamp = Date.now()) {
  const date = new Date(Number(timestamp) < 100000000000 ? Number(timestamp) * 1000 : Number(timestamp))
  const part = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}年${part(date.getMonth() + 1)}月${part(date.getDate())}日 ${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`
}
