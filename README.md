# koishi-plugin-multi-bot-controller

[![npm](https://img.shields.io/npm/v/koishi-plugin-multi-bot-controller)](https://www.npmjs.com/package/koishi-plugin-multi-bot-controller)

Multi-bot response controller for Koishi. Manage which bot should respond to messages in multi-bot scenarios.

## 功能特性

- **两种响应模式**
  - `constrained`（有条件约束）：根据关键词和指令决定是否响应
  - `unconstrained`（无约束）：非指令消息全部放行，由后续插件（如 LLM）判断

- **指令过滤**
  - 黑名单模式：只响应列表中的指令
  - 白名单模式：只响应列表外的指令

- **关键词过滤**（仅 constrained 模式）
  - 黑名单模式：只响应匹配关键词的消息
  - 白名单模式：只响应不匹配关键词的消息

- **辅助命令**
  - `mc.bots` - 查看可用的 Bot 列表
  - `mc.commands` - 查看可用的指令列表
  - `mc.config` - 查看当前插件配置

## 安装

```bash
# 使用 npm
npm install koishi-plugin-multi-bot-controller

# 使用 yarn
yarn add koishi-plugin-multi-bot-controller

# 使用 pnpm
pnpm add koishi-plugin-multi-bot-controller
```

## 配置

在 `koishi.yml` 中添加插件配置：

```yaml
plugins:
  multi-bot-controller:
    debug: false
    bots:
      # Bot 1: 有条件约束模式
      - platform: qq
        selfId: "123456789"
        enabled: true
        mode: constrained
        commands: []
        commandFilterMode: blacklist
        keywords: ["你好", "帮助", "查询"]
        keywordFilterMode: blacklist

      # Bot 2: 无约束模式（给 LLM 用）
      - platform: qq
        selfId: "987654321"
        enabled: true
        mode: unconstrained
        commands: ["echo", "ping"]
        commandFilterMode: whitelist
```

### 配置说明

#### 顶层配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `debug` | `boolean` | `false` | 是否启用调试日志 |
| `bots` | `BotConfig[]` | `[]` | Bot 配置列表 |

#### Bot 配置 (BotConfig)

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `platform` | `string` | **必需** | 平台名称（如 `qq`, `discord`） |
| `selfId` | `string` | **必需** | Bot 账号 ID |
| `enabled` | `boolean` | `true` | 是否启用此 bot 的响应控制 |
| `mode` | `ResponseMode` | `unconstrained` | 响应模式 |
| `commands` | `string[]` | `[]` | 允许响应的指令列表（空列表表示允许所有） |
| `commandFilterMode` | `FilterMode` | `blacklist` | 指令过滤模式 |
| `keywords` | `string[]` | `[]` | 关键词列表（仅 constrained 模式生效） |
| `keywordFilterMode` | `FilterMode` | `blacklist` | 关键词过滤模式 |

#### 响应模式 (ResponseMode)

| 模式 | 说明 |
|------|------|
| `constrained` | 有条件约束：非指令消息需要匹配关键词才响应 |
| `unconstrained` | 无约束：非指令消息全部放行，由后续插件判断 |

#### 过滤模式 (FilterMode)

| 模式 | 说明 |
|------|------|
| `blacklist` | 黑名单：只响应列表中的内容 |
| `whitelist` | 白名单：只响应列表外的内容 |

## 使用场景

### 场景 1：多个 Bot 处理不同类型的消息

```yaml
bots:
  # 简单问答 Bot
  - platform: qq
    selfId: "111"
    mode: constrained
    keywords: ["天气", "时间", "查询"]
    keywordFilterMode: blacklist

  # LLM 智能对话 Bot
  - platform: qq
    selfId: "222"
    mode: unconstrained
    commands: []
    commandFilterMode: blacklist
```

### 场景 2：按指令分配 Bot

```yaml
bots:
  # 管理类指令 Bot
  - platform: qq
    selfId: "111"
    mode: constrained
    commands: ["ban", "kick", "mute"]
    commandFilterMode: whitelist

  # 娱乐类指令 Bot
  - platform: qq
    selfId: "222"
    mode: constrained
    commands: ["roll", "draw", "guess"]
    commandFilterMode: whitelist

  # LLM 通用 Bot
  - platform: qq
    selfId: "333"
    mode: unconstrained
    commands: []
    commandFilterMode: blacklist
```

## 命令

| 命令 | 别名 | 说明 |
|------|------|------|
| `mc.bots` | `mbc.bots` | 查看可用的 Bot 列表 |
| `mc.commands` | `mbc.commands` | 查看可用的指令列表 |
| `mc.config` | `mbc.config` | 查看当前插件配置 |

## 工作原理

### Koishi 多 Bot 机制概述

在 Koishi 中，当多个 Bot 加入同一个频道时，系统使用 **Channel Table（频道表）** 来管理哪个 Bot 应该响应消息。每个频道记录都有一个 `assignee` 字段，表示被指定处理消息的 Bot ID。

消息处理流程如下：
1. 用户发送消息到频道
2. Koishi 检查该频道的 `assignee`
3. 如果 `assignee` 为空，所有 Bot 都可能响应
4. 如果 `assignee` 有值，只有被指定的 Bot 会响应

### 本插件的实现原理

本插件通过监听 Koishi 的 `attach-channel` 事件，在消息处理的**最早阶段**介入，动态控制 `assignee` 字段来实现多 Bot 的自动放行。

```
用户消息
    │
    ▼
┌─────────────────────────────────────┐
│  attach-channel 事件触发             │
│  (消息进入处理管道的第一步)            │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  multi-bot-controller 拦截           │
│  - 获取当前 Bot 的配置               │
│  - 判断是否应该响应此消息             │
└─────────────────────────────────────┘
    │
    ├─────────────────┬─────────────────┐
    ▼                 ▼
应该响应          不应该响应
    │                 │
    ▼                 ▼
设置 assignee    清空 assignee
为当前 Bot ID    (让其他 Bot 处理)
    │                 │
    └─────────────────┴─────────────────┘
                    │
                    ▼
          后续插件处理消息
          (指令、LLM、其他功能)
```

### 核心代码逻辑

#### 1. 事件监听与 Bot 配置获取

```typescript
ctx.on('attach-channel', (session) => {
    // 私聊消息不处理
    if (session.isDirect) return

    const platform = session.bot.platform
    const selfId = session.bot.selfId

    // 获取当前 Bot 的配置
    const botConfig = manager.getBotConfig(platform, selfId)

    // 如果没有配置，不进行干预
    if (!botConfig) return
})
```

#### 2. 响应决策逻辑

```typescript
// 判断 Bot 是否应该响应
if (!manager.shouldBotRespond(session, botConfig)) {
    // 不应该响应：清空 assignee，让其他 Bot 有机会处理
    if ((channel as any).assignee === selfId) {
        (channel as any).assignee = ''
    }
    return
}

// 应该响应：设置 assignee 为当前 Bot
if ((channel as any).assignee !== selfId) {
    (channel as any).assignee = selfId
}
```

#### 3. 响应判断流程

```
shouldBotRespond(session, botConfig)
    │
    ▼
┌─────────────────────────────────────┐
│  Bot 是否启用？                      │
│  (botConfig.enabled)                │
└─────────────────────────────────────┘
    │
    ├─ 否 ─→ 返回 false (不响应)
    │
    ▼ 是
┌─────────────────────────────────────┐
│  是指令消息？                        │
│  (session.argv?.command !== null)   │
└─────────────────────────────────────┘
    │
    ├─ 是 ─→ checkCommandPermission()
    │         - 检查指令是否在允许列表中
    │         - 根据 commandFilterMode 判断
    │
    ▼ 否
┌─────────────────────────────────────┐
│  响应模式？                          │
└─────────────────────────────────────┘
    │
    ├─ unconstrained ─→ 返回 true (全部放行)
    │
    ▼ constrained
    checkKeywordMatch()
    - 检查消息是否匹配关键词
    - 根据 keywordFilterMode 判断
```

### 为什么使用 attach-channel 事件？

Koishi 的事件触发顺序：

```
1. attach-channel     ← 本插件在此拦截 (最早)
2. before-attach
3. attach
4. before-command
5. command
6. middleware (中间件)
```

选择 `attach-channel` 的原因：
- **最早介入**：在任何插件处理消息之前就能控制 `assignee`
- **精确控制**：可以直接修改频道表的 `assignee` 字段
- **无副作用**：不会影响其他插件的事件监听

### 两种模式的实现差异

#### constrained 模式（有条件约束）

```typescript
case 'constrained':
    // 必须匹配关键词才响应
    const matched = this.checkKeywordMatch(session.content, botConfig)
    return matched
```

- 非指令消息必须匹配关键词列表
- 适用于：特定功能的 Bot（如天气查询、简单问答）

#### unconstrained 模式（无约束）

```typescript
case 'unconstrained':
    // 非指令消息全部放行
    return true
```

- 非指令消息全部放行，不做关键词过滤
- 适用于：LLM 智能对话 Bot（让 LLM 自己决定是否响应）

### 指令过滤的实现

两种模式的指令处理逻辑完全相同：

```typescript
private checkCommandPermission(session: Session, botConfig: BotConfig): boolean {
    const commandName = session.argv.command.name
    const { commands, commandFilterMode } = botConfig

    // 空列表 = 根据模式决定默认行为
    if (commands.length === 0) {
        return commandFilterMode === 'blacklist'  // blacklist=允许所有
    }

    // 检查指令是否在列表中
    const inList = commands.includes(commandName)
    return commandFilterMode === 'blacklist' ? inList : !inList
}
```

### 自动放行的实现

"自动放行"的本质是通过**主动放弃** assignee 来实现的：

1. Bot A 收到消息，检查配置发现不应该响应
2. Bot A 清空 `assignee`（如果自己是 assignee）
3. Koishi 继续让其他 Bot 处理这条消息
4. Bot B 收到消息，检查配置发现应该响应
5. Bot B 设置 `assignee` 为自己
6. Bot B 的后续插件正常处理消息

### 多个 Bot 同时满足条件的情况

如果多个 Bot 的配置都允许响应同一条消息：

1. 第一个收到消息的 Bot 会设置 `assignee` 为自己
2. 后续的 Bot 会检查 `assignee`，发现不是自己，选择跳过
3. 最终只有一个 Bot 会响应

这样可以避免多个 Bot 同时响应同一条消息导致的重复。

### 调试模式

启用 `debug: true` 后，插件会输出详细的决策日志：

```
[DEBUG] [qq:123456] 频道 987654, 用户 111222: constrained 模式：关键词匹配结果 = true
[DEBUG] [qq:123456] 频道 987654, 用户 111222: 指令 "help"：在列表中，blacklist 模式 → true
```

## License

MIT
