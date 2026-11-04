# Desktop Island - Discord 傳檔暫存板 Bot 操作手冊

本工具專門讓你透過 **Discord 私訊（DM）**（包含直接上傳與轉發訊息），隨手丟檔案直接自動下載並推入 **Desktop Island 暫存板（Shelf）**。下載完成後會主動透過本地 HTTP POST 叫醒 Island，並在收合膠囊上顯示提示。

---

## 快速設定步驟

### 步驟 1：建立 Discord Bot 並取得 Token
1. 前往 [Discord Developer Portal](https://discord.com/developers/applications)。
2. 點擊 **New Application** 建立新應用程式。
3. 進入左側 **Bot** 分頁：
   - 點擊 **Reset Token** 取得 Token 並複製好。
   - 在 **Privileged Gateway Intents** 區塊，務必勾選開啟：
     - ✅ **Message Content Intent**（若未開啟會報 `PrivilegedIntentsRequired` 錯誤）
4. 進入左側 **OAuth2** -> **URL Generator**：
   - `SCOPES` 勾選：`bot`
   - `BOT PERMISSIONS` 勾選：
     - `Send Messages`
     - `Attach Files`
     - `Read Message History`
     - `Add Reactions`
   - 複製最底下的 Generated URL，貼到瀏覽器，邀請機器人加入你的伺服器（這樣你就能在成員清單中找到它並發起私訊）。

---

### 步驟 2：建立與設定 config.json
1. 將本目錄下的範例檔 `config.example.json` 複製一份並命名為 `config.json`：
   ```powershell
   Copy-Item config.example.json config.json
   ```
2. 打開 `dc-bot/config.json` 填入你的 Bot Token：
   ```json
   {
     "bot_token": "YOUR_DISCORD_BOT_TOKEN_HERE",
     "shelf_dir": "./shelf",
     "temp_cache_dir": "./temp_cache",
     "island_notify_url": "http://127.0.0.1:28848/notify",
     "max_file_size_mb": 50,
     "bundle_timeout_seconds": 30
   }
   ```

* **`bot_token`**：你的個人 Discord 機器人金鑰（`config.json` 已被 `.gitignore` 忽略，不會被上傳至 Git）。
* **`shelf_dir`**：暫存板存放檔案的目錄（預設使用相對路徑 `./shelf`，自動對應至 `dc-bot/shelf`，無須硬編碼本機絕對路徑）。
* **`temp_cache_dir`**：下載過程 `.part` 暫存與多附件決策前的快取目錄（預設 `./temp_cache`）。
* **`island_notify_url`**：Bot 搬完檔案後叫醒 Island 的本機 HTTP 接口。
* **`max_file_size_mb`**：單檔大小限制（預設 50 MB）。

---

### 步驟 3：安裝依賴

在 `dc-bot` 目錄下打開終端機（PowerShell 或 CMD）：
```powershell
pip install -r requirements.txt
```

---

## 啟動與停止方式

### 方式 A：無黑視窗背景常駐（推薦）
* **背景啟動**：直接點兩下執行 `start_background.vbs`
  - 完全不會彈出黑黑的終端機視窗，關閉終端也不受影響，在背景常駐運作。
* **停止機器人**：直接點兩下執行 `stop_bot.bat`
  - 會直接終止背景運行的機器人行程。

### 方式 B：前台終端機執行（方便看 Log 除錯）
在 `dc-bot` 目錄下執行：
```powershell
python bot.py
```
若成功啟動，終端機會顯示：
```text
========================================
Desktop Island Discord Bot 已就緒！
機器人帳號: YourBot#1234
暫存板目錄: ...\dc-bot\shelf
Island 通知接口: http://127.0.0.1:28848/notify
========================================
```

---

## 日常使用方式

1. 打開 Discord，找到你的機器人並**直接發送一對一私訊（DM）**，或將其他對話的檔案**轉發（Forward）**給機器人。
2. **單一檔案**：
   - Bot 下載完成後會給該則訊息打上勾勾「✅」。
   - Desktop Island 在收合狀態下會彈出提示「**bot已收錄檔案至暫存板**」，檔案靜默進入暫存板。
3. **多個檔案（>=2 個）**：
   - Bot 會跳出詢問面板：`[ 📦 直接打包 ]` 或 `[ 📄 拆散保存 ]`。
   - **打包**：建立 `Bundle-xxxxxx` 專屬資料夾收納，並以手風琴抽屜卡片推入 Island 暫存板。
   - **拆散**：全部平鋪存入暫存板。
   - **30 秒超時未選**：自動以預設「打包」方式存入。

---

## 安全與 Git 版本控制說明
- **私密設定隔離**：`.gitignore` 已忽略 `dc-bot/config.json`、`dc-bot/shelf/`、`dc-bot/temp_cache/` 與快取檔案，**你的 `bot_token` 與下載的私人檔案絕不會被提交至 Git**。
- **公開程式碼與範例**：`bot.py`、`config.example.json`、`requirements.txt` 與啟動腳本皆已去除所有本機路徑資訊，可安全納入 Git 版本控制分享。
