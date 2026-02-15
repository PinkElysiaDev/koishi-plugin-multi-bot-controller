// src/config.ts
import { Schema, Context } from 'koishi'
import { BotConfig } from './types'

/**
 * 获取所有可用的指令
 */
function getAvailableCommands(ctx: Context): string[] {
    const commandMap = (ctx.$commander as any)?._commandMap
    if (!commandMap) return []

    return Array.from(commandMap.values())
        .filter((cmd: any) => cmd.name && cmd.name !== '' && !cmd.name.includes('.'))
        .map((cmd: any) => cmd.name)
        .sort()
}

/**
 * 创建来源过滤器 Schema
 */
const createSourceFilterSchema = () => {
    return Schema.array(
        Schema.object({
            type: Schema.union([
                Schema.const('guild' as const).description('群号'),
                Schema.const('user' as const).description('用户'),
                Schema.const('channel' as const).description('频道'),
                Schema.const('private' as const).description('私聊'),
            ]).description('类型'),
            value: Schema.string().description('值（私聊填 true/false）'),
        })
    ).default([]).description('来源过滤规则列表').role('table')
}

/**
 * 创建关键词过滤器 Schema
 */
const createKeywordFilterSchema = () => {
    return Schema.array(Schema.string())
        .default([])
        .description('关键词列表')
        .role('table')
}

/**
 * 创建指令过滤器 Schema（动态引用，将在运行时更新）
 */
const createCommandFilterSchema = () => {
    return Schema.dynamic('multi-bot-controller.commandFilter')
        .description('**开启插件后，将展示可用的指令列表**<br>**此列表会自动监听指令变化并实时更新**<br>> 选择该 bot 允许响应的指令')
}

/**
 * 创建单个 Bot 配置 Schema
 */
const createBotConfigSchema = (): Schema<BotConfig> => {
    return Schema.intersect([
        // 基础配置
        Schema.object({
            platform: Schema.string()
                .description('**Bot 平台名称**（如 onebot, qq, discord）')
                .required(),
            selfId: Schema.string()
                .description('**Bot 账号 ID**')
                .required(),
            enabled: Schema.boolean()
                .default(true)
                .description('是否启用此 bot 的响应控制'),
        }),

        // 指令过滤
        Schema.intersect([
            Schema.object({
                enableCommandFilter: Schema.boolean()
                    .default(false)
                    .description('是否启用指令过滤'),
            }),
            Schema.union([
                Schema.object({
                    enableCommandFilter: Schema.const(true).required(),
                    commands: createCommandFilterSchema(),
                }),
                Schema.object({}),
            ]),
        ]),

        // 来源过滤
        Schema.intersect([
            Schema.object({
                enableSourceFilter: Schema.boolean()
                    .default(false)
                    .description('是否启用来源过滤'),
            }),
            Schema.union([
                Schema.object({
                    enableSourceFilter: Schema.const(true).required(),
                    sourceFilters: createSourceFilterSchema(),
                    sourceFilterMode: Schema.union([
                        Schema.const('blacklist' as const).description('黑名单'),
                        Schema.const('whitelist' as const).description('白名单'),
                    ]).default('whitelist').description('来源过滤模式'),
                }),
                Schema.object({}),
            ]),
        ]),

        // 关键词过滤
        Schema.intersect([
            Schema.object({
                enableKeywordFilter: Schema.boolean()
                    .default(false)
                    .description('是否启用关键词过滤'),
            }),
            Schema.union([
                Schema.object({
                    enableKeywordFilter: Schema.const(true).required(),
                    keywords: createKeywordFilterSchema(),
                    keywordFilterMode: Schema.union([
                        Schema.const('blacklist' as const).description('黑名单'),
                        Schema.const('whitelist' as const).description('白名单'),
                    ]).default('whitelist').description('关键词过滤模式'),
                }),
                Schema.object({}),
            ]),
        ]),
    ]) as Schema<BotConfig>
}

/**
 * 创建插件配置 Schema
 */
export const createConfig = (ctx: Context): Schema<any> => {
    const commands = getAvailableCommands(ctx)

    return Schema.intersect([
        Schema.object({
            bots: Schema.array(createBotConfigSchema())
                .role('list')
                .default([])
                .description(`Bot 配置列表${commands.length > 0 ? `\n\n检测到 ${commands.length} 个可用指令` : ''}`),
        }),
        Schema.object({
            debug: Schema.boolean()
                .default(false)
                .description('启用调试日志'),
            verboseLog: Schema.boolean()
                .default(false)
                .description('详细日志模式：显示每条消息的完整判断过程'),
            restoreOnDispose: Schema.boolean()
                .default(true)
                .description('插件卸载时恢复被清空的 assignee（推荐开启）'),
        }).description('其他设置'),
    ])
}

/**
 * 静态的插件配置 Schema（导出供配置界面使用）
 */
export const Config = Schema.intersect([
    Schema.object({
        bots: Schema.array(createBotConfigSchema())
            .role('list')
            .default([])
            .description('Bot 配置列表'),
    }),
    Schema.object({
        debug: Schema.boolean()
            .default(false)
            .description('启用调试日志'),
        verboseLog: Schema.boolean()
            .default(false)
            .description('详细日志模式：显示每条消息的完整判断过程'),
        restoreOnDispose: Schema.boolean()
            .default(true)
            .description('插件卸载时恢复被清空的 assignee（推荐开启）'),
    }).description('其他设置'),
])

// 静态导出（用于类型检查）
export const name = 'multi-bot-controller'
