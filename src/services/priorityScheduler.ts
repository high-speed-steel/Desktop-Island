/**
 * 靈動島顯示優先等級定義
 * Level 4: 瞬時插斷（驗證碼、大寫鎖定、檔案拖入）
 * Level 3: 持續活動（音樂播放中、AI 狀態燈）
 * Level 2: 概要面板（待辦清單、滑鼠懸停）
 * Level 1: 待機靜默
 */
export type IslandPriorityLevel = 1 | 2 | 3 | 4;

export interface IslandEvent {
  /** 事件唯一 ID */
  id: string;
  /** 所屬模組 ID */
  moduleId: string;
  /** 優先等級 (1~4) */
  priority: IslandPriorityLevel;
  /** 標題 */
  title: string;
  /** 內容或副標題 */
  body?: string;
  /** 圖示識別 */
  icon?: string;
  /** 自動消失停留毫秒數（僅適用於 Level 4 瞬時事件，0 代表不自動消失） */
  durationMs?: number;
  /** 建立時間戳記 */
  createdAt: number;
}

export type IslandScheduleCallback = (currentEvent: IslandEvent | null) => void;

export class IslandPriorityScheduler {
  private currentEvent: IslandEvent | null = null;
  private previousEventStack: IslandEvent[] = [];
  private eventQueue: IslandEvent[] = [];
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<IslandScheduleCallback> = new Set();

  /** 註冊狀態變更監聽器 */
  public subscribe(cb: IslandScheduleCallback): () => void {
    this.listeners.add(cb);
    cb(this.currentEvent);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach((cb) => cb(this.currentEvent));
  }

  /** 發送新事件至靈動島排程調度器 */
  public pushEvent(event: IslandEvent) {
    if (!this.currentEvent) {
      this.activateEvent(event);
      return;
    }

    // 若新事件權重大於目前展示事件：執行搶佔插斷
    if (event.priority > this.currentEvent.priority) {
      if (this.dismissTimer) {
        clearTimeout(this.dismissTimer);
        this.dismissTimer = null;
      }
      this.previousEventStack.push(this.currentEvent);
      this.activateEvent(event);
    } else {
      // 權重較低或相等，推入佇列排隊
      this.eventQueue.push(event);
      this.eventQueue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    }
  }

  /** 啟動並展示事件 */
  private activateEvent(event: IslandEvent) {
    this.currentEvent = event;
    this.notify();

    // 若為瞬時事件且帶有停留時間，啟動倒數計時平滑回退
    if (event.priority === 4 && event.durationMs && event.durationMs > 0) {
      this.dismissTimer = setTimeout(() => {
        this.dismissCurrentEvent();
      }, event.durationMs);
    }
  }

  /** 結束或手動關閉當前事件，回退至前一狀態或佇列下一項 */
  public dismissCurrentEvent() {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }

    // 優先回退至之前被中斷的狀態
    if (this.previousEventStack.length > 0) {
      this.currentEvent = this.previousEventStack.pop() || null;
      this.notify();
      return;
    }

    // 否則取佇列中的下一筆事件
    if (this.eventQueue.length > 0) {
      const next = this.eventQueue.shift()!;
      this.activateEvent(next);
      return;
    }

    // 全部清空，回歸待機狀態
    this.currentEvent = null;
    this.notify();
  }

  /** 清除特定模組的所有事件 */
  public clearModuleEvents(moduleId: string) {
    this.eventQueue = this.eventQueue.filter((e) => e.moduleId !== moduleId);
    this.previousEventStack = this.previousEventStack.filter((e) => e.moduleId !== moduleId);
    if (this.currentEvent?.moduleId === moduleId) {
      this.dismissCurrentEvent();
    }
  }
}

export const islandScheduler = new IslandPriorityScheduler();
