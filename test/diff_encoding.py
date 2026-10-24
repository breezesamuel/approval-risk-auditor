"""用 viem 编码同一条 aggregate3，与 JS 手写版逐字节对比。"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(r"F:\2026\新建文件夹")))

from viem import encode_function_data

aggregate3_abi = [{
    "name": "aggregate3", "type": "function", "stateMutability": "view",
    "inputs": [{"name": "calls", "type": "tuple[]", "components": [
        {"name": "target", "type": "address"},
        {"name": "allowFailure", "type": "bool"},
        {"name": "callData", "type": "bytes"},
    ]}],
    "outputs": [{"name": "returnData", "type": "tuple[]", "components": [
        {"name": "success", "type": "bool"},
        {"name": "returnData", "type": "bytes"},
    ]}],
}]


def allowance_cd(owner, spender):
    return "0xdd62ed3e" + owner.replace("0x", "").lower().padStart(64, "0") + \
        spender.replace("0x", "").lower().padStart(64, "0")


USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F"
OWNER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
SPENDER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"

calls = [
    {"target": USDC, "allowFailure": True, "callData": allowance_cd(OWNER, SPENDER)},
    {"target": DAI, "allowFailure": True, "callData": allowance_cd(OWNER, SPENDER)},
]
viem_cd = encode_function_data({"abi": aggregate3_abi, "functionName": "aggregate3",
                                 "args": [calls]})
print("viem 长度:", len(viem_cd))
print("viem:", viem_cd[:300], "...")

# JS 手写版
enc = lambda a: a.replace("0x", "").lower().padStart(40, "0")
uint = lambda v: format(int(v), "x").rjust(64, "0")
js = ("0x82ad56cb" + uint(0x20) + uint(len(calls)) + "".join(
    enc(c["target"]) + uint(1 if c["allowFailure"] else 0) + uint(0x60) +
    uint((len(c["callData"]) - 2) // 2) +
    c["callData"][2:].ljust(((len(c["callData"]) - 2) // 2 + 31) // 32 * 64, "0")
    for c in calls))
print("\njs  长度:", len(js))
print("js :", js[:300], "...")

a = viem_cd[2:]
b = js[2:]
print("\n长度一致:", len(a) == len(b))
if len(a) == len(b):
    diffs = [(i, a[i:i+16], b[i:i+16]) for i in range(0, len(a), 16) if a[i:i+16] != b[i:i+16]]
    print("差异块数:", len(diffs))
    for i, x, y in diffs[:6]:
        print(f"  @{i}: viem={x}  js={y}")
