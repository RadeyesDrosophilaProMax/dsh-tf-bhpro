import asyncio
import os
import sys

from bleak import BleakClient

# The plugin passes the address through this variable; run the script by hand
# with:  set TOY_ADDRESS=AA:BB:CC:DD:EE:FF  (PowerShell: $env:TOY_ADDRESS="...")
ADDRESS = os.environ.get("TOY_ADDRESS", "").strip()
FFB7 = "0000ffb7-0000-1000-8000-00805f9b34fb"
PROP_RUN = 0x1D
PROP_MODE = 0x1E
PROP_LEVEL = 0x1F
STOP_VALUE = 2


def frame(sn: int, prop: int, value: int) -> bytes:
    return bytes([sn, 0x02, 0x00, 0x03, prop, value, (-(prop + value)) & 0xFF])


async def run(command: str, args) -> None:
    if ADDRESS == "":
        raise SystemExit("TOY_ADDRESS is not set (see README)")
    async with BleakClient(ADDRESS, timeout=20) as client:
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
    asyncio.run(run(sys.argv[1], sys.argv[2:]))
