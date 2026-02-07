// src/bot-manager.ts
import { Context, Session, Service } from 'koishi'
import { BotConfig, BotInfo, Config } from './types'

/**
 * 判断结果的详细信息
 */
export interface DecisionDetails {
    /** 来源过滤结果 */
    sourceFilter: { passed: boolean; reason?: string }
    /** 是否被艾特 */
    isMentioned: boolean
    /** 艾特的是哪些 bot */
    mentionedBots: string[]
    /** 是否是指令 */
    isCommand: boolean
    /** 指令名称 */
    commandName?: string
    /** 指令过滤结果 */
    commandFilter: { passed: boolean; reason?: string }
    /** 关键词过滤结果 */
    keywordFilter: { passed: boolean; reason?: string; matchedKeyword?: string }
    /** 最终结果 */
    finalResult: 'respond' | 'skip' | 'yield'
    /** 最终结果原因 */
    finalReason: string
}

export class BotManager {
    private logger: ReturnType<Context['logger']>

    constructor(
        private ctx: Context,
        private configs: BotConfig[]
    ) {
        this.logger = ctx.logger('multi-bot-controller')
    }

    /**
     * 获取已配置的 bot 信息列表
     * 供其他插件使用
     */
    getBots(): BotInfo[] {
        return this.configs.map(bot => ({
            platform: bot.platform,
            selfId: bot.selfId,
            enabled: bot.enabled,
        }))
    }

    /** 获取指定 bot 的配置 */
    getBotConfig(platform: string, selfId: string): BotConfig | undefined {
        return this.configs.find(
            bot => bot.platform === platform && bot.selfId === selfId
        )
    }

    /**
     * 获取消息中艾特的所有 bot selfId 列表
     * 多种方式检测：stripped.appel、elements、quote、content 正则
     */
    getMentionedBotIds(session: Session): string[] {
        const mentionedIds: string[] = []
        const seen = new Set<string>()

        // 1. 检查 Koishi 预处理的艾特结果
        // 如果 stripped.appel 为 true，说明当前 bot 被艾特
        if ((session as any).stripped?.appel) {
            const selfId = session.selfId
            if (!seen.has(selfId)) {
                mentionedIds.push(selfId)
                seen.add(selfId)
            }
        }

        // 2. 从 session.elements 中提取 at 元素
        const elements = session.elements || []
        for (const el of elements) {
            if ((el as any)?.type === 'at' && (el as any)?.attrs?.['id']) {
                const id = (el as any).attrs.id
                if (!seen.has(id)) {
                    mentionedIds.push(id)
                    seen.add(id)
                }
            }
        }

        // 3. 检查是否回复某个 bot（quote）
        if (session.quote?.user?.id) {
            const quoteUserId = session.quote.user.id
            if (!seen.has(quoteUserId)) {
                mentionedIds.push(quoteUserId)
                seen.add(quoteUserId)
            }
        }

        // 4. 从 session.content 中解析 <at id="xxx"/> XML 格式
        // 支持两种格式: <at id="xxx"/> 和 <at name='...'>xxx</at>
        const content = session.content || ''
        // 自闭合格式
        const atRegex1 = /<at\s+id=["']([^"']+)["']\s*\/?>/g
        let match: RegExpExecArray | null
        while ((match = atRegex1.exec(content)) !== null) {
            const id = match[1]
            if (!seen.has(id)) {
                mentionedIds.push(id)
                seen.add(id)
            }
        }
        // 包裹格式: <at name='...'>xxx</at>
        const atRegex2 = /<at[^>]*>\s*(\d+)\s*<\/at>/g
        while ((match = atRegex2.exec(content)) !== null) {
            const id = match[1]
            if (!seen.has(id)) {
                mentionedIds.push(id)
                seen.add(id)
            }
        }

        return mentionedIds
    }

    /**
     * 判断 bot 是否应该响应此消息
     * @returns true 表示应该响应（需要 assign），false 表示不响应
     */
    shouldBotRespond(session: Session, botConfig: BotConfig): boolean {
        if (!botConfig.enabled) {
            this.debugLog(session, 'Bot 未启用')
            return false
        }

        // 1. 检查来源过滤
        if (!this.checkSourceFilter(session, botConfig)) {
            return false
        }

        const isCommand = !!session.argv?.command

        // 2. 指令处理
        if (isCommand) {
            return this.checkCommandPermission(session, botConfig)
        }

        // 3. 非指令处理：检查关键词过滤
        return this.checkKeywordMatch(session.content || '', botConfig)
    }

