// src/index.ts
import { Context, Schema } from 'koishi'
import type { Config as ConfigType, BotInfo } from './types'
import { MultiBotControllerService, DecisionDetails } from './bot-manager'

export { BotConfig, BotInfo } from './types'
export { MultiBotControllerService } from './bot-manager'
export { name, Config } from './config'

// 声明 Koishi 类型扩展
declare module 'koishi' {
  interface Context {
    // multi-bot-controller 服务（供其他插件使用）
    'multi-bot-controller': MultiBotControllerService
  }

  interface Events {
    /** bot 配置更新事件 */
    'multi-bot-controller/bots-updated'(bots: BotInfo[]): void
  }
}

export const usage = `---

## 使用说明

本插件用于管理多 Bot 场景下的消息响应行为。

### 工作原理

当 Bot 的消息满足响应条件时，插件会自动修改该消息的 \`assignee\` 字段，使其指向应该响应的 Bot。

### 兼容性说明

- **adapter-onebot 多开**: 使用 adapter-onebot 多开时无需修改默认的服务器监听路径
- **Bug 反馈**: 请在插件主页提交 Issue

---

`

export function apply(ctx: Context, config: ConfigType) {
    const logger = ctx.logger('multi-bot-controller')

    // 注册服务
    const mbcService = new MultiBotControllerService(ctx, config)

    // 将服务添加到 context
    ctx['multi-bot-controller'] = mbcService

    /**
     * 发出 bot 配置更新事件
     */
    const emitBotsUpdated = () => {
        const botInfoList = mbcService.getBots()
        ctx.emit('multi-bot-controller/bots-updated', botInfoList)
        logger.debug(`已发出 bot 配置更新事件，共 ${botInfoList.length} 个 bot`)
    }

    // 立即发出初始事件（供后续加载的插件接收）
    setTimeout(() => emitBotsUpdated(), 100)

    // ========================================
    // 动态指令监听服务
    // ========================================
    class CommandsService {
        private commandList: string[] = []
        private debounceTimer: NodeJS.Timeout | null = null

        constructor(private ctx: Context) {
            setTimeout(() => this.scanCommands(), 1000)
            this.ctx.on('internal/runtime', () => this.scheduleScan())
            this.ctx.on('command-added', () => this.scheduleScan())
            this.ctx.on('command-removed', () => this.scheduleScan())
            this.ctx.on('command-updated', () => this.scheduleScan())
        }

        private scheduleScan() {
            if (this.debounceTimer) clearTimeout(this.debounceTimer)
            this.debounceTimer = setTimeout(() => this.scanCommands(), 200)
        }

        private scanCommands() {
            const commandList = (this.ctx.$commander as any)?._commandList
            if (!commandList) {
                this.commandList = []
                this.updateConfigSchema()
                return
            }

            const commands = commandList
                .filter((cmd: any) => cmd.name && cmd.name !== '' && !cmd.name.includes('.'))
                .map((cmd: any) => cmd.name)
                .sort()

            if (JSON.stringify(this.commandList) !== JSON.stringify(commands)) {
                this.commandList = commands
                logger.debug(`指令列表已更新，共 ${commands.length} 个`)
                this.updateConfigSchema()
            }
        }

        private updateConfigSchema() {
            const commands = this.commandList

            if (commands.length === 0) {
                this.ctx.schema.set('multi-bot-controller.commandFilter', Schema.array(Schema.union([
                    Schema.const('').description('暂无可用指令'),
                ])).default([]).description('允许响应的指令列表（暂无可用指令）'))
                return
            }

            const unionSchema = Schema.union(commands.map(name =>
                Schema.const(name).description(name)
            ))

            this.ctx.schema.set('multi-bot-controller.commandFilter', Schema.array(unionSchema)
                .default([])
                .description(`允许响应的指令列表（共 ${commands.length} 个可用指令）`)
                .role('select'))

            logger.info(`指令 Schema 已更新，共 ${commands.length} 个选项`)
        }
    }

    const commandsService = new CommandsService(ctx)

    logger.info('Multi-Bot Controller 插件已加载')
    logger.info(`已配置 ${(config.bots || []).length} 个 Bot 控制规则`)

    // ========================================
    // 核心功能：在 attach-channel 事件中拦截
    // ========================================
    const manager = mbcService.getManager()

    // ========================================
    // Middleware：在消息处理前进行来源过滤检查
    // ========================================
    // 注意：middleware 执行顺序很关键，需要在其他插件之前执行
    ctx.middleware((session, next) => {
        try {
            const { platform, selfId } = session
            const botConfig = manager.getBotConfig(platform, selfId)

            // 未配置或已禁用的 bot - 不处理消息，让其他插件处理
            if (!botConfig || !botConfig.enabled) {
                return next()
            }

            // 来源过滤检查 - 不符合条件的直接返回，不调用 next() 阻止后续处理
            if (!manager.checkSourceFilter(session, botConfig)) {
                logger.debug(`[${platform}:${selfId}] 来源过滤：阻止消息响应`)
                return  // 不调用 next()，阻止后续中间件执行
            }

            // 通过来源过滤，继续处理
            return next()
        } catch (error) {
            logger.error('Middleware 执行出错:', error)
            return next()
        }
    })

    ctx.on('attach-channel', (session) => {
        if (session.isDirect) return

        const { platform, selfId, channel } = session
        const botConfig = manager.getBotConfig(platform, selfId)
        const content = session.content || ''

        // 未配置的 bot 不响应任何消息
        if (!botConfig) {
            if ((channel as any).assignee === selfId) {
                logger.info(`[${platform}:${selfId}] 消息: "${content}" | 未配置控制规则，取消响应`)
                ;(channel as any).assignee = ''
            }
            return
        }

        // 已禁用的 bot 不响应任何消息
        if (!botConfig.enabled) {
            if ((channel as any).assignee === selfId) {
                logger.info(`[${platform}:${selfId}] 消息: "${content}" | 已禁用响应控制，取消响应`)
                ;(channel as any).assignee = ''
            }
            return
        }

        // 详细日志模式：获取完整判断信息
        if (config.verboseLog) {
            const details = manager.getDecisionDetails(session, botConfig)
            const userName = session.username || session.userId
            const verboseLog = manager.formatVerboseLog(session, content, details, botConfig, userName)
            logger.info(verboseLog)
        }

        // ========== 1. 来源过滤（最高优先级）==========
        if (!manager.checkSourceFilter(session, botConfig)) {
            if ((channel as any).assignee === selfId) {
                logger.info(`[${platform}:${selfId}] 消息: "${content}" | 不在允许的来源中，取消响应`)
                ;(channel as any).assignee = ''
            }
            return
        }

        // ========== 2. 艾特检测 ==========
        const mentionedIds = manager.getMentionedBotIds(session)

        if (mentionedIds.length > 0) {
            if (mentionedIds.includes(selfId)) {
                // 被艾特 → 接管消息处理
                if ((channel as any).assignee !== selfId) {
                    logger.info(`[${platform}:${selfId}] 消息: "${content}" | 被艾特，接管消息处理`)
                    ;(channel as any).assignee = selfId
                }
            } else {
                // 别人被艾特 → 取消响应
                if ((channel as any).assignee === selfId) {
                    logger.info(`[${platform}:${selfId}] 消息: "${content}" | 被 ${mentionedIds.join(', ')} 艾特，但不是自己，取消响应`)
                    ;(channel as any).assignee = ''
                }
            }
            return  // 艾特处理完直接返回，跳过后续判断
        }

        // ========== 3. 非艾特时的正常过滤逻辑 ==========
        // 3a. 指令处理
        const isCommand = !!session.argv?.command
        if (isCommand) {
            const hasPermission = manager.checkCommandPermission(session, botConfig)
            if (hasPermission) {
                if ((channel as any).assignee !== selfId) {
                    logger.info(`[${platform}:${selfId}] 消息: "${content}" | 指令: ${session.argv.command.name} | 权限验证通过，接管消息处理`)
                    ;(channel as any).assignee = selfId
                }
            } else {
                if ((channel as any).assignee === selfId) {
                    logger.info(`[${platform}:${selfId}] 消息: "${content}" | 指令: ${session.argv.command.name} | 权限验证失败，取消响应`)
                    ;(channel as any).assignee = ''
                }
            }
            return
        }

        // 3b. 关键词过滤
        const keywordMatch = manager.checkKeywordMatch(session.content || '', botConfig)
        if (keywordMatch) {
            if ((channel as any).assignee !== selfId) {
                logger.info(`[${platform}:${selfId}] 消息: "${content}" | 关键词匹配，接管消息处理`)
                ;(channel as any).assignee = selfId
            }
        } else {
            if ((channel as any).assignee === selfId) {
                logger.info(`[${platform}:${selfId}] 消息: "${content}" | 关键词不匹配，取消响应`)
                ;(channel as any).assignee = ''
            }
        }
        return
    })

    // 查看当前配置
    ctx.command('mc.config', '查看当前插件配置')
        .alias('mbc.config')
        .action(() => {
            const bots = config.bots || []
            if (bots.length === 0) {
                return '当前没有配置任何 Bot\n\n提示：在插件配置页面点击「添加配置」来新增 Bot 控制规则'
            }

            let output = `当前配置（共 ${bots.length} 个 Bot）：\n\n`

            for (const bot of bots) {
                output += `## ${bot.platform}:${bot.selfId}\n`
                output += `- 启用状态: ${bot.enabled ? '已启用' : '已禁用'}\n`

                if (bot.enableSourceFilter) {
                    const filters = bot.sourceFilters || []
                    output += `- 来源过滤: ${filters.length} 条规则，${bot.sourceFilterMode === 'blacklist' ? '黑名单' : '白名单'}\n`
                }

                if (bot.enableCommandFilter) {
                    const commands = bot.commands || []
                    output += `- 指令过滤: ${commands.length === 0 ? '（无）' : commands.map((c: string) => `\`${c}\``).join(', ')}\n`
                }

                if (bot.enableKeywordFilter) {
                    const keywords = bot.keywords || []
                    output += `- 关键词过滤: ${keywords.length === 0 ? '（无）' : keywords.map((k: string) => `\`${k}\``).join(', ')}\n`
                }

                output += '\n'
            }

            return output.trim()
        })

    // 插件就绪时
    ctx.on('ready', () => {
        logger.info('Multi-Bot Controller 已就绪')
        emitBotsUpdated()
        commandsService['scanCommands']()
    })
}
