use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};
use windows::{
    Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
    UI::Notifications::{
        KnownNotificationBindings,
        Management::{UserNotificationListener, UserNotificationListenerAccessStatus},
        NotificationKinds,
    },
};

const NOTIFICATIONS_CHANGED_EVENT: &str = "system-notifications-changed";
const MAX_NOTIFICATIONS: usize = 50;

static NOTIFICATION_SERVICE: OnceLock<Arc<NotificationService>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SystemNotificationItem {
    pub id: String,
    pub app_name: String,
    pub title: String,
    pub body: String,
    pub time: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSnapshot {
    pub status: String, // "allowed", "denied", "unspecified", "error"
    pub error: Option<String>,
    pub items: Vec<SystemNotificationItem>,
}

/// 應用程式通知設定（白名單與歷來發現的 App 名稱留檔，不存敏感正文）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationAppSettings {
    /// 是否啟用白名單過濾
    pub whitelist_enabled: bool,
    /// 白名單應用程式名稱列表
    pub whitelist: Vec<String>,
    /// 歷來收到的所有應用程式名稱留檔（整理成 JSON 儲存）
    pub discovered_apps: Vec<String>,
}

impl Default for NotificationAppSettings {
    fn default() -> Self {
        Self {
            whitelist_enabled: false,
            whitelist: Vec::new(),
            discovered_apps: Vec::new(),
        }
    }
}

struct WinRT;
impl Drop for WinRT {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}

struct NotificationService {
    app: AppHandle,
    state: Mutex<NotificationSnapshot>,
    settings: Mutex<NotificationAppSettings>,
}

fn get_notification_apps_path() -> PathBuf {
    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let island_dir = PathBuf::from(app_data).join("Island");
    if !island_dir.exists() {
        let _ = fs::create_dir_all(&island_dir);
    }
    island_dir.join("notification-apps.json")
}

fn load_persisted_settings() -> NotificationAppSettings {
    let path = get_notification_apps_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str::<NotificationAppSettings>(&content) {
                return settings;
            }
        }
    }
    NotificationAppSettings::default()
}

fn save_persisted_settings(settings: &NotificationAppSettings) -> Result<(), String> {
    let path = get_notification_apps_path();
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    if NOTIFICATION_SERVICE.get().is_some() {
        return Ok(());
    }

    let initial_settings = load_persisted_settings();

    let service = Arc::new(NotificationService {
        app: app.clone(),
        state: Mutex::new(NotificationSnapshot {
            status: "unspecified".to_string(),
            error: None,
            items: Vec::new(),
        }),
        settings: Mutex::new(initial_settings),
    });

    let _ = NOTIFICATION_SERVICE.set(service.clone());

    // 啟動背景輪詢監聽線程
    thread::Builder::new()
        .name("system-notifications-monitor".to_string())
        .spawn(move || {
            monitor_loop(service);
        })
        .map_err(|e| format!("啟動通知監聽線程失敗: {e}"))?;

    Ok(())
}

