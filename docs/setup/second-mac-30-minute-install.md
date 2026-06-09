# DLens 第二台 Mac 30 分鐘安裝 SOP

這份文件是給「會照著 Terminal 指令做，旁邊只有簡單 AI chatbot 幫忙」的人用。目標不是教會 DLens codebase，而是在新 Mac 上把可測試環境跑起來。

## 先講結論

30 分鐘可行，但只在 **owner 已預先準備 kit** 的情況下成立。

推薦路徑：

- 新手只設定本機 backend、放入 2 個 secret 檔、載入 owner 預先 build 好的 unpacked extension。
- 新手不需要 build extension，不需要跑 extension tests，不需要處理 DB migration。

不推薦把「clone extension + npm install + npm run build + backend bootstrap + Playwright install」全部丟給新手。那條路比較像 30-45 分鐘，而且任何 Node/Python/network 錯誤都會吃掉整個時限。

## 30 分鐘成功條件

完成後應該有：

- Backend API 跑在 `http://127.0.0.1:8000`
- Chrome 已從 `~/dlens/chrome-mv3` 載入 `DLens v3`
- Extension Settings backend URL 是 `http://127.0.0.1:8000`
- Threads 頁面看得到 DLens launcher / popup
- `curl -s http://127.0.0.1:8000/worker/status` 有回應

## 不需要的東西

這個 30 分鐘 install 不需要任何 OpenAI、Claude、Google Gemini 或其他 AI API key。Backend 分析是 deterministic；extension 內的 AI provider key 屬於進階功能，不是安裝前置。

真正必需的 secret surface 只有 2 個：

| 檔案 | 放置位置 | 用途 |
|---|---|---|
| `dlens-ingest-core.env` | 先放在 `~/Downloads`，安裝時複製成 backend repo 的 `.env` | Supabase/Postgres DB URL |
| `auth_threads.json` | 先放在 `~/Downloads`，安裝時複製到 backend repo | Backend crawler 的 Threads session |

注意：Chrome 裡登入 Threads 只讓 extension popup 能在 Threads 頁面上操作；它 **不能取代** backend 用的 `auth_threads.json`。

## Owner Prep

Owner 必須在交給新手前完成這段。這段不算進 30 分鐘。

### 1. 確認文件會送到新手手上

如果這份文件還沒 merge 到新手會 clone 的 branch，就把這份檔案直接放進交付包。不要假設新手 `git clone` 後一定看得到本文件。

### 2. 準備已 build extension zip

在 extension repo 執行：

```bash
cd /path/to/dlens-chrome-extension
npm run build
node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('output/chrome-mv3/manifest.json','utf8')); console.log(m.name, m.version)"
rm -f ~/Downloads/dlens-chrome-mv3-0.1.29.zip
(cd output && ditto -c -k --keepParent chrome-mv3 ~/Downloads/dlens-chrome-mv3-0.1.29.zip)
```

預期輸出包含：

```text
DLens v3 0.1.29
```

交付給新手的 zip 檔名：

```text
dlens-chrome-mv3-0.1.29.zip
```

### 3. 確認 backend DB 已套 schema

如果 owner 給的是共用、已 migrate 的 Supabase DB，只要確認即可。若是新的空 DB，owner 要先在 backend repo 跑：

```bash
cd /path/to/dlens-ingest-core
source .venv/bin/activate
set -a
source .env
set +a
python scripts/db_exec_sql.py --file migrations/0001_schema_v0.sql
python scripts/db_exec_sql.py --file migrations/0002_capture_analyses.sql
python scripts/db_exec_sql.py --file migrations/0003_thread_read_model.sql
```

這一步不要交給新手。Backend 可能啟動成功，但實際 queue/crawl 時才因缺 table 或 column 爆掉；簡單 chatbot 很難從 runtime DB error 修回來。

### 4. 準備新手要放到 `~/Downloads` 的 3 個檔案

```text
~/Downloads/dlens-chrome-mv3-0.1.29.zip
~/Downloads/dlens-ingest-core.env
~/Downloads/auth_threads.json
```

`dlens-ingest-core.env` 內容至少要有：

```bash
DLENS_DATABASE_URL='postgresql://...'
DLENS_THREADS_AUTH_FILE='auth_threads.json'
```

不要把 `.env` 或 `auth_threads.json` commit 到 git，也不要把 DB URL 貼到普通聊天視窗。

### 5. 確認新手有必要權限和工具

新手的 Mac 要有：

