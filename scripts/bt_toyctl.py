import asyncio
import json
import os
import sys
from pathlib import Path

from bleak import BleakClient, BleakScanner

# The plugin passes the address through this variable; run the script by hand
# with:  set TOY_ADDRESS=AA:BB:CC:DD:EE:FF  (PowerShell: $env:TOY_ADDRESS="...")
ADDRESS = os.environ.get("TOY_ADDRESS", "").strip()

# Zero-config fallback: remember the device we found once, next to this script.
CACHE = Path(__file__).with_name("toy-device.json")
# Names the device advertises; extend freely.
NAME_HINTS = ("TF-BHPRO", "TFBHPRO", "BHPRO", "TF-BH", "春风", "CHUNFENG")


def remember(address: str) -> None:
    try:
        CACHE.write_text(json.dumps({"address": address}), encoding="utf-8")
    except OSError:
        pass


def recall() -> str:
    try:
        return str(json.loads(CACHE.read_text(encoding="utf-8")).get("address", "")).strip()
    except (OSError, ValueError):
        return ""


async def discover() -> str:
    """Scan for a device whose name looks like the target and cache it."""
    print("no address configured, scanning 8s ...", file=sys.stderr)
    devices = await BleakScanner.discover(timeout=8)
    for device in devices:
        name = (device.name or "").upper()
        if any(hint.upper() in name for hint in NAME_HINTS):
            remember(device.address)
            print(f"found {device.address} ({device.name})", file=sys.stderr)
            return device.address
    return ""
FFB7 = "0000ffb7-0000-1000-8000-00805f9b34fb"
PROP_RUN = 0x1D
PROP_MODE = 0x1E
PROP_LEVEL = 0x1F
STOP_VALUE = 2


def frame(sn: int, prop: int, value: int) -> bytes:
    return bytes([sn, 0x02, 0x00, 0x03, prop, value, (-(prop + value)) & 0xFF])


async def run(command: str, args) -> None:
    address = ADDRESS or recall() or await discover()
    if address == "":
        raise SystemExit("device not found; set TOY_ADDRESS or run scripts/scan.py")
    async with BleakClient(address, timeout=20) as client:
        sn = 1

        async def write(prop: int, value: int) -> None:
            nonlocal sn
            await client.write_gatt_char(FFB7, frame(sn, prop, value), response=False)
            sn = sn % 15 + 1
            await asyncio.sleep(0.35)

        if command == "stop":
            await write(PROP_RUN, STOP_VALUE)
            print("stopped")
            return

        if command in ("start", "mode"):
            mode = max(1, min(4, int(args[0]))) if args else 1
            await write(PROP_MODE, mode)
            if len(args) > 1:
                await write(PROP_LEVEL, max(0, min(15, int(args[1]))))
            print(f"mode={mode}")
            return

        if command == "set":
            level = max(0, min(15, int(args[0]))) if args else 0
            if len(args) > 1:
                await write(PROP_MODE, max(1, min(4, int(args[1]))))
            await write(PROP_LEVEL, level)
            print(f"level={level}")
            return

        raise SystemExit(f"unknown command: {command}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("usage: bt_toyctl.py <start|stop|set|mode> [args]")
    try:
        asyncio.run(run(sys.argv[1], sys.argv[2:]))
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 - surface one readable line
        print(
            f"BLE error: {type(exc).__name__}: {exc}\n"
            "check that the device is powered on, in range, and not connected to the phone app",
            file=sys.stderr,
        )
        raise SystemExit(3) from None