fn monitor_loop(service: Arc<NotificationService>) {
    loop {
        let (status, error, raw_items) = match fetch_system_notifications() {
            Ok((status, items)) => (status, None, items),
            Err(e) => ("error".to_string(), Some(e), Vec::new()),
        };

        // 1. 歷來 App 名稱留檔：自動將新收到的 App 名稱收錄至 discovered_apps JSON
        let mut app_settings_updated = false;
        let mut current_settings = {
            service
                .settings
                .lock()
                .map(|s| s.clone())
                .unwrap_or_default()
        };

        let mut discovered_set: HashSet<String> =
            current_settings.discovered_apps.iter().cloned().collect();

        for item in &raw_items {
            let name = item.app_name.trim().to_string();
            if !name.is_empty() && !discovered_set.contains(&name) {
                discovered_set.insert(name.clone());
                current_settings.discovered_apps.push(name);
                app_settings_updated = true;
            }
        }

        if app_settings_updated {
            current_settings.discovered_apps.sort_by_key(|a| a.to_lowercase());
            let _ = save_persisted_settings(&current_settings);
            if let Ok(mut lock) = service.settings.lock() {
                *lock = current_settings.clone();
            }
        }

        // 2. 白名單過濾：若開啟白名單，僅保留白名單內的 App
        let filtered_items: Vec<SystemNotificationItem> = if current_settings.whitelist_enabled {
            let wl_set: HashSet<String> = current_settings
                .whitelist
                .iter()
                .map(|s| s.trim().to_lowercase())
                .collect();

            raw_items
                .into_iter()
                .filter(|it| wl_set.contains(&it.app_name.trim().to_lowercase()))
                .collect()
        } else {
            raw_items
        };

        let mut changed = false;
        if let Ok(mut current) = service.state.lock() {
            if current.status != status || current.error != error || current.items != filtered_items {
                current.status = status;
                current.error = error;
                current.items = filtered_items;
                changed = true;
            }
        }

        if changed {
            let _ = service.app.emit(NOTIFICATIONS_CHANGED_EVENT, ());
        }

        thread::sleep(Duration::from_millis(1500));
    }
}

fn fetch_system_notifications() -> Result<(String, Vec<SystemNotificationItem>), String> {
    unsafe { RoInitialize(RO_INIT_MULTITHREADED) }
        .map_err(|e| format!("WinRT 初始化失敗: {e}"))?;
    let _apartment = WinRT;

    let listener = UserNotificationListener::Current()
        .map_err(|e| format!("無法取得 UserNotificationListener: {e}"))?;

    let access = listener
        .GetAccessStatus()
        .map_err(|e| format!("取得通知存取狀態失敗: {e}"))?;

    let status_str = match access {
        UserNotificationListenerAccessStatus::Allowed => "allowed",
        UserNotificationListenerAccessStatus::Denied => "denied",
        UserNotificationListenerAccessStatus::Unspecified => "unspecified",
        _ => "unknown",
    };

    if access != UserNotificationListenerAccessStatus::Allowed {
        return Ok((status_str.to_string(), Vec::new()));
    }

    let operation = listener
        .GetNotificationsAsync(NotificationKinds::Toast)
        .map_err(|e| format!("無法讀取通知清單: {e}"))?;

    let notifications = pollster::block_on(operation)
        .map_err(|e| format!("非同步等待通知失敗: {e}"))?;

    let mut list = Vec::new();

    for notification in notifications {
        let app_name = notification
            .AppInfo()
            .ok()
            .and_then(|info| info.DisplayInfo().ok())
            .and_then(|disp| disp.DisplayName().ok())
            .map(|s| s.to_string_lossy())
            .unwrap_or_else(|| {
                notification
                    .AppInfo()
                    .ok()
                    .and_then(|info| info.AppUserModelId().ok())
                    .map(|s| s.to_string_lossy())
                    .unwrap_or_else(|| "系統通知".to_string())
            });

        let id_val = notification.Id().unwrap_or_default();
        let ticks = notification
            .CreationTime()
            .map(|t| t.UniversalTime)
            .unwrap_or_default();

        let id = format!("{app_name}:{id_val}:{ticks}");

        let mut parts = Vec::new();
        if let Ok(elements) = notification
            .Notification()
            .and_then(|n| n.Visual())
            .and_then(|v| v.GetBinding(&KnownNotificationBindings::ToastGeneric()?))
            .and_then(|b| b.GetTextElements())
        {
            for elem in elements {
                if let Ok(text) = elem.Text() {
                    let s = text.to_string_lossy();
                    if !s.trim().is_empty() {
                        parts.push(s);
                    }
                }
            }
        }

        let title = parts.first().cloned().unwrap_or_else(|| app_name.clone());
        let body = parts.iter().skip(1).cloned().collect::<Vec<_>>().join("\n");

        // 將 Windows 100-nanosecond ticks 轉換為 Unix 毫秒
        let timestamp = if ticks > 116_444_736_000_000_000 {
            (ticks - 116_444_736_000_000_000) / 10_000
        } else {
            current_unix_millis()
        };

        let time = format_timestamp(timestamp);

        list.push(SystemNotificationItem {
            id,
            app_name,
            title,
            body,
            time,
            timestamp,
        });
    }

    // 最新通知排在最前面
    list.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    list.truncate(MAX_NOTIFICATIONS);

    Ok((status_str.to_string(), list))
}

