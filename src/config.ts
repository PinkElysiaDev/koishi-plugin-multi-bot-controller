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
 * 表格形式，每行包含 type（下拉）和 value（根据 type 动态类型）
 */
const createSourceFilterSchema = () => {
    return Schema.array(
        Schema.union([
            // guild 类型
            Schema.object({
                type: Schema.const('guild' as const).description('群号'),
                value: Schema.string().default('').description('群号'),
            }),
            // user 类型
            Schema.object({
                type: Schema.const('user' as const).description('用户'),
                value: Schema.string().default('').description('用户 ID'),
            }),
            // channel 类型
            Schema.object({
                type: Schema.const('channel' as const).description('频道'),
                value: Schema.string().default('').description('频道 ID'),
            }),
            // private 类型
            Schema.object({
                type: Schema.const('private' as const).description('私聊'),
                value: Schema.boolean().default(true).description('是否允许私聊'),
            }),
        ])
    ).default([]).description('过滤规则列表').role('table')
}

/**
 * 创建来源过滤配置（Intersect + Union：配置联动 1）
 */
const createSourceFilterConfig = () => {
    return Schema.intersect([
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
                    Schema.const('blacklist' as const).description('黑名单：不处理列表中的来源'),
                    Schema.const('whitelist' as const).description('白名单：只处理列表中的来源'),
                ]).default('whitelist').description('来源过滤模式'),
            }),
            Schema.object({}),
        ]),
    ])
}

/**
 * 创建关键词过滤配置（Intersect + Union：配置联动 1）
 */
const createKeywordFilterConfig = () => {
    return Schema.intersect([
        Schema.object({
            enableKeywordFilter: Schema.boolean()
                .default(false)
                .description('是否启用关键词过滤'),
        }),
        Schema.union([
            Schema.object({
                enableKeywordFilter: Schema.const(true).required(),
                keywords: Schema.array(Schema.string())
                    .default([])
                    .description('关键词列表（每行一个关键词）'),
                keywordFilterMode: Schema.union([
                    Schema.const('blacklist' as const).description('黑名单：只响应匹配关键词的消息'),
                    Schema.const('whitelist' as const).description('白名单：只响应不匹配关键词的消息'),
                ]).default('blacklist').description('关键词过滤模式'),
            }),
            Schema.object({}),
        ]),
    ])
}

/**
 * 创建指令过滤配置（Intersect + Union：配置联动 1）
 */
const createCommandFilterConfig = (ctx: Context) => {
    const commands = getAvailableCommands(ctx)

    return Schema.intersect([
        Schema.object({
            enableCommandFilter: Schema.boolean()
                .default(false)
                .description('是否启用指令过滤'),
        }),
        Schema.union([
            Schema.object({
                enableCommandFilter: Schema.const(true).required(),
                commands: Schema.array(Schema.union([
                    Schema.string(),
                    ...commands.map(name => Schema.const(name)),
                ]))
                    .default([])
                    .description(`允许响应的指令列表${commands.length > 0 ? `（可用指令：${commands.join(', ')}）` : '（插件加载时可检测到指令）'}`)
                    .role('checkbox'),
                commandFilterMode: Schema.union([
                    Schema.const('blacklist' as const).description('黑名单：只响应列表中的指令'),
                    Schema.const('whitelist' as const).description('白名单：响应列表外的指令'),
                ]).default('blacklist').description('指令过滤模式'),
            }),
            Schema.object({}),
        ]),
    ])
}

/**
 * 创建约束模式配置 Schema
 */
const createConstrainedModeConfig = (ctx: Context) => {
    return Schema.intersect([
        // 来源过滤
        createSourceFilterConfig(),

        // 关键词过滤
        createKeywordFilterConfig(),

        // 指令过滤
        createCommandFilterConfig(ctx),
    ])
}

/**
 * 创建无约束模式配置 Schema
 */
const createUnconstrainedModeConfig = (ctx: Context) => {
    return Schema.intersect([
        // 来源过滤
        createSourceFilterConfig(),

        // 指令过滤
        createCommandFilterConfig(ctx),
    ])
}

/**
 * 创建单个 Bot 配置 Schema（Intersect + Union：配置联动 2）
 */
