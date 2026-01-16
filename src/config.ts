// src/config.ts
import { Schema } from 'koishi'
import { BotConfig } from './types'

// 定义独立的配置接口以避免冲突
interface PluginConfig {
    bots: BotConfig[]
    debug: boolean
}

/** Bot 配置 Schema */
const BotConfigSchema: Schema<BotConfig> = Schema.intersect([
    // 标识信息
    Schema.object({
        platform: Schema.string()
            .description('平台名称（如 qq, discord）')
            .required(),
        selfId: Schema.string()
            .description('Bot 账号 ID')
            .required(),
    }).description('标识信息'),

    // 基础配置
    Schema.object({
        enabled: Schema.boolean()
            .default(true)
            .description('是否启用此 bot 的响应控制'),
    }).description('基础配置'),

    // 响应模式选择
    Schema.object({
        mode: Schema.union([
            Schema.const('constrained' as const)
                .description('有条件约束：非指令消息需要匹配关键词才响应'),
            Schema.const('unconstrained' as const)
                .description('无约束：非指令消息全部放行，由后续插件（如 LLM）判断是否响应'),
        ]).default('unconstrained')
            .description('响应模式'),
    }).description('响应模式'),

    // 共用配置：指令过滤（两种模式都需要）
    Schema.object({
        commands: Schema.array(Schema.string())
            .role('table')
            .default([])
            .description('允许响应的指令列表（空列表表示允许所有指令）'),
        commandFilterMode: Schema.union([
            Schema.const('blacklist' as const)
                .description('黑名单：只响应列表中的指令'),
            Schema.const('whitelist' as const)
                .description('白名单：响应列表外的指令'),
        ]).default('blacklist')
            .description('指令过滤模式'),
    }).description('指令配置'),

    // constrained 模式专属配置：关键词过滤
    Schema.object({
        keywords: Schema.array(Schema.string())
            .role('table')
            .default([])
            .description('关键词列表（仅 constrained 模式生效，匹配关键词时响应非指令消息）'),
        keywordFilterMode: Schema.union([
            Schema.const('blacklist' as const)
                .description('黑名单：只响应匹配关键词的消息'),
            Schema.const('whitelist' as const)
                .description('白名单：只响应不匹配关键词的消息'),
        ]).default('blacklist')
            .description('关键词过滤模式'),
    }).description('关键词配置（constrained 模式）'),
]) as Schema<BotConfig>

/** 插件配置 Schema */
export const Config = Schema.intersect([
    Schema.object({
        bots: Schema.array(BotConfigSchema)
            .role('table')
            .default([])
            .description('Bot 配置列表'),
    }).description('基础配置'),
    Schema.object({
        debug: Schema.boolean()
            .default(false)
            .description('启用调试日志'),
    }).description('调试选项'),
]) as Schema<PluginConfig>

export const name = 'multi-bot-controller'
