import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Search,
  Copy,
  Check,
  Trash2,
  ClipboardList,
  Image as ImageIcon,
  Link as LinkIcon,
  Code,
  FileText,
} from "lucide-react";
import "./ClipboardView.css";

interface ClipboardHistoryImage {
  width: number;
  height: number;
  byteSize: number;
  originalPath: string;
  thumbnailPath: string;
  thumbnailDataUrl?: string | null;
}

interface ClipboardHistoryItem {
  id: string;
  kind: "text" | "image";
  hash: string;
  createdAt: number;
  copiedAt: number;
  favorite: boolean;
  note: string;
  preview: string;
  text?: string | null;
  image?: ClipboardHistoryImage | null;
}

interface ClipboardHistorySnapshot {
  settings: {
    enabled: boolean;
    captureImages: boolean;
    maxItems: number;
    shortcut: string;
    shortcutEnabled: boolean;
  };
  items: ClipboardHistoryItem[];
}

export const ClipboardView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [items, setItems] = useState<ClipboardHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    try {
      const snapshot = await invoke<ClipboardHistorySnapshot>("get_clipboard_history");
      if (snapshot && Array.isArray(snapshot.items)) {
        setItems(snapshot.items);
      }
    } catch (err) {
      console.error("載入剪貼簿歷史失敗:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();

    const unlistenPromise = listen("clipboard-history-changed", () => {
      loadHistory();
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const filteredItems = items.filter((item) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    if (item.preview && item.preview.toLowerCase().includes(term)) return true;
    if (item.text && item.text.toLowerCase().includes(term)) return true;
    if (item.note && item.note.toLowerCase().includes(term)) return true;
    return false;
  });

  const handleCopy = async (item: ClipboardHistoryItem) => {
    try {
      const snapshot = await invoke<ClipboardHistorySnapshot>("copy_clipboard_history_item", {
        id: item.id,
      });
      if (snapshot && Array.isArray(snapshot.items)) {
        setItems(snapshot.items);
      }
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      console.warn("後端複製失敗，嘗試前端 fallback:", err);
      if (item.text) {
        await navigator.clipboard.writeText(item.text);
        setCopiedId(item.id);
        setTimeout(() => setCopiedId(null), 1500);
      }
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const snapshot = await invoke<ClipboardHistorySnapshot>("delete_clipboard_history_item", {
        id,
      });
      if (snapshot && Array.isArray(snapshot.items)) {
        setItems(snapshot.items);
      } else {
        setItems((prev) => prev.filter((it) => it.id !== id));
      }
    } catch (err) {
      console.error("刪除剪貼簿項目失敗:", err);
    }
  };

  const handleClearAll = async () => {
    try {
      const snapshot = await invoke<ClipboardHistorySnapshot>("clear_clipboard_history");
      if (snapshot && Array.isArray(snapshot.items)) {
        setItems(snapshot.items);
      } else {
        setItems([]);
      }
    } catch (err) {
      console.error("清空剪貼簿失敗:", err);
    }
  };

  const formatRelativeTime = (timestamp: number) => {
    if (!timestamp) return "";
    const now = Date.now();
    const diffSec = Math.floor((now - timestamp) / 1000);
    if (diffSec < 45) return "剛剛";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} 分鐘前`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} 小時前`;
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()} ${date
      .getHours()
      .toString()
      .padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  };

  const getItemTypeBadge = (item: ClipboardHistoryItem) => {
    if (item.kind === "image") {
      return (
        <span className="clipboard-badge badge-image">
          <ImageIcon size={10} />
          <span>圖片</span>
        </span>
      );
    }
    const text = item.text || item.preview || "";
    if (text.startsWith("http://") || text.startsWith("https://")) {
      return (
        <span className="clipboard-badge badge-link">
          <LinkIcon size={10} />
          <span>連結</span>
        </span>
      );
    }
    if (text.includes("\n") || text.includes("{") || text.includes("function") || text.includes("const ")) {
      return (
        <span className="clipboard-badge badge-code">
          <Code size={10} />
          <span>代碼</span>
        </span>
      );
    }
    return (
      <span className="clipboard-badge badge-text">
        <FileText size={10} />
        <span>文字</span>
      </span>
    );
  };

  return (
    <div className="clipboard-view">
      <div className="clipboard-header">
        <div className="clipboard-search-bar">
          <Search size={14} opacity={0.6} />
          <input
            type="text"
            className="clipboard-search-input"
            placeholder="搜尋剪貼簿歷史 (文字、代碼、連結)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {items.length > 0 && (
          <button
            type="button"
            className="clipboard-clear-btn"
            onClick={handleClearAll}
            title="清空剪貼簿歷史"
          >
            <Trash2 size={12} />
            <span>清空全部</span>
          </button>
        )}
      </div>

      <div className="clipboard-list">
        {loading ? (
          <div className="clipboard-empty">載入剪貼簿中...</div>
        ) : filteredItems.length === 0 ? (
          <div className="clipboard-empty">
            <ClipboardList size={26} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div>
              {searchTerm ? "沒有相符的剪貼簿歷史紀錄" : "目前沒有剪貼簿歷史紀錄"}
            </div>
            <div className="clipboard-empty-sub">
              在 Windows 任何應用程式中按下 Ctrl+C 複製，內容將自動同步出現在此
            </div>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isCopied = copiedId === item.id;
            const timeLabel = formatRelativeTime(item.copiedAt || item.createdAt);

            return (
              <div
                key={item.id}
                className={`clipboard-card ${isCopied ? "card-copied" : ""}`}
                onClick={() => handleCopy(item)}
                title="點擊複製回剪貼簿"
              >
                <div className="clipboard-card-content">
                  <div className="clipboard-card-top-row">
                    {getItemTypeBadge(item)}
                    <span className="clipboard-card-meta">{timeLabel}</span>
                  </div>

                  {item.kind === "image" ? (
                    <div className="clipboard-card-image-box">
                      {item.image?.thumbnailDataUrl ? (
                        <img
                          src={item.image.thumbnailDataUrl}
                          alt="剪貼簿圖片"
                          className="clipboard-thumbnail"
                        />
                      ) : (
                        <div className="clipboard-image-placeholder">
                          <ImageIcon size={20} />
                        </div>
                      )}
                      <div className="clipboard-image-meta">
                        {item.image?.width} × {item.image?.height} px ·{" "}
                        {Math.round((item.image?.byteSize || 0) / 1024)} KB
                      </div>
                    </div>
                  ) : (
                    <div className="clipboard-card-text" title={item.text || item.preview}>
                      {item.preview || item.text}
                    </div>
                  )}
                </div>

                <div className="clipboard-card-actions">
                  <button
                    type="button"
                    className={`clipboard-copy-btn ${isCopied ? "copied" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(item);
                    }}
                    title={isCopied ? "已複製！" : "複製此項目"}
                  >
                    {isCopied ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                  <button
                    type="button"
                    className="clipboard-delete-btn"
                    onClick={(e) => handleDelete(e, item.id)}
                    title="刪除"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
