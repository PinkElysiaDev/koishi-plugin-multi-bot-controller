# koishi-plugin-multi-bot-controller

[![npm](https://img.shields.io/npm/v/koishi-plugin-multi-bot-controller)](https://www.npmjs.org/package/koishi-plugin-multi-bot-controller)

Multi-bot response controller for Koishi. Manage which bot should respond to messages in multi-bot scenarios.

## 功能特性

- **两种响应模式**
  - `constrained`（约束模式）：非指令消息必须匹配关键词才响应，适合功能型 Bot
  - `unconstrained`（放行模式）：非指令消息全部放行，适合 LLM 智能对话 Bot

- **来源过滤**
  - 支持按群号、用户 ID、频道 ID、私聊进行过滤
  - 黑名单/白名单模式

- **指令过滤**
  - 黑名单模式：只响应列表中的指令
  - 白名单模式：只响应列表外的指令

- **关键词过滤**（仅 constrained 模式）
  - 黑名单模式：只响应匹配关键词的消息
  - 白名单模式：只响应不匹配关键词的消息

- **艾特优先**
  - 当消息艾特了某个 Bot 时，只有被艾特的 Bot 会响应
  - 此逻辑优先级最高，通用于任何模式

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
| `mode` | `ResponseMode` | **必需** | 响应模式：`constrained` / `unconstrained` |

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
- `type: 'private'` - 私聊过滤，`value` 为是否允许私聊

#### 指令过滤

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enableCommandFilter` | `boolean` | `false` | 是否启用指令过滤 |
| `commands` | `string[]` | `[]` | 允许响应的指令列表 |
| `commandFilterMode` | `FilterMode` | `blacklist` | 指令过滤模式：`blacklist` / `whitelist` |

#### 关键词过滤（仅 constrained 模式）

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enableKeywordFilter` | `boolean` | `false` | 是否启用关键词过滤 |
| `keywords` | `string[]` | `[]` | 关键词列表 |
| `keywordFilterMode` | `FilterMode` | `blacklist` | 关键词过滤模式：`blacklist` / `whitelist` |

### 响应模式 (ResponseMode)

| 模式 | 说明 |
|------|------|
| `constrained` | 约束模式：非指令消息需要匹配关键词才响应 |
| `unconstrained` | 放行模式：非指令消息全部放行，由后续插件判断 |

### 过滤模式 (FilterMode)

| 模式 | 说明 |
|------|------|
| `blacklist` | 黑名单：只响应列表中的内容 |
| `whitelist` | 白名单：只响应列表外的内容 |

## 使用场景

### 场景 1：功能 Bot + LLM Bot

```yaml
bots:
  # 简单问答 Bot（约束模式）
  - platform: qq
    selfId: "111"
    enabled: true
    mode: constrained
    enableKeywordFilter: true
    keywords: ["天气", "时间", "查询"]
    keywordFilterMode: blacklist

  # LLM 智能对话 Bot（放行模式）
  - platform: qq
    selfId: "222"
    enabled: true
    mode: unconstrained
```

### 场景 2：按指令和来源分配 Bot

```yaml
bots:
  # 管理员专用 Bot（仅特定群和用户）
  - platform: qq
    selfId: "111"
    enabled: true
    mode: constrained
    enableSourceFilter: true
    sourceFilters:
      - type: guild
        value: "987654321"  # 管理员群
      - type: user
        value: "123456789"   # 超级用户
    sourceFilterMode: whitelist
    enableCommandFilter: true
    commands: ["ban", "kick", "mute"]
    commandFilterMode: whitelist

  # 娱乐类指令 Bot
  - platform: qq
    selfId: "222"
    enabled: true
    mode: constrained
    enableCommandFilter: true
    commands: ["roll", "draw", "guess"]
    commandFilterMode: whitelist

  # LLM 通用 Bot
  - platform: qq
    selfId: "333"
    enabled: true
    mode: unconstrained
```

### 场景 3：多平台 Bot

```yaml
bots:
  # QQ Bot - 处理指令和关键词
  - platform: onebot
    selfId: "111"
    enabled: true
    mode: constrained
    enableKeywordFilter: true
    keywords: ["帮助", "查询"]
    keywordFilterMode: blacklist

  # Discord Bot - 全部放行
  - platform: discord
    selfId: "222"
    enabled: true
    mode: unconstrained
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
│  检查来源过滤                        │
│  - 是否启用来源过滤                   │
│  - 是否匹配白/黑名单                  │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  判断消息类型                        │
│  - 指令消息 → 检查指令权限            │
│  - 非指令消息 → 根据模式判断           │
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
    │         - 黑名单：在列表中放行
    │         - 白名单：不在列表中放行
    │
    ▼ 否
┌─────────────────────────────────────┐
│  响应模式？                          │
└─────────────────────────────────────┘
    │
    ├─ unconstrained ─→ 放行
    │
    ▼ constrained
    检查关键词匹配
    - 黑名单：匹配则放行
    - 白名单：不匹配则放行
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
[DEBUG] [qq:123456] 频道 987654, 用户 111222: constrained 模式：关键词匹配结果 = true
[DEBUG] [qq:123456] 频道 987654, 用户 111222: 指令 "help"：在列表中，blacklist 模式 → true
[DEBUG] [qq:123456] 频道 987654, 用户 111222: 来源过滤：匹配，whitelist 模式 → 通过
[DEBUG] [qq:123456] 被艾特，接管消息处理
```

## License

MIT
