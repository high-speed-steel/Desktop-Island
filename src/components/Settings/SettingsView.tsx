import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Mail, Plus, Trash2, Edit2, Check, Save, RefreshCw } from 'lucide-react';
import { DynamicForm, type SchemaField } from './DynamicForm';
import { PrioritySettings, type PriorityConfig } from './PrioritySettings';
import {
  TODO_STORAGE_KEY,
  todosToMarkdown,
  markdownToTodos,
  type TodoItem,
} from '../Pages/TodoView';
import './SettingsView.css';

export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled_by_default: boolean;
  default_priority?: string;
  dismiss_timeout_ms?: number;
  settings_schema: SchemaField[];
}

export interface AppConfig {
  run_on_startup: boolean;
  suppress_in_fullscreen: boolean;
  priority_policy: PriorityConfig;
  modules: Record<string, any>;
}

export interface MailAccountConfig {
  id: string;
  name: string;        // 自訂標籤名字
  email: string;       // 信箱帳號
  imapHost: string;    // IMAP 伺服器
  imapPort: number;    // 連接埠
  authToken?: string;  // 密碼或授權碼
  color: string;       // 標籤顏色
  enabled: boolean;
}

const MAIL_STORAGE_KEY = 'focusd-island-mail-accounts';

const DEFAULT_MAIL_ACCOUNTS: MailAccountConfig[] = [];

