# AGENTS.md

本文件面向在本倉庫中工作的 AI 寫程式代理和協作者，說明專案背景、常用命令、程式碼邊界與變更約定。請在動手修改前先閱讀本文件，並優先遵循倉庫現有實現風格。

## 專案概覽

FocuSD Island 是一個 Windows 優先的桌面效率工具，以透明、無邊框、始終置頂的 Tauri 懸浮島形式運行。前端負責懸浮島 UI、待辦、每日筆記、歸檔、外觀設定和媒體控制面板；Tauri/Rust 側負責窗口定位、托盤、註冊表開機自啟、Markdown 寫入以及 Windows 媒體/音頻能力。

當前專案處於早期 MVP 階段，改動應保持小步、可驗證、低風險。

## 技術棧

- 前端：React 19、TypeScript、Vite 7
- 桌面殼：Tauri 2
- 原生能力：Rust、Windows API
- 圖示：lucide-react
- 包管理器：pnpm

## 目錄結構

```text
.
├── src/                    # React 前端
│   ├── App.tsx             # 核心 UI、狀態、交互與 Tauri invoke 調用
│   ├── App.css             # 主要樣式
│   ├── main.tsx            # React 入口
│   └── vite-env.d.ts
├── src-tauri/              # Tauri / Rust 桌面端
│   ├── src/lib.rs          # 原生命令、窗口定位、托盤、文件保存、媒體控制
│   ├── src/main.rs         # Tauri 應用入口
│   ├── Cargo.toml          # Rust 依賴與構建配置
│   ├── tauri.conf.json     # Tauri 配置
│   ├── capabilities/       # Tauri 權限能力配置
│   └── icons/              # 應用圖示
├── package.json            # 前端依賴和腳本
├── vite.config.ts
└── README.md
```

## 常用命令

安裝依賴：

```powershell
pnpm install
```

啟動前端開發服務器：

```powershell
pnpm dev
```

啟動 Tauri 桌面開發模式：

```powershell
pnpm tauri dev
```

類型檢查並構建前端：

```powershell
pnpm build
```

構建 Tauri 應用：

```powershell
pnpm tauri build
```

僅生成 release 可執行文件、不生成安裝包：

```powershell
pnpm tauri build --no-bundle
```

## 開發約定

- 預設使用 TypeScript 和 React 函數組件，延續當前 `src/App.tsx` 中的狀態組織與命名風格。
- 優先複用現有組件、類型、工具函數和 CSS class，不為小改動引入新的抽象層。
- 繼續使用 `localStorage` 存儲前端狀態，除非需求明確要求遷移到文件、數據庫或雲同步。
- Tauri 命令通過 `@tauri-apps/api/core` 的 `invoke` 調用；新增命令時需同步更新 Rust 側 handler、前端類型和必要的權限配置。
- UI 圖示優先使用 `lucide-react`，不要手寫可由圖示庫提供的 SVG。
- 面向 Windows 的原生能力需要謹慎處理錯誤路徑，Rust 命令應返回清晰的 `Result<_, String>`。
- 修改窗口大小、定位、透明度、置頂、托盤或註冊表邏輯時，要同時考慮摺疊態、展開態、邊緣收起和托盤隱藏。
- 避免無關重構、格式化整倉或改動生成產物。
- 驗證應與改動範圍匹配，不要無條件運行 `pnpm tauri build`，但改動範圍要求的構建不得省略：僅文檔改動不需要構建；前端邏輯、樣式或依賴改動必須運行 `pnpm build`；涉及 Tauri/Rust、Windows 原生能力、桌面配置或發佈產物的改動必須運行對應的 Tauri 構建。
- 不得因為構建耗時而跳過必要驗證。若必要構建失敗或受環境阻塞，應明確報告原因，不得將未完成的構建描述為已驗證。

## 前端注意事項

- `src/App.tsx` 目前承載了大部分業務邏輯，新增功能前先查找是否已有相關類型、狀態和工具函數。
- 樣式主要在 `src/App.css`，請保持現有視覺語言：懸浮島、緊湊面板、透明背景、可讀的控件狀態。
- 文本應注意中英文混排和窄窗口顯示，避免按鈕、標籤和任務標題溢出。
- 對任務、每日筆記、歸檔、設定預設等狀態的改動，需要維護對應的 `localStorage` key 兼容性。

## Tauri / Rust 注意事項

- 主要邏輯位於 `src-tauri/src/lib.rs`。
- 與 Windows API 相關的程式碼需保持最小權限和明確錯誤處理。
- 開機自啟使用當前用戶註冊表路徑：
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- Markdown 保存命令應繼續校驗目錄和文件名，避免不受控路徑寫入。
- 新增 Tauri 插件或權限時，需要檢查 `src-tauri/capabilities/default.json` 和 `src-tauri/tauri.conf.json`。

## 驗證建議

根據改動範圍選擇最小且充分的驗證方式，避免無關、耗時的構建：

- 僅文檔改動：確認 Markdown 內容可讀即可。
- 前端邏輯、樣式或依賴改動：必須運行 `pnpm build`，必要時運行 `pnpm dev` 進行瀏覽器檢查。
- Tauri 命令、窗口、托盤、註冊表、Windows API 或桌面配置改動：必須運行 `pnpm tauri build --no-bundle`，並在行為風險需要時運行 `pnpm tauri dev` 手動驗證。
- 發佈相關改動：必須運行完整的 `pnpm tauri build`。

## 本機更新與桌面快捷方式

- 每次完成應用更新併成功生成 release 可執行文件後，都要檢查並同步當前用戶桌面的島嶼快捷方式，無需再次確認；僅文檔改動不需要重新構建。
- 優先更新已有的 FocuSD / fly-island 快捷方式；不存在時創建 `fly-island.lnk`。使用 Windows 當前用戶的實際桌面目錄，不硬編碼用戶名或桌面路徑。
- 快捷方式目標應指向當前倉庫的 `src-tauri/target/release/focusd-island.exe` 絕對路徑，工作目錄設為該程序所在目錄，圖示使用該可執行文件。不得指向 debug 程序、舊備份或臨時構建目錄。
- 構建失敗時不切換快捷方式。更新後重新讀取快捷方式，確認目標文件存在、目標路徑與本次成功構建產物一致，再報告完成；不要修改其他應用的快捷方式。

## Git 與協作

- 修改前先查看 `git status --short`，不要覆蓋用戶已有改動。
- 不要使用 `git reset --hard`、`git checkout --` 等破壞性命令，除非用戶明確要求。
- 如果工作區已有與當前任務無關的修改，保留它們並只處理本次任務相關文件。
- 每次完成倉庫改動後，按改動範圍執行必要驗證，並主動創建 Git 提交，無需再次確認；僅提交當前任務相關文件，在最終說明中給出提交號和驗證結果。
- 提交前儘量讓改動範圍保持聚焦，並在最終說明中列出已驗證的命令。

## 編碼與文檔

- 源碼保持專案當前編碼風格。中文文檔建議使用 UTF-8。
- 註釋只寫在能降低理解成本的位置，不解釋顯而易見的程式碼。
- README 當前包含中英文專案說明；更新文檔時注意不要破壞現有雙語結構。
