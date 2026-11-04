# Desktop Island (FocuSD Island)

<div align="center">
  <img src="src-tauri/icons/mark.svg" alt="Desktop Island Logo" width="84" height="84" />
  <h3>Windows 桌面多功能懸浮靈動島</h3>
  <p>以透明、無邊框、始終置頂的形式運行，集中管理系統媒體、剪貼簿歷史、檔案暫存板、待辦清單、多信箱通知與快捷翻譯。</p>
</div>

---

## 目錄

- [功能特性](#功能特性)
- [核心模組介紹](#核心模組介紹)
- [環境要求與建置安裝](#環境要求與建置安裝)
  - [1. 前置依賴安裝](#1-前置依賴安裝)
  - [2. 下載專案與安裝依賴](#2-下載專案與安裝依賴)
  - [3. 本地開發運行](#3-本地開發運行)
  - [4. 編譯打包](#4-編譯打包)
- [郵箱 IMAP 接入設定指引](#郵箱-imap-接入設定指引)
  - [通用設定原理](#通用設定原理)
  - [Gmail 設定步驟](#gmail-設定步驟)
  - [Outlook / Microsoft 365 設定步驟](#outlook--microsoft-365-設定步驟)
  - [企業郵箱與自建標準 IMAP 伺服器](#企業郵箱與自建標準-imap-伺服器)
- [Todo Markdown 同步與設定](#todo-markdown-同步與設定)
- [快捷鍵與操作交互](#快捷鍵與操作交互)
- [技術棧與專案結構](#技術棧與專案結構)
- [鳴謝與參考專案](#鳴謝與參考專案)
- [授權](#授權)

---

## 功能特性

- **雙態懸浮互動**：支援「收合態」（緊湊藥丸膠囊）與「展開態」（多功能操作面板）。收合態下常駐顯示即時時間（` | hh : mm`），並可直觀瀏覽迷你專輯縮圖、音訊動態波形與即時狀態；展開態下支援點擊島外自動收合與釘選固定。
- **邊緣吸頂與自由拖曳**：頂部邊緣吸附時鎖定橫向拖動；向下拉出可自由浮動於螢幕任意位置，貼近頂部自動吸頂還原。
- **四種視覺風格**：
  - **純黑模式 (pureBlack)**：沉浸黑底高對比風格。
  - **純白模式 (pureWhite)**：俐落簡約高亮度純白風格。
  - **黑玻璃模式 (liquidGlass)**：深邃曜石黑毛玻璃質感，搭配暗色玻璃分頁標籤與細緻微光折射邊框。
  - **白玻璃模式 (whiteGlass)**：高通透度晶霜毛玻璃質感，背景自然透光，搭配晶瑩折射高光。
- **全域雙向檔案拖曳感知**：支援從外部將檔案拖入島內自動收納至暫存板，亦支援直接從暫存板原生拖出檔案至桌面或其它應用。
- **本地隱私優先**：所有待辦紀錄、剪貼簿快取與設定皆存放於本機，支援 Markdown 檔案雙向同歩。

---

## 核心模組介紹

### 1. 系統與音樂 (System & SMTC)
- 對接 Windows SMTC (System Media Transport Controls) 與 CoreAudio。
- 顯示當前媒體播放狀態、歌曲名稱、演出者、專輯封面縮圖。
- 支援播放進度條拖動、音量控制滑桿、上一首、播放/暫停、下一首、隨機播放與單曲循環模式切換。
- 內建動態波形動畫，依據音訊輸出動態跳動。

### 2. 剪貼簿歷史 (Clipboard)
- 透過 Rust 底層註冊 Windows `AddClipboardFormatListener` 原生事件與備用輪詢機制，即時監聽系統複製動作。
- 支援**純文字**、**程式代碼**、**URL 連結**格式自動標註，以及**圖片剪貼簿**（自動生成縮圖預覽、顯示解析度與體積）。
- 支援關鍵字即時搜尋、點擊一鍵寫回系統剪貼簿、單筆刪除與清空歷史。

### 3. 檔案暫存板 (Dropover Shelf) 與 Discord Bot 遠端收檔
- 提供類似 macOS Dropover 的輕量檔案暫存空間，支援資料夾手風琴原地展開與子檔案檢視。
- 支援**雙向拖曳**：可從外部拖放多個檔案/資料夾暫存，亦可直接按住暫存卡片（或資料夾內的子檔案）**原生拖出至桌面、檔案總管或通訊軟體**。
- **Discord Bot 遠端傳檔整合 (`dc-bot/`)**：支援透過 Discord 私訊（直接傳送或轉發附件）自動下載檔案並推入暫存板。支援多檔案 30 秒互動打包決策，下載完成後主動叫醒靈動島並在收合膠囊提示「`bot已收錄檔案至暫存板`」（詳見 [`dc-bot/README.md`](dc-bot/README.md)）。
- 自動格式化檔案體積（B / KB / MB / GB）與副檔名專屬圖示。
- 支援點擊呼叫系統預設軟體直接開啟、一鍵在「檔案總管中顯示定位」、快速拷貝絕對路徑。

### 4. 待辦清單 (Todo & Daily Notes)
- 待辦事項支援新增、標記完成、刪除與重要任務釘選。
- 支援本機 `.md` 檔案持久化存取，預設目錄為 `Documents/FocuSD/{YYYY-MM-DD}.md`。
- 設定中心提供獨立 Markdown 編輯器，編輯後點擊儲存即可全域即時雙向同歩。

### 5. 多信箱通知 (Unified Mail)
- 支援配置多個獨立郵箱（如：工作信箱、個人信箱、學校信箱），各信箱標籤名稱可完全自訂。
- 透過安全 IMAP 協議同步郵件標題、寄件人與未讀狀態，點擊郵件卡片可在島內直接閱讀正文內容。

### 6. 本機離線快捷翻譯 (Local Offline Translation)
- **純本機離線運算**：採用 Firefox 瀏覽器離線翻譯所使用的開源 Bergamot (Marian NMT) 神經機器翻譯引擎，完全於 CPU 本地極速推理，不需要顯示卡、不需要聯網、無需配置任何 API Key 即可快速進行中英互譯。
- **輕量與隱私保護**：採用 INT8 量化輕量模型（單個語言包約 20~30MB），推論迅速且記憶體佔用極低，所有輸入與譯文 100% 留存在本機，徹底保障隱私。
- **雙介面體驗**：支援獨立浮動翻譯視窗（全域快捷鍵，預設 `Alt+C`）與懸浮島內快捷翻譯面板，支援中英雙向自動辨識、Tab 鍵一鍵剪貼簿填入與譯文即時複製。

---

## 環境要求與建置安裝

### 1. 前置依賴安裝

專案需於 **Windows 10 / 11 (64-bit)** 環境下編譯，請確認本機已安裝以下工具：

1. **Node.js**：建議 Node.js 18 或更高版本（[官網下載](https://nodejs.org/)）。
2. **pnpm**：全域安裝包管理器：
   ```powershell
   npm install -g pnpm
   ```
3. **Rust 與 Cargo**：安裝 Rust 工具鏈（stable-x86_64-pc-windows-msvc，[官網下載](https://www.rust-lang.org/tools/install)）：
   ```powershell
   winget install Rustlang.Rustup
   rustup default stable-x86_64-pc-windows-msvc
   ```
4. **C++ 建置工具**：安裝 Visual Studio C++ 生成工具（包含 MSVC 編譯器與 Windows 10/11 SDK）。
5. **WebView2 Runtime**：Windows 10/11 通常已內建；若缺少請至微軟官網下載安裝。

### 2. 下載專案與安裝依賴

```powershell
# 複製倉庫
git clone https://github.com/high-speed-steel/Desktop-Island.git
cd Desktop-Island

# 安裝前端依賴
pnpm install
```

### 3. 本地開發運行

- **啟動完整桌面端（含 Tauri 視窗與 Rust 後端）**：
  ```powershell
  pnpm tauri dev
  ```
- **僅啟動前端開發預覽（瀏覽器模式）**：
  ```powershell
  pnpm dev
  ```

### 4. 編譯打包

- **僅編譯 Release 可執行檔（推薦，耗時最短，直接產出 `.exe`）**：
  ```powershell
  pnpm tauri build --no-bundle
  ```
  產物路徑位於：
  `src-tauri/target/release/desktop-island.exe`

- **編譯完整 Windows 安裝包（NSIS / MSI）**：
  ```powershell
  pnpm tauri build
  ```
  產物路徑位於：
  `src-tauri/target/release/bundle/nsis/desktop-island_x64-setup.exe`

---

## 郵箱 IMAP 接入設定指引

在島嶼「設定」中可點擊進入信箱配置頁，新增或編輯多個郵箱。

### 通用設定原理
> **重要安全性提示**：
> 現代郵件服務提供商均強制要求使用**「應用程式專用授權碼 / 應用程式密碼」**，**切勿使用個人郵箱的登入密碼**。

---

### Gmail 設定步驟
1. 前往 [Google 帳戶管理中心](https://myaccount.google.com/)。
2. 點選左側 **「安全性」**，確認已啟用 **「兩步驟驗證」**。
3. 搜尋或點入 **「應用程式密碼 (App Passwords)」**。
4. 應用程式名稱自訂填寫（如 `DesktopIsland`），點擊建立並複製生成的 16 位英文字元密碼。
5. 確保在 Gmail 網頁版「設定 → 轉寄和 POP/IMAP」中已勾選「啟用 IMAP」。
6. 在 Desktop Island 設定中填入：
   - **伺服器 (Host)**：`imap.gmail.com`
   - **連接埠 (Port)**：`993`
   - **加密模式**：SSL / TLS
   - **帳號 (Username)**：您的 Gmail 地址（例如 `example@gmail.com`）
   - **密碼 (Password)**：生成的 16 位應用程式密碼

---

### Outlook / Microsoft 365 設定步驟
1. 確保帳戶開啟 IMAP 存取權限。若有開啟雙重驗證，需於 Microsoft 帳戶安全性中生成「應用程式密碼」。
2. 在 Desktop Island 設定中填入：
   - **伺服器 (Host)**：`outlook.office365.com`
   - **連接埠 (Port)**：`993`
   - **加密模式**：SSL / TLS
   - **帳號 (Username)**：您的 Outlook / Hotmail 完整地址
   - **密碼 (Password)**：帳戶密碼或應用程式密碼

---

### 企業郵箱與自建標準 IMAP 伺服器
1. 向企業網域管理員或郵件託管服務商獲取 IMAP 連線資訊。
2. 在 Desktop Island 設定中填入：
   - **伺服器 (Host)**：如 `mail.yourcompany.com` 或 `imap.yourdomain.com`
   - **連接埠 (Port)**：預設安全連線通常為 `993`（SSL/TLS）或 `143`（STARTTLS）
   - **加密模式**：SSL / TLS
   - **帳號 (Username)**：完整的電子郵件地址
   - **密碼 (Password)**：郵箱登入密碼或專用授權碼

---

## Todo Markdown 同步與設定

Desktop Island 支援將待辦清單與每日筆記持久化為本地 `.md` 檔案：

1. **檔案存放目錄**：
   - 預設儲存於當前使用者的文件目錄：`C:\Users\<使用者名稱>\Documents\FocuSD\{YYYY-MM-DD}.md`。
   - 可在設定中自訂存放資料夾。
2. **雙向同歩機制**：
   - 在待辦介面新增、勾選或刪除任務時，即時更新本地 `.md` 檔案。
   - 設定中心內建 Markdown 原始碼編輯面板，直接修改存檔後自動同步更新島內任務渲染。

---

## 快捷鍵與操作交互

| 操作 / 快捷鍵 | 作用 |
| :--- | :--- |
| **滑鼠左鍵點擊島體** | 在收合膠囊態與展開多功能態之間切換 |
| **點擊島外任意處** | 展開態下（未釘選時）點擊外部自動收合成膠囊態 |
| **右上角釘選按鈕 (Pin)** | 切換展開態釘選狀態（釘選後島外點擊不動／不收合） |
| **頂部橫向拖曳** | 在吸頂狀態下橫向平移島嶼位置 |
| **下拉拖離頂部** | 脫離邊緣吸附，成為任意位置自由懸浮島 |
| **推回頂部邊緣** | 接近螢幕頂端時自動吸附回置頂膠囊態 |
| **雙擊懸浮膠囊** | 迅速復位至螢幕頂部中央吸頂狀態 |
| **檔案拖入島嶼** | 將檔案由外部拖入島內任意位置，自動展開並收入暫存板 |
| **暫存板檔案拖出** | 按住暫存板檔案卡片直接向外拖放至桌面、資料夾或其它程式 |
| `Esc` | 快速摺疊展開態面板 |
| `Tab` | 展開態下向後切換功能分頁 |
| `Shift + Tab` | 展開態下向前切換功能分頁 |

---

## 技術棧與專案結構

```text
.
├── src/                               # React 19 前端工程
│   ├── App.tsx                        # 核心島嶼視窗、動態懸浮、佈局排版
│   ├── App.css                        # 懸浮島、玻璃折射與主題樣式
│   ├── main.tsx                       # React 入口
│   ├── components/
│   │   ├── Pages/                     # 各功能模組頁面
│   │   │   ├── MusicAndSystemView.tsx # 系統與音樂 SMTC 控制
│   │   │   ├── SpecialNotificationsView.tsx # 通知中心
│   │   │   ├── ClipboardView.tsx      # 原生剪貼簿歷史
│   │   │   ├── FileShelfView.tsx      # 檔案暫存板 (Dropover)
│   │   │   ├── TodoView.tsx           # 待辦清單
│   │   │   ├── UnifiedMailView.tsx    # 多信箱聚合
│   │   │   └── QuickTranslateView.tsx # 快捷翻譯
│   │   └── Settings/                  # 設定中心
│   │       ├── SettingsView.tsx       # 外觀、Markdown 同步與全域設定
│   │       ├── PrioritySettings.tsx   # 模組優先級配置
│   │       └── DynamicForm.tsx        # 動態表單
│   ├── services/                      # 優先級調度服務
│   └── utils/                         # 文字與工具函數
├── src-tauri/                         # Tauri 2 / Rust 後端工程
│   ├── Cargo.toml                     # Rust 依賴配置
│   ├── tauri.conf.json                # Tauri 應用程式、權限與視窗規格
│   ├── src/
│   │   ├── lib.rs                     # 原生命令調度、視窗定位、穿透與事件
│   │   ├── main.rs                    # 桌面程式入口
│   │   ├── clipboard_history.rs       # Windows 剪貼簿底層原生監聽與圖像捕獲
│   │   ├── media_control.rs           # Windows SMTC 媒體會話與控制
│   │   ├── shelf_server.rs            # 暫存板本機接收服務 (與 Discord Bot 對接)
│   │   ├── translation.rs             # 翻譯服務與獨立視窗
│   │   ├── core/                      # 設定儲存與優先級核心
│   │   └── modules/                   # 模組清單定義
│   └── capabilities/                  # Tauri 2 權限聲明配置
├── dc-bot/                            # Discord 遠端傳檔暫存板機器人
│   ├── bot.py                         # Discord Bot 主程式
│   ├── config.example.json            # 配置檔範例 (請複製為 config.json 使用)
│   ├── requirements.txt               # Python 依賴套件
│   ├── start_background.vbs           # Windows 無視窗背景常駐啟動腳本
│   ├── stop_bot.bat                   # 一鍵停止機器人腳本
│   └── README.md                      # Bot 完整設定與操作手冊
├── package.json                       # 前端依賴配置
├── vite.config.ts                     # Vite 建置配置
└── README.md                          # 專案說明文檔
```

---

## 鳴謝與參考專案

本專案在架構規劃、桌面靈動島互動與效率功能設計上，參考並借鑒了以下開源專案：

- **[Fly Island](https://github.com/flyl1u/fly-island)** (`flyl1u/fly-island`)：提供靈動島懸浮架構、Tauri 2 與 React 前端狀態管理以及動態視窗定位的基礎靈感。
- **[小糖 · Daozai](https://github.com/Renly1994/xiaotang-daozai)** (`Renly1994/xiaotang-daozai`)：提供檔案暫存置物架（Dropover Shelf）及 Windows 桌面端多功能工作流整合的概念啟發。

---

## 授權

本專案採用 [MIT License](LICENSE) 授權協議。
