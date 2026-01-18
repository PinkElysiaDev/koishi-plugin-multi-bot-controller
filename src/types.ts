// src/types.ts
import { Status } from '@satorijs/protocol'

/** Bot 响应模式 */
export type ResponseMode = 'constrained' | 'unconstrained'

/** 过滤模式 */
export type FilterMode = 'blacklist' | 'whitelist'

/** 来源过滤器类型 */
export type SourceFilterType = 'guild' | 'user' | 'channel' | 'private'

/** 来源过滤器 */
export interface SourceFilter {
    /** 过滤器类型 */
    type: SourceFilterType
    /** 匹配值（群号/用户ID/频道ID等，private 类型时为 boolean） */
    value: string | boolean
}

/** 单个 Bot 的配置 */
export interface BotConfig {
    /** 平台名称 (如 'qq', 'discord') */
    platform: string
    /** Bot 账号 ID */
    selfId: string
    /** 是否启用此 bot 的控制 */
    enabled: boolean
    /** 响应模式 */
    mode: ResponseMode
    /** 是否启用指令过滤 */
    enableCommandFilter?: boolean
    /** 允许的指令列表（空=所有） */
    commands?: string[]
    /** 指令过滤模式 */
    commandFilterMode?: FilterMode
    /** 是否启用关键词过滤 */
    enableKeywordFilter?: boolean
    /** 关键词列表 */
    keywords?: string[]
    /** 关键词过滤模式 */
    keywordFilterMode?: FilterMode
    /** 是否启用来源过滤 */
    enableSourceFilter?: boolean
    /** 来源过滤器列表 */
    sourceFilters?: SourceFilter[]
    /** 来源过滤模式 */
    sourceFilterMode?: FilterMode
}

/** 插件配置 */
export interface Config {
    /** Bot 配置列表 */
    bots: BotConfig[]
    /** 调试模式 */
    debug: boolean
}

/** 可用的 Bot 信息 */
export interface AvailableBot {
    platform: string
    selfId: string
    status: Status
}

/** 可用的指令信息 */
export interface AvailableCommand {
    name: string
    description: string
}
