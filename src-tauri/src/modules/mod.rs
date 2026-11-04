use serde::{Deserialize, Serialize};
use serde_json::Value;

pub mod clipboard;
pub mod media_smtc;
pub mod translation;

/// 設定欄位定義型別（供前端動態渲染表單）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaField {
    /// 設定項目的唯一識別鍵
    pub key: String,
    /// 顯示於設定介面的標籤名稱（繁體中文）
    pub label: String,
    /// 欄位型別："string" | "number" | "password" | "boolean" | "range"
    #[serde(rename = "type")]
    pub field_type: String,
    /// 預設值
    pub default: Value,
    /// 數值最小值（僅用於 number 或 range）
    pub min: Option<f64>,
    /// 數值最大值（僅用於 number 或 range）
    pub max: Option<f64>,
    /// 數值步進量（僅用於 number 或 range）
    pub step: Option<f64>,
}

/// 模組宣告清單（對應各外掛子目錄下的 manifest.json）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleManifest {
    /// 模組唯一識別碼（如 "clipboard", "media_smtc"）
    pub id: String,
    /// 模組名稱（繁體中文）
    pub name: String,
    /// 模組版本號
    pub version: String,
    /// 模組詳細描述
    pub description: String,
    /// 初始預設啟用狀態
    pub enabled_by_default: bool,
    /// 預設顯示優先等級："urgent" (Level 4) | "active" (Level 3) | "overview" (Level 2) | "idle" (Level 1)
    pub default_priority: Option<String>,
    /// 瞬時插斷事件的預設停留毫秒數（例如 5000 代表 5 秒）
    pub dismiss_timeout_ms: Option<u64>,
    /// 模組的設定結構描述清單
    pub settings_schema: Vec<SchemaField>,
}

/// 靈動島模組通用生命週期介面
pub trait IslandModule: Send + Sync {
    /// 取得模組的描述清單元資訊
    fn manifest(&self) -> ModuleManifest;

    /// 模組初始化或啟用（註冊背景執行緒、事件監聽器等）
    fn init(&mut self, config: Value, app_handle: &tauri::AppHandle) -> Result<(), String>;

    /// 模組停用或關閉（釋放系統資源與背景監聽器）
    fn disable(&mut self) -> Result<(), String>;

    /// 使用者於設定中心修改組態時通知模組
    fn on_config_change(&mut self, new_config: Value) -> Result<(), String>;
}

/// 建立系統所有已註冊的模組清單
pub fn create_default_modules() -> Vec<Box<dyn IslandModule>> {
    vec![
        Box::new(clipboard::ClipboardModule::new()),
        Box::new(media_smtc::MediaSmtcModule::new()),
        Box::new(translation::TranslationModule::new()),
    ]
}
