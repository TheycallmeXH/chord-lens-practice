# 和弦镜 · 练琴

Windows MIDI 和弦分析与练琴桌面工具。接入键盘即接收 MIDI，默认静音，数据保存在本机。

![自由分析](docs/free-analysis.png)

## 下载

从 [Releases](https://github.com/TheycallmeXH/chord-lens-practice/releases) 下载 Windows x64 压缩包，完整解压后运行 `和弦镜练琴版.exe`。移动应用时保留整个文件夹。无需安装 Node.js 或启动服务器。

Windows 可能提示发布者未知：当前版本未做代码签名。

## 功能

- 实时和弦名、候选、转位、实际组成音、力度、低音、音程与定性听感。
- 三和弦、七和弦、转位、12 调与可移调和弦进行练习。
- 任意八度或指定音区判定；正确保持后松键切题，支持踏板。
- 五度圈、键盘上方的相邻 / 低音音程关系、面板折叠与边缘侧栏开关。
- 可缩放的极简窗口、窗口置顶、无声节拍器、练习记录与 JSON 导出。
- 自动连接 MIDI、设备热插拔、通道筛选、断开清音、损坏记录恢复。

自由分析隐藏练习目标区，当前和弦占满该区域。音符与和弦长度变化不改变面板高度。

## 操作

空格开始或暂停，Escape 清音。`A W S E D F T G Y H U J K` 对应 C4–C5；也可点击屏幕琴键。开启“保持选音”后再次点击松开。

练习默认正确保持 350 ms 后等待全部松键进入下一题，保持时间可调整。默认计入踏板延音，切题也需松开踏板。清音不记错误，暂停不计用时。进入极简模式会暂停练习，返回后手动继续。

每次启动总声音关闭。开启总声音后，外接 MIDI 的合成试听还需在设置中单独开启。节拍器可以只闪拍。软件不读取麦克风或系统音频。

记录保存于当前 Windows 用户的应用数据目录，保留最近 100 轮。更新应用不会主动删除记录。程序不上传 MIDI 或练习记录。

## 开发

需要 Windows x64、Node.js 24 或更新的兼容版本。依赖版本锁定在 `desktop/package-lock.json`。

```powershell
cd desktop
npm ci
npm start
npm test
npm run test:ui
npm run build
npm run test:desktop
```

`test:ui` 默认使用已安装的 Microsoft Edge，也可通过 `CHORD_LENS_BROWSER` 指定 Chromium 浏览器路径。原生测试使用独立测试记录目录，不读取日常练习记录。`test:desktop` 需先构建，测试期间会显示窗口。

构建产物位于 `dist/和弦镜练琴版/`，应分发完整目录。公开源码与发布包使用 Jost（SIL OFL 1.1），优先使用用户本机已有的 Ableton Sans。仓库不包含 Ableton 字体，不隶属于 Ableton。

## 识别边界

识别基于 Tonal 字典及实际 MIDI 音集。保留八度、实际低音与候选解释；无调性上下文时，同一音集可能有多个合理名称。省略五音解释会明确标为推测，推测音不会添加到实际组成音表中。练习判定直接比较音高，不依赖候选名称排序。

情绪是定性听感提示，不是情绪预测，也不是对全部延伸和弦的实验性结论。文化、音区、配器与上下文会改变听感。详细依据见 [研究与方法](docs/references.md)，测试范围见 [发布验证](docs/validation.md)。

项目代码采用 MIT 许可证，第三方组件见 [授权声明](THIRD_PARTY_NOTICES.md)。
