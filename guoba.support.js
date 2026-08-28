import { getConfig, saveConfig } from './lib/config.js'

export function supportGuoba() {
  return {
    pluginInfo: {
      name: 'bili-card-plugin',
      title: 'B站高清卡片',
      author: ['Codex'],
      link: 'https://github.com/TimeRainStarSky/Yunzai',
      isV3: true,
      isV2: false,
      description: 'Bilibili/B23 视频与动态链接高清卡片解析，可分别自定义标题和正文字体',
    },
    configInfo: {
      schemas: [
        {
          field: 'enabled',
          label: '启用链接解析',
          component: 'Switch',
          defaultValue: true,
        },
        {
          field: 'dynamicEnabled',
          label: '启用动态卡片',
          bottomHelpMessage: '识别 Opus、t.bilibili.com、m.bilibili.com/dynamic 和对应 B23 短链',
          component: 'Switch',
          defaultValue: true,
        },
        {
          field: 'showParsingMessage',
          label: '发送解析中提示',
          component: 'Switch',
          defaultValue: true,
        },
        {
          field: 'parsingMessage',
          label: '解析提示文字',
          component: 'Input',
          defaultValue: '解析中～',
        },
        {
          field: 'cardWidth',
          label: 'PNG 宽度',
          bottomHelpMessage: '高清推荐 1080，可设置 720～1600',
          component: 'InputNumber',
          componentProps: { min: 720, max: 1600 },
          defaultValue: 1080,
        },
        {
          field: 'titleFontFile',
          label: '卡片标题字体文件',
          bottomHelpMessage: '作用于 UP 昵称和底部标题，不修改视频封面；先放入 resources/fonts',
          component: 'Input',
          defaultValue: '',
        },
        {
          field: 'bodyFontFile',
          label: '正文字体文件',
          bottomHelpMessage: '支持 ttf、otf、woff、woff2；留空使用系统字体',
          component: 'Input',
          defaultValue: '',
        },
        {
          field: 'titleFontWeight',
          label: '标题字重',
          component: 'InputNumber',
          componentProps: { min: 100, max: 900, step: 100 },
          defaultValue: 900,
        },
        {
          field: 'bodyFontWeight',
          label: '正文字重',
          component: 'InputNumber',
          componentProps: { min: 100, max: 900, step: 100 },
          defaultValue: 600,
        },
        {
          field: 'accentColor',
          label: '主题强调色',
          component: 'Input',
          defaultValue: '#75d9ff',
        },
        {
          field: 'descriptionMaxLength',
          label: '简介最大字数',
          component: 'InputNumber',
          componentProps: { min: 20, max: 300 },
          defaultValue: 100,
        },
        {
          field: 'cooldownSeconds',
          label: '重复解析冷却（秒）',
          component: 'InputNumber',
          componentProps: { min: 0, max: 300 },
          defaultValue: 8,
        },
        {
          field: 'dynamicContentMaxLength',
          label: '动态正文最大字数',
          component: 'InputNumber',
          componentProps: { min: 200, max: 12000 },
          defaultValue: 5000,
        },
        {
          field: 'dynamicImageLimit',
          label: '动态图片上限',
          component: 'InputNumber',
          componentProps: { min: 1, max: 9 },
          defaultValue: 9,
        },
      ],
      getConfigData() {
        return getConfig()
      },
      setConfigData(data, { Result }) {
        try {
          saveConfig(data)
          return Result.ok({}, 'B站高清卡片设置已保存，下次解析立即生效')
        } catch (error) {
          return Result.error(`保存失败：${error.message}`)
        }
      },
    },
  }
}
