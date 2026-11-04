import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Mail, Check, KeyRound, Copy, Settings, Inbox, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
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

interface EmailItem {
  id: string;
  accountId: string;   // 所屬信箱帳戶 ID
  accountName: string; // 自訂信箱標籤名
  accountColor: string;// 自訂標籤顏色
  sender: string;
  subject: string;
  snippet: string;
  date: string;
  code?: string;
}

const MAIL_STORAGE_KEY = "focusd-island-mail-accounts";

const DEFAULT_ACCOUNTS: MailAccount[] = [];

export const UnifiedMailView: React.FC = () => {
  // 讀取使用者在設定中自訂的多個信箱
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
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // 取得有效啟用的帳號清單
  const enabledAccounts = accounts.filter((a) => a.enabled);
  const enabledAccountsRef = useRef(enabledAccounts);
  enabledAccountsRef.current = enabledAccounts;

  // 執行抓取信件
  const handleFetchEmails = useCallback(async (showLoading = true) => {
    const targets = enabledAccountsRef.current;
    if (targets.length === 0) {
      setEmails([]);
      setFetchError(null);
      return;
    }

    if (showLoading) setIsLoading(true);
    setFetchError(null);

    try {
      const result = await invoke<EmailItem[]>("fetch_emails", {
        accounts: targets,
      });
      setEmails(result);
    } catch (err) {
      setFetchError(String(err));
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  // 監聽獨立設定視窗發來的 storage 變更（及時同步自訂信箱帳號）
  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const stored = localStorage.getItem(MAIL_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setAccounts(parsed);
          }
        }
      } catch {
        // 忽略
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // 帳號變更或首次掛載時自動拉取
  useEffect(() => {
    void handleFetchEmails(true);
  }, [accounts, handleFetchEmails]);

  // 背景自動輪詢（每 60 秒定期刷新）
  useEffect(() => {
    const timer = setInterval(() => {
      void handleFetchEmails(false);
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
            onClick={() => void handleFetchEmails(true)}
            disabled={isLoading}
            title={isLoading ? "正在同步中..." : "重新整理收件匣"}
          >
            <RefreshCw size={13} className={isLoading ? "mail-refresh-spin" : ""} />
          </button>

          {/* 前往獨立設定視窗按鈕 */}
          <button
            type="button"
            className="config-mail-btn"
            onClick={handleOpenSettings}
            title="前往設定視窗新增或管理信箱"
          >
            <Settings size={13} />
          </button>
        </div>
      </div>

      {/* 錯誤提示橫幅 */}
      {fetchError && (
        <div className="mail-error-banner">
          <AlertCircle size={14} className="mail-error-icon" />
          <span className="mail-error-msg">{fetchError}</span>
          <button
            type="button"
            className="mail-error-action"
            onClick={handleOpenSettings}
          >
            前往設定
          </button>
        </div>
      )}

      {/* 信件流列表 */}
      <div className="mail-list">
        {isLoading && emails.length === 0 ? (
          <div className="mail-empty">
            <Loader2 size={28} className="mail-refresh-spin text-blue-400" opacity={0.7} />
            <p>正在連線 IMAP 伺服器同步郵件中...</p>
          </div>
        ) : filteredEmails.length === 0 ? (
          <div className="mail-empty">
            <Inbox size={32} opacity={0.3} />
            <p>
              {enabledAccounts.length === 0
                ? "尚未啟用任何信箱帳號，請前往設定新增或開啟信箱。"
                : "此信箱目前沒有新郵件"}
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