const createBotConfigSchema = (ctx: Context): Schema<BotConfig> => {
    return Schema.intersect([
        // 基础配置
        Schema.object({
            platform: Schema.string()
                .description('Bot 平台名称（如 onebot, qq, discord）')
                .required(),
            selfId: Schema.string()
                .description('Bot 账号 ID')
                .required(),
            enabled: Schema.boolean()
                .default(true)
                .description('是否启用此 bot 的响应控制'),
            mode: Schema.union([
                Schema.const('constrained' as const)
                    .description('[约束模式] 非指令消息必须匹配关键词才响应，适合功能型 Bot'),
                Schema.const('unconstrained' as const)
                    .description('[放行模式] 非指令消息全部放行，适合 LLM 智能对话 Bot'),
            ]).required().description('响应模式'),
        }).description('基础配置'),

        // 模式联动配置
        Schema.union([
            Schema.intersect([
                Schema.object({
                    mode: Schema.const('constrained' as const).required(),
                }),
                createConstrainedModeConfig(ctx),
            ]).description('约束模式配置'),
            Schema.intersect([
                Schema.object({
                    mode: Schema.const('unconstrained' as const).required(),
                }),
                createUnconstrainedModeConfig(ctx),
            ]).description('放行模式配置'),
        ]),
    ]) as Schema<BotConfig>
}

/**
 * 创建插件配置 Schema
 */
export const createConfig = (ctx: Context): Schema<any> => {
    const commands = getAvailableCommands(ctx)

    return Schema.object({
        bots: Schema.array(createBotConfigSchema(ctx))
            .role('table')
            .default([])
            .description(`Bot 配置列表${commands.length > 0 ? `\n\n检测到 ${commands.length} 个可用指令` : ''}`),
        debug: Schema.boolean()
            .default(false)
            .description('启用调试日志（输出详细的决策过程）'),
    })
}

/**
 * 静态的指令过滤配置 Schema（不依赖 ctx，用于顶层导出）
 */
const createStaticCommandFilterConfig = () => {
    return Schema.intersect([
        Schema.object({
            enableCommandFilter: Schema.boolean()
                .default(false)
                .description('是否启用指令过滤'),
        }),
        Schema.union([
            Schema.object({
                enableCommandFilter: Schema.const(true).required(),
                commands: Schema.array(Schema.string())
                    .default([])
                    .description('允许响应的指令列表（插件加载后会自动填充可用指令）')
                    .role('checkbox'),
                commandFilterMode: Schema.union([
                    Schema.const('blacklist' as const).description('黑名单：只响应列表中的指令'),
                    Schema.const('whitelist' as const).description('白名单：响应列表外的指令'),
                ]).default('blacklist').description('指令过滤模式'),
            }),
            Schema.object({}),
        ]),
    ])
}

/**
 * 静态的单个 Bot 配置 Schema（不依赖 ctx，用于顶层导出）
 */
const createStaticBotConfigSchema = (): Schema<BotConfig> => {
    return Schema.intersect([
        // 基础配置
        Schema.object({
            platform: Schema.string()
                .description('Bot 平台名称（如 onebot, qq, discord）')
                .required(),
            selfId: Schema.string()
                .description('Bot 账号 ID')
                .required(),
            enabled: Schema.boolean()
                .default(true)
                .description('是否启用此 bot 的响应控制'),
            mode: Schema.union([
                Schema.const('constrained' as const)
                    .description('[约束模式] 非指令消息必须匹配关键词才响应，适合功能型 Bot'),
                Schema.const('unconstrained' as const)
                    .description('[放行模式] 非指令消息全部放行，适合 LLM 智能对话 Bot'),
            ]).required().description('响应模式'),
        }).description('基础配置'),

        // 模式联动配置
        Schema.union([
            Schema.intersect([
                Schema.object({
                    mode: Schema.const('constrained' as const).required(),
                }),
                Schema.intersect([
                    createSourceFilterConfig(),
                    createKeywordFilterConfig(),
                    createStaticCommandFilterConfig(),
                ]),
            ]).description('约束模式配置'),
            Schema.intersect([
                Schema.object({
                    mode: Schema.const('unconstrained' as const).required(),
                }),
                Schema.intersect([
                    createSourceFilterConfig(),
                    createStaticCommandFilterConfig(),
                ]),
            ]).description('放行模式配置'),
        ]),
    ]) as Schema<BotConfig>
}

/**
 * 静态的插件配置 Schema（不依赖 ctx，用于顶层导出）
 * 这是插件入口必须导出的 Config，Koishi 会使用它来初始化配置界面
 */
export const Config: Schema<{ bots: BotConfig[]; debug: boolean }> = Schema.object({
    bots: Schema.array(createStaticBotConfigSchema())
        .role('table')
        .default([])
        .description('Bot 配置列表'),
    debug: Schema.boolean()
        .default(false)
        .description('启用调试日志（输出详细的决策过程）'),
})

// 静态导出（用于类型检查）
export const name = 'multi-bot-controller'
