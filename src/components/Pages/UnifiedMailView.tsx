import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Mail,
  Check,
  KeyRound,
  Copy,
  Settings,
  Inbox,
  RefreshCw,
  AlertCircle,
  Loader2,
} from "lucide-react";
import "./UnifiedMailView.css";

export interface MailAccount {
  id: string;
  name: string;        // 自訂標籤名字
  email: string;       // 信箱帳號
  imapHost: string;
  imapPort: number;
  authToken?: string;
  color: string;
  enabled: boolean;
}

export interface EmailItem {
  id: string;
  accountId: string;   // 所屬信箱帳戶 ID
  accountName: string; // 自訂信箱標籤名
  accountColor: string;// 自訂標籤顏色
  sender: string;
  subject: string;
  snippet: string;
  date: string;
  timestamp?: number;  // 毫秒時間戳
  code?: string;
}

export interface MailRetentionSettings {
  maxItems: number;      // 預設 30
  retentionDays: number; // 預設 7 天
}

export const MAIL_STORAGE_KEY = "focusd-island-mail-accounts";
export const MAIL_CACHE_KEY = "focusd-island-mail-cache";
export const MAIL_SETTINGS_KEY = "focusd-island-mail-settings";

export const DEFAULT_MAIL_SETTINGS: MailRetentionSettings = {
  maxItems: 30,
  retentionDays: 7,
};

export function getMailRetentionSettings(): MailRetentionSettings {
  try {
    const raw = localStorage.getItem(MAIL_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        maxItems: typeof parsed.maxItems === "number" ? parsed.maxItems : DEFAULT_MAIL_SETTINGS.maxItems,
        retentionDays: typeof parsed.retentionDays === "number" ? parsed.retentionDays : DEFAULT_MAIL_SETTINGS.retentionDays,
      };
    }
  } catch {
    // 忽略
  }
  return DEFAULT_MAIL_SETTINGS;
}

export function applyMailRetention(
  items: EmailItem[],
  settings: MailRetentionSettings
): EmailItem[] {
  const now = Date.now();
  const maxAgeMs = settings.retentionDays * 24 * 60 * 60 * 1000;

  // 1. 過濾超過保留天數的信件
  const valid = items.filter((item) => {
    if (!item.timestamp) return true;
    return now - item.timestamp <= maxAgeMs;
  });

  // 2. 按時間戳倒序排序（最新在前）
  valid.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  // 3. 截取最多保留條數
  return valid.slice(0, Math.max(5, settings.maxItems));
}

const DEFAULT_ACCOUNTS: MailAccount[] = [];

