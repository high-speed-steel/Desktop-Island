import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import {
  FolderDown,
  File,
  Folder,
  FileImage,
  FileCode,
  FileVideo,
  FileArchive,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  FolderOpen,
  Plus,
  GripVertical,
} from "lucide-react";
import "./FileShelfView.css";

export interface ShelfFile {
  id: string;
  name: string;
  size: string;
  path: string;
  isDir?: boolean;
  addedAt: string;
}

interface ShelfFileInfo {
  path: string;
  name: string;
  sizeFormatted: string;
  isDir: boolean;
}

const SHELF_STORAGE_KEY = "focusd-island-shelf-files";

export const FileShelfView: React.FC = () => {
  const [files, setFiles] = useState<ShelfFile[]>(() => {
    try {
      const raw = localStorage.getItem(SHELF_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn("讀取暫存檔案失敗:", e);
    }
    return [];
  });

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 同步保存至 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SHELF_STORAGE_KEY, JSON.stringify(files));
    } catch (e) {
      console.warn("保存暫存檔案失敗:", e);
    }
  }, [files]);

  // 新增檔案路徑清單至暫存板
  const addFilePaths = async (paths: string[]) => {
    if (!paths || paths.length === 0) return;

    const newEntries: ShelfFile[] = [];
    const nowStr = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    for (const path of paths) {
      try {
        const info = await invoke<ShelfFileInfo>("get_file_info", { path });
        newEntries.push({
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: info.name,
          path: info.path,
          size: info.sizeFormatted,
          isDir: info.isDir,
          addedAt: nowStr,
        });
      } catch {
        const name = path.split(/[/\\]/).pop() || path;
        newEntries.push({
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name,
          path,
          size: "檔案",
          isDir: false,
          addedAt: nowStr,
        });
      }
    }

    setFiles((prev) => {
      const existingPaths = new Set(newEntries.map((e) => e.path));
      const filteredPrev = prev.filter((p) => !existingPaths.has(p.path));
      return [...newEntries, ...filteredPrev];
    });
  };

  // 監聽 Tauri 原生拖入事件
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        const webview = getCurrentWebview();
        unlisten = await webview.onDragDropEvent((event) => {
          if (event.payload.type === "over" || event.payload.type === "enter") {
            setIsDragOver(true);
          } else if (event.payload.type === "leave") {
            setIsDragOver(false);
          } else if (event.payload.type === "drop") {
            setIsDragOver(false);
            const droppedPaths = event.payload.paths;
            if (Array.isArray(droppedPaths) && droppedPaths.length > 0) {
              addFilePaths(droppedPaths);
            }
          }
        });
      } catch (err) {
        console.warn("無法註冊 Tauri drag-drop 監聽器:", err);
      }
    };

    setupListener();

    const handleGlobalDrop = (e: CustomEvent<string[]>) => {
      if (e.detail && Array.isArray(e.detail)) {
        addFilePaths(e.detail);
      }
    };
    window.addEventListener("focusd-shelf-add-files" as any, handleGlobalDrop);

    return () => {
      if (unlisten) unlisten();
      window.removeEventListener("focusd-shelf-add-files" as any, handleGlobalDrop);
    };
  }, []);

  // 原生拖出（Drag Out）至桌面、檔案總管或其他應用
  const handleDragOut = async (e: React.DragEvent, file: ShelfFile) => {
    e.preventDefault();
    try {
      await startDrag({
        item: [file.path],
        icon: "",
      });
    } catch (err) {
      console.error("拖出檔案失敗:", err);
    }
  };

  const handleCopyPath = async (e: React.MouseEvent, file: ShelfFile) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(file.path);
      setCopiedId(file.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch (err) {
      console.error("複製路徑失敗:", err);
    }
  };

  const handleOpenFile = async (file: ShelfFile) => {
    try {
      await openPath(file.path);
    } catch (err) {
      console.error("開啟檔案失敗:", err);
    }
  };

  const handleReveal = async (e: React.MouseEvent, file: ShelfFile) => {
    e.stopPropagation();
    try {
      await revealItemInDir(file.path);
    } catch (err) {
      console.error("在資料夾中顯示失敗:", err);
    }
  };

  const handleRemove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleClearAll = () => {
    setFiles([]);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const paths: string[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const fullPath = (f as any).path || f.name;
      paths.push(fullPath);
    }
    addFilePaths(paths);
    e.target.value = "";
  };

  const getFileIcon = (file: ShelfFile) => {
    if (file.isDir) {
      return <Folder size={17} className="text-amber-400" />;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) {
      return <FileImage size={17} className="text-emerald-400" />;
    }
    if (["ts", "tsx", "js", "jsx", "json", "html", "css", "rs", "py", "md", "txt", "cmd", "bat", "sh"].includes(ext)) {
      return <FileCode size={17} className="text-purple-400" />;
    }
    if (["mp4", "mkv", "avi", "mov", "mp3", "wav", "flac", "aac"].includes(ext)) {
      return <FileVideo size={17} className="text-pink-400" />;
    }
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
      return <FileArchive size={17} className="text-yellow-400" />;
    }
    return <File size={17} className="text-cyan-400" />;
  };

  return (
    <div
      className={`file-shelf-page ${isDragOver ? "dragging-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
      }}
    >
      <input
        type="file"
        multiple
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleFileInputChange}
      />

      <div className="shelf-header">
        <div className="shelf-title-group">
          <FolderDown size={16} className="text-cyan-400" />
          <span className="shelf-title">檔案暫存板 (Dropover Shelf)</span>
          <span className="shelf-count">{files.length}</span>
        </div>
        <div className="shelf-header-actions">
          <button
            type="button"
            className="shelf-add-btn"
            onClick={() => fileInputRef.current?.click()}
            title="選擇檔案加入暫存"
          >
            <Plus size={12} />
            <span>加入</span>
          </button>
          {files.length > 0 && (
            <button
              type="button"
              className="shelf-clear-btn"
              onClick={handleClearAll}
              title="清空全部暫存"
            >
              <Trash2 size={12} />
              <span>清空</span>
            </button>
          )}
        </div>
      </div>

      <div
        className={`shelf-dropzone ${isDragOver ? "dropzone-active" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        title="點擊選擇檔案，或直接將檔案拖入此處"
      >
        <div className="dropzone-border">
          <FolderDown size={22} className={isDragOver ? "text-cyan-400 animate-bounce" : "text-gray-400"} />
          <div className="dropzone-text-group">
            <span className="dropzone-text">
              {isDragOver ? "放開滑鼠即可暫存檔案" : "拖曳檔案進來暫存 · 按住卡片隨時拖出至桌面或資料夾"}
            </span>
            <span className="dropzone-sub">
              支援原生雙向拖曳：外部拖入收納、按住直接拖出放置至任意視窗
            </span>
          </div>
        </div>
      </div>

      <div className="shelf-list">
        {files.length === 0 ? (
          <div className="shelf-empty">
            <FolderDown size={26} style={{ marginBottom: 8, opacity: 0.3 }} />
            <div>目前暫存板沒有任何檔案</div>
            <div className="shelf-empty-sub">
              從桌面或檔案總管直接拖曳進來；暫存後按住卡片即可拖出放置至桌面或資料夾
            </div>
          </div>
        ) : (
          files.map((file) => {
            const isCopied = copiedId === file.id;

            return (
              <div
                key={file.id}
                className="shelf-file-card"
                draggable={true}
                onDragStart={(e) => handleDragOut(e, file)}
                onClick={() => handleOpenFile(file)}
                title={`按住直接拖出至桌面/檔案總管；點擊直接開啟：${file.name}`}
              >
                <div
                  className="drag-grip"
                  title="按住拖出此檔案"
                  onDragStart={(e) => handleDragOut(e, file)}
                >
                  <GripVertical size={13} className="text-gray-500" />
                </div>

                <div className="file-icon-box">{getFileIcon(file)}</div>

                <div className="file-details">
                  <div className="file-name" title={file.name}>
                    {file.name}
                  </div>
                  <div className="file-meta">
                    <span>{file.size}</span>
                    <span>·</span>
                    <span>{file.addedAt}</span>
                    <span className="file-path-preview" title={file.path}>
                      {file.path}
                    </span>
                  </div>
                </div>

                <div className="file-actions">
                  <button
                    className="action-btn"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenFile(file);
                    }}
                    title="開啟檔案"
                  >
                    <ExternalLink size={13} />
                  </button>

                  <button
                    className="action-btn"
                    type="button"
                    onClick={(e) => handleReveal(e, file)}
                    title="在檔案總管中顯示"
                  >
                    <FolderOpen size={13} />
                  </button>

                  <button
                    className={`action-btn ${isCopied ? "copied" : ""}`}
                    type="button"
                    onClick={(e) => handleCopyPath(e, file)}
                    title={isCopied ? "路徑已複製！" : "複製檔案路徑"}
                  >
                    {isCopied ? <Check size={13} /> : <Copy size={13} />}
                  </button>

                  <button
                    className="action-btn delete-btn"
                    type="button"
                    onClick={(e) => handleRemove(e, file.id)}
                    title="從暫存移除"
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
