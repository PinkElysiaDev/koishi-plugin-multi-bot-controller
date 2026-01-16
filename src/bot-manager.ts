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
     * 判断 bot 是否应该响应此消息
     * @returns true 表示应该响应（需要 assign），false 表示不响应
     */
    shouldBotRespond(session: Session, botConfig: BotConfig): boolean {
        if (!botConfig.enabled) {
            this.debugLog(session, 'Bot 未启用')
            return false
        }

        const isCommand = session.argv?.command !== null

        // 1. 指令处理：两种模式逻辑相同
        if (isCommand) {
            return this.checkCommandPermission(session, botConfig)
        }

        // 2. 非指令处理：根据模式决定
        switch (botConfig.mode) {
            case 'unconstrained':
                this.debugLog(session, 'unconstrained 模式：非指令消息放行')
                return true

            case 'constrained':
                const matched = this.checkKeywordMatch(session.content, botConfig)
                this.debugLog(session, `constrained 模式：关键词匹配结果 = ${matched}`)
                return matched
        }
    }

    /**
     * 检查指令权限
     * 两种模式的指令处理逻辑完全相同
     */
    private checkCommandPermission(session: Session, botConfig: BotConfig): boolean {
        const commandName = session.argv.command.name
        const { commands, commandFilterMode } = botConfig

        if (commands.length === 0) {
            // 空列表 = 允许所有指令
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
        const { keywords, keywordFilterMode } = botConfig

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