export const UnifiedMailView: React.FC = () => {
  // 讀取使用者自訂的多個信箱帳號
  const [accounts, setAccounts] = useState<MailAccount[]>(() => {
    try {
      const stored = localStorage.getItem(MAIL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // 忽略
    }
    return DEFAULT_ACCOUNTS;
  });

  const [activeAccountId, setActiveAccountId] = useState<string>("all");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // 初始狀態：優先從本地快取秒開讀取（Stale-While-Revalidate）
  const [emails, setEmails] = useState<EmailItem[]>(() => {
    try {
      const cached = localStorage.getItem(MAIL_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return applyMailRetention(parsed, getMailRetentionSettings());
        }
      }
    } catch {
      // 忽略
    }
    return [];
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // 取得有效啟用的帳號清單
  const enabledAccounts = accounts.filter((a) => a.enabled);
  const enabledAccountsRef = useRef(enabledAccounts);
  enabledAccountsRef.current = enabledAccounts;

  // 執行抓取信件（先開本地，同時抓新的並合併更新）
  const handleFetchEmails = useCallback(async () => {
    const targets = enabledAccountsRef.current;
    if (targets.length === 0) {
      setFetchError(null);
      return;
    }

    setIsSyncing(true);
    setFetchError(null);

    try {
      const incoming = await invoke<EmailItem[]>("fetch_emails", {
        accounts: targets,
      });

      setEmails((prevEmails) => {
        // 合併現有快取與最新抓取的郵件（以 ID 去重）
        const map = new Map<string, EmailItem>();
        for (const item of prevEmails) {
          map.set(item.id, item);
        }
        for (const item of incoming) {
          map.set(item.id, item);
        }

        const merged = Array.from(map.values());
        const currentSettings = getMailRetentionSettings();
        const retained = applyMailRetention(merged, currentSettings);

        try {
          localStorage.setItem(MAIL_CACHE_KEY, JSON.stringify(retained));
        } catch {
          // 忽略
        }
        return retained;
      });
    } catch (err) {
      setFetchError(String(err));
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // 監聽獨立設定視窗發來的 storage 變更（及時同步帳號、保留原則或清空快取）
  useEffect(() => {
    const handleStorageChange = (e?: StorageEvent) => {
      // 帳號變更
      if (!e || !e.key || e.key === MAIL_STORAGE_KEY) {
        try {
          const stored = localStorage.getItem(MAIL_STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
              setAccounts(parsed);
            }
          }
        } catch {}
      }

      // 保留設定變更
      if (!e || !e.key || e.key === MAIL_SETTINGS_KEY) {
        const newSettings = getMailRetentionSettings();
        setEmails((prev) => {
          const updated = applyMailRetention(prev, newSettings);
          try {
            localStorage.setItem(MAIL_CACHE_KEY, JSON.stringify(updated));
          } catch {}
          return updated;
        });
      }

      // 快取被手動清空
      if (e && e.key === MAIL_CACHE_KEY) {
        try {
          const cached = localStorage.getItem(MAIL_CACHE_KEY);
          if (!cached) {
            setEmails([]);
          } else {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) setEmails(parsed);
          }
        } catch {}
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // 掛載或帳號清單變更時：立即於背景抓取最新郵件
  useEffect(() => {
    void handleFetchEmails();
  }, [accounts, handleFetchEmails]);

  // 背景定時自動輪詢（每 60 秒同步一次）
  useEffect(() => {
    const timer = setInterval(() => {
      void handleFetchEmails();
    }, 60000);
    return () => clearInterval(timer);
  }, [handleFetchEmails]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleOpenSettings = () => {
    invoke("open_settings_window").catch(() => {});
  };

  // 依照選中的自訂信箱過濾
  const filteredEmails =
    activeAccountId === "all"
      ? emails
      : emails.filter((m) => m.accountId === activeAccountId);

  return (
    <div className="unified-mail-page">
      {/* 頂部標題與自訂標籤 Tab 篩選列 */}
      <div className="mail-header">
        <div className="mail-title-group">
          <Mail size={15} className="text-blue-400" />
          <span className="mail-title">收件匣與驗證碼</span>
          {isSyncing && (
            <span className="mail-sync-badge">
              <RefreshCw size={10} className="mail-refresh-spin" />
              <span>同步中</span>
            </span>
          )}
        </div>

        <div className="mail-header-actions">
          {/* 自訂信箱切換標籤 */}
          <div className="account-filter-tabs">
            <button
              className={`filter-tab ${activeAccountId === "all" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveAccountId("all")}
            >
              全部 ({enabledAccounts.length})
            </button>
            {enabledAccounts.map((acc) => (
              <button
                key={acc.id}
                className={`filter-tab ${activeAccountId === acc.id ? "active" : ""}`}
                type="button"
                onClick={() => setActiveAccountId(acc.id)}
              >
                <span
                  className="filter-dot"
                  style={{ backgroundColor: acc.color }}
                />
                <span>{acc.name}</span>
              </button>
            ))}
          </div>

          {/* 手動重新整理按鈕 */}
          <button
            type="button"
            className="config-mail-btn"
            onClick={() => void handleFetchEmails()}
            disabled={isSyncing}
            title={isSyncing ? "正在同步最新郵件..." : "立即檢查新郵件"}
          >
            <RefreshCw size={13} className={isSyncing ? "mail-refresh-spin" : ""} />
          </button>

          {/* 前往獨立設定視窗按鈕 */}
          <button
            type="button"
            className="config-mail-btn"
            onClick={handleOpenSettings}
            title="前往設定視窗新增或管理信箱與保留原則"
          >
            <Settings size={13} />
          </button>
        </div>
      </div>

      {/* 錯誤提示橫幅（保留本地快取顯示，僅提示背景同步問題） */}
      {fetchError && (
        <div className="mail-error-banner">
          <AlertCircle size={14} className="mail-error-icon" />
          <span className="mail-error-msg">
            {emails.length > 0
              ? `背景連線失敗（已保留本地快取）：${fetchError}`
              : fetchError}
          </span>
          <button
            type="button"
            className="mail-error-action"
            onClick={handleOpenSettings}
          >
            設定
          </button>
        </div>
      )}

      {/* 信件流列表 */}
      <div className="mail-list">
        {emails.length === 0 && isSyncing ? (
          <div className="mail-empty">
            <Loader2 size={28} className="mail-refresh-spin text-blue-400" opacity={0.7} />
            <p>正在連線 IMAP 伺服器初次抓取郵件中...</p>
          </div>
        ) : filteredEmails.length === 0 ? (
          <div className="mail-empty">
            <Inbox size={32} opacity={0.3} />
            <p>
              {enabledAccounts.length === 0
                ? "尚未啟用任何信箱帳號，請前往設定新增或開啟信箱。"
                : "目前沒有符合條件的新郵件"}
            </p>
          </div>
        ) : (
          filteredEmails.map((item) => {
            const hasCode = Boolean(item.code);
            const isCopied = copiedCode === item.code;

            // 尋找當前信箱自訂的名稱與色彩
            const matchedAccount = accounts.find((a) => a.id === item.accountId);
            const labelName = matchedAccount?.name || item.accountName;
            const labelColor = matchedAccount?.color || item.accountColor;

            return (
              <div
                key={item.id}
                className={`mail-card ${hasCode ? "has-verification-code" : ""}`}
              >
                <div className="mail-card-top">
                  <div className="mail-sender-group">
                    {/* 自訂信箱標籤名 */}
                    <span
                      className="source-badge"
                      style={{
                        backgroundColor: `${labelColor}22`,
                        color: labelColor,
                        borderColor: `${labelColor}55`,
                      }}
                    >
                      {labelName}
                    </span>
                    <span className="mail-sender">{item.sender}</span>
                  </div>
                  <span className="mail-date">{item.date}</span>
                </div>

                <div className="mail-subject">{item.subject}</div>

                {/* 驗證碼高亮專區 */}
                {hasCode && item.code && (
                  <div className="verification-code-box">
                    <div className="code-text-group">
                      <KeyRound size={14} className="code-key-icon" />
                      <span className="code-label">自動偵測驗證碼：</span>
                      <span className="code-value">{item.code}</span>
                    </div>
                    <button
                      className={`copy-code-btn ${isCopied ? "copied" : ""}`}
                      type="button"
                      onClick={() => handleCopyCode(item.code!)}
                      title="點擊複製驗證碼"
                    >
                      {isCopied ? (
                        <>
                          <Check size={12} />
                          <span>已複製</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          <span>複製</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                <div className="mail-snippet">{item.snippet}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
