import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  Music2,
  Bell,
  ClipboardList,
  Mail,
  FolderDown,
  ListTodo,
  Languages,
  Pin,
  Settings,
} from "lucide-react";

import { MusicAndSystemView } from "./components/Pages/MusicAndSystemView";
import { SpecialNotificationsView } from "./components/Pages/SpecialNotificationsView";
import { ClipboardView } from "./components/Pages/ClipboardView";
import { UnifiedMailView } from "./components/Pages/UnifiedMailView";
import { FileShelfView } from "./components/Pages/FileShelfView";
import { TodoView } from "./components/Pages/TodoView";
import { QuickTranslateView } from "./components/Pages/QuickTranslateView";

import "./App.css";

export type IslandMode = "collapsed" | "expanded";
export type AppearanceMode = "classic" | "liquidGlass" | "whiteGlass" | "pureBlack" | "pureWhite";
export type IslandPage =
  | "music"
  | "notifications"
  | "clipboard"
  | "mail"
  | "shelf"
  | "todo"
  | "translation";

interface MediaState {
  available: boolean;
  playbackStatus: string;
  title: string;
  artist: string;
  album: string;
  thumbnail?: string | null;
  timeline?: {
    positionMs: number;
    durationMs: number;
  };
}

const SETTINGS_STORAGE_KEY = "focusd-island-settings";

const PAGES: { id: IslandPage; label: string; icon: React.ReactNode }[] = [
  { id: "music", label: "系統", icon: <Music2 size={12} /> },
  { id: "notifications", label: "通知", icon: <Bell size={12} /> },
  { id: "clipboard", label: "剪貼簿", icon: <ClipboardList size={12} /> },
  { id: "mail", label: "信箱", icon: <Mail size={12} /> },
  { id: "shelf", label: "暫存板", icon: <FolderDown size={12} /> },
  { id: "todo", label: "待辦", icon: <ListTodo size={12} /> },
  { id: "translation", label: "翻譯", icon: <Languages size={12} /> },
];

