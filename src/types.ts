// src/types.ts

/** 过滤模式 */
export type FilterMode = 'blacklist' | 'whitelist'

/** 来源过滤器类型 */
export type SourceFilterType = 'guild' | 'user' | 'channel' | 'private'

/** 来源过滤器 */
export interface SourceFilter {
    type: SourceFilterType
    value: string | boolean
}

/** 单个 Bot 的配置 */
export interface BotConfig {
    platform: string
    selfId: string
    enabled: boolean
    enableCommandFilter?: boolean
    commands?: string[]
    enableKeywordFilter?: boolean
    keywords?: string[]
    keywordFilterMode?: FilterMode
    enableSourceFilter?: boolean
    sourceFilters?: SourceFilter[]
    sourceFilterMode?: FilterMode
}

/** 插件配置 */
export interface Config {
    bots: BotConfig[]
    debug: boolean
}
