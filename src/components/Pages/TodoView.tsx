import React, { useState, useEffect } from "react";
import { Plus, Check, Trash2, ListTodo } from "lucide-react";
import "./TodoView.css";

export interface TodoItem {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
}

export const TODO_STORAGE_KEY = "focusd-island-todos";

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
          id: `${Date.now()}_${index++}`,
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
          id: `${Date.now()}_${index++}`,
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
        return JSON.parse(stored);
      }
    } catch {
      // 忽略
    }
    return [];
  });

  const [inputTitle, setInputTitle] = useState("");

  // 監聽外部（例如設定視窗）發來的 storage 變更
  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const stored = localStorage.getItem(TODO_STORAGE_KEY);
        if (stored) {
          setTodos(JSON.parse(stored));
        }
      } catch {
        // 忽略
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  useEffect(() => {
    localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  const handleAddTodo = () => {
    if (!inputTitle.trim()) return;
    const newItem: TodoItem = {
      id: Date.now().toString(),
      title: inputTitle.trim(),
      completed: false,
      createdAt: Date.now(),
    };
    setTodos([newItem, ...todos]);
    setInputTitle("");
  };

  const handleToggle = (id: string) => {
    setTodos(
      todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    );
  };

  const handleDelete = (id: string) => {
    setTodos(todos.filter((t) => t.id !== id));
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
