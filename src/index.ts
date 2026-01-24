// src/index.ts
import { Context, Schema } from 'koishi'
import type { Config as ConfigType, BotInfo } from './types'
import { MultiBotControllerService } from './bot-manager'

export { BotConfig, BotInfo } from './types'
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

    ctx.on('attach-channel', (session) => {
        if (session.isDirect) return

        const { platform, selfId, channel } = session
        const botConfig = manager.getBotConfig(platform, selfId)

        if (!botConfig) return

        // 艾特逻辑
        const mentionedIds = manager.getMentionedBotIds(session)

        if (mentionedIds.length > 0) {
            if (mentionedIds.includes(selfId)) {
                if ((channel as any).assignee !== selfId) {
                    logger.info(`[${platform}:${selfId}] 被艾特，接管消息处理`)
                    ;(channel as any).assignee = selfId
                }
            } else {
                // 被艾特但不是自己，不响应
                if ((channel as any).assignee === selfId) {
                    logger.debug(`[${platform}:${selfId}] 被 ${mentionedIds.join(', ')} 艾特，但不是自己，取消响应`)
                    ;(channel as any).assignee = ''
                }
            }
            return
        }

        // 正常过滤逻辑
        const shouldRespond = manager.shouldBotRespond(session, botConfig)

        if (!shouldRespond) {
            if ((channel as any).assignee === selfId) {
                logger.debug(`[${platform}:${selfId}] 不满足响应条件，取消响应`)
                ;(channel as any).assignee = ''
            }
            return
        }

        // 检查是否有其他 bot 应该优先响应
        const currentAssignee = (channel as any).assignee as string | undefined

        if (currentAssignee && currentAssignee !== selfId && currentAssignee !== '') {
            const otherBotConfig = manager.getBotConfig(platform, currentAssignee)
            if (otherBotConfig && manager.shouldBotRespond(session, otherBotConfig)) {
                logger.info(`[${platform}:${selfId}] Bot ${currentAssignee} 已在响应，跳过`)
                return
            }
        }

        if ((channel as any).assignee !== selfId) {
            logger.info(`[${platform}:${selfId}] 满足响应条件，接管消息处理`)
            ;(channel as any).assignee = selfId
        }
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
