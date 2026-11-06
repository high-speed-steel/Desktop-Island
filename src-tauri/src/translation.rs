use crate::clipboard_history::{parse_shortcut_binding, ShortcutBinding};
use arboard::Clipboard;
use fxtranslate::{cache::Cache, fetch::NetworkFetch, loader::load_translation, engine::Translation};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex, OnceLock,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size};
use windows::{
    core::w,
    Win32::{
        Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, RECT, WPARAM},
        System::LibraryLoader::GetModuleHandleW,
        UI::{
            Input::KeyboardAndMouse::{
                RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS, MOD_NOREPEAT,
            },
            WindowsAndMessaging::{
                CreateWindowExW, DefWindowProcW, DispatchMessageW, GetForegroundWindow,
                GetMessageW, GetWindowRect, PostMessageW, RegisterClassW, TranslateMessage,
                HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE, WM_APP, WM_HOTKEY, WNDCLASSW,
            },
        },
    },
};

const WINDOW_LABEL: &str = "translation";
const DEFAULT_SHORTCUT: &str = "Alt+C";
const HOTKEY_ID: i32 = 0x4654;
const CHANGE_HOTKEY_MESSAGE: u32 = WM_APP + 0x52;
const MAX_CHARACTERS: usize = 5_000;

static APP: OnceLock<AppHandle> = OnceLock::new();
static HAS_POSITIONED_WINDOW: AtomicBool = AtomicBool::new(false);
static HOTKEY_WINDOW: Mutex<Option<isize>> = Mutex::new(None);
static ACTIVE_BINDING: Mutex<Option<ShortcutBinding>> = Mutex::new(None);
static PENDING_BINDING: Mutex<Option<(ShortcutBinding, mpsc::Sender<Result<String, String>>)>> =
    Mutex::new(None);

pub fn init(app: &AppHandle) {
    if APP.set(app.clone()).is_ok() {
        thread::spawn(|| {
            if let Err(error) = run_hotkey_loop() {
                eprintln!("failed to initialize translation shortcut: {error}");
            }
        });
    }
}

const MODEL_IDLE_TIMEOUT: Duration = Duration::from_secs(45);

struct CachedEngine {
    engine: Arc<Translation>,
    last_used: Instant,
}