fn current_unix_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

fn format_timestamp(ts: i64) -> String {
    let now = current_unix_millis();
    let diff_sec = (now - ts) / 1000;
    if diff_sec < 60 {
        return "剛剛".to_string();
    }
    let diff_min = diff_sec / 60;
    if diff_min < 60 {
        return format!("{diff_min} 分鐘前");
    }
    let diff_hour = diff_min / 60;
    if diff_hour < 24 {
        return format!("{diff_hour} 小時前");
    }
    let diff_day = diff_hour / 24;
    format!("{diff_day} 天前")
}

#[tauri::command]
pub fn get_system_notifications() -> Result<NotificationSnapshot, String> {
    let service = NOTIFICATION_SERVICE
        .get()
        .ok_or_else(|| "Notification service not initialized".to_string())?;

    let state = service
        .state
        .lock()
        .map_err(|e| format!("Lock state error: {e}"))?;

    Ok(state.clone())
}

#[tauri::command]
pub fn request_notification_permission() -> Result<String, String> {
    unsafe { RoInitialize(RO_INIT_MULTITHREADED) }
        .map_err(|e| format!("WinRT 初始化失敗: {e}"))?;
    let _apartment = WinRT;

    let listener = UserNotificationListener::Current()
        .map_err(|e| format!("無法取得 UserNotificationListener: {e}"))?;

    let op = listener
        .RequestAccessAsync()
        .map_err(|e| format!("請求存取權限失敗: {e}"))?;

    let status = pollster::block_on(op)
        .map_err(|e| format!("等待存取權限回應失敗: {e}"))?;

    let status_str = match status {
        UserNotificationListenerAccessStatus::Allowed => "allowed",
        UserNotificationListenerAccessStatus::Denied => "denied",
        UserNotificationListenerAccessStatus::Unspecified => "unspecified",
        _ => "unknown",
    };

    Ok(status_str.to_string())
}

#[tauri::command]
pub fn clear_system_notifications() -> Result<(), String> {
    let service = NOTIFICATION_SERVICE
        .get()
        .ok_or_else(|| "Notification service not initialized".to_string())?;

    if let Ok(mut state) = service.state.lock() {
        state.items.clear();
    }

    let _ = service.app.emit(NOTIFICATIONS_CHANGED_EVENT, ());
    Ok(())
}

#[tauri::command]
pub fn get_notification_app_settings() -> Result<NotificationAppSettings, String> {
    let service = NOTIFICATION_SERVICE
        .get()
        .ok_or_else(|| "Notification service not initialized".to_string())?;

    let settings = service
        .settings
        .lock()
        .map_err(|e| format!("Lock settings error: {e}"))?;

    Ok(settings.clone())
}

#[tauri::command]
pub fn save_notification_app_settings(
    settings: NotificationAppSettings,
) -> Result<NotificationAppSettings, String> {
    let service = NOTIFICATION_SERVICE
        .get()
        .ok_or_else(|| "Notification service not initialized".to_string())?;

    save_persisted_settings(&settings)?;

    if let Ok(mut current) = service.settings.lock() {
        *current = settings.clone();
    }

    let _ = service.app.emit(NOTIFICATIONS_CHANGED_EVENT, ());
    Ok(settings)
}

#[tauri::command]
pub fn get_notification_apps_file_path() -> Result<String, String> {
    Ok(get_notification_apps_path().to_string_lossy().to_string())
}