- Git
- Python 3.11+
- Chrome
- GitHub access to `github.com/jasonmaxxxon/dlens-ingest-core`，這是 private repo

Node/npm 只在 fallback「自行 build extension」才需要；推薦 30 分鐘路徑不需要新手安裝 Node。

## Chatbot Priming Prompt

新手開始前，把這段貼給 chatbot：

```text
I am installing DLens on a new Mac using a written SOP.
Guide me one command block at a time.
Do not skip ahead.
After each command, ask me to paste the output.
Never ask me to paste the full .env or database URL.
If there is an error, explain it in plain language and give exactly one next command.
The SOP is the source of truth.
```

## 新手 30 分鐘步驟

### 1. 建立工作資料夾並 clone backend

```bash
mkdir -p ~/dlens
cd ~/dlens
git clone https://github.com/jasonmaxxxon/dlens-ingest-core.git
```

預期資料夾：

```text
~/dlens/dlens-ingest-core
```

如果出現 `Repository not found`，代表 GitHub 帳號沒有 private backend repo 權限，找 owner 處理。

### 2. 放入 backend secrets

確認 owner 給的 2 個 secret 檔在 Downloads：

```bash
test -f ~/Downloads/dlens-ingest-core.env && echo "dlens-ingest-core.env OK"
test -f ~/Downloads/auth_threads.json && echo "auth_threads.json OK"
```

複製到 backend repo：

```bash
cd ~/dlens/dlens-ingest-core
cp ~/Downloads/dlens-ingest-core.env .env
cp ~/Downloads/auth_threads.json auth_threads.json
chmod 600 .env auth_threads.json
grep -q '^DLENS_THREADS_AUTH_FILE=auth_threads.json' .env || printf '\nDLENS_THREADS_AUTH_FILE=auth_threads.json\n' >> .env
test -f .env && echo ".env copied"
test -f auth_threads.json && echo "auth_threads.json copied"
```

不要把 `.env` 內容貼給 chatbot。只貼錯誤訊息。

### 3. 安裝 backend dependencies

```bash
cd ~/dlens/dlens-ingest-core
bash scripts/bootstrap.sh
```

這一步會建立 Python venv、安裝套件、安裝 Playwright Chromium。網路慢時可能要幾分鐘。

成功時最後會看到類似：

```text
done. Next:
source .venv/bin/activate ...
python scripts/run_api.py
```

### 4. 啟動 backend

開第一個 Terminal 視窗，執行：

```bash
cd ~/dlens/dlens-ingest-core
source .venv/bin/activate
set -a
source .env
set +a
python scripts/run_api.py
```

這個視窗要保持開著，不要關。

再開第二個 Terminal 視窗，檢查 backend：

```bash
curl -s http://127.0.0.1:8000/worker/status && echo
```

預期看到 JSON，常見是：

```json
{"status":"idle"}
```

如果 Python 說找不到 module 或 app，在第一個 Terminal 停掉 backend，改試：

```bash
cd ~/dlens/dlens-ingest-core
source .venv/bin/activate
set -a
source .env
set +a
PYTHONPATH=src python scripts/run_api.py
```

### 5. 解壓並載入 extension

在第二個 Terminal 執行：

```bash
mkdir -p ~/dlens
ditto -x -k ~/Downloads/dlens-chrome-mv3-0.1.29.zip ~/dlens
test -f ~/dlens/chrome-mv3/manifest.json && echo "extension folder OK"
```

如果 `extension folder OK` 沒出現，先找 manifest 在哪：

```bash
find ~/dlens -name manifest.json -path '*chrome-mv3*' -print
```

Chrome 載入方式：

1. 打開 Chrome。
2. 去 `chrome://extensions`。
3. 開啟 `Developer mode`。
4. 按 `Load unpacked`。
5. 選：

```text
~/dlens/chrome-mv3
```

預期 Chrome extension 顯示：

```text
DLens v3
Version 0.1.29
```

### 6. Smoke Test

1. Chrome 打開 `https://www.threads.net/`。
2. 確認 Chrome 裡已登入 Threads。
3. 打開 Threads feed 或單一 post 頁。
4. 確認看得到 DLens launcher / popup。
5. 打開 DLens Settings。
6. 確認 backend URL 是：

```text
http://127.0.0.1:8000
```

7. 進 Collect mode，對一個可見 post 做 collect。
8. 如果有 queue backend processing，第一個 Terminal 應該會看到 API activity。
9. 第二個 Terminal 再跑：

