import React from 'react';

export interface SchemaField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'password' | 'boolean' | 'range';
  default: any;
  min?: number;
  max?: number;
  step?: number;
}

interface DynamicFormProps {
  schema: SchemaField[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
}

/**
 * 依據 Schema 自動產生的動態設定表單元件
 */
export const DynamicForm: React.FC<DynamicFormProps> = ({ schema, values, onChange }) => {
  return (
    <div className="dynamic-form-container">
      {schema.map((field) => {
        const val = values[field.key] ?? field.default;

        if (field.type === 'boolean') {
          return (
            <label key={field.key} className="dynamic-form-row form-checkbox-row">
              <span className="form-label">{field.label}</span>
              <input
                type="checkbox"
                checked={Boolean(val)}
                onChange={(e) => onChange(field.key, e.target.checked)}
                className="form-checkbox"
              />
            </label>
          );
        }

        if (field.type === 'range') {
          return (
            <div key={field.key} className="dynamic-form-col form-range-col">
              <div className="form-range-header">
                <span className="form-label">{field.label}</span>
                <span className="form-range-val">{val}</span>
              </div>
              <input
                type="range"
                min={field.min ?? 0}
                max={field.max ?? 100}
                step={field.step ?? 1}
                value={Number(val)}
                onChange={(e) => onChange(field.key, Number(e.target.value))}
                className="form-slider"
              />
            </div>
          );
        }

        return (
          <div key={field.key} className="dynamic-form-col form-input-col">
            <label className="form-label">{field.label}</label>
            <input
              type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
              value={val ?? ''}
              onChange={(e) =>
                onChange(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)
              }
              className="form-input"
            />
          </div>
        );
      })}
    </div>
  );
};
