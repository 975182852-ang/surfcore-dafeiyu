# SurfCore 大肥鱼定制版

在自己的 Windows 电脑上运行的大肥鱼 QQ 助手：普通/高贵傲娇双人格、共享记忆、分人格表情库、主动互动、渐进限流、缓存感知的长历史整理，以及可选的晚间 QQ 空间日记。

| 项目 | 内容 |
| --- | --- |
| 版本 | `0.8.8-dafeiyu.1` |
| 平台 | Windows 10/11，Node.js ≥22.13 |
| 来源 | 基于 [Mieksido/surfcore](https://github.com/Mieksido/surfcore) v0.8.8，保留 MIT 许可与原作者署名 |
| 必要前置 | 已安装并打开过 DeepSeek Harness；自行安装 SnowLuma 并完成 QQ 登录 |
| 首次每日额度 | 新安装默认 QQ/总额各 ¥3；已有额度不覆盖，设置页可自行调整 |

这是独立定制发行版。仓库不含任何人的 API 密钥、QQ 会话、私人记忆、账号缓存或收藏表情图片，也不包含 SnowLuma 本体。公开人格是可编辑示例，不是原使用者的历史记录。

## 一键部署

先完成三个前置条件：Node.js、DSH、SnowLuma/本人 QQ 扫码登录。脚本只自动安装本项目，不能代你登录第三方账号。

**方式一：下载 ZIP 后双击**

1. 在本页选择 **Code → Download ZIP**，解压到你准备长期保留的文件夹。
2. 双击 **`一键部署.bat`**。
3. 输入主人 QQ 和允许的群号；不填群号即仅私聊。
4. 脚本安装锁定依赖、初始化模板与额度、注册 DSH 插件和 MCP。
5. 退出再打开 DSH，在 **设置 → SurfCore → 诊断/QQ** 确认网关、主人和白名单；在 DSH 设置中配置你自己的模型接口。

**方式二：一条下载部署命令**

在 PowerShell 执行以下整段，先下载可查看的脚本，再运行：

```powershell
$file = Join-Path $env:TEMP 'surfcore-dafeiyu-bootstrap.ps1'
Invoke-WebRequest 'https://raw.githubusercontent.com/975182852-ang/surfcore-dafeiyu/main/scripts/bootstrap.ps1' -OutFile $file
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $file
```

可指定目录：在最后一行加 `-Dir 'D:\Apps\surfcore-dafeiyu'`。仅检查环境加 `-Check`。

**方式三：Git 克隆**

```powershell
git clone https://github.com/975182852-ang/surfcore-dafeiyu.git
cd surfcore-dafeiyu
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install-local.ps1
```

完整参数、首次验证、升级和排错见 **[一键部署指南](docs/DEPLOY.md)**。安装目录是实际运行的源码目录，注册后不要随意移动；移动后需重新注册。

## 本版功能

- **双人格**：管理人聊天说“切换傲娇模式”“恢复普通模式”，也支持 `/persona brat`、`/persona normal`。两种表达共享同一角色记忆，不靠切换创建陌生人。
- **可爱语气**：普通、傲娇分别提供 21/22 个颜文字候选；傲娇更常用“杂鱼~”、哼哒、芙芙芙等口癖，群/私聊场景分别调整。
- **表情库隔离**：真实图片分别标记 normal/brat，按情绪选择少量候选进入上下文；请导入自己有权使用的图片。
- **缓存保护**：28万输入为软整理阈值，热缓存优先保留；连续低命中后再考虑整理，60万取消缓存延后，仍受额度和冷却约束。原始日志保留，近期消息与成对工具调用保持。
- **后台等待**：过早收尾由桥接接管后续窗口，减少模型重复 close/wait；默认两分钟后续、十分钟潜水观察。
- **群聊节奏**：按群记录普通回复与活跃度，平滑降低概率；真实点名、管理人互动与必要保护分别处理。240条/小时的特殊目标群由配置决定，不写死任何真实群号。
- **余额查询**：可选配置 DeepSeek 官方余额查询；密钥只由本机工具读取，不交给模型。程序额度和 API 余额是两回事。
- **空间日记**：默认关闭。本人显式启用后，晚间22:05附近写自己的活动感想，好友可见、每天至多一篇，使用去身份化摘要。
- **B站**：上游相关代码保留，但本版默认关闭，不自动刷视频或发布。

## 人格与数据

公开模板在 [`examples/dafeiyu/`](examples/dafeiyu/)。实际角色安装到 `%USERPROFILE%\.dsh\surfcore\characters\char-dafeiyu-public\`；自定义 DSH_HOME 时跟随该目录。已有角色、人格文件和记忆不会被安装器覆盖。

不要把运行目录中的 `config.json`、`state/`、密钥文件或 DSH 用户目录提交到 GitHub。群/私聊上下文属于本机数据，不在本仓库中。

## 开发与验证

```powershell
npm ci --no-audit --no-fund
npm run test:audit
npm run test:regressions
npm run test:deploy
npm run privacy:public
```

源码校验清单来自已提交 Git 对象；可运行 `node scripts/release-manifest.mjs --verify-ref HEAD`。真实 QQ 收发、模型接口和扫码登录需要部署者本人完成，离线测试不冒充真实平台验收。

## 许可

项目沿用上游 **[MIT License](LICENSE)**。上游贡献者版权声明保持不变；SnowLuma、DSH、各 SDK 和可选语音/桌宠组件按各自许可使用，不随本仓库夹带第三方运行时或私人图片。
