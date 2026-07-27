# APK 构建全流程（沙箱环境专用）

> 目标：从源码到签名 APK，上传 GitHub Release 给用户下载。
> 沙箱每次会话 `$HOME` 和 `/tmp` 会被清空，工具链必须重装（约 5-8 分钟）。
> **keystore 在 `/mnt/agents/output/apk-signing/koudai.keystore`（持久化），丢了就无法覆盖安装！**

## 1. 重装工具链

```bash
T=/tmp/toolchain; mkdir -p $T && cd $T
# Node 22（npm 镜像，快）
curl -sL -o n22.tgz "https://registry.npmmirror.com/-/binary/node/v22.17.0/node-v22.17.0-linux-x64.tar.gz"
tar xzf n22.tgz && export PATH=$T/node-v22.17.0-linux-x64/bin:$PATH
# JDK 21（Amazon Corretto）
curl -sL -o j21.tgz "https://corretto.aws/downloads/latest/amazon-corretto-21-x64-linux-jdk.tar.gz"
tar xzf j21.tgz && export JAVA_HOME=$T/amazon-corretto-21*/ && export PATH=$JAVA_HOME/bin:$PATH
# Android SDK 命令行工具
curl -s -o ct.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
mkdir -p $T/sdk/cmdline-tools && unzip -q ct.zip -d $T/sdk/cmdline-tools && mv $T/sdk/cmdline-tools/cmdline-tools $T/sdk/cmdline-tools/latest
export ANDROID_HOME=$T/sdk
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH
yes | sdkmanager --licenses >/dev/null
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

## 2. 构建

```bash
cd /mnt/agents/output/app
export PATH=/tmp/toolchain/node-v22.17.0-linux-x64/bin:$PATH   # 若新开 shell
npm install                       # 或 npm ci
npm run build                     # 产出 dist/
npx cap sync android              # 拷贝 dist → android/app/src/main/assets/public
cd android
./gradlew assembleRelease         # 约 3-6 分钟，腾讯镜像已配好
# 产物：android/app/build/outputs/apk/release/app-release-unsigned.apk
```

## 3. 签名 + 对齐

```bash
KS=/mnt/agents/output/apk-signing/koudai.keystore
U=android/app/build/outputs/apk/release/app-release-unsigned.apk
$ANDROID_HOME/build-tools/34.0.0/zipalign -f -p 4 $U /tmp/aligned.apk
$ANDROID_HOME/build-tools/34.0.0/apksigner sign \
  --ks $KS --ks-key-alias koudai \
  --ks-pass pass:koudai2026 --key-pass pass:koudai2026 \
  --out "/mnt/agents/output/口袋私教-vX.Y.apk" /tmp/aligned.apk
$ANDROID_HOME/build-tools/34.0.0/apksigner verify --print-certs "/mnt/agents/output/口袋私教-vX.Y.apk" | head -3
# SHA-256 必须是 67:F7:FC:FF:28:0D:44:75:57:F1:AE:2A:72:A6:53:F2:94:05:CD:0C:82:D9:08:C9:1C:8F:E2:5C:FC:50:94:7E
# 指纹一致才能覆盖安装；不一致说明 keystore 错了，千万不要发给用户！
```

## 4. 上传 GitHub Release（用户下载入口）

```bash
TAG="vX.Y"; REPO="Xuyang52-8/koudai-coach"; TOK="<GitHub PAT，见交接文档>"
curl -s -X POST -H "Authorization: token $TOK" -H "Content-Type: application/json" \
  -d "{\"tag_name\":\"$TAG\",\"name\":\"口袋私教 $TAG\",\"body\":\"更新说明\"}" \
  "https://api.github.com/repos/$REPO/releases" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])"
RID=<上一步返回的id>
curl -s -X POST -H "Authorization: token $TOK" -H "Content-Type: application/vnd.android.package-archive" \
  --data-binary @"/mnt/agents/output/口袋私教-$TAG.apk" \
  "https://uploads.github.com/repos/$REPO/releases/$RID/assets?name=koudai-coach-$TAG.apk"
# 下载链接：https://github.com/Xuyang52-8/koudai-coach/releases/latest
```

## 5. 同时更新 COS 网页版

```bash
python3 scripts/deploy-cos.py    # 自动把 dist/ 上传到腾讯云 COS，网页版即时更新
```

## 关键配置（已固化在仓库，勿动）

| 文件 | 作用 |
|---|---|
| `android/variables.gradle` | `ext.kotlin_version='2.2.20'`，解决插件 Kotlin 2.2 编译与项目 2.0 的 metadata 冲突 |
| `android/gradle/wrapper/gradle-wrapper.properties` | Gradle 用腾讯镜像 `mirrors.cloud.tencent.com/gradle/`（官方源在沙箱不稳） |
| `package.json` | @capacitor/* 全家桶对齐 8.4.2，勿混装 7.x |
| `capacitor.config.ts` | packageId `cn.koudai.coach`，webDir `dist` |

## v1.6 新增经验

- **依赖下载慢/构建超时**：阿里云 maven 镜像已加进 build.gradle（buildscript + allprojects），冷构建从 20 分钟降到 ~10 分钟
- **沙箱 OOM 杀 Gradle daemon**（lintVitalAnalyzeRelease/mergeDexRelease 阶段）：加 `-x lintVitalRelease --no-daemon -Dorg.gradle.jvmargs="-Xmx1536m -XX:MaxMetaspaceSize=512m"`，二次构建 1 分 14 秒完成
- **持久化 gradle 缓存到 portal FS 不可行**（大文件写入 I/O error），放弃，靠镜像提速解决

## 历史坑（每个都踩过，别再踩）

1. **不要回退 Capacitor 到 7.x**：duplicate classes kotlin-stdlib 冲突；8.4.2 + kotlin 2.2.20 是验证过的组合
2. **不要在根 build.gradle 加 `force kotlin-stdlib:1.8.22`**：会把插件的 Kotlin 2.2 运行库强压崩溃
3. **tts.ts 里操作 `window.speechSynthesis` 必须用 `hasWebSpeech()` 守卫**（真实存在判断），不能用 `ttsSupported()`（原生壳返回 true）——v1.4 黑屏根因
4. **原生壳内禁止注册 Service Worker**（main.tsx 已处理）：SW 旧缓存会把新页面卡成黑屏
5. **构建前先 `git status`**：portal 文件系统偶发把工作区回退到旧版本，发现 M 文件先 `git diff HEAD` 确认方向，必要时 `git reset --hard HEAD`
