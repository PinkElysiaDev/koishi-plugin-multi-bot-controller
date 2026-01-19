# koishi-plugin-multi-bot-controller

[![npm](https://img.shields.io/npm/v/koishi-plugin-multi-bot-controller)](https://www.npmjs.org/package/koishi-plugin-multi-bot-controller)

Multi-bot response controller for Koishi. Manage which bot should respond to messages in multi-bot scenarios.

## 功能特性

- **独立过滤配置**
  - 指令过滤：控制响应哪些指令
  - 来源过滤：按群号、用户 ID、频道 ID、私聊进行过滤
  - 关键词过滤：控制响应哪些非指令消息

- **艾特优先**
  - 当消息艾特了某个 Bot 时，只有被艾特的 Bot 会响应
  - 此逻辑优先级最高，通用于任何配置

- **动态指令监听**
  - 自动监听当前实例的所有可用指令
  - 指令列表会随着插件加载/卸载自动更新

- **辅助命令**
  - `mc.bots` - 查看可用的 Bot 列表
  - `mc.commands` - 查看可用的指令列表
  - `mc.copy-commands` - 获取所有指令名称（方便配置时使用）
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

### 顶层配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `debug` | `boolean` | `false` | 是否启用调试日志 |
| `bots` | `BotConfig[]` | `[]` | Bot 配置列表 |

### Bot 配置 (BotConfig)

#### 基础配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `platform` | `string` | **必需** | 平台名称（如 `onebot`, `qq`, `discord`） |
| `selfId` | `string` | **必需** | Bot 账号 ID |
| `enabled` | `boolean` | `true` | 是否启用此 bot 的响应控制 |

#### 指令过滤

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enableCommandFilter` | `boolean` | `false` | 是否启用指令过滤 |
| `commands` | `string[]` | `[]` | 允许响应的指令列表 |

**说明**：启用后，只有列表中的指令会被响应。列表为空时不响应任何指令。

#### 来源过滤

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enableSourceFilter` | `boolean` | `false` | 是否启用来源过滤 |
| `sourceFilters` | `SourceFilter[]` | `[]` | 来源过滤规则列表 |
| `sourceFilterMode` | `FilterMode` | `whitelist` | 来源过滤模式：`blacklist` / `whitelist` |

来源过滤规则 (SourceFilter)：
- `type: 'guild'` - 按群号过滤，`value` 为群号
- `type: 'user'` - 按用户 ID 过滤，`value` 为用户 ID
- `type: 'channel'` - 按频道 ID 过滤，`value` 为频道 ID
- `type: 'private'` - 私聊过滤，`value` 为 `true` 或 `false`

#### 关键词过滤

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enableKeywordFilter` | `boolean` | `false` | 是否启用关键词过滤 |
| `keywords` | `string[]` | `[]` | 触发词列表 |
| `keywordFilterMode` | `FilterMode` | `whitelist` | 关键词过滤模式 |

**说明**：仅对非指令消息生效。

### 过滤模式 (FilterMode)

| 模式 | 关键词过滤 | 来源过滤 |
|------|-----------|----------|
| `whitelist` | 白名单 | 白名单 |
| `blacklist` | 黑名单 | 黑名单 |

## 使用场景

### 场景 1：功能 Bot + LLM Bot

```yaml
bots:
  # 简单问答 Bot（只响应特定关键词）
  - platform: qq
    selfId: "111"
    enabled: true
    enableKeywordFilter: true
    keywords: ["天气", "时间", "查询"]
    keywordFilterMode: whitelist  # 白名单：只响应包含这些关键词的消息

  # LLM 智能对话 Bot（响应所有消息）
  - platform: qq
    selfId: "222"
    enabled: true
    # 不配置任何过滤，响应所有消息
```

### 场景 2：按指令和来源分配 Bot

```yaml
bots:
  # 管理员专用 Bot（仅特定群和用户的管理指令）
  - platform: qq
    selfId: "111"
    enabled: true
    enableSourceFilter: true
    sourceFilters:
      - type: guild
        value: "987654321"  # 管理员群
      - type: user
        value: "123456789"   # 超级用户
    sourceFilterMode: whitelist  # 白名单：只允许这些来源
    enableCommandFilter: true
    commands: ["ban", "kick", "mute"]  # 只响应这些指令

  # 娱乐类指令 Bot
  - platform: qq
    selfId: "222"
    enabled: true
    enableCommandFilter: true
    commands: ["roll", "draw", "guess"]  # 只响应这些指令

  # LLM 通用 Bot
  - platform: qq
    selfId: "333"
    enabled: true
    # 不配置过滤，响应所有消息
```

### 场景 3：多平台 Bot

```yaml
bots:
  # QQ Bot - 处理指令和关键词
  - platform: onebot
    selfId: "111"
    enabled: true
    enableKeywordFilter: true
    keywords: ["帮助", "查询"]
    keywordFilterMode: whitelist  # 白名单：只响应包含这些关键词的消息

  # Discord Bot - 全部响应
  - platform: discord
    selfId: "222"
    enabled: true
```

### 场景 4：关键词黑名单（屏蔽某些消息）

```yaml
bots:
  - platform: qq
    selfId: "111"
    enabled: true
    enableKeywordFilter: true
    keywords: ["广告", "推广", "加群"]
    keywordFilterMode: blacklist  # 黑名单：屏蔽包含这些关键词的消息
```

## 命令

| 命令 | 别名 | 说明 |
|------|------|------|
| `mc.bots` | `mbc.bots` | 查看可用的 Bot 列表 |
| `mc.commands` | `mbc.commands` | 查看可用的指令列表 |
| `mc.copy-commands` | `mbc.copy-commands` | 获取所有指令名称（方便配置时使用） |
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

本插件通过监听 Koishi 的 `attach-channel` 事件，在消息处理的**最早阶段**介入，动态控制 `assignee` 字段来实现多 Bot 的自动分配。

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
│  检查是否有艾特                       │
│  - 有艾特：只有被艾特的 Bot 响应       │
│  - 无艾特：继续判断                   │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  Bot 是否启用？                      │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  来源过滤检查                        │
│  - 未启用 → 通过                     │
│  - 黑名单模式 → 匹配则阻止            │
│  - 白名单模式 → 匹配则通过            │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  判断消息类型                        │
│  - 指令消息 → 检查指令权限            │
│  - 非指令消息 → 检查关键词匹配        │
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

### 决策流程图

```
shouldBotRespond(session, botConfig)
    │
    ▼
┌─────────────────────────────────────┐
│  Bot 是否启用？                      │
└─────────────────────────────────────┘
    │
    ├─ 否 ─→ 返回 false (不响应)
    │
    ▼ 是
┌─────────────────────────────────────┐
│  来源过滤检查                        │
│  - 未启用 → 通过                     │
│  - 黑名单模式 → 匹配则阻止            │
│  - 白名单模式 → 匹配则通过            │
└─────────────────────────────────────┘
    │
    ▼ 通过
┌─────────────────────────────────────┐
│  是指令消息？                        │
└─────────────────────────────────────┘
    │
    ├─ 是 ─→ 检查指令权限
    │         - 未启用过滤 → 放行
    │         - 列表为空 → 不响应
    │         - 在列表中 → 响应
    │         - 不在列表中 → 不响应
    │
    ▼ 否
┌─────────────────────────────────────┐
│  关键词过滤检查                      │
│  - 未启用 → 不响应                   │
│  - 白名单（默认）：匹配则响应         │
│  - 黑名单：不匹配则响应              │
└─────────────────────────────────────┘
```

### 艾特优先逻辑

当消息中包含艾特（@提及）时：

1. **被艾特的 Bot**：直接接管消息处理，设置 `assignee` 为自己
2. **未被艾特的 Bot**：放弃处理，清空 `assignee`（如果之前持有）

此逻辑优先级最高，会跳过所有其他过滤判断。

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

### 调试模式

启用 `debug: true` 后，插件会输出详细的决策日志：

```
[DEBUG] [qq:123456] 频道 987654, 用户 111222: 来源过滤：匹配，whitelist 模式 → 通过
[DEBUG] [qq:123456] 频道 987654, 用户 111222: 指令 "help"：在列表中 → true
[DEBUG] [qq:123456] 被艾特，接管消息处理
[DEBUG] [qq:123456] 频道 987654, 用户 111222: 非指令消息：关键词匹配结果 = true
```

## License

MIT
