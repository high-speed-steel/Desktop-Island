import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  Bell,
  Check,
  Trash2,
  ShieldAlert,
  ExternalLink,
  RefreshCw,
  Filter,
  SlidersHorizontal,
  FileJson,
  Plus,
  X,
} from "lucide-react";
import "./SpecialNotificationsView.css";

interface SystemNotificationItem {
  id: string;
  appName: string;
  title: string;
  body: string;
  time: string;
  timestamp: number;
}

interface NotificationSnapshot {
  status: "allowed" | "denied" | "unspecified" | "error" | string;
  error?: string | null;
  items: SystemNotificationItem[];
}

interface NotificationAppSettings {
  whitelistEnabled: boolean;
  whitelist: string[];
  discoveredApps: string[];
}

export const SpecialNotificationsView: React.FC = () => {
  const [snapshot, setSnapshot] = useState<NotificationSnapshot>({
    status: "unspecified",
    error: null,
    items: [],
  });
  const [appSettings, setAppSettings] = useState<NotificationAppSettings>({
    whitelistEnabled: false,
    whitelist: [],
    discoveredApps: [],
  });
  const [showWhitelistPanel, setShowWhitelistPanel] = useState(false);
  const [customAppInput, setCustomAppInput] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [jsonFilePath, setJsonFilePath] = useState<string>("");

  const loadNotifications = async () => {
    try {
      const res = await invoke<NotificationSnapshot>("get_system_notifications");
      if (res) {
        setSnapshot(res);
      }
    } catch (e) {
      console.error("讀取系統通知失敗:", e);
    }
  };

  const loadAppSettings = async () => {
    try {
      const settings = await invoke<NotificationAppSettings>("get_notification_app_settings");
      if (settings) {
        setAppSettings(settings);
      }
      const path = await invoke<string>("get_notification_apps_file_path");
      if (path) {
        setJsonFilePath(path);
      }
    } catch (e) {
      console.error("讀取通知白名單設定失敗:", e);
    }
  };

  useEffect(() => {
    loadNotifications();
    loadAppSettings();

    const unlistenPromise = listen("system-notifications-changed", () => {
      loadNotifications();
      loadAppSettings();
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const handleClear = async () => {
    try {
      await invoke("clear_system_notifications");
      setSnapshot((prev) => ({ ...prev, items: [] }));
    } catch (e) {
      console.error("清空通知失敗:", e);
    }
  };

  const handleRemoveSingle = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await invoke("remove_system_notification", { id });
      setSnapshot((prev) => ({
        ...prev,
        items: prev.items.filter((it) => it.id !== id),
      }));
    } catch (err) {
      console.error("刪除單則通知失敗:", err);
    }
  };

  const handleRequestPermission = async () => {
    setRequesting(true);
    try {
      await invoke<string>("request_notification_permission");
      await loadNotifications();
    } catch (e) {
      console.error("請求權限失敗:", e);
    } finally {
      setRequesting(false);
    }
  };

  const handleOpenWindowsSettings = async () => {
    try {
      await openPath("ms-settings:privacy-notifications");
    } catch (e) {
      console.error("無法開啟 Windows 設定:", e);
    }
  };

  const handleToggleWhitelistEnabled = async () => {
    const nextSettings: NotificationAppSettings = {
      ...appSettings,
      whitelistEnabled: !appSettings.whitelistEnabled,
    };
    try {
      const saved = await invoke<NotificationAppSettings>(
        "save_notification_app_settings",
        { settings: nextSettings }
      );
      setAppSettings(saved);
    } catch (e) {
      console.error("保存白名單開關失敗:", e);
    }
  };

  const handleToggleAppWhitelist = async (appName: string) => {
    const isWhitelisted = appSettings.whitelist.some(
      (w) => w.toLowerCase() === appName.toLowerCase()
    );
    const nextWhitelist = isWhitelisted
      ? appSettings.whitelist.filter((w) => w.toLowerCase() !== appName.toLowerCase())
      : [...appSettings.whitelist, appName];

    const nextSettings: NotificationAppSettings = {
      ...appSettings,
      whitelist: nextWhitelist,
    };

    try {
      const saved = await invoke<NotificationAppSettings>(
        "save_notification_app_settings",
        { settings: nextSettings }
      );
      setAppSettings(saved);
    } catch (e) {
      console.error("更新 App 白名單失敗:", e);
    }
  };

  const handleAddCustomApp = async () => {
    const trimmed = customAppInput.trim();
    if (!trimmed) return;

    const exists = appSettings.whitelist.some(
      (w) => w.toLowerCase() === trimmed.toLowerCase()
    );
    if (!exists) {
      const nextWhitelist = [...appSettings.whitelist, trimmed];
      const nextDiscovered = appSettings.discoveredApps.includes(trimmed)
        ? appSettings.discoveredApps
        : [...appSettings.discoveredApps, trimmed];

      const nextSettings: NotificationAppSettings = {
        ...appSettings,
        whitelist: nextWhitelist,
        discoveredApps: nextDiscovered,
      };

      try {
        const saved = await invoke<NotificationAppSettings>(
          "save_notification_app_settings",
          { settings: nextSettings }
        );
        setAppSettings(saved);
        setCustomAppInput("");
      } catch (e) {
        console.error("新增白名單失敗:", e);
      }
    } else {
      setCustomAppInput("");
    }
  };

  const handleOpenJsonFile = async () => {
    if (!jsonFilePath) return;
    try {
      await revealItemInDir(jsonFilePath);
    } catch {
      try {
        await openPath(jsonFilePath);
      } catch (err) {
        console.error("無法開啟 JSON 檔案:", err);
      }
    }
  };

  const isPermissionNeeded =
    snapshot.status === "denied" || snapshot.status === "unspecified";

  // 合併所有已發現與手動加入的 App
  const allKnownApps = Array.from(
    new Set([...appSettings.discoveredApps, ...appSettings.whitelist])
  ).sort((a, b) => a.localeCompare(b));

  return (
    <div className="special-notifications-page">
      <div className="notif-header">
        <div className="notif-title-group">
          <Bell size={16} className="text-amber-400" />
          <span className="notif-title">系統與應用通知</span>
          <span className="notif-count">{snapshot.items.length}</span>
          {appSettings.whitelistEnabled && (
            <span className="whitelist-active-pill" title="已啟用白名單過濾">
              <Filter size={10} />
              <span>白名單 ({appSettings.whitelist.length})</span>
            </span>
          )}
        </div>

        <div className="notif-header-actions">
          <button
            className={`action-pill-btn ${showWhitelistPanel ? "active" : ""}`}
            type="button"
            onClick={() => setShowWhitelistPanel((prev) => !prev)}
            title="設定通知白名單與檢視留檔 App"
          >
            <SlidersHorizontal size={12} />
            <span>白名單設定</span>
          </button>

          <button
            className="action-icon-btn"
            type="button"
            onClick={loadNotifications}
            title="手動重新整理"
          >
            <RefreshCw size={13} />
          </button>

          {snapshot.items.length > 0 && (
            <button
              className="clear-btn"
              type="button"
              onClick={handleClear}
              title="清除所有已擷取的通知"
            >
              <Trash2 size={13} />
              <span>清空</span>
            </button>
          )}
        </div>
      </div>

      {/* 白名單與歷來 App 留檔管理面板 */}
      {showWhitelistPanel && (
        <div className="whitelist-panel">
          <div className="whitelist-panel-header">
            <div className="panel-switch-row">
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={appSettings.whitelistEnabled}
                  onChange={handleToggleWhitelistEnabled}
                />
                <span className="switch-text">僅接收白名單內的 App 通知</span>
              </label>
            </div>
            <button
              type="button"
              className="panel-close-btn"
              onClick={() => setShowWhitelistPanel(false)}
            >
              <X size={14} />
            </button>
          </div>

          <div className="panel-hint">
            歷來收到的通知僅將 <strong>App 名稱留檔至 JSON</strong>，不保存敏感對話正文。
          </div>

          <div className="whitelist-apps-section">
            <div className="section-title">
              已留檔之應用程式 ({allKnownApps.length})：
            </div>

            {allKnownApps.length === 0 ? (
              <div className="apps-empty-hint">
                尚無歷來 App 紀錄。當 Windows 收到任何新通知時，App 名稱將自動留檔於此。
              </div>
            ) : (
              <div className="apps-chips-wrap">
                {allKnownApps.map((appName) => {
                  const isWhitelisted = appSettings.whitelist.some(
                    (w) => w.toLowerCase() === appName.toLowerCase()
                  );
                  return (
                    <button
                      key={appName}
                      type="button"
                      className={`app-chip ${isWhitelisted ? "chip-whitelisted" : ""}`}
                      onClick={() => handleToggleAppWhitelist(appName)}
                      title={isWhitelisted ? "點擊從白名單移除" : "點擊加入白名單"}
                    >
                      <span className="chip-name">{appName}</span>
                      <span className="chip-status">
                        {isWhitelisted ? "✓ 允許" : "+ 加入"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 手動輸入白名單 App 名稱 */}
          <div className="custom-app-input-row">
            <input
              type="text"
              className="custom-app-input"
              placeholder="手動輸入 App 名稱 (如: Discord, LINE)..."
              value={customAppInput}
              onChange={(e) => setCustomAppInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustomApp();
                }
              }}
            />
            <button
              type="button"
              className="custom-app-add-btn"
              onClick={handleAddCustomApp}
              disabled={!customAppInput.trim()}
            >
              <Plus size={13} />
              <span>新增</span>
            </button>
          </div>

          {/* JSON 留檔檔案資訊 */}
          {jsonFilePath && (
            <div className="json-path-footer" onClick={handleOpenJsonFile} title="點擊在檔案總管中檢視 JSON">
              <FileJson size={13} className="text-cyan-400" />
              <span className="path-text">{jsonFilePath}</span>
              <ExternalLink size={11} className="open-icon" />
            </div>
          )}
        </div>
      )}

      {isPermissionNeeded && (
        <div className="notif-permission-banner">
          <div className="banner-title-row">
            <ShieldAlert size={16} className="text-amber-400" />
            <span className="banner-title">需要 Windows 通知讀取權限</span>
          </div>
          <div className="banner-desc">
            Windows 尚未允許存取 Toast 通知。請點擊授權或至 Windows 設定開啟「允許應用程式存取您的通知」。
          </div>
          <div className="banner-buttons">
            <button
              type="button"
              className="banner-primary-btn"
              onClick={handleRequestPermission}
              disabled={requesting}
            >
              {requesting ? "請求中..." : "立即請求存取權限"}
            </button>
            <button
              type="button"
              className="banner-secondary-btn"
              onClick={handleOpenWindowsSettings}
              title="開啟 Windows 隱私權通知設定"
            >
              <ExternalLink size={12} />
              <span>開啟 Windows 設定</span>
            </button>
          </div>
        </div>
      )}

      <div className="notif-list">
        {snapshot.items.length === 0 ? (
          <div className="notif-empty">
            <Check size={26} className="empty-icon text-emerald-400" />
            <div className="empty-text">
              {appSettings.whitelistEnabled && appSettings.whitelist.length === 0
                ? "白名單目前為空，請於白名單設定中勾選允許接收的 App"
                : "目前尚無未處理的系統通知"}
            </div>
            <div className="empty-sub">
              {appSettings.whitelistEnabled
                ? `已啟用白名單過濾（僅接收 ${appSettings.whitelist.join("、") || "0 個"} 的通知）`
                : "當 Windows 收到任何應用程式的 Toast 橫幅通知時，將自動在此即時呈現"}
            </div>
          </div>
        ) : (
          snapshot.items.map((item) => (
            <div key={item.id} className="notif-card">
              <div className="notif-card-header">
                <span className="source-badge">{item.appName}</span>
                <div className="notif-card-meta">
                  <span className="notif-time">{item.time}</span>
                  <button
                    type="button"
                    className="notif-item-delete-btn"
                    onClick={(e) => handleRemoveSingle(e, item.id)}
                    title="移除此通知"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
              <div className="notif-item-title">{item.title}</div>
              {item.body && <div className="notif-item-body">{item.body}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
