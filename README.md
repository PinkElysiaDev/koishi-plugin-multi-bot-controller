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

插件通过监听 Koishi 的 `attach-channel` 事件，在消息处理前检查当前 Bot 的配置：

1. 获取当前 Bot 的配置
2. 根据配置判断是否应该响应消息
3. 如果应该响应，修改 `session.channel.assignee` 为当前 Bot ID
4. 如果不应该响应，清空 `assignee` 或保持原值

## License

MIT
