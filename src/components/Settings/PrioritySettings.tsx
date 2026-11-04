import React from 'react';

export interface PriorityConfig {
  urgent_display_duration_ms: number;
  allow_urgent_interrupt: boolean;
  custom_module_priority: Record<string, number>;
}

export interface ModuleManifest {
  id: string;
  name: string;
  description: string;
}

interface PrioritySettingsProps {
  config: PriorityConfig;
  modules: ModuleManifest[];
  onChange: (updated: PriorityConfig) => void;
}

const PRIORITY_LEVELS: Record<number, { title: string; desc: string }> = {
  4: { title: 'Level 4: 瞬時插斷 (最高)', desc: '強制插斷展開，彈跳卡片計時倒數' },
  3: { title: 'Level 3: 持續活動', desc: '活動期間優先常駐（如音樂播放、狀態燈）' },
  2: { title: 'Level 2: 概要面板', desc: '滑鼠懸停展開或背景狀態清單' },
  1: { title: 'Level 1: 靜默待機 (最低)', desc: '最小化緊湊膠囊展示' },
};

export const PrioritySettings: React.FC<PrioritySettingsProps> = ({ config, modules, onChange }) => {
  const handleLevelChange = (moduleId: string, level: number) => {
    onChange({
      ...config,
      custom_module_priority: {
        ...config.custom_module_priority,
        [moduleId]: level,
      },
    });
  };

  return (
    <div className="priority-settings-container">
      <div className="settings-section-header">
        <h3 className="section-title">靈動島展示排程與權重設定</h3>
        <p className="section-subtitle">
          當多個模組同時有新狀態或通知時，靈動島將優先展示較高層級的內容。
        </p>
      </div>

      <div className="priority-global-card">
        <label className="dynamic-form-row form-checkbox-row">
          <span className="form-label">允許插斷目前進行中的動畫與活動</span>
          <input
            type="checkbox"
            checked={config.allow_urgent_interrupt}
            onChange={(e) => onChange({ ...config, allow_urgent_interrupt: e.target.checked })}
            className="form-checkbox"
          />
        </label>

        <div className="dynamic-form-col form-range-col">
          <div className="form-range-header">
            <span className="form-label">插斷卡片停留時間 (秒)</span>
            <span className="form-range-val">
              {(config.urgent_display_duration_ms / 1000).toFixed(1)}s
            </span>
          </div>
          <input
            type="range"
            min="2000"
            max="12000"
            step="500"
            value={config.urgent_display_duration_ms}
            onChange={(e) =>
              onChange({ ...config, urgent_display_duration_ms: Number(e.target.value) })
            }
            className="form-slider"
          />
        </div>
      </div>

      <div className="priority-module-list">
        <div className="module-list-title">各模組優先層級分配</div>
        {modules.map((m) => {
          const currentLevel = config.custom_module_priority[m.id] ?? 2;
          const meta = PRIORITY_LEVELS[currentLevel] || PRIORITY_LEVELS[2];

          return (
            <div key={m.id} className="priority-module-item">
              <div className="module-info">
                <div className="module-name">{m.name}</div>
                <div className="module-desc">{meta.desc}</div>
              </div>

              <select
                value={currentLevel}
                onChange={(e) => handleLevelChange(m.id, Number(e.target.value))}
                className="priority-select"
              >
                <option value={4}>Level 4 (瞬時插斷)</option>
                <option value={3}>Level 3 (持續活動)</option>
                <option value={2}>Level 2 (概要面板)</option>
                <option value={1}>Level 1 (靜默待機)</option>
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
};