```bash
curl -s http://127.0.0.1:8000/worker/status && echo
```

Pass condition：

- Extension 沒 crash。
- Popup modes 可見。
- Backend health endpoint 有回應。
- Settings backend URL 指向 `http://127.0.0.1:8000`。

## 如果 `auth_threads.json` 過期或缺失

這不是 Chrome Threads 登入可以解決的問題。Backend crawler 有自己的 Playwright session 檔。

如果 owner 沒有可用的 `auth_threads.json`，或 backend log 顯示 Threads auth 失效，先確認 owner 允許在這台 Mac 重新登入，然後執行：

```bash
cd ~/dlens/dlens-ingest-core
source .venv/bin/activate
python src/dlens_ingest_core/crawlers/threads/vendor/login.py
```

依照跳出的 Chromium 視窗登入 Threads。完成後回 Terminal 按 Enter。成功後 repo 內會產生：

```text
~/dlens/dlens-ingest-core/auth_threads.json
```

然後重新啟動 backend。

這一步可能需要 2FA、Meta/Threads 帳號權限或 owner 協助，所以不保證仍在 30 分鐘內。

## Fallback：自行 build extension

只有在 owner 沒有提供 `dlens-chrome-mv3-0.1.29.zip` 時才走這段。這條路需要 Node/npm，而且時間比較不可控。

```bash
cd ~/dlens
git clone https://github.com/jasonmaxxxon/dlens-chrome-extension.git
cd ~/dlens/dlens-chrome-extension
git checkout main
npm install
npm run build
node scripts/locate-ingest-core.mjs
```

預期：

```text
Mirrored unpacked extension to .../output/chrome-mv3
ingest-core checkout found:
```

Chrome `Load unpacked` 時改選：

```text
~/dlens/dlens-chrome-extension/output/chrome-mv3
```

注意：`node scripts/locate-ingest-core.mjs` 只是 dev 檢查。Extension runtime 真正使用的是 Settings 裡的 backend URL。

## 不包含在 30 分鐘內的工作

以下任何一項都會讓 30 分鐘承諾失效：

- 建立或修復 GitHub private repo access
- 安裝 Homebrew、Python、Chrome、Xcode Command Line Tools
- 新建 Supabase DB 或旋轉 DB password
- 對空 DB 套 migrations
- 修復過期 Threads session / 2FA / 帳號風控
- 從主力 Mac 搬移既有 Chrome local extension storage
- 跑完整 extension test suite 或準備 Chrome Web Store release

## Troubleshooting Prompts

### GitHub clone failed

```text
The backend git clone failed. Here is the full output:

<paste output>

Tell me whether this is GitHub access, authentication, or a command typo. Give me exactly one next command or tell me to contact the owner.
```

### Secret files missing

```text
The SOP says to check two files in Downloads. This is my output:

<paste output>

Tell me which exact file is missing and whether I need the owner to resend it. Do not ask me to paste the .env contents.
```

### Backend bootstrap failed

```text
The backend bootstrap failed. Here is the full output:

<paste output>

Check whether this is Python version, pip install, Playwright install, or network. Give me exactly one next command to try.
```

### Backend did not start

```text
The DLens backend did not start. Here is the command I ran and the full output:

<paste command and output>

Check whether this is missing Python deps, missing .env, missing auth_threads.json, missing DB URL, or PYTHONPATH. Give me exactly one fix to try next.
```

### Backend starts but processing fails

```text
DLens backend started, but processing a Threads post failed. Here is the backend log:

<paste log>

Tell me whether this looks like DB schema missing, Threads auth expired, or crawler/network failure. Do not ask me to paste the database URL.
```

### Chrome cannot load extension

```text
Chrome could not load the unpacked DLens extension. I selected this folder:

~/dlens/chrome-mv3

Here is the Chrome error:

<paste error>

Tell me whether I selected the wrong folder or the zip/build output is broken. Give me the next exact check.
```

## Owner Acceptance Checklist

Owner 或 technical helper 最後確認：

```bash
curl -s http://127.0.0.1:8000/worker/status && echo
```

Chrome：

- `DLens v3` loaded
- Version is `0.1.29`
- Loaded from `~/dlens/chrome-mv3` or fallback `~/dlens/dlens-chrome-extension/output/chrome-mv3`
- Threads page shows DLens launcher / popup
- Settings backend URL is `http://127.0.0.1:8000`

如果以上都通過，第二台 Mac 已達到 extension + local backend testing 的最低可用狀態。