    /**
     * 检查来源过滤
     * @returns true 表示通过来源检查，false 表示被过滤
     */
    checkSourceFilter(session: Session, botConfig: BotConfig): boolean {
        const { enableSourceFilter, sourceFilters = [], sourceFilterMode = 'whitelist' } = botConfig

        // 如果未启用来源过滤，全部通过
        if (!enableSourceFilter) {
            return true
        }

        // 如果过滤器列表为空，全部通过
        if (sourceFilters.length === 0) {
            return true
        }

        // 检查是否有任何过滤器匹配
        const matched = sourceFilters.some(filter => {
            switch (filter.type) {
                case 'guild':
                    return session.guildId === (filter.value as string)
                case 'user':
                    return session.userId === (filter.value as string)
                case 'channel':
                    return session.channelId === (filter.value as string)
                case 'private':
                    const filterValue = typeof filter.value === 'boolean'
                        ? filter.value
                        : (filter.value as string).toLowerCase() === 'true'
                    return session.isDirect === filterValue
            }
        })

        const result = sourceFilterMode === 'whitelist' ? matched : !matched

        this.debugLog(session,
            `来源过滤：${matched ? '匹配' : '不匹配'}，${sourceFilterMode} 模式 → ${result ? '通过' : '阻止'}`)

        return result
    }

    /**
     * 检查指令权限
     * 只响应列表中的指令
     */
    checkCommandPermission(session: Session, botConfig: BotConfig): boolean {
        if (!session.argv?.command) {
            return true
        }

        const commandName = session.argv.command.name
        const { enableCommandFilter, commands = [] } = botConfig

        if (!enableCommandFilter) {
            return true
        }

        if (commands.length === 0) {
            return false
        }

        const validCommands = commands.filter(c => c !== '')
        return validCommands.includes(commandName)
    }

    /**
     * 检查关键词匹配
     * 用于非指令消息的过滤
     *
     * 未开启过滤时：响应所有消息
     * 开启白名单模式：只响应包含关键词的消息
     * 开启黑名单模式：不响应包含关键词的消息
     */
    checkKeywordMatch(content: string, botConfig: BotConfig): boolean {
        const { enableKeywordFilter, keywords = [], keywordFilterMode = 'whitelist' } = botConfig

        // 未开启关键词过滤：响应所有消息
        if (!enableKeywordFilter) {
            return true
        }

        // 开启过滤但关键词列表为空：不响应
        if (keywords.length === 0) {
            return false
        }

        const matched = keywords.some(kw => content.includes(kw))

        // 白名单：匹配关键词才响应
        // 黑名单：匹配关键词不响应
        return keywordFilterMode === 'whitelist' ? matched : !matched
    }

    /** 调试日志 */
    private debugLog(session: Session, message: string) {
        this.logger.debug(
            `[${session.platform}:${session.selfId}] ` +
            `频道 ${session.channelId}, 用户 ${session.userId}: ${message}`
        )
    }

