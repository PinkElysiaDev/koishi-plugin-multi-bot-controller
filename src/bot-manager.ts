// src/bot-manager.ts
import { Context, Session } from 'koishi'
import { Status } from '@satorijs/protocol'
import { BotConfig, AvailableBot, AvailableCommand } from './types'

export class BotManager {
    private logger: ReturnType<Context['logger']>

    constructor(
        private ctx: Context,
        private configs: BotConfig[]
    ) {
        this.logger = ctx.logger('multi-bot-controller')
    }

    /** 获取所有可用的 bots */
    getAvailableBots(): AvailableBot[] {
        return this.ctx.bots.map(bot => ({
            platform: bot.platform,
            selfId: bot.selfId,
            status: bot.status,
        }))
    }

    /** 获取所有可用的指令 */
    getAvailableCommands(): AvailableCommand[] {
        const commandMap = (this.ctx.$commander as any)._commandMap
        if (!commandMap) return []

        return Array.from(commandMap.values())
            .filter((cmd: any) => cmd.name && cmd.name !== '' && !cmd.name.includes('.'))
            .map((cmd: any) => ({
                name: cmd.name,
                description: cmd.description || '',
            }))
            .sort((a, b) => a.name.localeCompare(b.name))
    }

    /** 获取指定 bot 的配置 */
    getBotConfig(platform: string, selfId: string): BotConfig | undefined {
        return this.configs.find(
            bot => bot.platform === platform && bot.selfId === selfId
        )
    }

    /**
     * 检查消息是否艾特了指定的 bot
     * @returns true 表示消息艾特了该 bot
     */
    isBotMentioned(session: Session, selfId: string): boolean {
        const elements = session.elements || []
        return elements.some((el: any) =>
            el?.type === 'at' && el?.id === selfId
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

        const isCommand = session.argv?.command !== null

        // 2. 指令处理：两种模式逻辑相同
        if (isCommand) {
            return this.checkCommandPermission(session, botConfig)
        }

        // 3. 非指令处理：根据模式决定
        switch (botConfig.mode) {
            case 'unconstrained':
                this.debugLog(session, 'unconstrained 模式：非指令消息放行')
                return true

            case 'constrained':
                const matched = this.checkKeywordMatch(session.content || '', botConfig)
                this.debugLog(session, `constrained 模式：关键词匹配结果 = ${matched}`)
                return matched
        }
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
                    // 群号匹配
                    return session.guildId === (filter.value as string)
                case 'user':
                    // 用户 ID 匹配
                    return session.userId === (filter.value as string)
                case 'channel':
                    // 频道 ID 匹配
                    return session.channelId === (filter.value as string)
                case 'private':
                    // 私聊匹配，filter.value 为 boolean
                    return session.isDirect === (filter.value as boolean)
            }
        })

        const result = sourceFilterMode === 'whitelist' ? matched : !matched

        this.debugLog(session,
            `来源过滤：${matched ? '匹配' : '不匹配'}，${sourceFilterMode} 模式 → ${result ? '通过' : '阻止'}`)

        return result
    }

    /**
     * 检查指令权限
     * 两种模式的指令处理逻辑完全相同
     */
    private checkCommandPermission(session: Session, botConfig: BotConfig): boolean {
        // 修复：确保 command 存在
        if (!session.argv?.command) {
            this.debugLog(session, '指令消息但 command 为空，放行')
            return true
        }

        const commandName = session.argv.command.name
        const { enableCommandFilter, commands = [], commandFilterMode = 'blacklist' } = botConfig

        // 如果未启用指令过滤，所有指令都放行
        if (!enableCommandFilter) {
            this.debugLog(session,
                `指令 "${commandName}"：未启用指令过滤，放行`)
            return true
        }

        if (commands.length === 0) {
            // 启用过滤但列表为空 = 允许所有指令
            const result = commandFilterMode === 'blacklist'
            this.debugLog(session,
                `指令 "${commandName}"：列表为空，${commandFilterMode} 模式 → ${result}`)
            return result
        }

        const inList = commands.includes(commandName)
        const result = commandFilterMode === 'blacklist' ? inList : !inList

        this.debugLog(session,
            `指令 "${commandName}"：${inList ? '在' : '不在'}列表中，${commandFilterMode} 模式 → ${result}`)
        return result
    }

    /**
     * 检查关键词匹配
     * 仅 constrained 模式使用
     */
    private checkKeywordMatch(content: string, botConfig: BotConfig): boolean {
        const { enableKeywordFilter, keywords = [], keywordFilterMode = 'blacklist' } = botConfig

        // 如果未启用关键词过滤，不响应
        if (!enableKeywordFilter) {
            return false
        }

        if (keywords.length === 0) {
            return false
        }

        const matched = keywords.some(kw => content.includes(kw))
        return keywordFilterMode === 'blacklist' ? matched : !matched
    }

    /** 调试日志 */
    private debugLog(session: Session, message: string) {
        this.logger.debug(
            `[${session.platform}:${session.selfId}] ` +
            `频道 ${session.channelId}, 用户 ${session.userId}: ${message}`
        )
    }

    /** 更新配置列表 */
    updateConfigs(configs: BotConfig[]) {
        this.configs = configs
        this.logger.info(`配置已更新，当前 ${configs.length} 个 bot 配置`)
    }
}
