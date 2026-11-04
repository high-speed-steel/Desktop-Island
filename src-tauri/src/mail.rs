use mailparse::MailHeaderMap;
use native_tls::TlsConnector;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
pub struct FetchMailAccountParams {
    pub id: String,
    pub name: String,
    pub email: String,
    #[serde(rename = "imapHost")]
    pub imap_host: String,
    #[serde(rename = "imapPort")]
    pub imap_port: u16,
    #[serde(rename = "authToken")]
    pub auth_token: Option<String>,
    pub color: String,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FetchedEmailItem {
    pub id: String,
    #[serde(rename = "accountId")]
    pub account_id: String,
    #[serde(rename = "accountName")]
    pub account_name: String,
    #[serde(rename = "accountColor")]
    pub account_color: String,
    pub sender: String,
    pub subject: String,
    pub snippet: String,
    pub date: String,
    pub code: Option<String>,
}

pub fn fetch_account_emails_sync(
    params: FetchMailAccountParams,
) -> Result<Vec<FetchedEmailItem>, String> {
    let auth_token = params
        .auth_token
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("帳號 [{}] 尚未設定密碼或應用程式密碼", params.name))?;

    let host = params.imap_host.trim();
    if host.is_empty() {
        return Err(format!("帳號 [{}] 未設定 IMAP 伺服器主機", params.name));
    }
    let port = if params.imap_port == 0 { 993 } else { params.imap_port };
    let email = params.email.trim();
    if email.is_empty() {
        return Err(format!("帳號 [{}] 未設定電子郵件地址", params.name));
    }

    let is_ssl = port == 993 || port == 465;

    if is_ssl {
        let tls = TlsConnector::builder()
            .build()
            .map_err(|e| format!("TLS 初始化失敗: {e}"))?;
        let client = imap::connect((host, port), host, &tls)
            .map_err(|e| format!("無法連線至 IMAP 伺服器 ({}:{}): {e}", host, port))?;
        let session = client
            .login(email, auth_token)
            .map_err(|(e, _)| format!("登入失敗 (帳號或密碼錯誤): {e}"))?;
        fetch_from_session(session, &params)
    } else {
        let stream = std::net::TcpStream::connect((host, port))
            .map_err(|e| format!("無法連線至 IMAP 伺服器 ({}:{}): {e}", host, port))?;
        let client = imap::Client::new(stream);
        let session = client
            .login(email, auth_token)
            .map_err(|(e, _)| format!("登入失敗 (帳號或密碼錯誤): {e}"))?;
        fetch_from_session(session, &params)
    }
}

fn fetch_from_session<T: std::io::Read + std::io::Write>(
    mut session: imap::Session<T>,
    params: &FetchMailAccountParams,
) -> Result<Vec<FetchedEmailItem>, String> {
    let mailbox = session
        .select("INBOX")
        .map_err(|e| format!("開啟收件匣失敗: {e}"))?;

    let total = mailbox.exists;
    if total == 0 {
        let _ = session.logout();
        return Ok(Vec::new());
    }

    let limit = params.limit.unwrap_or(15).clamp(1, 50);
    let start = if total > limit { total - limit + 1 } else { 1 };
    let seq_set = format!("{}:{}", start, total);

    let messages = session
        .fetch(&seq_set, "(RFC822 INTERNALDATE FLAGS UID)")
        .map_err(|e| format!("抓取郵件清單失敗: {e}"))?;

    let mut results = Vec::new();

    // 依序反轉，讓最新郵件排在最前面
    for msg in messages.iter().rev() {
        let raw_body = match msg.body() {
            Some(b) => b,
            None => continue,
        };

        let parsed = match mailparse::parse_mail(raw_body) {
            Ok(p) => p,
            Err(_) => continue,
        };

        let subject = parsed
            .headers
            .get_first_value("Subject")
            .unwrap_or_else(|| "(無主旨)".to_string());

        let sender = parsed
            .headers
            .get_first_value("From")
            .unwrap_or_else(|| "(未知寄件人)".to_string());

        let date_str = parsed
            .headers
            .get_first_value("Date")
            .unwrap_or_else(|| {
                msg.internal_date()
                    .map(|d| d.to_rfc3339())
                    .unwrap_or_default()
            });

        let uid = msg
            .uid
            .map(|u| u.to_string())
            .unwrap_or_else(|| format!("{}", msg.message));

        let body_text = extract_body_text(&parsed);
        let snippet = create_snippet(&body_text, 140);
        let code = extract_verification_code(&subject, &body_text);

        results.push(FetchedEmailItem {
            id: format!("{}-{}", params.id, uid),
            account_id: params.id.clone(),
            account_name: params.name.clone(),
            account_color: params.color.clone(),
            sender: clean_sender(&sender),
            subject,
            snippet,
            date: format_email_date(&date_str),
            code,
        });
    }

    let _ = session.logout();
    Ok(results)
}

