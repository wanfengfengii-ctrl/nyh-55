import type { IReplayable } from './types';

export abstract class BaseReplayable<TFrame> implements IReplayable<TFrame> {
  protected _replayFrames: TFrame[] = [];
  protected _replayIndex: number = -1;
  protected _isReplaying: boolean = false;
  protected _replaySpeed: number = 1;
  protected _replayTimer: ReturnType<typeof setInterval> | null = null;
  protected _onFrameChange?: (frame: TFrame, index: number) => void;

  get replayFrames(): TFrame[] {
    return this._replayFrames;
  }

  get replayIndex(): number {
    return this._replayIndex;
  }

  get isReplaying(): boolean {
    return this._isReplaying;
  }

  setFrameChangeHandler(handler: (frame: TFrame, index: number) => void): void {
    this._onFrameChange = handler;
  }

  abstract buildFrames(): TFrame[];

  canReplay(): boolean {
    return this._replayFrames.length > 0;
  }

  startReplay(): void {
    if (!this.canReplay()) return;
    if (this._isReplaying) return;
    this._replayIndex = -1;
    this._isReplaying = true;
    this.replayNext();
    this._scheduleAutoAdvance();
  }

  pauseReplay(): void {
    this._isReplaying = false;
    this._clearTimer();
  }

  resumeReplay(): void {
    if (this._replayFrames.length === 0) return;
    if (this._isReplaying) return;
    this._isReplaying = true;
    this._scheduleAutoAdvance();
  }

  stopReplay(): void {
    this._isReplaying = false;
    this._replayIndex = -1;
    this._clearTimer();
  }

  replayNext(): boolean {
    const nextIdx = this._replayIndex + 1;
    if (nextIdx >= this._replayFrames.length) {
      this.stopReplay();
      return false;
    }
    this._replayIndex = nextIdx;
    const frame = this._replayFrames[nextIdx];
    this.applyFrame(frame, nextIdx);
    this._onFrameChange?.(frame, nextIdx);
    return true;
  }

  replayPrev(): boolean {
    const prevIdx = this._replayIndex - 1;
    if (prevIdx < 0) return false;
    this._replayIndex = prevIdx;
    const frame = this._replayFrames[prevIdx];
    this.applyFrame(frame, prevIdx);
    this._onFrameChange?.(frame, prevIdx);
    return true;
  }

  replayGoto(index: number): void {
    const targetIdx = Math.max(0, Math.min(this._replayFrames.length - 1, index));
    this._replayIndex = targetIdx;
    const frame = this._replayFrames[targetIdx];
    if (frame) {
      this.applyFrame(frame, targetIdx);
      this._onFrameChange?.(frame, targetIdx);
    }
  }

  setReplaySpeed(speed: number): void {
    this._replaySpeed = Math.max(0.25, Math.min(4, speed));
    if (this._isReplaying) {
      this.pauseReplay();
      this.resumeReplay();
    }
  }

  protected abstract applyFrame(frame: TFrame, index: number): void;

  protected getReplayInterval(): number {
    return Math.max(300, 1500 / this._replaySpeed);
  }

  private _scheduleAutoAdvance(): void {
    this._clearTimer();
    this._replayTimer = setInterval(() => {
      if (this._isReplaying) {
        const hasMore = this.replayNext();
        if (!hasMore) {
          this.stopReplay();
        }
      }
    }, this.getReplayInterval());
  }

  private _clearTimer(): void {
    if (this._replayTimer) {
      clearInterval(this._replayTimer);
      this._replayTimer = null;
    }
  }

  destroy(): void {
    this._clearTimer();
    this._replayFrames = [];
    this._replayIndex = -1;
    this._isReplaying = false;
  }
}