export const SettingsView: React.FC = () => {
  const [modules, setModules] = useState<ModuleManifest[]>([]);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  
  // 側邊欄導覽
  const [activeTab, setActiveTab] = useState<string>('mailAccounts');

  // 外觀風格狀態
  const [appearanceMode, setAppearanceMode] = useState<string>(() => {
    try {
      const raw = localStorage.getItem('focusd-island-settings');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.appearanceMode) {
          return parsed.appearanceMode === 'classic' ? 'whiteGlass' : parsed.appearanceMode;
        }
      }
    } catch {
      // 忽略
    }
    return 'pureBlack';
  });

  // 信箱帳戶多帳號設定
  const [mailAccounts, setMailAccounts] = useState<MailAccountConfig[]>(() => {
    try {
      const raw = localStorage.getItem(MAIL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // 忽略
    }
    return DEFAULT_MAIL_ACCOUNTS;
  });

  // 新增 / 編輯信箱表單狀態
  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [accountForm, setAccountForm] = useState<MailAccountConfig>({
    id: '',
    name: '',
    email: '',
    imapHost: '',
    imapPort: 993,
    authToken: '',
    color: '#3b82f6',
    enabled: true,
  });

  // 待辦 Markdown 內容狀態
  const [todoMarkdown, setTodoMarkdown] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(TODO_STORAGE_KEY);
      if (stored) {
        const todos: TodoItem[] = JSON.parse(stored);
        return todosToMarkdown(todos);
      }
    } catch {
      // 忽略
    }
    return "# 今日待辦事項\n\n";
  });

  // 全域設定儲存提示與本機路徑
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [todoSavePath, setTodoSavePath] = useState<string>('');

  useEffect(() => {
    Promise.all([
      invoke<ModuleManifest[]>('get_available_modules'),
      invoke<AppConfig>('get_app_config'),
    ]).then(([fetchedModules, fetchedConfig]) => {
      setModules(fetchedModules);
      setAppConfig(fetchedConfig);
    }).catch((err) => {
      console.error('載入模組或設定失敗:', err);
    });

    // 啟動時讀取磁碟上的待辦 Markdown 檔案（開啟就是要讀檔）
    const today = new Date().toISOString().slice(0, 10);
    invoke<string>('get_default_todo_save_directory')
      .then((dir) => {
        setTodoSavePath(dir);
        return invoke<string>('read_todo_markdown', { directory: dir, date: today });
      })
      .then((diskContent) => {
        if (diskContent && diskContent.trim().length > 0) {
          setTodoMarkdown(diskContent);
          const parsed = markdownToTodos(diskContent);
          if (parsed.length > 0) {
            localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(parsed));
          }
        }
      })
      .catch((err) => {
        console.warn('讀取本機待辦 Markdown 檔案略過或失敗:', err);
      });
  }, []);

  // 全域統一儲存與即時同步
  const handleSaveAllSettings = async () => {
    try {
      // 1. 儲存外觀風格
      let settingsObj: Record<string, any> = {};
      try {
        const raw = localStorage.getItem('focusd-island-settings');
        if (raw) settingsObj = JSON.parse(raw);
      } catch {}
      settingsObj.appearanceMode = appearanceMode;
      localStorage.setItem('focusd-island-settings', JSON.stringify(settingsObj));

      // 2. 儲存多信箱帳戶
      localStorage.setItem(MAIL_STORAGE_KEY, JSON.stringify(mailAccounts));

      // 3. 儲存待辦事項（解析 Markdown 寫入 localStorage，並持久化至磁碟 Markdown 檔案）
      const parsedTodos = markdownToTodos(todoMarkdown);
      localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(parsedTodos));

      const today = new Date().toISOString().slice(0, 10);
      const targetDir = todoSavePath || (await invoke<string>('get_default_todo_save_directory'));
      await invoke('save_todo_markdown', {
        directory: targetDir,
        date: today,
        content: todoMarkdown,
      }).catch((e) => console.warn('寫入磁碟 Markdown 檔案失敗:', e));

      // 4. 儲存全域 appConfig
      if (appConfig) {
        const updatedConfig = {
          ...appConfig,
          modules: {
            ...appConfig.modules,
            appearance: { mode: appearanceMode },
            mail: { accounts: mailAccounts },
          },
        };
        setAppConfig(updatedConfig);
        await invoke('save_full_app_config', { config: updatedConfig }).catch(() => {});
      }

      // 5. 廣播 storage 事件，通知靈動島主視窗立即同步重繪
      window.dispatchEvent(new Event('storage'));

      // 6. 成功反饋
      setSaveToast('✓ 設定與待辦清單已成功儲存至磁碟並即時同步！');
      setTimeout(() => setSaveToast(null), 3000);
    } catch (err) {
      console.error('儲存設定失敗:', err);
      setSaveToast('❌ 儲存失敗：' + String(err));
      setTimeout(() => setSaveToast(null), 3500);
    }
  };

  const saveMailAccounts = (accounts: MailAccountConfig[]) => {
    setMailAccounts(accounts);
    localStorage.setItem(MAIL_STORAGE_KEY, JSON.stringify(accounts));
    window.dispatchEvent(new Event('storage'));
  };

  const handleToggleModule = async (id: string, currentEnabled: boolean) => {
    try {
      const nextEnabled = !currentEnabled;
      await invoke('toggle_module_status', { id, enabled: nextEnabled });
      if (appConfig) {
        setAppConfig({
          ...appConfig,
          modules: {
            ...appConfig.modules,
            [id]: {
              ...(appConfig.modules[id] || {}),
              enabled: nextEnabled,
            },
          },
        });
      }
    } catch (err) {
      console.error('切換模組狀態失敗:', err);
    }
  };

  const handleModuleFormChange = async (moduleId: string, key: string, val: any) => {
    if (!appConfig) return;
    const currentModuleConf = appConfig.modules[moduleId] || {};
    const updated = { ...currentModuleConf, [key]: val };

    setAppConfig({
      ...appConfig,
      modules: {
        ...appConfig.modules,
        [moduleId]: updated,
      },
    });

    try {
      await invoke('save_module_config', { id: moduleId, moduleConfig: updated });
    } catch (err) {
      console.error('儲存模組設定失敗:', err);
    }
  };

  const handlePriorityPolicyChange = async (newPolicy: PriorityConfig) => {
    if (!appConfig) return;
    setAppConfig({ ...appConfig, priority_policy: newPolicy });
    try {
      await invoke('save_priority_policy', { policy: newPolicy });
    } catch (err) {
      console.error('儲存優先權策略失敗:', err);
    }
  };

  const handleSelectAppearanceMode = (mode: string) => {
    setAppearanceMode(mode);
    try {
      const raw = localStorage.getItem('focusd-island-settings');
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.appearanceMode = mode;
      localStorage.setItem('focusd-island-settings', JSON.stringify(parsed));
      window.dispatchEvent(new Event('storage'));
    } catch (err) {
      console.error('儲存外觀模式失敗:', err);
    }
  };

  // 信箱增刪改
  const handleAddNewAccount = () => {
    setAccountForm({
      id: Date.now().toString(),
      name: '',
      email: '',
      imapHost: 'imap.gmail.com',
      imapPort: 993,
      authToken: '',
      color: '#3b82f6',
      enabled: true,
    });
    setIsEditingAccount(true);
  };

  const handleEditAccount = (acc: MailAccountConfig) => {
    setAccountForm({ ...acc });
    setIsEditingAccount(true);
  };

  const handleDeleteAccount = (id: string) => {
    const updated = mailAccounts.filter((a) => a.id !== id);
    saveMailAccounts(updated);
  };

  const handleToggleAccountEnabled = (id: string) => {
    const updated = mailAccounts.map((a) =>
      a.id === id ? { ...a, enabled: !a.enabled } : a,
    );
    saveMailAccounts(updated);
  };

  const handleSaveAccountForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountForm.name.trim() || !accountForm.email.trim()) return;

    const exists = mailAccounts.some((a) => a.id === accountForm.id);
    let updated: MailAccountConfig[];
    if (exists) {
      updated = mailAccounts.map((a) =>
        a.id === accountForm.id ? accountForm : a,
      );
    } else {
      updated = [...mailAccounts, accountForm];
    }
    saveMailAccounts(updated);
    setIsEditingAccount(false);
  };

  if (!appConfig) {
    return <div className="settings-loading">載入設定中心中...</div>;
  }

  const currentModule = modules.find((m) => m.id === activeTab);
  const isCurrentEnabled = currentModule
    ? (appConfig.modules[currentModule.id]?.enabled ?? currentModule.enabled_by_default ?? true)
    : false;

  return (
    <div className="settings-window">
      {/* 側邊導覽列 */}
      <div className="settings-sidebar">
        <div className="sidebar-brand">
          <div className="brand-title">靈動島設定</div>
          <div className="brand-subtitle">Desktop Island</div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-group-label">信箱與通訊</div>
          <button
            className={`nav-tab-btn ${activeTab === 'mailAccounts' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('mailAccounts');
              setIsEditingAccount(false);
            }}
          >
            <span className="nav-icon">✉️</span>
            <span className="nav-btn-text">多信箱管理</span>
          </button>

          <div className="sidebar-group-label mt-4">個人化風格</div>
          <button
            className={`nav-tab-btn ${activeTab === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveTab('appearance')}
          >
            <span className="nav-icon">🎨</span>
            <span className="nav-btn-text">外觀風格</span>
          </button>

          <div className="sidebar-group-label mt-4">任務與待辦</div>
          <button
            className={`nav-tab-btn ${activeTab === 'todoMarkdown' ? 'active' : ''}`}
            onClick={() => setActiveTab('todoMarkdown')}
          >
            <span className="nav-icon">📝</span>
            <span className="nav-btn-text">待辦清單 Markdown</span>
          </button>

          <div className="sidebar-group-label mt-4">功能模組外掛</div>
          {modules.map((m) => {
            const isEnabled = appConfig.modules[m.id]?.enabled ?? m.enabled_by_default;
            return (
              <button
                key={m.id}
                className={`nav-tab-btn ${activeTab === m.id ? 'active' : ''}`}
                onClick={() => setActiveTab(m.id)}
              >
                <span className={`status-indicator ${isEnabled ? 'on' : 'off'}`} />
                <span className="nav-btn-text">{m.name}</span>
              </button>
            );
          })}

          <div className="sidebar-group-label mt-4">全域系統排程</div>
          <button
            className={`nav-tab-btn ${activeTab === 'priority' ? 'active' : ''}`}
            onClick={() => setActiveTab('priority')}
          >
            <span className="nav-icon">⚖️</span>
            <span className="nav-btn-text">優先權排程調度</span>
          </button>

          <button
            className={`nav-tab-btn ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => setActiveTab('about')}
          >
            <span className="nav-icon">ℹ️</span>
            <span className="nav-btn-text">關於本軟體</span>
          </button>
        </nav>
      </div>

      {/* 主內容區塊 */}
      <div className="settings-content">
        {/* 全域頂部狀態與儲存按鍵列 */}
        <div className="settings-global-header">
          <div className="global-header-info">
            <span className="global-status-dot" />
            <span className="global-status-text">設定中心即時連線中</span>
          </div>
          <div className="global-header-actions">
            {saveToast && <span className="save-toast-pill">{saveToast}</span>}
            <button
              type="button"
              className="global-save-btn"
              onClick={handleSaveAllSettings}
              title="儲存所有設定並立即同步至靈動島與磁碟檔案"
            >
              <Save size={14} />
              <span>儲存並同步設定</span>
            </button>
          </div>
        </div>

        {/* 多信箱管理子分頁 */}
        {activeTab === 'mailAccounts' && (
          <div className="mail-settings-panel">
            <div className="panel-header-with-action">
              <div>
                <h3 className="panel-title">多信箱帳戶管理</h3>
                <p className="panel-subtitle">
                  可自訂多個信箱（Gmail、學校信箱、公務 Mail2000 等），自訂島上標籤名稱與驗證碼提取。
                </p>
              </div>
              {!isEditingAccount && (
                <button
                  type="button"
                  className="primary-action-btn"
                  onClick={handleAddNewAccount}
                >
                  <Plus size={14} />
                  <span>新增信箱帳戶</span>
                </button>
              )}
            </div>

            {/* 新增/編輯信箱表單 */}
            {isEditingAccount ? (
              <form className="account-form-card" onSubmit={handleSaveAccountForm}>
                <h4 className="form-title">
                  {mailAccounts.some((a) => a.id === accountForm.id)
                    ? '編輯信箱帳戶'
                    : '新增信箱帳戶'}
                </h4>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">自訂標籤名稱 (顯示在島上)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="例：個人 Gmail / 台大校園信箱 / 工作"
                      value={accountForm.name}
                      onChange={(e) =>
                        setAccountForm({ ...accountForm, name: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">電子郵件帳號 (Email)</label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="例：username@gmail.com 或 student@ntu.edu.tw"
                      value={accountForm.email}
                      onChange={(e) =>
                        setAccountForm({ ...accountForm, email: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">IMAP 伺服器主機</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="例：imap.gmail.com 或 mail.edu.tw"
                      value={accountForm.imapHost}
                      onChange={(e) =>
                        setAccountForm({ ...accountForm, imapHost: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">連接埠 (Port)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={accountForm.imapPort}
                      onChange={(e) =>
                        setAccountForm({
                          ...accountForm,
                          imapPort: parseInt(e.target.value) || 993,
                        })
                      }
                      required
                    />
                  </div>

                  <div className="form-group form-col-span-2">
                    <label className="form-label">
                      應用程式專用密碼 / 授權密碼 (App Password)
                    </label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="選填，用於自動後台輪詢擷取驗證碼"
                      value={accountForm.authToken || ''}
                      onChange={(e) =>
                        setAccountForm({
                          ...accountForm,
                          authToken: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="form-group form-col-span-2">
                    <label className="form-label">標籤代表色彩</label>
                    <div className="color-picker-row">
                      {['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'].map(
                        (col) => (
                          <div
                            key={col}
                            className={`color-circle ${
                              accountForm.color === col ? 'selected' : ''
                            }`}
                            style={{ backgroundColor: col }}
                            onClick={() =>
                              setAccountForm({ ...accountForm, color: col })
                            }
                          />
                        ),
                      )}
                    </div>
                  </div>
                </div>

                <div className="form-actions-row">
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => setIsEditingAccount(false)}
                  >
                    取消
                  </button>
                  <button type="submit" className="save-btn">
                    <Check size={14} />
                    <span>確認儲存</span>
                  </button>
                </div>
              </form>
            ) : (
              /* 信箱帳戶清單 */
              <div className="accounts-list">
                {mailAccounts.length === 0 ? (
                  <div className="accounts-empty">
                    <Mail size={32} opacity={0.3} />
                    <p>目前尚未配置任何信箱帳戶，點擊上方按鈕立即新增。</p>
                  </div>
                ) : (
                  mailAccounts.map((acc) => (
                    <div key={acc.id} className="account-card">
                      <div className="account-card-left">
                        <span
                          className="account-tag-badge"
                          style={{
                            backgroundColor: `${acc.color}22`,
                            color: acc.color,
                            borderColor: `${acc.color}55`,
                          }}
                        >
                          {acc.name}
                        </span>
                        <div className="account-meta">
                          <div className="account-email">{acc.email}</div>
                          <div className="account-host">
                            {acc.imapHost}:{acc.imapPort}
                          </div>
                        </div>
                      </div>

                      <div className="account-card-right">
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={acc.enabled}
                            onChange={() => handleToggleAccountEnabled(acc.id)}
                          />
                          <span className="slider" />
                        </label>
                        <button
                          type="button"
                          className="icon-action-btn"
                          onClick={() => handleEditAccount(acc)}
                          title="編輯此帳戶"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-action-btn delete"
                          onClick={() => handleDeleteAccount(acc.id)}
                          title="刪除此帳戶"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* 外觀風格獨立子分頁 */}
        {activeTab === 'appearance' && (
          <div className="appearance-panel">
            <div className="panel-header">
              <h3 className="panel-title">外觀風格選擇</h3>
              <p className="panel-subtitle">請選擇桌面靈動島的視覺風格，切換後將即時生效於島嶼視窗。</p>
            </div>

            <div className="theme-grid">
              {/* 純黑純色 */}
              <div
                className={`theme-card ${appearanceMode === 'pureBlack' ? 'selected' : ''}`}
                onClick={() => handleSelectAppearanceMode('pureBlack')}
              >
                <div className="theme-preview pure-black-preview">
                  <div className="preview-dot" />
                  <div className="preview-line" />
                </div>
                <div className="theme-info">
                  <div className="theme-name">純黑純色 (Pure Black)</div>
                  <div className="theme-desc">純黑不透明底色，高對比明亮白字與細緻高雅邊框，極致沉浸低干擾。</div>
                </div>
                {appearanceMode === 'pureBlack' && <span className="theme-badge">當前使用中</span>}
              </div>

              {/* 純白純色 */}
              <div
                className={`theme-card ${appearanceMode === 'pureWhite' ? 'selected' : ''}`}
                onClick={() => handleSelectAppearanceMode('pureWhite')}
              >
                <div className="theme-preview pure-white-preview">
                  <div className="preview-dot dark-dot" />
                  <div className="preview-line dark-line" />
                </div>
                <div className="theme-info">
                  <div className="theme-name">純白純色 (Pure White)</div>
                  <div className="theme-desc">純白底色，精緻墨黑文字與輕柔邊界，明亮俐落乾淨清爽。</div>
                </div>
                {appearanceMode === 'pureWhite' && <span className="theme-badge">當前使用中</span>}
              </div>

              {/* 黑玻璃 */}
              <div
                className={`theme-card ${appearanceMode === 'liquidGlass' ? 'selected' : ''}`}
                onClick={() => handleSelectAppearanceMode('liquidGlass')}
              >
                <div className="theme-preview liquid-glass-preview">
                  <div className="preview-dot" />
                  <div className="preview-line" />
                </div>
                <div className="theme-info">
                  <div className="theme-name">黑玻璃 (Dark Glass)</div>
                  <div className="theme-desc">暗黑半透明液態毛玻璃，具備光學邊緣色散、游標光斑跟隨與環境背景自然融合。</div>
                </div>
                {appearanceMode === 'liquidGlass' && <span className="theme-badge">當前使用中</span>}
              </div>

              {/* 白玻璃 */}
              <div
                className={`theme-card ${appearanceMode === 'whiteGlass' || appearanceMode === 'classic' ? 'selected' : ''}`}
                onClick={() => handleSelectAppearanceMode('whiteGlass')}
              >
                <div className="theme-preview white-glass-preview">
                  <div className="preview-dot dark-dot" />
                  <div className="preview-line dark-line" />
                </div>
                <div className="theme-info">
                  <div className="theme-name">白玻璃 (White Glass)</div>
                  <div className="theme-desc">亮白半透明磨砂毛玻璃，純淨通透高雅，明亮環境下自然融入桌面。</div>
                </div>
                {(appearanceMode === 'whiteGlass' || appearanceMode === 'classic') && <span className="theme-badge">當前使用中</span>}
              </div>
            </div>
          </div>
        )}

        {/* 待辦事項 Markdown 編輯子分頁 */}
        {activeTab === 'todoMarkdown' && (
          <div className="todo-markdown-panel">
            <div className="panel-header-with-action">
              <div>
                <h3 className="panel-title">待辦清單 Markdown 編輯器</h3>
                <p className="panel-subtitle">
                  直接在此以 Markdown 格式編修任務（支援 <code>- [ ]</code> 未完成與 <code>- [x]</code> 已完成語法）。儲存後將同步至磁碟 <code>.md</code> 檔案與島嶼待辦分頁。
                </p>
              </div>
              <div className="todo-md-header-actions">
                <button
                  type="button"
                  className="secondary-action-btn"
                  onClick={() => {
                    try {
                      const stored = localStorage.getItem(TODO_STORAGE_KEY);
                      if (stored) {
                        setTodoMarkdown(todosToMarkdown(JSON.parse(stored)));
                        setSaveToast('✓ 已從島嶼待辦重新載入！');
                        setTimeout(() => setSaveToast(null), 2000);
                      }
                    } catch {}
                  }}
                  title="從目前島嶼待辦清單重新載入"
                >
                  <RefreshCw size={13} />
                  <span>重新載入</span>
                </button>
                <button
                  type="button"
                  className="primary-action-btn"
                  onClick={handleSaveAllSettings}
                  title="儲存 Markdown 並同步更新至島嶼待辦分頁與磁碟檔案"
                >
                  <Save size={14} />
                  <span>儲存並同步待辦</span>
                </button>
              </div>
            </div>

            {/* Markdown 編輯器主體 */}
            <div className="todo-editor-container">
              <div className="editor-toolbar">
                <div className="editor-stats">
                  <span>本機存檔路徑：<code>{todoSavePath ? `${todoSavePath}\\${new Date().toISOString().slice(0, 10)}.md` : '預設文件目錄'}</code></span>
                </div>
                <div className="editor-stats-right">
                  <span>總計 <b>{markdownToTodos(todoMarkdown).length}</b> 項任務</span>
                  <span>已完成 <b>{markdownToTodos(todoMarkdown).filter((t) => t.completed).length}</b> 項</span>
                </div>
              </div>

              <textarea
                className="todo-markdown-textarea"
                value={todoMarkdown}
                onChange={(e) => setTodoMarkdown(e.target.value)}
                placeholder="# 今日待辦事項&#10;&#10;- [ ] 寫入第一項任務&#10;- [x] 已完成任務&#10;- [ ] 記得按儲存同步"
                rows={15}
                spellCheck={false}
              />

              <div className="markdown-cheatsheet-card">
                <div className="cheatsheet-title">💡 Markdown 待辦語法快速指南：</div>
                <div className="cheatsheet-grid">
                  <div className="cheatsheet-item"><code>- [ ] 任務名稱</code> <span>未完成任務（島上顯示空選框）</span></div>
                  <div className="cheatsheet-item"><code>- [x] 任務名稱</code> <span>已完成任務（島上顯示勾選劃除線）</span></div>
                  <div className="cheatsheet-item"><code>- 事項名稱</code> <span>普通清單項目（自動轉換為待辦）</span></div>
                  <div className="cheatsheet-item"><code># 標題文字</code> <span>純分類標題（保留於檔案中）</span></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentModule && (
          <div className="module-detail-card">
            <div className="module-detail-header">
              <div>
                <h3 className="module-title">{currentModule.name}</h3>
                <p className="module-meta">{currentModule.description}</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={isCurrentEnabled}
                  onChange={() => handleToggleModule(currentModule.id, isCurrentEnabled)}
                />
                <span className="slider" />
              </label>
            </div>

            <div className="module-form-wrapper">
              <DynamicForm
                schema={currentModule.settings_schema}
                values={appConfig.modules[currentModule.id] || {}}
                onChange={(k, v) => handleModuleFormChange(currentModule.id, k, v)}
              />
            </div>
          </div>
        )}

        {activeTab === 'priority' && (
          <div className="priority-panel">
            <PrioritySettings
              config={appConfig.priority_policy}
              modules={modules}
              onChange={handlePriorityPolicyChange}
            />
          </div>
        )}

        {activeTab === 'about' && (
          <div className="about-panel">
            <h3 className="about-title">Desktop Island</h3>
            <p className="about-desc">
              以輕量高效為原則，具備獨立資料夾插件擴充、瀏覽器風格分頁、通用開放協定整合與多階優先權排程調度的 Windows 桌面靈動島。
            </p>
            <div className="about-specs">
              <div className="spec-item">
                <span className="spec-label">前端架構</span>
                <span className="spec-val">React 19 + TypeScript + Vite</span>
              </div>
              <div className="spec-item">
                <span className="spec-label">原生核心</span>
                <span className="spec-val">Tauri 2 + Rust 2021 + Windows API</span>
              </div>
              <div className="spec-item">
                <span className="spec-label">語言介面</span>
                <span className="spec-val">繁體中文 (Traditional Chinese)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
