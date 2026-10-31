# 宿主跟随与吸附（0.5.0）

Windows 便携版运行 `Start-Follow.cmd`，停止运行 `Stop-Follow.cmd`。无需安装计划任务，不覆盖已有安装；运行数据保存在便携目录的 `data`。WSL 入口与强制独立桌面行为保持不变。macOS 沿用原宿主探测；本次规则表接入的是 Windows 原生探测。

## dragon.json

配置为严格 JSON，不能写 `//` 注释。默认值如下：

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| hostRules | codex-store 开启，其余关闭 | 规则间是“或”，同一规则内是“且” |
| processNames | 进程名数组 | 大小写不敏感；空数组不限制此条件 |
| imageContains | 路径片段 | 空字符串不限制此条件 |
| imageEndsWith | 路径后缀数组 | 命中任一后缀；空数组不限制此条件 |
| sameSession | true | 始终保留当前登录会话边界，即便填写 false 也不允许跨会话附着 |
| enabled | true / false | false 不参与匹配；保留规则以供再次启用 |
| overlay.anchor | {"ax":1,"ay":1} | 右下角；归一化至 [0,1] |
| overlay.snapDistance | 24 | DIP；距离严格小于阈值时吸附 |
| overlay.flipOnLeft | true | ax < 0.5 时水平镜像 |
| overlay.flipOnTop | false | 开启后 ay < 0.5 时垂直镜像 |

缺失、JSON 解析失败、规则字段类型错误均回退原 codex-store 规则。合法的空数组或全部 disabled 表示明确停用跟随，保留托盘。规则在原生探测时刷新，750ms 内读取；进程根列表保留空 250ms / 非空 750ms 的扫描节奏。修改 overlay 选项后重启生效；完成拖拽后立即原子写回 anchor，并合并保留其他字段。

浏览器规则仅跟随浏览器整个 client 区，无法识别当前标签页是否为 ChatGPT，也不能贴合其对话区。精确标签页几何需要 UIA，本版未实现。启用 codex-standalone 前建议补全镜像路径条件，避免只依赖同名进程。

## 坐标和输入

渲染层使用 DIP：`x = ax * max(0,W-w)`，`y = ay * max(0,H-h)`。原生层负责宿主屏幕坐标，渲染层只负责 client 内的局部坐标。拖拽结束按可用行程反算锚点；窗口移动、缩放、DPI 与挂件尺寸变化重新计算显示位置，不将临时像素位置写回配置。两边均进入吸附阈值时选最近边；零行程返回 0。

WindowApi 的 WinEvent 消息泵独占 Windows 跟随模式的 x/y；Electron 仅同步视口尺寸。Windows 生产跟随路径已禁止 JS 坐标回退，独立桌面、macOS 和隔离测试保持各自原有定位方式。region 随挂件位置更新，空区域通过已有 EMPTY_SHAPE 转成 1×1 安全区域，最多 64 块。水平和垂直翻转同时映射 alpha 点击检测。

## 改动边界

未修改计费、额度、服务商实现、美术图片、许可范围、WindowStacking、native-viewport 或启动器 C#。`assets/whale-widget.js` 是交互代码，其拖拽/定位路径接入锚点；美术素材保持原样。

为满足“规则全关闭仍可启动托盘”，supervisor.ps1 仅增加配置路径接线和无宿主启动条件，main.cjs 无宿主时隐藏挂件并保留托盘。原守护机制不变。便携启动脚本独立于原 WSL 入口。

## 验证

`npm test` 包含原生规则匹配、非法配置回退、非白名单/跨会话拒绝、禁用规则、锚点边界、磁吸阈值和空 shape 兜底。`tests/host-follow-fixture.mjs` 驱动真实 Electron 验证 DOM 几何、镜像、拖拽、重载与穿透；隔离原生测试验证 owner、非 TOPMOST、移动缩放和最小化恢复。Windows 测试桩已适配本机 PowerShell 与 Node 启动方式，未改变额度生产实现。
