# 大肥鱼一键部署指南

## 1. 准备

仅支持 Windows 10/11。安装 Node.js ≥22.13（含 npm）、DeepSeek Harness，并打开 DSH 一次使其生成用户配置。自行获取 SnowLuma 并完成 QQ 扫码登录；本项目只连接已有网关，不分发它或代登录。

在 DSH 设置中配置自己的模型服务。OpenAI 兼容第三方接口可以使用，但缓存、额度和 API 余额要以对应服务为准；这里的可选余额工具只查询 DeepSeek 官方接口。

## 2. 运行安装器

下载本仓库 ZIP，解压，双击根目录 `一键部署.bat`。或 Git 克隆后运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install-local.ps1 -OwnerQQ 20001 -Groups '10001,10002' -Profile desktop
```

以上号码是示例，必须换成你自己的主人账号与授权群。省略 OwnerQQ 会交互询问；群号留空表示仅私聊。`desktop`只是示例，通常可省略让注册器自动发现。

可选参数：

| 参数 | 用途 |
| --- | --- |
| `-Check` | 只读检查环境，不安装、不注册 |
| `-DshHome 'D:\Data\dsh'` | 自定义 DSH 用户目录，须与实际 DSH 使用的目录一致 |
| `-DailyBudget 3` | 新安装每日 QQ/总估算额度；已有额度保留 |
| `-EnableDiary` | 显式启用22:05附近的QQ空间日记；默认不启用 |

安装顺序固定为 `npm ci` → 初始化本机配置/角色 → 注册 DSH。先注册再装依赖容易激活失败。安装器会备份修改的本机配置，保留已有角色和文件；重复安装仅补缺失模板，不覆盖你细调的内容，也不清零用量。

## 3. 启动和首次配置

1. 完全退出再打开 DSH，刷新设置页面。
2. 打开 **SurfCore → 诊断/QQ设置**，选择或发现已有 SnowLuma 网关，按实际网关配置填写地址和访问令牌。
3. 确认主人 QQ、私聊白名单和群白名单；模式选择智能社交二代（qq-chat-v2）。不要把控制台或网关直接暴露到公网。
4. 确认模型目录能列出你的接口和模型。项目默认跟随 DSH 默认模型；API 密钥在 DSH/服务商配置中保存。
5. 先给主人私聊发一句话，再在授权群 @机器人。只有消息进入、模型回复、QQ收到三段都成功，才算真实收发验证完成。

安装器不会调用付费模型、发送测试 QQ 或替你完成扫码。首次桥接上线和后续主动互动属于你启用机器人后的行为，请设置合适的额度与群白名单。

## 4. 人格和表情

实际人格位于 `DSH_HOME/surfcore/characters/char-dafeiyu-public/`：

- `persona.md`：共同核心；`persona.tone.md`：普通语气/颜文字。
- `persona.scenes/qq-group.md`、`qq-private.md`：普通群/私聊场景。
- `persona.modes/brat/core.md`、`tone.md`、`personality.md`：傲娇核心、语气和常驻细节。
- `persona.modes/brat/qq-group.md`、`qq-private.md`：傲娇群/私聊场景。

管理人可以聊天切换：`切换傲娇模式`、`恢复普通模式`；`/persona status`查看。自动切换有冷却，手动指定优先；两个模式共享实际记忆，语气和图片库分开。

图片没有随仓库打包。导入自己的 QQ 收藏或有权使用的图片后，可用后台表情工具分类，也可用：

```powershell
node scripts/persona-admin.mjs list
node scripts/persona-admin.mjs assign '#编号' brat
node scripts/persona-admin.mjs assign '#编号' normal
```

只有当前人格的可用图片会给模型选择。颜文字不是图片，文字和图片工具分别发送。

## 5. 日记、限流和缓存

`config.json`中的`qzoneDiary.enabled`默认false，启用前确认QQ空间和好友可见设置。每天只写自己的活动和感想，不列群友个人信息；没有模型额度时可用事实模板。

`socialV2.progressiveGroupId`填写允许放宽到每小时240条的目标群，必须在白名单中；不填写则不指定特殊群。普通概率、白名单、安全保护和日额度仍独立生效，额度不是保证发送量。

`socialV2.historyEconomy`控制长历史整理：软阈值280000、缓存命中底线0.95、长度阈值600000。高命中时优先保留；不足两条同路由有效样本时等待；连续低命中再考虑软整理。原6小时冷却、预算和原生溢出保护继续生效。摘要有一次生成与缓存重建费用，输入变短不等于费用马上同比下降。

实际状态在`DSH_HOME/surfcore/history-economy.json`；不含正文的前缀诊断在同目录`cache-prefix.jsonl`。若原生摘要服务不可用，检查DSH兼容性和QQ预设；保留原聊天，不手工删会话文件。

## 6. 可选官方余额查询

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/set-balance-key.ps1
```

在本机安全输入框输入 **DeepSeek官方** API Key；自定义目录加`-DshHome`。密钥保存在DSH用户数据中，不写Git、不显示给模型。此脚本只保存，不发起查询。之后管理人在聊天中问余额，工具才按需访问官方接口，并带查询时间。第三方转发额度不能用这个接口替代。

每日用量和限额是程序估算，最终以服务商实际账单为准。调整额度在SurfCore设置中操作；不要通过删除账本来解除额度。

## 7. 更新、备份和卸载

更新前退出DSH，备份本机`config.json`和整个`DSH_HOME/surfcore/`。在干净的仓库中执行`git pull --ff-only`，再运行一键部署。若Git提示本地修改，先备份或自行提交，安装器不强制覆盖。

ZIP用户请把新源码解压到新目录，迁移自己的config.json，再注册到新目录；旧目录先保留。实际角色和记忆在DSH用户目录，不随代码ZIP附带。已有角色不自动切换；在设置里选择公开模板或保留原角色。

卸载前阅读原卸载脚本提示。不要把删除源码目录当作清理角色/账号的方式；先保留可恢复备份。

## 8. 常见问题

- **找不到Node/npm**：重装支持的Node版本并重新开终端。执行`node --version`、`npm --version`确认。
- **看不到SurfCore设置**：确认依赖安装成功，再运行`node scripts/setup-dsh.mjs`，随后完全退出重开DSH。
- **原端口失效**：DSH端口可在重启后变化；让项目发现当前实例，在诊断中检查，不把旧3080示例值当固定端口。
- **QQ连接正常但不回复**：先查白名单、模式、日额度和模型连接，再查是否有新消息入站。不要直接清空角色或记忆。
- **缓存突然低**：区分接口/模型切换、摘要后的重建、辅助任务冷请求和稳定聊天；用实际usage和匿名指纹核对，不靠额外空请求刷命中率。
- **自检失败**：运行`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install-local.ps1 -Check`并保留错误code/hint。反馈时遮住密钥、访问令牌、个人账号与聊天正文。
