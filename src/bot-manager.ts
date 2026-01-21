// src/bot-manager.ts
import { Context, Session } from 'koishi'
import { BotConfig } from './types'

export class BotManager {
    private logger: ReturnType<Context['logger']>

    constructor(
        private ctx: Context,
        private configs: BotConfig[]
    ) {
        this.logger = ctx.logger('multi-bot-controller')
    }

    /** 获取指定 bot 的配置 */
    getBotConfig(platform: string, selfId: string): BotConfig | undefined {
        return this.configs.find(
            bot => bot.platform === platform && bot.selfId === selfId
        )
    }

    /**
     * 获取消息中艾特的所有 bot selfId 列表
     */
    getMentionedBotIds(session: Session): string[] {
        const elements = session.elements || []
        const mentionedIds: string[] = []
        for (const el of elements) {
            if ((el as any)?.type === 'at' && (el as any)?.id) {
                mentionedIds.push((el as any).id)
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
        return this.checkKeywordMatch(session.content || '', botConfig, session)
    }

    /**
     * 检查来源过滤
     * @returns true 表示通过来源检查，false 表示被过滤
     */
    private checkSourceFilter(session: Session, botConfig: BotConfig): boolean {
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
    private checkCommandPermission(session: Session, botConfig: BotConfig): boolean {
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
     */
    private checkKeywordMatch(content: string, botConfig: BotConfig, session: Session): boolean {
        const { enableKeywordFilter, keywords = [], keywordFilterMode = 'whitelist' } = botConfig

        if (!enableKeywordFilter) {
            return false
        }

        if (keywords.length === 0) {
            return false
        }

        const matched = keywords.some(kw => content.includes(kw))
        return keywordFilterMode === 'whitelist' ? matched : !matched
    }

    /** 调试日志 */
    private debugLog(session: Session, message: string) {
        this.logger.debug(
            `[${session.platform}:${session.selfId}] ` +
            `频道 ${session.channelId}, 用户 ${session.userId}: ${message}`
        )
    }
}