    /**
     * 获取消息判断的详细信息
     */
    getDecisionDetails(session: Session, botConfig: BotConfig): DecisionDetails {
        const details: DecisionDetails = {
            sourceFilter: { passed: false },
            isMentioned: false,
            mentionedBots: [],
            isCommand: false,
            commandFilter: { passed: false },
            keywordFilter: { passed: false },
            finalResult: 'skip',
            finalReason: ''
        }

        // 1. 来源过滤
        const sourcePassed = this.checkSourceFilter(session, botConfig)
        details.sourceFilter.passed = sourcePassed
        if (!sourcePassed) {
            details.sourceFilter.reason = botConfig.enableSourceFilter
                ? `${botConfig.sourceFilterMode === 'whitelist' ? '白名单' : '黑名单'}不匹配`
                : '未启用'
            details.finalResult = 'skip'
            details.finalReason = '来源过滤未通过'
            return details
        }

        // 2. 艾特检测
        const mentionedIds = this.getMentionedBotIds(session)
        details.isMentioned = mentionedIds.length > 0
        details.mentionedBots = mentionedIds

        const isSelfMentioned = mentionedIds.includes(session.selfId)
        if (mentionedIds.length > 0) {
            if (isSelfMentioned) {
                details.finalResult = 'respond'
                details.finalReason = '被艾特'
            } else {
                details.finalResult = 'yield'
                details.finalReason = `其他bot被艾特: ${mentionedIds.join(', ')}`
            }
            return details
        }

        // 3. 指令检测
        const isCommand = !!session.argv?.command
        details.isCommand = isCommand
        if (isCommand) {
            const commandName = session.argv.command.name
            details.commandName = commandName
            const commandPassed = this.checkCommandPermission(session, botConfig)
            details.commandFilter.passed = commandPassed
            if (!commandPassed) {
                details.commandFilter.reason = botConfig.enableCommandFilter
                    ? `指令不在允许列表中`
                    : '未启用'
            }
            details.finalResult = commandPassed ? 'respond' : 'skip'
            details.finalReason = commandPassed ? '指令允许' : '指令不允许'
            return details
        }

        // 4. 关键词检测
        const content = session.content || ''
        const keywordMatch = this.checkKeywordMatch(content, botConfig)
        details.keywordFilter.passed = keywordMatch

        if (!botConfig.enableKeywordFilter) {
            details.keywordFilter.reason = '未启用关键词过滤，响应所有消息'
        } else {
            const { keywords = [], keywordFilterMode = 'whitelist' } = botConfig
            if (keywords.length === 0) {
                details.keywordFilter.reason = '关键词列表为空'
            } else {
                const matched = keywords.find(kw => content.includes(kw))
                if (matched) {
                    details.keywordFilter.matchedKeyword = matched
                    details.keywordFilter.reason = `${keywordFilterMode === 'whitelist' ? '白名单' : '黑名单'}匹配: "${matched}"`
                } else {
                    details.keywordFilter.reason = `${keywordFilterMode === 'whitelist' ? '白名单' : '黑名单'}无匹配`
                }
            }
        }

        details.finalResult = keywordMatch ? 'respond' : 'skip'
        details.finalReason = keywordMatch ? '关键词匹配' : '关键词不匹配'

        return details
    }

    /**
     * 格式化详细日志
     * @param userName 用户名
     */
    formatVerboseLog(session: Session, content: string, details: DecisionDetails, botConfig: BotConfig, userName: string): string {
        // 最终结果文字描述
        const resultText: Record<string, string> = {
            respond: '响应',
            skip: '跳过',
            yield: '让出'
        }

        // 构建判断过程
        const parts: string[] = []

        // 来源过滤（仅当开启时显示）
        if (botConfig.enableSourceFilter) {
            parts.push(`来源:${details.sourceFilter.passed ? '✓' : '✗'}`)
        }

        // 艾特（只有自己被艾特时才显示"是"）
        const isSelfMentioned = details.mentionedBots.includes(session.selfId)
        parts.push(isSelfMentioned ? `艾特:是` : `艾特:否`)

        // 指令（仅当开启指令过滤时显示）
        if (botConfig.enableCommandFilter) {
            if (details.isCommand) {
                parts.push(`指令:${details.commandName}(${details.commandFilter.passed ? '✓' : '✗'})`)
            } else {
                parts.push('指令:否')
            }
        }

        // 关键词（仅当开启关键词过滤时显示）
        if (botConfig.enableKeywordFilter) {
            if (details.keywordFilter.matchedKeyword) {
                parts.push(`关键词:"${details.keywordFilter.matchedKeyword}"`)
            } else {
                parts.push('关键词:✗')
            }
        }

        // 组合最终日志
        // 格式: xxx说：内容 | botid | [来源] | 艾特 | [指令] | [关键词] → 结果
        const middlePart = parts.length > 0 ? ` | ${parts.join(' | ')}` : ''
        return `${userName}说：${content} | ${session.selfId}${middlePart} → ${resultText[details.finalResult]}`
    }
}

/**
 * Multi-Bot Controller 服务
 * 为其他插件提供 Bot 配置信息
 */
export class MultiBotControllerService extends Service {
    private manager: BotManager

    constructor(public readonly ctx: Context, config: Config) {
        super(ctx, 'multi-bot-controller')
        this.manager = new BotManager(ctx, config.bots || [])
    }

    /**
     * 获取已配置的 bot 信息列表
     * 供其他插件使用
     */
    getBots(): BotInfo[] {
        return this.manager.getBots()
    }

    /**
     * 获取 BotManager 实例（供内部使用）
     */
    getManager(): BotManager {
        return this.manager
    }
}
