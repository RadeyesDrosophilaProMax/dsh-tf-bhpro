# dsh-tf-bhpro

<p align="center"><img src="docs/qrcode.png" width="360" alt="QR code"></p>

A [DSH](https://github.com/deepseek-ai) (Cordis) plugin that controls a **TF-BHPRO** Bluetooth LE
device directly from the computer — no phone app, no cloud.

- **Panel** in the DSH sidebar: presets, mode/speed control, live status
- **Keyword router**: chat messages drive the device directly, so a small local model
  does not have to be good at tool calling
- **Editable keywords** in the panel: add a word by typing `/新词`
- **Optional model tool** (`exposeTool: true`) for models that do tool calling well

> 18+ only. This plugin controls an adult device; it contains no media and no
> explicit content, only Bluetooth control code.

---


## 快速安装（从 GitHub）

前提：本机有 Python 3.9+，并且装过一次 `bleak`：

```powershell
pip install bleak
```

然后在 DSH 里让 Agent 执行（一条命令，直接从 GitHub 装）：

```
plugin_manager install_bundle github:RadeyesDrosophilaProMax/dsh-tf-bhpro
```

**不需要填设备地址**：插件第一次动设备时会自动扫描附近设备，按名字
（TF-BHPRO / BHPRO / 春风…）找到它并把地址缓存到 `scripts/toy-device.json`。

想手动指定地址也可以：编辑装好后的 `cordis.patch.yml`，把 `address` 填成
`python scripts/scan.py` 扫描到的值，然后重新安装。

想用 git 开发：

```powershell
git clone https://github.com/RadeyesDrosophilaProMax/dsh-tf-bhpro.git
plugin_manager install_bundle <仓库所在路径>
```

## 1. Requirements

| Item | Notes |
|---|---|
| DSH with Cordis plugin support | any recent build |
| Windows 10/11 | the bundled Python script uses `bleak` (cross-platform, macOS/Linux should work too) |
| Python 3.9+ | `pip install bleak` |
| Bluetooth LE | built-in or USB dongle |

Pair the device with the computer once, and keep the phone app disconnected while
the plugin is driving it.

## 2. Find the device address

```bash
python scripts/scan.py
```

Look for a device named like `TF-BHPRO` and copy its address (`AA:BB:CC:DD:EE:FF`).

## 3. Install

1. Put this folder anywhere, e.g. `D:\plugins\dsh-tf-bhpro`.
2. Edit `cordis.patch.yml`:

```yaml
- insert:
    - id: toy-control
      name: dsh-tf-bhpro
      config:
        pythonPath: python            # or a full path to python.exe
        scriptPath: ""                # empty = bundled scripts/bt_toyctl.py
        address: "AA:BB:CC:DD:EE:FF"  # <- your device
        exposeTool: false
```

3. Install the bundle in DSH (plugin manager → install from folder, or
   `plugin_manager install_bundle <path>`).
4. The sidebar shows **外接躯体**; open it and press 启动.

## 4. Keywords

The router matches substrings in **your own messages** and drives the device,
independently of the model. Defaults:

| Group | Behaviour | Default words |
|---|---|---|
| `nearFinish` | speed up | 要射出来了 |
| `stop` | stop | 结束 / 射出来了 / 拔出来了 |
| `faster` | + speed | 快一点 / 快点 / 加速 / 用力 / 使劲 / 再快 … |
| `slower` | − speed | 慢一点 / 慢点 / 减速 / 轻一点 / 轻柔 … |
| `status` | query only | 状态 / 什么状态 / 舒服吗 / 在动吗 … |
| `modeSwitch` | random other mode | 换个动作 / 换个姿势 |
| `start` | start (random mode, slow gear) | 插进去了 / 动一下 / 继续动 / 别停 … |

Rules: one action per message, first match wins, in the order above. Every hit is
appended to `toy-calls.log` next to the script (`router: …`).

### Editing keywords

Open the **外接躯体** panel: the top section lists all seven groups. Words are
separated by `/`; append `/新词` to add one, then press 保存 for that group.
Changes take effect immediately and persist in `toy-keywords.json`.

## 5. Panel controls

- **Presets** — name + mode + speed, click to apply
- **Start / Stop / speed slider**
- **State** — plugin remembers the last applied mode/level in `toy-state.json`

## 6. Model integration (optional)

Set `exposeTool: true` to also register a `toy_control` tool for the model
(`start` / `stop` / `set` / `faster` / `slower` / `status`). Small models often
narrate instead of calling tools, which is exactly why the keyword router exists;
the two paths can be used together.

## 7. Protocol

See [docs/PROTOCOL.zh-CN.md](docs/PROTOCOL.zh-CN.md): service `0000ffac`,
write `0000ffb7`, notify `0000ffb8`, 7-byte frames with properties `0x1D`
(run/stop), `0x1E` (mode 1–4), `0x1F` (speed 0–15).

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| nothing happens | check `toy-calls.log`; if empty, BLE never connected |
| keywords ignored | log has no `router:` line → the word is not in the group |
| device stops immediately | phone app still connected |
| `ModuleNotFoundError: bleak` | `pip install bleak` |
| `TOY_ADDRESS is not set` | fill `address` in `cordis.patch.yml` |

## License

MIT — see [LICENSE](LICENSE).
