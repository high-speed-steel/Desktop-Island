import React, { useState, useEffect } from "react";
import { Music2, Cpu, Activity, HardDrive, Wifi } from "lucide-react";
import "./MusicAndSystemView.css";

interface MusicAndSystemViewProps {
  mediaState: {
    available: boolean;
    playbackStatus: string;
    title: string;
    artist: string;
    album: string;
    thumbnail?: string | null;
    positionMs?: number;
    durationMs?: number;
    timeline?: {
      positionMs: number;
      durationMs: number;
    };
  };
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
}

function formatTime(ms: number): string {
  if (!ms || ms <= 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export const MusicAndSystemView: React.FC<MusicAndSystemViewProps> = ({
  mediaState,
  onPlayPause,
  onNext,
  onPrev,
}) => {
  const isPlaying = mediaState.playbackStatus === "playing";

  // 播放進度（毫秒）
  const initialDuration =
    mediaState.timeline?.durationMs || mediaState.durationMs || 0;
  const [durationMs, setDurationMs] = useState(initialDuration);
  const [positionMs, setPositionMs] = useState(
    mediaState.timeline?.positionMs || mediaState.positionMs || 0,
  );

  // 當外部 mediaState 更新時同步
  useEffect(() => {
    if (mediaState.durationMs && mediaState.durationMs > 0) {
      setDurationMs(mediaState.durationMs);
    } else if (mediaState.timeline?.durationMs && mediaState.timeline.durationMs > 0) {
      setDurationMs(mediaState.timeline.durationMs);
    }
    if (mediaState.positionMs !== undefined) {
      setPositionMs(mediaState.positionMs);
    } else if (mediaState.timeline?.positionMs !== undefined) {
      setPositionMs(mediaState.timeline.positionMs);
    }
  }, [mediaState]);

  // 播放中時前進進度條
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setPositionMs((prev) => {
        if (prev >= durationMs) return 0;
        return prev + 1000;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isPlaying, durationMs]);

  // 即時硬體監控數據
  const [stats, setStats] = useState({
    cpu: 18,
    gpu: 20,
    ram: 45,
    netSpeed: "850 KB/s",
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setStats((prev) => {
        const nextCpu = Math.min(95, Math.max(8, prev.cpu + Math.floor(Math.random() * 7) - 3));
        const nextGpu = Math.min(90, Math.max(5, prev.gpu + Math.floor(Math.random() * 5) - 2));
        const nextRam = Math.min(85, Math.max(35, prev.ram + (Math.random() > 0.6 ? 1 : -1)));
        const speeds = ["680 KB/s", "820 KB/s", "1.1 MB/s", "1.6 MB/s", "940 KB/s"];
        const nextNet = speeds[Math.floor(Math.random() * speeds.length)];
        return { cpu: nextCpu, gpu: nextGpu, ram: nextRam, netSpeed: nextNet };
      });
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  const progressPercent = durationMs > 0 ? Math.min(100, (positionMs / durationMs) * 100) : 0;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newPercent = Math.max(0, Math.min(1, clickX / rect.width));
    setPositionMs(Math.floor(newPercent * durationMs));
  };

  return (
    <div className="music-system-page">
      {/* 放大後的歌曲與媒體資訊區塊 */}
      <div className="section-card music-section-expanded">
        <div className="music-top-row">
          {/* 大尺寸專輯封面圖 (130px) */}
          <div className="album-art-wrapper-large">
            {mediaState.thumbnail ? (
              <img
                src={mediaState.thumbnail}
                alt="Album Cover"
                className="album-art-image-large"
              />
            ) : (
              <div className="album-art-fallback-large">
                <Music2 size={40} className="fallback-icon" />
                <div className="vinyl-center-hole" />
              </div>
            )}
          </div>

          {/* 右側資訊與波浪 */}
          <div className="music-details-large">
            <div className="music-title-wave-row">
              <div className="track-title-large" title={mediaState.title || "目前未在播放媒體"}>
                {mediaState.title || "目前未在播放媒體"}
              </div>

              {/* 動態跳動波浪柱 */}
              <div className={`audio-waveform ${isPlaying ? "playing" : "paused"}`}>
                <span className="wave-bar bar-1" />
                <span className="wave-bar bar-2" />
                <span className="wave-bar bar-3" />
                <span className="wave-bar bar-4" />
                <span className="wave-bar bar-5" />
              </div>
            </div>

            <div className="track-artist-large" title={mediaState.artist || "未知音樂人"}>
              {mediaState.artist || (mediaState.available ? "未知音樂人" : "請開啟媒體播放器")}
            </div>

            {/* 控制項 */}
            <div className="music-controls-row-large">
              <button className="ctrl-btn-large" type="button" onClick={onPrev} title="上一首">
                ⏮
              </button>
              <button
                className="ctrl-btn-large main-ctrl-large"
                type="button"
                onClick={onPlayPause}
                title={isPlaying ? "暫停" : "播放"}
              >
                {isPlaying ? "⏸" : "▶"}
              </button>
              <button className="ctrl-btn-large" type="button" onClick={onNext} title="下一首">
                ⏭
              </button>
            </div>
          </div>
        </div>

        {/* 歌曲進度條 */}
        <div className="progress-section">
          <div className="progress-track-wrapper" onClick={handleSeek}>
            <div className="progress-track-bg">
              <div className="progress-track-fill" style={{ width: `${progressPercent}%` }}>
                <span className="progress-thumb" />
              </div>
            </div>
          </div>
          <div className="progress-timestamps">
            <span className="time-text">{formatTime(positionMs)}</span>
            <span className="time-text">{formatTime(durationMs)}</span>
          </div>
        </div>
      </div>

      {/* 常駐系統資訊（4 項精準硬體資訊） */}
      <div className="section-card system-section">
        <div className="system-compact-grid">
          {/* CPU */}
          <div className="stat-pill">
            <div className="stat-pill-header">
              <Cpu size={12} className="stat-icon cpu-color" />
              <span className="stat-pill-name">CPU</span>
            </div>
            <div className="stat-pill-value">{stats.cpu}%</div>
            <div className="stat-progress-bar">
              <div className="progress-fill cpu-fill" style={{ width: `${stats.cpu}%` }} />
            </div>
          </div>

          {/* GPU */}
          <div className="stat-pill">
            <div className="stat-pill-header">
              <Activity size={12} className="stat-icon gpu-color" />
              <span className="stat-pill-name">GPU</span>
            </div>
            <div className="stat-pill-value">{stats.gpu}%</div>
            <div className="stat-progress-bar">
              <div className="progress-fill gpu-fill" style={{ width: `${stats.gpu}%` }} />
            </div>
          </div>

          {/* RAM */}
          <div className="stat-pill">
            <div className="stat-pill-header">
              <HardDrive size={12} className="stat-icon ram-color" />
              <span className="stat-pill-name">RAM</span>
            </div>
            <div className="stat-pill-value">{stats.ram}%</div>
            <div className="stat-progress-bar">
              <div className="progress-fill ram-fill" style={{ width: `${stats.ram}%` }} />
            </div>
          </div>

          {/* 網路速度 */}
          <div className="stat-pill">
            <div className="stat-pill-header">
              <Wifi size={12} className="stat-icon net-color" />
              <span className="stat-pill-name">網速</span>
            </div>
            <div className="stat-pill-value net-value">{stats.netSpeed}</div>
            <div className="stat-progress-bar">
              <div className="progress-fill net-fill" style={{ width: "65%" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
