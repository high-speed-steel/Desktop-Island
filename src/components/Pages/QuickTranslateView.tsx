import React, { useState } from "react";
import { Languages, ArrowRightLeft, Copy, Check, Sparkles } from "lucide-react";
import "./QuickTranslateView.css";

export const QuickTranslateView: React.FC = () => {
  const [sourceText, setSourceText] = useState("");
  const [targetText, setTargetText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleTranslate = () => {
    if (!sourceText.trim()) return;
    setIsTranslating(true);

    // 模擬快速中英互譯
    setTimeout(() => {
      setIsTranslating(false);
      if (/[\u4e00-\u9fa5]/.test(sourceText)) {
        setTargetText("This is the translated English result powered by Desktop Island.");
      } else {
        setTargetText("這是由 Desktop Island 快捷翻譯模組即時生成的繁體中文譯文。");
      }
    }, 400);
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
          placeholder="輸入或貼上欲翻譯的文字（支援快速中英切換）..."
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
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
            <span>{isTranslating ? "翻譯中..." : "立即翻譯"}</span>
          </button>
        </div>

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
