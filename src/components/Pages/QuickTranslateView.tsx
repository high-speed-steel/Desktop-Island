import React, { useState } from "react";
import { Languages, ArrowRightLeft, Copy, Check, Sparkles, Cpu } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import "./QuickTranslateView.css";

export const QuickTranslateView: React.FC = () => {
  const [sourceText, setSourceText] = useState("");
  const [targetText, setTargetText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleTranslate = async () => {
    const text = sourceText.trim();
    if (!text || isTranslating) return;
    setIsTranslating(true);
    setError("");

    try {
      const result = await invoke<string>("translate_text", {
        text,
        direction: "auto",
      });
      setTargetText(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsTranslating(false);
    }
  };

  const handleCopy = () => {
    if (!targetText) return;
    navigator.clipboard.writeText(targetText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="quick-translate-page">
      <div className="translate-header">
        <div className="translate-title-group">
          <Languages size={16} className="text-indigo-400" />
          <span className="translate-title">快捷翻譯 (Quick Translate)</span>
          <span
            style={{
              fontSize: "10px",
              padding: "2px 6px",
              borderRadius: "4px",
              background: "rgba(99, 102, 241, 0.15)",
              color: "#818cf8",
              display: "inline-flex",
              alignItems: "center",
              gap: "3px",
              fontWeight: 500,
            }}
          >
            <Cpu size={10} /> 離線 Bergamot
          </span>
        </div>
        <div className="lang-tag">
          <span>自動識別</span>
          <ArrowRightLeft size={11} />
          <span>繁體中文 / English</span>
        </div>
      </div>

      <div className="translate-body">
        <textarea
          className="translate-input"
          placeholder="輸入或貼上欲翻譯的文字（本機離線 Marian NMT 模型，支援快速中英互譯）..."
          value={sourceText}
          onChange={(e) => {
            setSourceText(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void handleTranslate();
            }
          }}
          rows={3}
        />

        <div className="translate-action-bar">
          <button
            className="translate-btn"
            type="button"
            onClick={handleTranslate}
            disabled={!sourceText.trim() || isTranslating}
          >
            <Sparkles size={13} />
            <span>{isTranslating ? "本機翻譯中..." : "立即翻譯"}</span>
          </button>
        </div>

        {error && (
          <div
            style={{
              color: "#f87171",
              fontSize: "12px",
              padding: "6px 8px",
              background: "rgba(239, 68, 68, 0.1)",
              borderRadius: "6px",
              marginTop: "8px",
            }}
          >
            {error}
          </div>
        )}

        {targetText && (
          <div className="translate-result-card">
            <div className="result-header">
              <span className="result-label">翻譯結果</span>
              <button className="copy-result-btn" type="button" onClick={handleCopy}>
                {copied ? <Check size={12} /> : <Copy size={12} />}
                <span>{copied ? "已複製" : "複製結果"}</span>
              </button>
            </div>
            <div className="result-content">{targetText}</div>
          </div>
        )}
      </div>
    </div>
  );
};