fn extract_body_text(parsed: &mailparse::ParsedMail) -> String {
    if parsed.subparts.is_empty() {
        let mimetype = parsed.ctype.mimetype.to_lowercase();
        if mimetype == "text/plain" || mimetype.starts_with("text/") {
            return parsed.get_body().unwrap_or_default();
        }
        return String::new();
    }

    // 優先找尋純文字 text/plain 子區塊
    for subpart in &parsed.subparts {
        if subpart.ctype.mimetype.to_lowercase() == "text/plain" {
            let body = subpart.get_body().unwrap_or_default();
            if !body.trim().is_empty() {
                return body;
            }
        }
    }

    // 次之遞迴尋找子區塊
    for subpart in &parsed.subparts {
        let text = extract_body_text(subpart);
        if !text.trim().is_empty() {
            return text;
        }
    }

    // 若都沒有純文字，降級使用 HTML 標籤去除
    for subpart in &parsed.subparts {
        if subpart.ctype.mimetype.to_lowercase() == "text/html" {
            let html = subpart.get_body().unwrap_or_default();
            let stripped = strip_html_tags(&html);
            if !stripped.trim().is_empty() {
                return stripped;
            }
        }
    }

    String::new()
}

fn strip_html_tags(html: &str) -> String {
    let mut output = String::with_capacity(html.len());
    let mut inside_tag = false;

    for ch in html.chars() {
        if ch == '<' {
            inside_tag = true;
        } else if ch == '>' {
            inside_tag = false;
            output.push(' ');
        } else if !inside_tag {
            output.push(ch);
        }
    }

    output
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

fn create_snippet(text: &str, max_len: usize) -> String {
    let cleaned: String = text
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    let trimmed = cleaned.trim();
    if trimmed.chars().count() <= max_len {
        trimmed.to_string()
    } else {
        let truncated: String = trimmed.chars().take(max_len).collect();
        format!("{truncated}...")
    }
}

fn clean_sender(sender: &str) -> String {
    // 若寄件人格式為 "Name <user@domain.com>"，去除外層多餘引號
    sender.trim_matches('"').trim().to_string()
}

fn format_email_date(raw_date: &str) -> String {
    let trimmed = raw_date.trim();
    if trimmed.is_empty() {
        return "剛剛".to_string();
    }
    // 截取常見 RFC 2822 日期的核心部分或直接返回簡潔格式
    // 例： "Wed, 4 Nov 2026 18:25:00 +0800" -> 取前段
    if trimmed.len() > 25 {
        trimmed[..25].trim().to_string()
    } else {
        trimmed.to_string()
    }
}

fn extract_verification_code(subject: &str, body: &str) -> Option<String> {
    // 1. 優先檢查主旨中是否直接含有括號包裹的數字驗證碼，例如 [123456]、(654321)、【891234】
    if let Some(code) = extract_bracketed_code(subject) {
        return Some(code);
    }

    // 2. 檢查主旨中是否包含關鍵字 + 驗證碼
    if let Some(code) = search_code_near_keywords(subject) {
        return Some(code);
    }

    // 3. 檢查正文前 1000 字元中是否包含關鍵字 + 驗證碼
    let search_body: String = body.chars().take(1000).collect();
    if let Some(code) = search_code_near_keywords(&search_body) {
        return Some(code);
    }

    None
}

fn extract_bracketed_code(text: &str) -> Option<String> {
    for (open, close) in [('[', ']'), ('【', '】'), ('(', ')')] {
        if let Some(start) = text.find(open) {
            if let Some(end) = text[start + open.len_utf8()..].find(close) {
                let inside = &text[start + open.len_utf8()..start + open.len_utf8() + end].trim();
                if is_likely_code(inside) {
                    return Some(inside.to_string());
                }
            }
        }
    }
    None
}

fn search_code_near_keywords(text: &str) -> Option<String> {
    let keywords = [
        "驗證碼",
        "验证码",
        "動態密碼",
        "动态密码",
        "確認碼",
        "确认码",
        "安全碼",
        "安全码",
        "授權碼",
        "授权码",
        "verification code",
        "security code",
        "auth code",
        "passcode",
        "otp",
        "code",
    ];

    let lower_text = text.to_lowercase();

    for kw in keywords {
        let mut search_from = 0;
        while let Some(pos) = lower_text[search_from..].find(kw) {
            let actual_pos = search_from + pos;
            let window_start = actual_pos + kw.len();
            // 在關鍵字後方 40 個字元範圍內找尋候選碼
            let window_end = (window_start + 40).min(text.len());
            if window_start < text.len() {
                let window = &text[window_start..window_end];
                if let Some(code) = find_code_in_token_slice(window) {
                    return Some(code);
                }
            }
            search_from = actual_pos + kw.len();
        }
    }

    None
}

fn find_code_in_token_slice(slice: &str) -> Option<String> {
    // 尋找由冒號、空白或等號隔開後的候選 token
    let tokens: Vec<&str> = slice
        .split(|c: char| c == ':' || c == '：' || c == '=' || c == ' ' || c == '\t' || c == '\n')
        .map(|s| s.trim_matches(|c: char| !c.is_alphanumeric()))
        .filter(|s| !s.is_empty())
        .collect();

    for token in tokens {
        if is_likely_code(token) {
            return Some(token.to_string());
        }
    }
    None
}

fn is_likely_code(candidate: &str) -> bool {
    let len = candidate.chars().count();
    // 驗證碼長度通常為 4 ~ 8 碼
    if !(4..=8).contains(&len) {
        return false;
    }
    // 必須至少包含 3 個數字（避免匹配到一般單詞）
    let digit_count = candidate.chars().filter(|c| c.is_ascii_digit()).count();
    if digit_count < 3 {
        return false;
    }
    // 且所有字元皆為字母或數字
    candidate.chars().all(|c| c.is_ascii_alphanumeric())
}