const formatCapsuleTime = (date: Date = new Date()): string => {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours} : ${minutes}`;
};

export const App: React.FC = () => {
  const [mode, setMode] = useState<IslandMode>("collapsed");
  const [activePage, setActivePage] = useState<IslandPage>("music");

  // 膠囊摺疊態即時時間更新（格式：hh : mm）
  const [currentTime, setCurrentTime] = useState<string>(() => formatCapsuleTime());
  useEffect(() => {
    const updateTime = () => setCurrentTime(formatCapsuleTime());
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // 外觀風格，預設純黑風格
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed.appearanceMode === "pureBlack" ||
          parsed.appearanceMode === "pureWhite" ||
          parsed.appearanceMode === "liquidGlass" ||
          parsed.appearanceMode === "whiteGlass" ||
          parsed.appearanceMode === "classic"
        ) {
          return parsed.appearanceMode === "classic" ? "whiteGlass" : parsed.appearanceMode;
        }
      }
    } catch {
      // 忽略
    }
    return "pureBlack";
  });

  // 是否已拖出螢幕頂端邊界（懸浮模式）
  const [isDetached, setIsDetached] = useState(false);

  // 面板釘選狀態：若釘選，點擊島外不自動收合；未釘選時點擊島外自動收合
  const [isPinned, setIsPinned] = useState<boolean>(() => {
    try {
      return localStorage.getItem("focusd-island-pinned") === "true";
    } catch {
      return false;
    }
  });

  const togglePin = useCallback(() => {
    setIsPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("focusd-island-pinned", String(next));
      } catch {}
      invoke("set_island_pinned", { pinned: next }).catch(() => {});
      return next;
    });
  }, []);

  useEffect(() => {
    invoke("set_island_pinned", { pinned: isPinned }).catch(() => {});
  }, [isPinned]);

  // 監聽原生島嶼位置變更事件（即時獲知是否拖出吸頂邊界）
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<any>("island-position-changed", (event) => {
      if (event.payload && typeof event.payload.isDetached === "boolean") {
        setIsDetached(event.payload.isDetached);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // 音訊媒體狀態（預設清空測試訊息，依 Windows SMTC 即時同步）
  const [mediaState, setMediaState] = useState<MediaState>({
    available: false,
    playbackStatus: "paused",
    title: "",
    artist: "",
    album: "",
  });

  // 監聽獨立設定視窗發來的 storage 變更
  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.appearanceMode) {
            setAppearanceMode(
              parsed.appearanceMode === "classic" ? "whiteGlass" : parsed.appearanceMode
            );
          }
        }
      } catch {
        // 忽略
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // 同步 Tauri 原生交互與尺寸（邊緣貼緊頂部，margin_y: 0）
  const syncInteraction = useCallback((targetMode: IslandMode) => {
    const isExpanded = targetMode === "expanded";
    invoke("set_island_interaction", {
      mode: targetMode,
      collapsedScale: 1.0,
      expandedScale: 1.0,
      margin_y: 0.0,
      expandedHeight: isExpanded ? 385 : 36,
      collapsedWidth: 300,
      is_pinned: isPinned,
    }).catch(() => {
      // 容錯（在非 Tauri 瀏覽器環境下忽略）
    });
  }, [isPinned]);

  // 初次掛載通知 Tauri 視窗就緒
  useEffect(() => {
    invoke("show_ready_island").catch(() => {});
    syncInteraction("collapsed");
  }, [syncInteraction]);

  // 定期同步 Windows SMTC 媒體播放狀態
  useEffect(() => {
    const timer = setInterval(() => {
      invoke<any>("get_media_state")
        .then((state) => {
          if (state && state.title) {
            setMediaState(state);
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const handleMediaPlayPause = () => {
    invoke("media_play_pause").catch(() => {
      setMediaState((prev) => ({
        ...prev,
        playbackStatus: prev.playbackStatus === "playing" ? "paused" : "playing",
      }));
    });
  };

  const handleMediaNext = () => {
    invoke("media_next").catch(() => {});
  };

  const handleMediaPrev = () => {
    invoke("media_previous").catch(() => {});
  };

  const expandIsland = useCallback(() => {
    setMode("expanded");
    syncInteraction("expanded");
  }, [syncInteraction]);

  const collapseIsland = useCallback(() => {
    setMode("collapsed");
    syncInteraction("collapsed");
  }, [syncInteraction]);

  const openSettings = useCallback(() => {
    invoke("open_settings_window").catch((err) => {
      console.error("開啟設定視窗失敗:", err);
    });
  }, []);

  // 監聽原生島外點擊自動收合事件（未釘選狀態下點擊島外自動摺疊）
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("auto-collapse-island", () => {
      if (mode === "expanded" && !isPinned) {
        collapseIsland();
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [mode, isPinned, collapseIsland]);

  // 視窗失去焦點時（例如點擊其他全螢幕程式或桌面），若未釘選則自動收合
  useEffect(() => {
    const handleWindowBlur = () => {
      if (mode === "expanded" && !isPinned) {
        setTimeout(() => {
          if (!document.hasFocus() && mode === "expanded" && !isPinned) {
            collapseIsland();
          }
        }, 120);
      }
    };
    window.addEventListener("blur", handleWindowBlur);
    return () => window.removeEventListener("blur", handleWindowBlur);
  }, [mode, isPinned, collapseIsland]);

  // 全域鍵盤監聽：Tab / Shift+Tab 切換分頁，Esc 關閉/摺疊
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mode === "expanded") {
          e.preventDefault();
          collapseIsland();
        }
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        if (mode === "collapsed") {
          expandIsland();
          return;
        }

        const currentIndex = PAGES.findIndex((p) => p.id === activePage);
        if (e.shiftKey) {
          // Shift + Tab：上一個分頁
          const prevIndex = (currentIndex - 1 + PAGES.length) % PAGES.length;
          setActivePage(PAGES[prevIndex].id);
        } else {
          // Tab：下一個分頁
          const nextIndex = (currentIndex + 1) % PAGES.length;
          setActivePage(PAGES[nextIndex].id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, activePage, expandIsland, collapseIsland]);

  // 全域檔案拖入支援：當使用者將任何檔案拖至懸浮島上時，自動展開並切換至暫存板分頁
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setupDragDrop = async () => {
      try {
        const webview = getCurrentWebview();
        unlisten = await webview.onDragDropEvent((event) => {
          if (event.payload.type === "drop") {
            const droppedPaths = event.payload.paths;
            if (Array.isArray(droppedPaths) && droppedPaths.length > 0) {
              setMode("expanded");
              syncInteraction("expanded");
              setActivePage("shelf");
              setTimeout(() => {
                window.dispatchEvent(
                  new CustomEvent("focusd-shelf-add-files", {
                    detail: droppedPaths,
                  })
                );
              }, 120);
            }
          }
        });
      } catch (e) {
        console.warn("註冊島嶼全域拖放監聽失敗:", e);
      }
    };
    setupDragDrop();
    return () => {
      if (unlisten) unlisten();
    };
  }, [syncInteraction]);

  // 是否為玻璃質感模式（黑玻璃或白玻璃）
  const isGlassMode = appearanceMode === "liquidGlass" || appearanceMode === "whiteGlass";

  // 滑鼠移動即時追蹤光學折射高光（原版液態玻璃核心）
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isGlassMode) return;
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    target.style.setProperty("--glass-pointer-x", `${x}%`);
    target.style.setProperty("--glass-pointer-y", `${y}%`);
  };

  // 滑鼠拖曳狀態追蹤（支援橫向拖曳與拖出吸頂邊緣）
  const dragRef = useRef<{
    startX: number;
    startY: number;
    pointerId: number;
  } | null>(null);
  const didDragRef = useRef(false);

  const handleCapsulePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, textarea, a")) return;

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handleCapsulePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    handlePointerMove(e);

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const deltaX = Math.abs(e.clientX - drag.startX);
    const deltaY = Math.abs(e.clientY - drag.startY);

    // 只要移動超過 4px，即刻啟動原生拖曳（可橫向滑動，亦可縱向拖出）
    if (deltaX > 4 || deltaY > 4) {
      dragRef.current = null;
      didDragRef.current = true;
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {}

      invoke("start_island_drag").catch((err) => {
        console.error("無法啟動靈動島拖曳:", err);
      });
    }
  };

  const handleCapsulePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
  };

  const handleCapsuleClick = () => {
    // 若剛才正在進行拖曳，則吞掉點擊，避免展開
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    expandIsland();
  };

  // 雙擊膠囊可重設吸附回螢幕正中央頂部
  const handleCapsuleDoubleClick = () => {
    invoke("reset_island_position")
      .then(() => setIsDetached(false))
      .catch(() => {});
  };

  // 展開模式 Tab 欄橫拖處理
  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, textarea, a")) return;

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    handlePointerMove(e);

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const deltaX = Math.abs(e.clientX - drag.startX);
    const deltaY = Math.abs(e.clientY - drag.startY);

    // 展開模式下移動超過 4px 即啟動橫向拖曳
    if (deltaX > 4 || deltaY > 4) {
      dragRef.current = null;
      didDragRef.current = true;
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {}

      invoke("start_island_drag").catch((err) => {
        console.error("無法啟動展開橫拖:", err);
      });
    }
  };

  const handleHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
  };

  // 右鍵點擊靈動島彈出獨立設定視窗
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openSettings();
  };

  return (
    <div
      className={`desktop-island-root appearance-${appearanceMode} mode-${mode} ${
        isDetached ? "is-detached" : ""
      }`}
      onContextMenu={handleContextMenu}
    >
      {/* 膠囊摺疊態 (Collapsed Capsule) - 支援橫向拖曳、拖出螢幕邊界、迷你專輯封面與動態音訊波浪 */}
      {mode === "collapsed" && (
        <div
          className={`island-capsule ${isDetached ? "detached" : ""}`}
          onClick={handleCapsuleClick}
          onDoubleClick={handleCapsuleDoubleClick}
          onPointerDown={handleCapsulePointerDown}
          onPointerMove={handleCapsulePointerMove}
          onPointerUp={handleCapsulePointerUp}
          onPointerCancel={handleCapsulePointerUp}
          title={
            isDetached
              ? "按住可隨意拖曳，雙擊復位頂部中央，點擊展開面板"
              : "按住可橫向移動或拖離螢幕頂端，點擊展開面板，按右鍵開啟設定"
          }
        >
          {/* 玻璃光學折射層 */}
          {isGlassMode && (
            <div className="island__glass" aria-hidden="true">
              <span className="island__glass-refraction" />
              <span className="island__glass-highlight" />
            </div>
          )}

          {/* 左側插槽：播放中且有封面顯示微型專輯圖，否則顯示專屬去背白點 */}
          <div className="capsule-icon-wrap">
            {mediaState.thumbnail && mediaState.playbackStatus === "playing" ? (
              <img
                src={mediaState.thumbnail}
                alt="Mini Album"
                className="capsule-mini-album-art"
              />
            ) : (
              <span className="capsule-dot" />
            )}
          </div>

          {/* 膠囊動態資訊：常駐播放與系統資訊，後綴即時時間 (| hh : mm) */}
          <div className="capsule-ticker">
            <span className={`ticker-text ${mediaState.playbackStatus === "playing" ? "music-text" : "system-text"}`}>
              <span className="ticker-title">
                {mediaState.playbackStatus === "playing"
                  ? `${mediaState.title || "未知曲目"}${mediaState.artist ? ` - ${mediaState.artist}` : ""}`
                  : "Desktop Island 靈動島"}
              </span>
              <span className="ticker-time">
                <span className="ticker-time-divider">|</span>
                <span className="ticker-time-clock">{currentTime}</span>
              </span>
            </span>
          </div>

          {/* 右側插槽：播放中顯示律動音訊波浪，未播放時顯示指示燈 */}
          <div className="capsule-end-badge">
            {mediaState.playbackStatus === "playing" ? (
              <div className="capsule-waveform">
                <span className="capsule-wave-bar bar-1" />
                <span className="capsule-wave-bar bar-2" />
                <span className="capsule-wave-bar bar-3" />
                <span className="capsule-wave-bar bar-4" />
              </div>
            ) : (
              <span className="pulse-indicator" />
            )}
          </div>
        </div>
      )}

      {/* 展開面板態 (Expanded Panel) */}
      {mode === "expanded" && (
        <div
          className={`island-expanded-panel ${isDetached ? "detached" : ""}`}
          onPointerMove={handlePointerMove}
        >
          {/* 玻璃光學折射層 */}
          {isGlassMode && (
            <div className="island__glass" aria-hidden="true">
              <span className="island__glass-refraction" />
              <span className="island__glass-highlight" />
            </div>
          )}

          {/* 頂部瀏覽器風格 Tab 欄（支援展開態橫拖） */}
          <div
            className="island-tab-header"
            onPointerDown={handleHeaderPointerDown}
            onPointerMove={handleHeaderPointerMove}
            onPointerUp={handleHeaderPointerUp}
            onPointerCancel={handleHeaderPointerUp}
            title="按住頂部欄空白處可橫向拖曳島嶼"
          >
            <div className="browser-tabs-scroll-area">
              {PAGES.map((page) => {
                const isActive = activePage === page.id;
                return (
                  <button
                    key={page.id}
                    type="button"
                    className={`browser-tab-item ${isActive ? "active" : ""}`}
                    onClick={() => setActivePage(page.id)}
                  >
                    <span className="tab-icon">{page.icon}</span>
                    <span className="tab-title">{page.label}</span>
                  </button>
                );
              })}
            </div>

            {/* 右上角操作控制：設定與釘選 */}
            <div className="tab-actions">
              <button
                type="button"
                className="action-icon-btn"
                onClick={openSettings}
                title="開啟獨立設定視窗 (亦可點擊右鍵)"
              >
                <Settings size={14} />
              </button>
              <button
                type="button"
                className={`action-icon-btn pin-btn ${isPinned ? "is-pinned" : ""}`}
                onClick={togglePin}
                title={
                  isPinned
                    ? "已釘選展開態（點擊島外不收合，點此取消釘選）"
                    : "釘選展開態（目前點擊島外將自動收合）"
                }
              >
                <Pin size={13} className={isPinned ? "pinned-icon" : ""} />
              </button>
            </div>
          </div>

          {/* 核心內容分頁區塊：精準只渲染當前選中的 7 大頁面 */}
          <div className="island-content-body">
            {activePage === "music" && (
              <MusicAndSystemView
                mediaState={mediaState}
                onPlayPause={handleMediaPlayPause}
                onNext={handleMediaNext}
                onPrev={handleMediaPrev}
              />
            )}
            {activePage === "notifications" && <SpecialNotificationsView />}
            {activePage === "clipboard" && <ClipboardView />}
            {activePage === "mail" && <UnifiedMailView />}
            {activePage === "shelf" && <FileShelfView />}
            {activePage === "todo" && <TodoView />}
            {activePage === "translation" && <QuickTranslateView />}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
