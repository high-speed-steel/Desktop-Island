use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;
use tauri::{AppHandle, Emitter};

pub fn init(app_handle: AppHandle) {
    thread::spawn(move || {
        let listener = match TcpListener::bind("127.0.0.1:28848") {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[ShelfServer] 無法綁定 127.0.0.1:28848: {e}");
                return;
            }
        };

        for stream in listener.incoming() {
            let mut stream = match stream {
                Ok(s) => s,
                Err(_) => continue,
            };

            let mut buffer = [0u8; 8192];
            let n = match stream.read(&mut buffer) {
                Ok(bytes) => bytes,
                Err(_) => continue,
            };

            if n == 0 {
                continue;
            }

            let request = String::from_utf8_lossy(&buffer[..n]);

            // 尋找 HTTP Body (以 \r\n\r\n 分隔)
            if let Some(body_start) = request.find("\r\n\r\n") {
                let body = &request[body_start + 4..];
                if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(body) {
                    let mut paths_to_add: Vec<String> = Vec::new();

                    // 如果是打包資料夾 (bundle)，優先將整個資料夾加入暫存板
                    if let Some(bundle_dir) = json_val.get("bundle_dir").and_then(|b| b.as_str()) {
                        paths_to_add.push(bundle_dir.to_string());
                    } else if let Some(path) = json_val.get("path").and_then(|p| p.as_str()) {
                        paths_to_add.push(path.to_string());
                    } else if let Some(files) = json_val.get("files").and_then(|f| f.as_array()) {
                        for item in files {
                            if let Some(p) = item.as_str() {
                                paths_to_add.push(p.to_string());
                            }
                        }
                    }

                    if !paths_to_add.is_empty() {
                        let _ = app_handle.emit("shelf:remote-files-added", paths_to_add);
                    }
                }
            }

            // 回應 HTTP 200 OK
            let response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"status\":\"ok\"}";
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();
        }
    });
}
