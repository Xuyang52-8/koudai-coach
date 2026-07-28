#!/usr/bin/env python3
"""口袋私教 · 激活码生成器（与 src/lib/license.ts 严格同算法）

用法：python3 scripts/gen-codes.py [数量]   # 默认 10 个
把生成的码发给朋友，对方首次打开 App 输入即可使用。
"""
import random, sys

SALT = "koudai-coach-license-v1"          # 与 license.ts 的 SALT 一致
ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # 31 个，剔除 0/O/1/I/L

def fnv1a(s: str) -> int:
    h = 0x811C9DC5
    for ch in s:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h

def make_code() -> str:
    payload = "".join(random.choice(ALPHA) for _ in range(8))
    h = fnv1a(payload + SALT)
    check = ALPHA[h % 31] + ALPHA[(h // 31) % 31]
    body = payload + check
    return f"KD-{body[:4]}-{body[4:8]}-{body[8:]}"

n = int(sys.argv[1]) if len(sys.argv) > 1 else 10
codes = sorted({make_code() for _ in range(n * 2)})[:n]  # 去重保险
for c in codes:
    print(c)
