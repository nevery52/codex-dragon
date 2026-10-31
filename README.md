# Codex 龙娘：Windows 底部跟随版

个人源码备份，基于 [Karal23/codex-dragon](https://github.com/Karal23/codex-dragon/tree/dragon) 的 `dragon` 分支，基准提交 `8e02754e71ea8fae79d4e7f40cea16d12b1dc5d9`。非 OpenAI 官方产品。

## 当前功能

- 保留白发龙角角色、表情、订阅面板、Token 反馈和历史统计。
- Windows Codex 窗口原生跟随，宿主关闭或隐藏时隐藏龙娘。
- 固定窗口底边，仅左右拖动；支持边缘吸附、相对位置记忆。
- 拖动更新按帧合并，减少重复裁剪计算。
- `Start-Follow.cmd` / `Stop-Follow.cmd` 启停跟随版。

## 恢复使用

此仓库保存源码，不包含 Electron 二进制、账号凭据、个人运行数据或当前 Windows 自启配置。下载源码不能直接当成已安装成品运行。

1. 安装 Node.js 24 或更高版本。运行 `node --test tests/*.test.mjs` 检查源码。
2. 为跟随入口准备 Windows x64 Electron 44.3.0。可复用已有可信运行时，将整个 Electron 发行目录（包含 DLL、resources、locales 等）放在 `desktop-runtime/windows/electron/dist/`，确认其中有 `electron.exe`。也可从 Electron 官方发行页下载相同版本并核验 SHA256。
3. 双击 `Start-Follow.cmd`。它在本目录创建新的 `data/`，不会恢复你旧电脑的登录或统计记录。
4. 在龙娘设置中选择本机采集连接；新电脑需先正常安装并登录 Codex。本机连接适配已包含在源码中，不能复制他人的认证文件。
5. 登录 Windows 自启需要在新电脑单独配置；仓库不会自动修改启动项。原项目的 `Install-Dragon.cmd` 和 `build:windows` 是上游独立桌面/WSL 安装流程，不是本跟随版的便携打包入口。

配置文件 `dragon.json` 中 `overlay.bottomOnly=true` 锁定底部，默认锚点为右下角。修改角色/窗口行为前建议保留备份。

## 验证与边界

本次适配在 Windows 上通过 499 项自动测试，并完成真实 Electron 的底部锁定、横向拖动、原生跟随、位置恢复及原版面板验收。尚未完成长期稳定性测试、macOS 或 WSL 真机验收。源码备份的全新机器恢复流程尚未实机演练。

## 来源与许可

保留上游 MIT 许可证及素材来源，基准提交链接见上文。详见 [LICENSE](LICENSE)、[PROVENANCE.md](PROVENANCE.md)、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。素材权利不因代码 MIT 而扩大。

[上游原始说明](README-UPSTREAM.md)记录原项目功能与安装方式；当前跟随版以本说明为准。
