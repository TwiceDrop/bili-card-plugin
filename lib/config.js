import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configPath = path.join(pluginRoot, 'config', 'config.json')
const fontsPath = path.join(pluginRoot, 'resources', 'fonts')
const fontExtensions = new Set(['.ttf', '.otf', '.woff', '.woff2'])

const defaults = Object.freeze({
  enabled: true,
  dynamicEnabled: true,
  showParsingMessage: true,
  parsingMessage: '解析中～',
  bodyFontFile: '',
  titleFontFile: '',
  bodyFontFamily: 'Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif',
  titleFontFamily: 'Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif',
  bodyFontWeight: 600,
  titleFontWeight: 900,
  accentColor: '#75d9ff',
  cardWidth: 1080,
  descriptionMaxLength: 100,
  dynamicContentMaxLength: 5000,
  dynamicImageLimit: 9,
  cooldownSeconds: 8,
  requestTimeoutMs: 15000,
})

function clampNumber(value, fallback, min, max) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback
}

function isFontFileName(value) {
  if (value === '') return true
  if (typeof value !== 'string' || value !== path.basename(value)) return false
  return fontExtensions.has(path.extname(value).toLowerCase())
}

function cleanFontFamily(value, fallback) {
  if (typeof value !== 'string') return fallback
  const cleaned = value.replace(/[{};<>]/g, '').trim().slice(0, 180)
  return cleaned || fallback
}

function sanitizeConfig(input = {}) {
  const data = { ...defaults, ...input }
  return {
    enabled: data.enabled !== false,
    dynamicEnabled: data.dynamicEnabled !== false,
    showParsingMessage: data.showParsingMessage !== false,
    parsingMessage:
      typeof data.parsingMessage === 'string' ? data.parsingMessage.trim().slice(0, 40) : defaults.parsingMessage,
    bodyFontFile: isFontFileName(data.bodyFontFile) ? data.bodyFontFile : '',
    titleFontFile: isFontFileName(data.titleFontFile) ? data.titleFontFile : '',
    bodyFontFamily: cleanFontFamily(data.bodyFontFamily, defaults.bodyFontFamily),
    titleFontFamily: cleanFontFamily(data.titleFontFamily, defaults.titleFontFamily),
    bodyFontWeight: clampNumber(data.bodyFontWeight, defaults.bodyFontWeight, 100, 900),
    titleFontWeight: clampNumber(data.titleFontWeight, defaults.titleFontWeight, 100, 900),
    accentColor: /^#[0-9a-f]{6}$/i.test(data.accentColor) ? data.accentColor : defaults.accentColor,
    cardWidth: clampNumber(data.cardWidth, defaults.cardWidth, 720, 1600),
    descriptionMaxLength: clampNumber(
      data.descriptionMaxLength,
      defaults.descriptionMaxLength,
      20,
      300,
    ),
    dynamicContentMaxLength: clampNumber(
      data.dynamicContentMaxLength,
      defaults.dynamicContentMaxLength,
      200,
      12000,
    ),
    dynamicImageLimit: clampNumber(data.dynamicImageLimit, defaults.dynamicImageLimit, 1, 9),
    cooldownSeconds: clampNumber(data.cooldownSeconds, defaults.cooldownSeconds, 0, 300),
    requestTimeoutMs: clampNumber(data.requestTimeoutMs, defaults.requestTimeoutMs, 3000, 60000),
  }
}

export function getConfig() {
  try {
    return sanitizeConfig(JSON.parse(fs.readFileSync(configPath, 'utf8')))
  } catch (error) {
    global.logger?.warn?.(`[bili-card-plugin] 配置读取失败，使用默认值：${error.message}`)
    return { ...defaults }
  }
}

export function saveConfig(next) {
  const config = sanitizeConfig(next)
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return config
}

export function updateConfig(patch) {
  return saveConfig({ ...getConfig(), ...patch })
}

export function listFonts() {
  try {
    fs.mkdirSync(fontsPath, { recursive: true })
    return fs
      .readdirSync(fontsPath, { withFileTypes: true })
      .filter(entry => entry.isFile() && fontExtensions.has(path.extname(entry.name).toLowerCase()))
      .map(entry => entry.name)
      .sort((left, right) => left.localeCompare(right, 'zh-CN'))
  } catch {
    return []
  }
}

export function isAvailableFont(fileName) {
  return isFontFileName(fileName) && fileName !== '' && listFonts().includes(fileName)
}

export function configPaths() {
  return { pluginRoot, configPath, fontsPath }
}

export { defaults }
