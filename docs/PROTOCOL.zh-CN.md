# TF-BHPRO（春风元力）协议研究记录

记录时间：2026-11-15 凌晨
设备：TF-BHPRO（蓝牙名），春风元力 App `com.tryfun.intelligent` 8.2.0
目标：让电脑上的 AI 直接控制设备，不依赖手机

> ✅ **已破解并落地**（2026-11-15 凌晨 3:00，3:20 修正停止指令）
>
> 控制帧格式：
> ```
> [序号 1-15][0x02][0x00][长度=0x03][属性ID][值][第三字节]
> ```
> 长度 = 3，一共 7 字节；第三字节属于载荷（不是校验和）。
>
> - **启动 = 写模式 `0x1E`**，值 1–4；启动后速度自动重置为 3
> - **速度 = 写 `0x1F`**，值 0–15；对外简化为三档：1=慢(1)、2=中(7)、3=快(15)，快/慢一点即档位 ±1
> - **停止 = 写 `0x1D = 2`**（真正的暂停指令；速度写 0 不会停）
> - 按设备按钮会主动上报事件帧：类型 `0x07`，载荷 `27 00 xx`（启动）/ `27 35 xx`（暂停）
> - 状态帧里的 `1d/1e/1f` 对应当前运行状态 / 模式 / 速度，屏幕显示为「模式 / 速度」
>
> 已封装为本仓库的 DSH 插件（面板 + 关键词路由，可选 `toy_control` 工具），
> 电脑直接蓝牙控制，**不需要手机、不需要 App**。

---

## 一、已确认的硬件与 BLE 信息

- 芯片方案：**杰理（JieLi）**，服务 `AE00/AE30` 是其 RCSP 特征
- 设备蓝牙地址：`AA:BB:CC:DD:EE:FF`（用户私有，勿外传）

### GATT 结构（服务 `0000ffac-...`）

| 特征值 | 属性 | 用途 |
|---|---|---|
| `ffb4` | read | 可读状态 |
| `ffb5` | write | 写入（带响应） |
| `ffb7` | write-no-response | 写入（无响应） |
| `ffb8` | notify | 状态上报 |

> Android 侧实际写入的 attribute handle 是 **0x001A**（bleak 枚举里显示 27/0x1B，两者编号体系不同）。

### 实际帧长度（从系统日志确认）

App 写入 ATT 的 PDU 长度（含 opcode+handle）为 **8 字节和 10 字节**，
换算成特征值内容 → 帧长度分别是 **5 字节** 和 **7 字节**。

---

## 二、协议层（杰理 RCSP）

从 App 内嵌的 JS SDK 反编译出操作码表：

```
0x01 CMD_DATA             0x07 CMD_GET_SYS_INFO
0x02 CMD_GET_TARGET_FEATURE_MAP   0x08 CMD_SET_SYS_INFO
0x03 CMD_GET_TARGET_INFO  0x09 CMD_SYS_INFO_AUTO_UPDATE
0x06 DISCONNECT_CLASSIC_BT 0x0B CMD_SWITCH_DEVICE_REQUEST
0xF0 CMD_CUSTOM           0xFF CMD_EXTRA_CUSTOM
0xD0 CMD_NOTIFY_DEVICE_APP_INFO   0xD1 SETTINGS_COMMUNICATION_MTU
```

设备周期上报的状态帧示例（18 字节）：

```
0c 01 00 0f 00 4d 01 00 03 00 05 00 1d 02 1e 00 1f 00 8b
```

- 第 2 字节 `0x01` = CMD_DATA
- 第 4 字节 `0x0F` = 长度
- 载荷是「属性ID + 值」的成对数据
- 最后 1 字节是校验

**注意：这些状态帧是周期性主动上报的，不是对写入的 ACK。**

## 三、设备能力枚举（App 内定义）

```
LINER_DETECTION=0  GRYO_DETECTION=1  HEAT_SWITCH=2  SWING_SWITCH=3
TELESCOPIC_LEVEL=9  ROTATION_LEVEL=10  VIBRATION_LEVEL=11
SUCTION_LEVEL=12  PULSE_LEVEL=13  ROTATION_AMP=15
```

产品型号表（App 识别用）：`tf-mastrb8-bhp02`、`bhp03`、`bhmp01`、`bhse01`、`bhmx01`、`hqm01-03`、`yxl01-03` 等。

## 四、尝试过并失败的方法（不要再重复）

1. **直接发明文帧**（多种操作码/属性组合）→ 设备不动，收到的"回包"实为周期状态帧
2. **补丁版 App + Frida 抓 writeCharacteristic** → 服务器校验 App 签名，登录永远失败（短信也被拒）
3. **微信登录补丁版** → 微信开放平台校验签名，服务器端拒绝
4. **旧版微信 + Sony 旧手机** → 微信服务器强制升级，旧版无法登录
5. **Sony Xperia XZs 当抓包机** → docomo 版：Bootloader unlock allowed = No、SIM 锁、无 HCI 日志开关、无 root
6. **系统级 HCI 日志** → `bluetooth_hci_log=1` 无效，`persist.bluetooth.btsnooplogmode` 无权限写
7. **App 日志（Logan）** → RSA 加密，私钥在服务器
8. **电脑伪装 BLE 外设** → Windows 驱动拒绝外设广播（Access Denied），手机扫不到
9. **静态逆向** → blutter 反编译出的 Dart 汇编里，协议函数体被 AOT 剥离
10. **中间人伪造登录响应** → libflutter 的 BoringSSL 静态链接且符号被剥，无法绕过证书校验
11. **MuMu 模拟器** → 无蓝牙适配器（state OFF、address null）
12. **硬件嗅探 / ESP32** → 用户所在地区不允许
13. **索尼 USB 有线连接设备** → 无数据通道，只有充电

## 五、唯一可行的后续路径

需要一台 **可解锁 Bootloader 的 Android 手机**（二手红米/小米最便宜）：

1. 解锁 BL → 刷 Magisk 拿 root
2. 安装官方原版 App，微信登录
3. root 下设置 `persist.bluetooth.btsnooplogmode=full`，重启蓝牙
4. 用 App 操作设备（伸缩 1→3→停）
5. 拉取 `/data/misc/bluetooth/logs/btsnoop_hci.log`
6. 用 `parse_btsnoop.py` 解析出 App→设备 的 ATT 写操作，即得完整协议

工具已备好：
- `parse_btsnoop.py`：解析 btsnoop 日志
- `btctl.py`：本地 BLE 连接/读写/订阅工具
- `hook_capture.js`：Frida 抓 writeCharacteristic 的脚本

## 六、附：当前可用的替代方案

手机的 App 已登录（微信），通过 adb 点击 UI 控制设备：
- 早期手机方案：插件 `device_control`（经手机 App），现已不再需要
- 前提：手机 USB 连接、App 停在「万能遥控」页
- 支持：模式 1~4 启动/停止、300 秒自动停
