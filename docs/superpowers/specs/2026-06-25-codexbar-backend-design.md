---
title: CodexBar 后端集成 — 通用动态 AI Usage Action
status: design
date: 2026-06-25
author: iflexajax
---

# CodexBar 后端集成 — 通用动态 AI Usage Action

## 1. 背景与目标

`stream-deck-ai-limits` 是一个 Stream Deck 插件(TypeScript/Node),在按键和旋钮上显示 AI 编码配额用量与重置倒计时。当前覆盖 6 个 provider:Claude、Codex、Antigravity、Gemini CLI、MiniMax、OpenRouter。每个 provider 是一个独立 action(`xxx-progress-bars.ts`),provider 逻辑统一放在开源 npm 库 [`@lenadweb/ai-limits`](https://github.com/lenadweb/ai-limits)。

痛点:**每新增一个 provider 都要手写一个 action 文件 + settings interface + manifest 条目 + UI html + 品牌资源**,无法快速扩展。

`CodexBar`(Swift,macOS 菜单栏应用,[steipete/CodexBar](https://github.com/steipete/CodexBar))已经实现了 **50+ 个 AI provider** 的用量采集,并提供本地 HTTP 服务 `codexbar serve`(默认 `127.0.0.1:8080`),暴露标准化 JSON 端点 `GET /usage`、`GET /cost`、`GET /health`。已有 showy-quota、codexbar-waybar 等第三方项目基于它集成。

**目标**:在 macOS 上复用 CodexBar 全部 50+ provider 的采集能力,通过一个**通用动态 action** 直接消费 `codexbar serve` 输出,从而以一个 action 覆盖 CodexBar 支持的全部 provider,而不是逐个对接。Windows 与现有 6 个 action 不受影响。

## 2. 关键决策(已与用户确认)

1. **集成定位:仅 macOS 增强(可选后端)** — Mac 上检测到 `codexbar serve` 在线就用它,否则回退到现有 6 个 action;Windows 完全不受影响(CodexBar 仅 macOS 桌面端,无 Windows 二进制)。
2. **Provider 范围:通用动态 action,覆盖全部 50+** — 用户在设置里选 provider id(如 `cursor`/`copilot`),插件从 `/usage?provider=<id>` 拉取并渲染。一个 action 覆盖全部,而非逐个写 action。
3. **贡献策略:Fork + PR** — Fork `stream-deck-ai-limits` 到 `iflexajax/stream-deck-ai-limits`,在 feature 分支实现后向 `lenadweb/stream-deck-ai-limits` 发 PR。纯增量、单仓 PR。
4. **集成方案:方案 A(CodexBarBackend 适配器)** — 新增 codexbar serve 适配器 + 一个通用 action + 运行时后端探测/降级,纯增量、对原作者零侵入。
5. **测试框架:`node:test`** — Node 内置,零新增运行时依赖,利于上游接受。

## 3. 现状分析(数据契约已验证)

### 3.1 stream-deck-ai-limits 架构

- `BaseMonitoringAction`(基类,`src/actions/base-monitoring-action.ts`):统一管理生命周期、15 分钟轮询节奏(`monitoringIntervalMs`)、按键/旋钮/触摸刷新、缓存防抖(`lastResult`/`lastFetchTime`)、键与旋钮双路 SVG 渲染、错误态/占位态/消息态。**它通过抽象方法 `getDisplayData(ev, result)` 与 result 解耦**——只要子类能从自己的 result 取出 `{ value1, value2, label1, label2, resetTime1, resetTime2 }` 即可,基类不关心 result 具体形状。
- 每个 provider 子类:`@action({ UUID })` + `providerName` + `themeName` + `getDisplayData`。
- `LimitsManager`(单例)封装 `LimitsClient`(`@lenadweb/ai-limits`)。
- `ProgressBarRenderer`:纯函数式 SVG 渲染,`render(value1,value2,...)` / `renderSlots` / `renderError` / `renderPlaceholder` / `renderMessage`。
- 渲染模型字段:`value1`/`value2`(上下两条进度 0-100)、`resetTime1`/`resetTime2`(ISO,经 `time-formatter` 转为 `3h 33m` 风格)。

### 3.2 CodexBar `serve` 数据契约(已读源码验证)

- 端点:`GET /health` → `{ "status": "ok", "version": "..." }`;`GET /usage` / `GET /usage?provider=<id>` → `ProviderPayload[]`(每个 provider 一项)。
- `ProviderPayload` 字段:`provider`、`source`、`usage`(UsageSnapshot)、`credits`、`error`(`{ message }`)、`pace`、`status`。
- `UsageSnapshot` 的**通用窗口**:`primary` / `secondary` / `tertiary`(均为 `RateWindow`)、`extraRateWindows[]`、`updatedAt`。
- `RateWindow` 字段:`usedPercent`(0-100)、`windowMinutes?`、`resetsAt?`(ISO8601)、`resetDescription?`。
- serve 特性:localhost-only、带错误回退(防抖动)、provider 配置按请求热重载、`--port`/`--request-timeout` 可配。

### 3.3 字段同构性(关键)

CodexBar `RateWindow` 与现有渲染模型高度同构:

| CodexBar `RateWindow` / `UsageSnapshot` | 现有渲染模型 |
|---|---|
| `usage.primary.usedPercent` | `value1` |
| `usage.secondary.usedPercent` | `value2` |
| `usage.primary.resetsAt` | `resetTime1` |
| `usage.secondary.resetsAt` | `resetTime2` |

因此通用 action 的 `getDisplayData` 极薄,且 `BaseMonitoringAction` 的渲染/生命周期可**完整复用**。

## 4. 架构与数据流

### 4.1 模块边界(纯增量,新增 4 文件 + 扩展 4 处)

```
src/
  services/
    codexbar-backend.ts              (新增:serve HTTP 客户端 + 探测/缓存/降级,单例)
    codexbar-provider-registry.ts    (新增:provider id → 显示名/主题色/兜底)
    limits-manager.ts                (不改:通用 action 不走它)
  actions/
    codexbar-generic-progress.ts     (新增:通用动态 action)
  interfaces/
    codexbar.ts                      (新增:UsageSnapshot/RateWindow TS 类型 + 通用 action settings)
  actions/base-monitoring-action.ts  (扩展:fetchProviderUsage 返回类型放宽为联合)
  plugin.ts                          (扩展:注册通用 action)
  interfaces/theme.ts                (扩展:ServiceTheme 增加兜底取值)
com.len.limits.sdPlugin/
  ui/codexbar-settings.html          (新增:provider 下拉 + 端口 + 窗口选择 + 状态提示)
  manifest.json                      (扩展:新增 com.len.limits.codexbar.generic action)
```

### 4.2 数据流(macOS,通用 action)

```
codexbar serve (127.0.0.1:8080)        ← CodexBar 本地拉 50+ provider,localhost 权限,错误回退防抖
        │  GET /health                  ← 启动探测(1.5s 超时)
        │  GET /usage?provider=<id>     ← 取数(8s 客户端上限)
        ▼
codexbar-backend.ts (单例)
   ├─ process.platform !== 'darwin' → available=false,不发请求
   ├─ /health 失败 → available=false,结果缓存 60s
   └─ fetchUsage(providerId) → { usage, error }（不抛错，error 透传给 renderer）
        ▼
codexbar-generic-progress.ts (extends BaseMonitoringAction)
   └─ fetchProviderUsage → backend.fetchUsage(...)
   └─ getDisplayData: primary.usedPercent→value1, secondary→value2,
      resetsAt→resetTime1/2 (经 normalizeCodexBarDisplay 纯函数)
        ▼
ProgressBarRenderer (复用,零改动) → key(144) / dial(200) SVG
```

### 4.3 后端选择策略

- 通用 action 走 `CodexBarBackend`;现有 6 个 action 仍走 `@lenadweb/ai-limits` 的 `LimitsManager`。两者独立,**不互相污染**。
- 不做"同一 provider 两源择优"(YAGNI):通用 action 的职责就是覆盖 ai-limits 未覆盖的 provider。

## 5. 组件细节

### 5.1 `interfaces/codexbar.ts` — 类型定义

对齐 CodexBar serve 真实 JSON(Codable 字段名),只建最小子集,字段全部 optional 容错。

```ts
// 对应 CodexBarCore 的 RateWindow / UsageSnapshot(Codable 字段名)
interface RateWindow {
  usedPercent: number;          // 0-100
  windowMinutes?: number | null;
  resetsAt?: string | null;     // ISO8601
  resetDescription?: string | null;
}
interface UsageSnapshot {
  primary?: RateWindow | null;
  secondary?: RateWindow | null;
  tertiary?: RateWindow | null;
  extraRateWindows?: { name: string; [k: string]: unknown }[] | null;
  updatedAt: string;
}
interface ProviderPayload {
  provider: string;
  source: string;
  usage?: UsageSnapshot | null;
  credits?: unknown | null;      // v1 不渲染,留接口位
  error?: { message: string; [k: string]: unknown } | null;
}
interface HealthPayload { status: string; version?: string; }

// 通用 action 结果(与 StandardUsageResult 的 error 形状对齐,见 6.2)
interface CodexBarResult {
  usage?: UsageSnapshot | null;
  error?: { message: string } | null;
}

interface CodexBarGenericSettings {
  providerId?: string;                              // 默认 "cursor"
  port?: number;                                    // 默认 8080
  window?: "primary" | "secondary";                 // 上层条用哪个窗口,默认 "primary"
  showProviderName?: boolean;
}
```

### 5.2 `codexbar-backend.ts` — serve 客户端

职责:封装 HTTP,暴露 `isAvailable()` 与 `fetchUsage(providerId, port)`。

- **探测**:`GET /health`(超时 1.5s),仅 localhost。失败 → `available=false`,**不抛错**。结果缓存 ~60s,避免每次刷新都打。
- **取数**:`GET /usage?provider=<id>`(超时 8s 客户端上限)。从返回数组里挑 `provider === providerId` 的项,返回 `{ usage, error }`,**不抛**——透传 codexbar 的 `error`。
- **跨平台守护**:`process.platform !== 'darwin'` 时 `available` 直接 false,不发请求。
- **零新增依赖**:用 Node 内置 `fetch`(Node 20,manifest 已要求)。
- **单例**:`CodexBarBackend.getInstance()`,与现有 `LimitsManager` 单例模式一致。

### 5.3 `codexbar-provider-registry.ts` — provider 映射表

serve 给 provider id(如 `cursor`),但 Stream Deck 需要显示名 + 主题色 + 图标。建静态表,覆盖一批高价值 provider(Cursor / Copilot / Gemini / Codex OAuth / z.ai / Augment / Windsurf / Zed / Kiro 等),其余 id 走**兜底项**(通用图标 + provider id 作显示名 + 中性灰主题)。

- 这张表是"精选 subset",兜底保证 **50+ 全部可渲染**(符合决策 2)。
- 提供 `themeFor(providerId): ServiceTheme`、`displayNameFor(providerId): string`、`knownProviderIds(): string[]`(供 PI 下拉)。

### 5.4 `codexbar-generic-progress.ts` — 通用 action

继承 `BaseMonitoringAction`,只覆写三处:

```ts
@action({ UUID: "com.len.limits.codexbar.generic" })
export class CodexBarGenericProgress extends BaseMonitoringAction<CodexBarGenericSettings> {
  protected get providerName() { return this.currentSettings.providerId ?? "cursor"; }
  protected get themeName(): ServiceTheme {
    return registry.themeFor(this.currentSettings.providerId);
  }

  protected async fetchProviderUsage(): Promise<CodexBarResult> {
    const backend = CodexBarBackend.getInstance();
    if (!backend.isAvailable()) {
      return { error: { message: "CodexBar serve 未运行(仅 macOS)" } };
    }
    return backend.fetchUsage(
      this.currentSettings.providerId ?? "cursor",
      this.currentSettings.port ?? 8080,
    );
  }

  protected getDisplayData(_ev, result: CodexBarResult) {
    const win = this.currentSettings.window ?? "primary";
    const top = result.usage?.[win] ?? result.usage?.primary;
    const bottom = result.usage?.secondary;
    return {
      value1: top?.usedPercent ?? 0,
      value2: bottom?.usedPercent ?? 0,
      label1: "Session",
      label2: "Week",
      resetTime1: top?.resetsAt ?? null,
      resetTime2: bottom?.resetsAt ?? null,
    };
  }
}
```

> `getDisplayData` 的核心归一化逻辑抽成纯函数 `normalizeCodexBarDisplay(snapshot, window)`,定义在 `codexbar-backend.ts`(导出),便于单测(见 7.3)。action 的 `getDisplayData` 直接调用它。

### 5.5 `codexbar-settings.html` — Property Inspector

基于现有 `claude-settings.html` 的 sdpi-components v4 模式,字段:
- **Provider**(select):从 `registry.knownProviderIds()` 填充 + "Custom" 手填 id。
- **Window**(select):`primary` / `secondary`(上层条)。
- **Port**(number,默认 8080)。
- **Show provider name**(checkbox)。
- 信息提示:"需要在 macOS 上安装 CodexBar 并启用 `codexbar serve`(Preferences → Advanced)。Windows 暂不支持此 action。"

## 6. 错误处理

### 6.1 错误处理矩阵

| 情况 | 行为 |
|---|---|
| 非 macOS 平台 | `available=false`,通用 action 渲染 `renderMessage(["仅 macOS", "需 CodexBar serve"])`;不发请求 |
| serve 未运行 / health 失败 | 同上消息;60s 后才重试探测 |
| serve 在线但该 provider 报错 | 透传 codexbar 的 `error.message` → `renderError`(红态,现有能力) |
| 某窗口字段缺失 | `usedPercent ?? 0`;重置时间缺则不显示倒计时(renderer 已容错) |
| 请求超时(>8s) | 返回 error 态,不卡 UI |
| providerId 为空 | 兜底用默认 `cursor` |

**无静默失败**:每种错误都有可见反馈。

### 6.2 类型兼容关键点

`BaseMonitoringAction.draw()` 里有 `if (result.error)` 分支。`CodexBarResult` 的 `error` 形状(`{ message }`)与 `StandardUsageResult` 的 `error` 对齐,**让基类的错误分支对两种 result 都成立**。这是联合类型方案成立的前提,以单测固化。

## 7. 现有改动点、测试、贡献编排

### 7.1 对现有代码的改动点(最小侵入)

| 文件 | 改动 |
|---|---|
| `base-monitoring-action.ts` | `fetchProviderUsage` 返回类型从 `StandardUsageResult` 放宽为 `StandardUsageResult \| CodexBarResult`(联合);`lastResult` 类型相应放宽 |
| `plugin.ts` | 注册 `CodexBarGenericProgress`(1 行) |
| `manifest.json` | 新增 `com.len.limits.codexbar.generic` action 条目 + `PropertyInspectorPath: ui/codexbar-settings.html`;复用现有 layout/StackColor 模式 |
| `interfaces/theme.ts` | `ServiceTheme` 增加兜底取值 `codexbar-generic`(或复用 `codex`);其余 6 个主题不动 |
| `limits-manager.ts` | **不改动** |

> 联合类型方案:`draw()` 已通过 `getDisplayData` 与 result 解耦,基类核心逻辑零改动,回归风险为零。

### 7.2 数据契约风险

唯一脆弱处:`draw()` 读 `result.error`。保证 `CodexBarResult.error` 与 `StandardUsageResult.error` 同形(`{ message }`),并以单测固化。

### 7.3 测试策略(`node:test`,零依赖)

1. **类型映射单测**(最高价值):纯函数 `normalizeCodexBarDisplay(snapshot, window)` —— 字段缺失/百分比越界/重置时间缺失。
2. **provider registry 单测**:已知 id 返回品牌项、未知 id 返回兜底项。
3. **探测逻辑单测**(mock `fetch`):`/health` 200→available、超时→unavailable、非 mac→unavailable、不抛错。
4. **错误透传单测**:codexbar 返回 `{ error }` 时,`CodexBarResult.error.message` 供 renderer。
5. **类型兼容单测**:`CodexBarResult.error` 与 `StandardUsageResult.error` 同形,`draw()` 的 error 分支对两者成立。

不在测试中触达真实网络或 keychain(对齐 CodexBar AGENTS.md 的"用 stub/test store"原则)。

### 7.4 贡献编排(Fork + PR,单仓)

```
lenadweb/stream-deck-ai-limits  ──upstream──┐
        你的 fork: iflexajax/stream-deck-ai-limits
            └─ feat/codexbar-backend
                  实现 + 测试 + 文档
                  └─→ PR → lenadweb/stream-deck-ai-limits
```

步骤:
1. Fork `stream-deck-ai-limits` 到 `iflexajax/stream-deck-ai-limits`(本地 clone 已就绪)。
2. 建 `feat/codexbar-backend` 分支,按设计实现(单元逐个独立,便于 review)。
3. README 增"CodexBar 后端(macOS 可选)"章节;CONTRIBUTING 补说明。
4. PR 描述突出:**纯增量、不碰现有 6 个 action、Windows 无影响、零新增运行时依赖、单仓 PR**;附数据流图与测试清单。
5. 跨平台声明:通用 action 仅 macOS 生效(serve 限制),已在 UI 明示。

**与上游 ai-limits 库解耦**:本方案不改 `@lenadweb/ai-limits`,只需向 `stream-deck-ai-limits` 一个仓库发 PR。

## 8. 验收标准

- macOS + 运行 `codexbar serve` → 通用 action 能渲染 Cursor / Copilot 等 ai-limits 未覆盖 provider 的进度条与重置倒计时。
- 未装 CodexBar → 通用 action 显示明确提示,现有 6 个 action 正常(回归零)。
- Windows → 通用 action 显示"仅 macOS",6 个 action 正常。
- 5 项单测全部通过。
- `npm run build` 产出 `bin/plugin.js`,Stream Deck 可加载新 action。

## 9. 风险与权衡

- **serve 未运行是常态**:靠"探测 + 明确消息态"处理,绝不卡 UI 或污染现有 action。
- **provider 数据异构**:极少数 provider 可能不填充 `primary`——`getDisplayData` 全部 `??` 兜底,显示 0% + 无倒计时,不报错。
- **跨平台用户预期**:UI 明示"仅 macOS",避免 Windows 用户困惑。
- **不引入 credits/spend 渲染(v1)**:YAGNI,留接口位,未来按需扩展。
- **provider 映射表手工维护**:兜底保证可用,精选表后续可补充。

## 10. 未来演进(非本期)

- **方案 B**:在 `@lenadweb/ai-limits` 库内新增 `CodexBarBridgeProvider`,让所有现有 action 透明受益(数据源自动切换)。架构更美但需跨两个上游 PR,本期不做,留作后续。
- **credits / cost 渲染**:通用 action v2 可消费 `GET /cost` 与 `credits` 字段。
- **自动 provider 发现**:从 `GET /usage`(`?provider=all`)动态拉取可用 provider 列表填充 PI 下拉,取代静态 registry。

## 附录:CodexBar serve 启用方式

- 安装 CodexBar(macOS,`brew install --cask codexbar`)。
- 启用 serve:`codexbar serve --port 8080`(或 Preferences → Advanced 设置自启动)。
- 确保目标 provider 在 CodexBar Settings → Providers 中已启用并配置好凭据。