static ENGINE_CACHE: Mutex<Option<HashMap<(String, String), CachedEngine>>> = Mutex::new(None);
static CLEANUP_RUNNING: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn toggle_translation_window(app: AppHandle) -> Result<(), String> {

    let window = app
        .get_webview_window(WINDOW_LABEL)
        .ok_or_else(|| "Translation window was not found.".to_string())?;
    if window.is_visible().map_err(|error| error.to_string())? {
        return window.hide().map_err(|error| error.to_string());
    }

    if !HAS_POSITIONED_WINDOW.load(Ordering::Relaxed) {
        let monitors = window
            .available_monitors()
            .map_err(|error| error.to_string())?;
        let foreground = unsafe { GetForegroundWindow() };
        let mut rect = RECT::default();
        let center =
            if !foreground.0.is_null() && unsafe { GetWindowRect(foreground, &mut rect) }.is_ok() {
                Some(((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2))
            } else {
                None
            };
        let monitor = monitors
            .into_iter()
            .find(|monitor| {
                center.is_some_and(|(x, y)| {
                    let origin = monitor.position();
                    let size = monitor.size();
                    x >= origin.x
                        && x < origin.x + size.width as i32
                        && y >= origin.y
                        && y < origin.y + size.height as i32
                })
            })
            .or(window
                .primary_monitor()
                .map_err(|error| error.to_string())?)
            .ok_or_else(|| "No monitor is available for translation.".to_string())?;
        let logical_width = 480.0;
        let logical_height =
            (monitor.size().height as f64 / monitor.scale_factor() - 32.0).clamp(380.0, 640.0);
        window
            .set_size(Size::Logical(LogicalSize::new(
                logical_width,
                logical_height,
            )))
            .map_err(|error| error.to_string())?;
        let width = (logical_width * monitor.scale_factor()).round() as i32;
        let height = (logical_height * monitor.scale_factor()).round() as i32;
        let origin = monitor.position();
        window
            .set_position(Position::Physical(PhysicalPosition::new(
                origin.x + (monitor.size().width as i32 - width) / 2,
                origin.y + (monitor.size().height as i32 - height) / 2,
            )))
            .map_err(|error| error.to_string())?;
        HAS_POSITIONED_WINDOW.store(true, Ordering::Relaxed);
    }
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    let _ = app.emit("translation-window-opened", ());
    Ok(())
}

#[tauri::command]
pub fn hide_translation_window(app: AppHandle) -> Result<(), String> {
    app.get_webview_window(WINDOW_LABEL)
        .ok_or_else(|| "Translation window was not found.".to_string())?
        .hide()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn read_translation_clipboard() -> Result<Option<String>, String> {
    let mut clipboard = Clipboard::new().map_err(|error| format!("無法讀取剪貼簿：{error}"))?;
    match clipboard.get_text() {
        Ok(text) if !text.trim().is_empty() => Ok(Some(text)),
        _ => Ok(None),
    }
}

#[tauri::command]
pub fn copy_translation_result(text: String) -> Result<(), String> {
    Clipboard::new()
        .map_err(|error| format!("無法打開剪貼簿：{error}"))?
        .set_text(text)
        .map_err(|error| format!("無法複製譯文：{error}"))
}

#[tauri::command]
pub fn has_translation_secret() -> Result<bool, String> {
    Ok(true)
}

#[tauri::command]
pub fn save_translation_secret(_secret: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn delete_translation_secret() -> Result<(), String> {
    Ok(())
}

fn schedule_cache_cleanup() {
    if CLEANUP_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    thread::spawn(|| loop {
        thread::sleep(Duration::from_secs(15));
        let mut guard = match ENGINE_CACHE.lock() {
            Ok(g) => g,
            Err(_) => break,
        };

        if let Some(map) = guard.as_mut() {
            let now = Instant::now();
            map.retain(|_, cached| now.duration_since(cached.last_used) < MODEL_IDLE_TIMEOUT);
            if map.is_empty() {
                *guard = None;
                CLEANUP_RUNNING.store(false, Ordering::SeqCst);
                break;
            }
        } else {
            CLEANUP_RUNNING.store(false, Ordering::SeqCst);
            break;
        }
    });
}

fn get_or_load_engine(src: &str, trg: &str) -> Result<Arc<Translation>, String> {
    let key = (src.to_string(), trg.to_string());
    {
        let mut guard = ENGINE_CACHE.lock().map_err(|e| e.to_string())?;
        let cache_map = guard.get_or_insert_with(HashMap::new);
        if let Some(cached) = cache_map.get_mut(&key) {
            cached.last_used = Instant::now();
            return Ok(Arc::clone(&cached.engine));
        }
    }

    let cache = Cache::locate();
    let fetch = NetworkFetch::new();

    let attempts: Vec<(&str, &str)> = match (src, trg) {
        ("en", "zh") => vec![("en", "zh-Hant"), ("en", "zh-Hans")],
        ("zh", "en") => vec![("zh-Hant", "en"), ("zh-Hans", "en")],
        _ => vec![(src, trg)],
    };

    let mut last_error = String::new();
    for (s, t) in attempts {
        match load_translation(&fetch, &cache, s, t) {
            Ok(engine) => {
                let arc = Arc::new(engine);
                let mut guard = ENGINE_CACHE.lock().map_err(|e| e.to_string())?;
                let cache_map = guard.get_or_insert_with(HashMap::new);
                cache_map.insert(
                    key,
                    CachedEngine {
                        engine: Arc::clone(&arc),
                        last_used: Instant::now(),
                    },
                );
                schedule_cache_cleanup();
                return Ok(arc);
            }
            Err(err) => {
                last_error = err;
            }
        }
    }

    Err(format!("無法載入 Bergamot 離線翻譯模型 ({src} -> {trg})：{last_error}"))
}

#[tauri::command]
pub async fn translate_text(text: String, direction: String) -> Result<String, String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("請輸入要翻譯的內容。".to_string());
    }
    if text.chars().count() > MAX_CHARACTERS {
        return Err("單次最多翻譯 5000 個字符。".to_string());
    }
    let (src, trg) = match direction.as_str() {
        "zh-en" => ("zh", "en"),
        "en-zh" => ("en", "zh"),
        "auto" => {
            if text
                .chars()
                .any(|ch| ('\u{4e00}'..='\u{9fff}').contains(&ch))
            {
                ("zh", "en")
            } else {
                ("en", "zh")
            }
        }
        _ => return Err("不支持的翻譯方向。".to_string()),
    };

    tauri::async_runtime::spawn_blocking(move || {
        let engine = get_or_load_engine(src, trg)?;
        let translated = engine.translate_long(&text);
        let trimmed = translated.trim();
        if trimmed.is_empty() {
            return Err("翻譯模型未返回有效內容。".to_string());
        }
        Ok(trimmed.to_string())
    })
    .await
    .map_err(|error| format!("翻譯任務執行失敗：{error}"))?
}

#[tauri::command]
pub fn set_translation_shortcut(shortcut: String) -> Result<String, String> {
    let binding = parse_shortcut_binding(&shortcut)
        .ok_or_else(|| "快捷鍵無效，請使用至少一個修飾鍵。".to_string())?;
    let started = Instant::now();
    let hwnd = loop {
        if let Some(hwnd) = *HOTKEY_WINDOW.lock().map_err(|error| error.to_string())? {
            break hwnd;
        }
        if started.elapsed() >= Duration::from_secs(2) {
            return Err("快捷鍵服務尚未準備好。".to_string());
        }
        thread::sleep(Duration::from_millis(25));
    };
    let (sender, receiver) = mpsc::channel();
    {
        let mut pending = PENDING_BINDING.lock().map_err(|error| error.to_string())?;
        if pending.is_some() {
            return Err("快捷鍵正在更新。".to_string());
        }
        *pending = Some((binding, sender));
    }
    if let Err(error) = unsafe {
        PostMessageW(
            Some(HWND(hwnd as *mut _)),
            CHANGE_HOTKEY_MESSAGE,
            WPARAM(0),
            LPARAM(0),
        )
    } {
        *PENDING_BINDING.lock().map_err(|error| error.to_string())? = None;
        return Err(format!("無法更新快捷鍵：{error}"));
    }
    receiver
        .recv_timeout(Duration::from_secs(2))
        .map_err(|error| format!("快捷鍵更新超時：{error}"))?
}

fn run_hotkey_loop() -> Result<(), String> {
    unsafe {
        let class_name = w!("FocuSDTranslationHotkey");
        let module = GetModuleHandleW(None).map_err(|error| error.to_string())?;
        let instance = HINSTANCE(module.0);
        let class = WNDCLASSW {
            lpfnWndProc: Some(hotkey_window_proc),
            hInstance: instance,
            lpszClassName: class_name,
            ..Default::default()
        };
        if RegisterClassW(&class) == 0 {
            return Err("無法註冊翻譯快捷鍵窗口。".to_string());
        }
        let hwnd = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            class_name,
            w!("FocuSD Translation Hotkey"),
            WINDOW_STYLE(0),
            0,
            0,
            0,
            0,
            Some(HWND_MESSAGE),
            None,
            Some(instance),
            None,
        )
        .map_err(|error| error.to_string())?;
        if let Some(binding) = parse_shortcut_binding(DEFAULT_SHORTCUT) {
            if register_binding(hwnd, &binding).is_ok() {
                *ACTIVE_BINDING.lock().map_err(|error| error.to_string())? = Some(binding);
            }
        }
        *HOTKEY_WINDOW.lock().map_err(|error| error.to_string())? = Some(hwnd.0 as isize);
        let mut message = MSG::default();
        while GetMessageW(&mut message, None, 0, 0).into() {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
        let _ = UnregisterHotKey(Some(hwnd), HOTKEY_ID);
    }
    Ok(())
}

fn register_binding(hwnd: HWND, binding: &ShortcutBinding) -> Result<(), String> {
    unsafe {
        RegisterHotKey(
            Some(hwnd),
            HOTKEY_ID,
            HOT_KEY_MODIFIERS(binding.modifiers | MOD_NOREPEAT.0),
            binding.key_code,
        )
        .map_err(|error| format!("快捷鍵 {} 已被佔用或無法註冊：{error}", binding.label))
    }
}

unsafe extern "system" fn hotkey_window_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if message == WM_HOTKEY && wparam.0 == HOTKEY_ID as usize {
        if let Some(app) = APP.get() {
            let _ = toggle_translation_window(app.clone());
        }
        return LRESULT(0);
    }
    if message == CHANGE_HOTKEY_MESSAGE {
        let pending = PENDING_BINDING
            .lock()
            .ok()
            .and_then(|mut value| value.take());
        if let Some((binding, sender)) = pending {
            let previous = ACTIVE_BINDING
                .lock()
                .ok()
                .and_then(|mut value| value.take());
            if previous.is_some() {
                let _ = unsafe { UnregisterHotKey(Some(hwnd), HOTKEY_ID) };
            }
            let result = register_binding(hwnd, &binding).map(|()| binding.label.clone());
            if let Ok(mut active) = ACTIVE_BINDING.lock() {
                *active = if result.is_ok() {
                    Some(binding)
                } else {
                    previous.and_then(|old| register_binding(hwnd, &old).ok().map(|()| old))
                };
            }
            let _ = sender.send(result);
        }
        return LRESULT(0);
    }
    unsafe { DefWindowProcW(hwnd, message, wparam, lparam) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "requires access to LOCALAPPDATA outside sandbox"]
    fn test_bergamot_offline_translation() {
        let eng = get_or_load_engine("en", "zh").expect("Failed to load en->zh");
        let result = eng.translate_long("Hello world! This is a test.");
        println!("Translation en->zh: {}", result);
        assert!(!result.trim().is_empty());

        let eng_rev = get_or_load_engine("zh", "en").expect("Failed to load zh->en");
        let result_rev = eng_rev.translate_long("你好世界！這是一個測試。");
        println!("Translation zh->en: {}", result_rev);
        assert!(!result_rev.trim().is_empty());
    }
}
