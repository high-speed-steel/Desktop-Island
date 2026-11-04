use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// 靈動島全域優先權策略組態
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriorityPolicy {
    /// 瞬時插斷卡片停留時間（毫秒）
    pub urgent_display_duration_ms: u64,
    /// 是否允許瞬時事件插斷目前正在進行的動畫或活動
    pub allow_urgent_interrupt: bool,
    /// 各模組自訂優先權層級映射（模組識別碼 -> 優先權等級 1~4）
    pub custom_module_priority: HashMap<String, u8>,
}

impl Default for PriorityPolicy {
    fn default() -> Self {
        let mut custom_priority = HashMap::new();
        custom_priority.insert("mail_verifier".to_string(), 4);
        custom_priority.insert("shelf".to_string(), 4);
        custom_priority.insert("system_monitor".to_string(), 4);
        custom_priority.insert("media_smtc".to_string(), 3);
        custom_priority.insert("antigravity_status".to_string(), 3);
        custom_priority.insert("calendar".to_string(), 2);
        custom_priority.insert("clipboard".to_string(), 2);

        Self {
            urgent_display_duration_ms: 5000,
            allow_urgent_interrupt: true,
            custom_module_priority: custom_priority,
        }
    }
}

/// 靈動島應用程式全域設定結構
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// 開機自動啟動
    pub run_on_startup: bool,
    /// 全螢幕時隱藏或靜音
    pub suppress_in_fullscreen: bool,
    /// 優先權排程策略
    pub priority_policy: PriorityPolicy,
    /// 各模組的自訂組態（模組識別碼 -> JSON 鍵值對）
    pub modules: HashMap<String, Value>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            run_on_startup: false,
            suppress_in_fullscreen: true,
            priority_policy: PriorityPolicy::default(),
            modules: HashMap::new(),
        }
    }
}

/// 取得設定檔儲存路徑（%APPDATA%/Island/config.json）
pub fn get_config_file_path() -> PathBuf {
    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let island_dir = PathBuf::from(app_data).join("Island");
    if !island_dir.exists() {
        let _ = fs::create_dir_all(&island_dir);
    }
    island_dir.join("config.json")
}

/// 讀取本機設定檔，不存在則建立預設組態
pub fn load_app_config() -> AppConfig {
    let path = get_config_file_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(config) = serde_json::from_str::<AppConfig>(&content) {
                return config;
            }
        }
    }
    let default_config = AppConfig::default();
    let _ = save_app_config(&default_config);
    default_config
}

/// 寫入設定檔至本機磁碟
pub fn save_app_config(config: &AppConfig) -> Result<(), String> {
    let path = get_config_file_path();
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}
