#!/usr/bin/env python3
"""口袋私教 · 网页版部署脚本（上传 dist 到腾讯云 COS 静态网站）

用法：
  cd <项目根> && npm run build
  python3 scripts/deploy-cos.py            # 默认传 dist/
  python3 scripts/deploy-cos.py <dist路径>

依赖：纯标准库。
密钥从环境变量读取（GitHub 推送保护不允许密钥入库）：
  export COS_SECRET_ID=<见交接文档>
  export COS_SECRET_KEY=<见交接文档>
带密钥的完整版另存于 /mnt/agents/output/deploy-cos-keyed.py
"""
import os, sys, mimetypes, hashlib, hmac, time, urllib.request

SECRET_ID = os.environ.get("COS_SECRET_ID", "")
SECRET_KEY = os.environ.get("COS_SECRET_KEY", "")
if not SECRET_ID or not SECRET_KEY:
    sys.exit("请先 export COS_SECRET_ID / COS_SECRET_KEY（值见交接文档）")
HOST = "koudai-coach-1433385498.cos.ap-guangzhou.myqcloud.com"
DIST = sys.argv[1] if len(sys.argv) > 1 else "dist"

CT = {".html": "text/html; charset=utf-8", ".js": "application/javascript",
      ".css": "text/css", ".json": "application/json",
      ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
      ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain"}

def cos_sign(method, path, headers_to_sign, params):
    now = int(time.time()); kt = f"{now-60};{now+600}"
    sk = hmac.new(SECRET_KEY.encode(), kt.encode(), hashlib.sha1).hexdigest()
    def fmt(d):
        return "&".join(f"{urllib.request.quote(k.lower(), safe='')}={urllib.request.quote(str(v), safe='')}"
                        for k, v in sorted(d.items()))
    hs = f"{method.lower()}\n{path}\n{fmt(params)}\n{fmt(headers_to_sign)}\n"
    sts = f"sha1\n{kt}\n{hashlib.sha1(hs.encode()).hexdigest()}\n"
    sig = hmac.new(sk.encode(), sts.encode(), hashlib.sha1).hexdigest()
    return (f"q-sign-algorithm=sha1&q-ak={SECRET_ID}&q-sign-time={kt}&q-key-time={kt}"
            f"&q-header-list={';'.join(sorted(k.lower() for k in headers_to_sign))}"
            f"&q-url-param-list={';'.join(sorted(k.lower() for k in params))}&q-signature={sig}")

def cos_put(key, raw, ct):
    path = "/" + key
    h = {"Content-Type": ct, "Authorization": cos_sign("PUT", path, {"Content-Type": ct}, {})}
    req = urllib.request.Request(f"https://{HOST}{path}", data=raw, headers=h, method="PUT")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code

files = sorted(os.path.relpath(os.path.join(r, n), DIST)
               for r, _, ns in os.walk(DIST) for n in ns)
ok = 0
for rel in files:
    raw = open(os.path.join(DIST, rel), "rb").read()
    ct = CT.get(os.path.splitext(rel)[1]) or mimetypes.guess_type(rel)[0] or "application/octet-stream"
    code = cos_put(rel.replace(os.sep, "/"), raw, ct)
    if code in (200, 201, 204):
        ok += 1
    else:
        print("FAIL", rel, code)
print(f"uploaded {ok}/{len(files)} -> https://{HOST.replace('.cos.', '.cos-website.')}/")
