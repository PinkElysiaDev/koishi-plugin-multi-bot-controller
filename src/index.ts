// src/index.ts
import { Context } from 'koishi'
import { Config, BotConfig } from './types'
import { Config as ConfigSchema, name } from './config'
import { BotManager } from './bot-manager'
import { Status } from '@satorijs/protocol'

export { Config, BotConfig } from './types'
export { name }

export function apply(ctx: Context, config: Config) {
    const logger = ctx.logger('multi-bot-controller')

    // 创建 Bot 管理服务
    const manager = new BotManager(ctx, config.bots)

    logger.info('Multi-Bot Controller 插件已加载')
    logger.info(`当前配置了 ${config.bots.length} 个 bot`)

    // ========================================
    // 核心功能：在 attach-channel 事件中拦截
    // ========================================
    ctx.on('attach-channel', (session) => {
        // 私聊消息不需要处理 assignee
        if (session.isDirect) return

        const { platform, selfId, channel } = session

        // 获取当前 bot 的配置
        const botConfig = manager.getBotConfig(platform, selfId)

        if (!botConfig) {
            // 没有配置，不干预
            return
        }

        // 判断是否应该响应
        if (!manager.shouldBotRespond(session, botConfig)) {
            // 不应该响应
            // 如果当前 assignee 是自己，主动放弃
            if ((channel as any).assignee === selfId) {
                logger.debug(`[${platform}:${selfId}] 放弃处理消息`)
                ;(channel as any).assignee = ''
            }
            return
        }

        // 应该响应，确保 assignee 是自己
        if ((channel as any).assignee !== selfId) {
            logger.debug(`[${platform}:${selfId}] 接管消息处理`)
            ;(channel as any).assignee = selfId
            // observe 机制会在消息处理结束后自动同步到数据库
        }
    })

    // ========================================
    // 辅助命令
    // ========================================

    // 查看可用的 bots
    ctx.command('mc.bots', '查看可用的 Bot 列表')
        .alias('mbc.bots')
        .action(() => {
            const bots = manager.getAvailableBots()
            if (bots.length === 0) {
                return '当前没有可用的 Bot'
            }

            let output = `可用的 Bot 列表（共 ${bots.length} 个）：\n`
            for (const bot of bots) {
                const statusIcon = bot.status === Status.ONLINE ? '🟢' : '🔴'
                output += `${statusIcon} ${bot.platform}:${bot.selfId}\n`
            }
            return output
        })

    // 查看可用的指令
    ctx.command('mc.commands', '查看可用的指令列表')
        .alias('mbc.commands')
        .action(() => {
            const commands = manager.getAvailableCommands()
            if (commands.length === 0) {
                return '当前没有可用的指令'
            }

            let output = `可用的指令（共 ${commands.length} 个）：\n`
            for (const cmd of commands) {
                output += `- ${cmd.name}${cmd.description ? `: ${cmd.description}` : ''}\n`
            }
            return output
        })

    // 查看当前配置
    ctx.command('mc.config', '查看当前插件配置')
        .alias('mbc.config')
        .action(() => {
            if (config.bots.length === 0) {
                return '当前没有配置任何 Bot'
            }

            let output = `当前配置（共 ${config.bots.length} 个 Bot）：\n\n`

            for (const bot of config.bots) {
                output += `## ${bot.platform}:${bot.selfId}\n`
                output += `- 启用状态: ${bot.enabled ? '✅' : '❌'}\n`
                output += `- 响应模式: ${bot.mode === 'constrained' ? '有条件约束' : '无约束'}\n`
                output += `- 指令列表: ${bot.commands.length === 0 ? '（全部）' : bot.commands.join(', ')}\n`
                output += `- 指令过滤: ${bot.commandFilterMode === 'blacklist' ? '黑名单' : '白名单'}\n`

                if (bot.mode === 'constrained') {
                    output += `- 关键词: ${bot.keywords.length === 0 ? '（无）' : bot.keywords.join(', ')}\n`
                    output += `- 关键词过滤: ${bot.keywordFilterMode === 'blacklist' ? '黑名单' : '白名单'}\n`
                }

                output += '\n'
            }

            return output.trim()
        })

    // ========================================
    // 生命周期事件
    // ========================================

    // 当新 bot 上线时
    ctx.on('login-added', ({ platform, selfId }) => {
        logger.info(`新 Bot 上线: ${platform}:${selfId}`)
        // 可以在这里自动添加配置提示
        const existing = manager.getBotConfig(platform, selfId)
        if (!existing) {
            logger.warn(`Bot ${platform}:${selfId} 尚未配置，请添加配置以启用控制`)
        }
    })

    // 插件就绪时
    ctx.on('ready', () => {
        logger.info('Multi-Bot Controller 已就绪')
        const bots = manager.getAvailableBots()
        logger.info(`检测到 ${bots.length} 个 Bot`)

        const onlineBots = bots.filter(b => b.status === Status.ONLINE)
        logger.info(`其中 ${onlineBots.length} 个在线`)
    })
}
