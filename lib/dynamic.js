function textFromRichNode(node = {}) {
  if (node.word?.words) return node.word.words
  if (node.rich) return node.rich.text || node.rich.orig_text || ''
  if (node.text?.words) return node.text.words
  return node.text || node.orig_text || ''
}

function summaryText(summary = {}) {
  const paragraphText = Array.isArray(summary.paragraphs)
    ? summary.paragraphs
        .map(paragraph => {
          const nodes = paragraph?.text?.nodes
          if (!Array.isArray(nodes)) return ''
          return nodes.map(textFromRichNode).join('')
        })
        .filter(Boolean)
        .join('\n\n')
    : ''
  const richText = Array.isArray(summary.rich_text_nodes)
    ? summary.rich_text_nodes.map(textFromRichNode).join('')
    : ''
  const plainText = String(summary.text || '')
  return [paragraphText, richText, plainText].sort((left, right) => right.length - left.length)[0] || ''
}

function paragraphText(paragraph = {}) {
  const nodes =
    paragraph?.text?.nodes ||
    paragraph?.heading?.nodes ||
    paragraph?.heading?.text?.nodes ||
    paragraph?.blockquote?.nodes ||
    paragraph?.blockquote?.text?.nodes
  if (Array.isArray(nodes)) return nodes.map(textFromRichNode).join('')
  if (Array.isArray(paragraph?.list?.items)) {
    return paragraph.list.items
      .map(item => {
        const itemNodes = item?.nodes || item?.text?.nodes
        return Array.isArray(itemNodes) ? itemNodes.map(textFromRichNode).join('') : ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function limitMultiline(value, maxLength) {
  const text = String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
  const chars = Array.from(text)
  return chars.length > maxLength ? `${chars.slice(0, Math.max(1, maxLength - 1)).join('')}…` : text
}

function normalizeUrl(value) {
  if (!value) return ''
  return String(value).startsWith('//') ? `https:${value}` : String(value)
}

function additionalCard(additional) {
  if (!additional?.type) return null
  if (additional.type === 'ADDITIONAL_TYPE_COMMON' && additional.common) {
    const data = additional.common
    return {
      label: data.head_text || '相关内容',
      title: data.title || '',
      description: data.desc1 || '',
      detail: data.desc2 || '',
      coverUrl: normalizeUrl(data.cover),
    }
  }
  if (additional.type === 'ADDITIONAL_TYPE_RESERVE' && additional.reserve) {
    const data = additional.reserve
    return {
      label: '预约',
      title: data.title || '',
      description: data.desc1?.text || '',
      detail: data.desc2?.text || data.desc3?.text || '',
      coverUrl: '',
    }
  }
  if (additional.type === 'ADDITIONAL_TYPE_UPOWER_LOTTERY' && additional.upower_lottery) {
    const data = additional.upower_lottery
    return {
      label: '互动抽奖',
      title: data.title || '',
      description: data.desc?.text || '',
      detail: data.hint?.text || data.button?.check?.text || '',
      coverUrl: '',
    }
  }
  if (additional.type === 'ADDITIONAL_TYPE_VOTE' && additional.vote) {
    const data = additional.vote
    return {
      label: '投票',
      title: data.desc || '动态投票',
      description: data.join_num ? `${data.join_num}人参与` : '',
      detail: data.end_time ? `截止时间：${data.end_time}` : '',
      coverUrl: '',
    }
  }
  return null
}

function pageAdditionalCard(paragraphs = []) {
  for (const paragraph of paragraphs) {
    const card = paragraph?.link_card?.card
    if (!card) continue
    if (card.reserve) {
      const data = card.reserve
      return {
        label: '预约',
        title: data.title || '',
        description: data.desc1?.text || '',
        detail: data.desc2?.text || data.desc3?.text || '',
        coverUrl: '',
      }
    }
    if (card.upower_lottery) {
      const data = card.upower_lottery
      return {
        label: '互动抽奖',
        title: data.title || '',
        description: data.desc?.text || '',
        detail: data.hint?.text || data.button?.check?.text || '',
        coverUrl: '',
      }
    }
    if (card.vote || card.eva3_vote) {
      const data = card.vote || card.eva3_vote
      return {
        label: '投票',
        title: data.desc || data.title || '动态投票',
        description: data.join_num ? `${data.join_num}人参与` : '',
        detail: '',
        coverUrl: '',
      }
    }
    const common = card.common || card.opus || card.eva3_opus || card.archive || card.ugc
    if (common) {
      return {
        label: common.head_text || '相关内容',
        title: common.title || '',
        description: common.desc1 || common.desc || '',
        detail: common.desc2 || '',
        coverUrl: normalizeUrl(common.cover || common.cover_url),
      }
    }
  }
  return null
}

const typeLabels = Object.freeze({
  DYNAMIC_TYPE_WORD: '文字动态',
  DYNAMIC_TYPE_DRAW: '图文动态',
  DYNAMIC_TYPE_ARTICLE: '文章动态',
  DYNAMIC_TYPE_FORWARD: '转发动态',
  DYNAMIC_TYPE_AV: '视频动态',
})

export function normalizeDynamicItem(item, options = {}, isForwarded = false) {
  const maxLength = options.contentMaxLength || 5000
  const imageLimit = options.imageLimit || 9
  const pageModules = Array.isArray(item?.modules) ? item.modules : null
  const findPageModule = key => pageModules?.find(module => module?.[key])?.[key] || null
  const author = findPageModule('module_author') || item?.modules?.module_author || {}
  const pageTitle = findPageModule('module_title')
  const pageContent = findPageModule('module_content')
  const pageStat = findPageModule('module_stat')
  const pageTopic = findPageModule('module_topic')
  const pageParagraphs = Array.isArray(pageContent?.paragraphs) ? pageContent.paragraphs : []
  const moduleDynamic = item?.modules?.module_dynamic || {}
  const major = moduleDynamic.major || {}
  const opus = major.opus || null
  const draw = major.draw || null
  const article = major.article || null
  const archive = major.archive || null

  let title = opus?.title || article?.title || archive?.title || pageTitle?.text || ''
  let content = summaryText(opus?.summary)
  if (!content) content = moduleDynamic.desc?.text || article?.desc || archive?.desc || ''
  if (!content && pageParagraphs.length) {
    content = pageParagraphs.map(paragraphText).filter(Boolean).join('\n\n')
  }

  let pictures = []
  if (Array.isArray(opus?.pics)) pictures = opus.pics.map(pic => pic?.url)
  else if (Array.isArray(draw?.items)) pictures = draw.items.map(pic => pic?.src)
  else if (Array.isArray(article?.covers)) pictures = article.covers
  else if (archive?.cover) pictures = [archive.cover]
  else if (pageParagraphs.length) {
    pictures = pageParagraphs.flatMap(paragraph =>
      Array.isArray(paragraph?.pic?.pics) ? paragraph.pic.pics.map(pic => pic?.url) : [],
    )
  }
  pictures = pictures.filter(Boolean).slice(0, imageLimit).map(normalizeUrl)

  const stat = pageStat || item?.modules?.module_stat || {}
  const extra = additionalCard(moduleDynamic.additional) || pageAdditionalCard(pageParagraphs)
  const topicName = moduleDynamic.topic?.name || pageTopic?.topic?.name || pageTopic?.name || ''
  const inferredType = pictures.length ? 'DYNAMIC_TYPE_DRAW' : 'DYNAMIC_TYPE_WORD'
  const rawType = typeof item?.type === 'string' && item.type ? item.type : inferredType
  const normalized = {
    id: String(item?.id_str || ''),
    type: rawType,
    typeLabel: typeLabels[rawType] || 'B站动态',
    authorName: String(author.name || '未知UP主'),
    authorFaceUrl: normalizeUrl(author.face),
    publishTime: String(author.pub_time || ''),
    publishTimestamp: Number(author.pub_ts || 0),
    topicName: String(topicName || ''),
    title: limitMultiline(title, 180),
    content: limitMultiline(content, maxLength),
    pictureUrls: pictures,
    likeCount: Number(stat.like?.count || 0),
    commentCount: Number(stat.comment?.count || 0),
    forwardCount: Number(stat.forward?.count || 0),
    additional: extra,
    archiveUrl: normalizeUrl(archive?.jump_url),
    isForwarded,
    original: null,
  }
  if (item?.orig && !isForwarded) {
    normalized.original = normalizeDynamicItem(item.orig, options, true)
  }
  return normalized
}

export function dynamicGalleryClass(count) {
  if (count <= 1) return 'count-1'
  if (count === 2) return 'count-2'
  if (count === 3) return 'count-3'
  return 'count-many'
}
