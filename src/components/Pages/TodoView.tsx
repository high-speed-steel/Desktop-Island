import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Check, Trash2, ListTodo } from "lucide-react";
import "./TodoView.css";

export interface TodoItem {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
}

export const TODO_STORAGE_KEY = "focusd-island-todos";

export const getLocalDateString = (d: Date = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * 將 TodoItem 清單轉為標準 Markdown 待辦格式
 */
export function todosToMarkdown(todos: TodoItem[]): string {
  if (!todos || todos.length === 0) {
    return "# 今日待辦事項\n\n";
  }
  const lines = [
    "# 今日待辦事項",
    "",
    ...todos.map((t) => `- [${t.completed ? "x" : " "}] ${t.title}`),
    "",
  ];
  return lines.join("\n");
}

/**
 * 將 Markdown 文字解析為 TodoItem 清單
 */
export function markdownToTodos(md: string): TodoItem[] {
  const lines = md.split("\n");
  const items: TodoItem[] = [];
  let index = 1;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // 匹配 - [ ] 或 - [x]
    const taskMatch = line.match(/^[-*+]\s*\[([ xX])\]\s*(.*)$/);
    if (taskMatch) {
      const isCompleted = taskMatch[1].toLowerCase() === "x";
      const text = taskMatch[2].trim();
      if (text) {
        items.push({
          id: `todo_${index++}_${encodeURIComponent(text.slice(0, 16))}`,
          title: text,
          completed: isCompleted,
          createdAt: Date.now(),
        });
      }
      continue;
    }

    // 匹配無勾選框的清單項 - 項目 或 * 項目
    const bulletMatch = line.match(/^[-*+]\s+(.*)$/);
    if (bulletMatch) {
      const text = bulletMatch[1].trim();
      if (text && !text.startsWith("#")) {
        items.push({
          id: `todo_${index++}_${encodeURIComponent(text.slice(0, 16))}`,
          title: text,
          completed: false,
          createdAt: Date.now(),
        });
      }
      continue;
    }
  }

  return items;
}

export const TodoView: React.FC = () => {
  const [todos, setTodos] = useState<TodoItem[]>(() => {
    try {
      const stored = localStorage.getItem(TODO_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // 忽略
    }
    return [];
  });

  const [inputTitle, setInputTitle] = useState("");
  const isLoadedRef = useRef(false);

  // 雙向持久化：儲存至 localStorage 並即時寫入本機磁碟 Markdown 檔案
  const persistTodos = useCallback((newTodos: TodoItem[]) => {
    try {
      localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(newTodos));
      window.dispatchEvent(new Event("storage"));
    } catch (e) {
      console.warn("寫入 localStorage 待辦失敗:", e);
    }

    invoke<string>("get_default_todo_save_directory")
      .then((dir) => {
        const date = getLocalDateString();
        const content = todosToMarkdown(newTodos);
        return invoke("save_todo_markdown", {
          directory: dir,
          date,
          content,
        });
      })
      .catch((err) => {
        console.warn("寫入磁碟待辦 Markdown 失敗:", err);
      });
  }, []);

  // 啟動時自動從磁碟 Markdown 檔案同步讀取，確保重啟或關閉後完美記憶
  useEffect(() => {
    let isCancelled = false;

    const syncWithDisk = async () => {
      try {
        const dir = await invoke<string>("get_default_todo_save_directory");
        const date = getLocalDateString();
        const diskContent = await invoke<string>("read_todo_markdown", {
          directory: dir,
          date,
        });

        if (isCancelled) return;

        if (diskContent && diskContent.trim().length > 0) {
          const diskTodos = markdownToTodos(diskContent);
          if (diskTodos.length > 0) {
            setTodos(diskTodos);
            localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(diskTodos));
            isLoadedRef.current = true;
            return;
          }
        }

        // 若磁碟今日無檔案但 localStorage 中有記憶待辦，立即補回磁碟存檔
        const stored = localStorage.getItem(TODO_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const md = todosToMarkdown(parsed);
            await invoke("save_todo_markdown", {
              directory: dir,
              date,
              content: md,
            });
          }
        }
      } catch (err) {
        console.warn("讀取磁碟待辦失敗:", err);
      } finally {
        isLoadedRef.current = true;
      }
    };

    syncWithDisk();

    return () => {
      isCancelled = true;
    };
  }, []);

  // 監聽外部（例如設定視窗）發來的 storage 變更
  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const stored = localStorage.getItem(TODO_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setTodos(parsed);
          }
        }
      } catch {
        // 忽略
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const handleAddTodo = () => {
    if (!inputTitle.trim()) return;
    const newItem: TodoItem = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: inputTitle.trim(),
      completed: false,
      createdAt: Date.now(),
    };
    const next = [newItem, ...todos];
    setTodos(next);
    setInputTitle("");
    persistTodos(next);
  };

  const handleToggle = (id: string) => {
    const next = todos.map((t) =>
      t.id === id ? { ...t, completed: !t.completed } : t
    );
    setTodos(next);
    persistTodos(next);
  };

  const handleDelete = (id: string) => {
    const next = todos.filter((t) => t.id !== id);
    setTodos(next);
    persistTodos(next);
  };

  return (
    <div className="todo-view">
      <div className="todo-add-box">
        <input
          type="text"
          className="todo-input"
          placeholder="新增今日待辦事項..."
          value={inputTitle}
          onChange={(e) => setInputTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddTodo()}
        />
        <button
          type="button"
          className="todo-add-btn"
          onClick={handleAddTodo}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="todo-list">
        {todos.length === 0 ? (
          <div className="todo-empty">
            <ListTodo size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div>目前沒有待辦事項，好好休息一下吧！</div>
          </div>
        ) : (
          todos.map((item) => (
            <div key={item.id} className="todo-item">
              <div
                className="todo-item-main"
                onClick={() => handleToggle(item.id)}
              >
                <div className={`todo-checkbox ${item.completed ? "checked" : ""}`}>
                  {item.completed && <Check size={12} />}
                </div>
                <span className={`todo-text ${item.completed ? "completed" : ""}`}>
                  {item.title}
                </span>
              </div>
              <button
                type="button"
                className="todo-delete-btn"
                onClick={() => handleDelete(item.id)}
                title="刪除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
