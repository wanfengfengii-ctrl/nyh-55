import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseReplayable } from './BaseReplayable';

interface TestFrame {
  id: number;
  value: string;
}

class MockReplayable extends BaseReplayable<TestFrame> {
  public appliedFrames: { frame: TestFrame; index: number }[] = [];
  private _frames: TestFrame[] = [];

  setMockFrames(frames: TestFrame[]): void {
    this._frames = frames;
  }

  public buildFrames(): TestFrame[] {
    return this._frames;
  }

  protected applyFrame(frame: TestFrame, index: number): void {
    this.appliedFrames.push({ frame, index });
  }
}

describe('BaseReplayable', () => {
  let replayable: MockReplayable;
  const testFrames: TestFrame[] = [
    { id: 0, value: 'first' },
    { id: 1, value: 'second' },
    { id: 2, value: 'third' },
  ];

  beforeEach(() => {
    replayable = new MockReplayable();
    replayable.setMockFrames(testFrames);
  });

  describe('初始状态', () => {
    it('应正确初始化', () => {
      expect(replayable.isReplaying).toBe(false);
      expect(replayable.replayIndex).toBe(-1);
      expect(replayable.replayFrames).toEqual([]);
      expect(replayable.canReplay()).toBe(false);
    });
  });

  describe('buildFrames 和 canReplay', () => {
    it('buildFrames 后 canReplay 应为 true', () => {
      const frames = replayable.buildFrames();
      expect(frames).toHaveLength(3);
      replayable['_replayFrames'] = frames;
      expect(replayable.canReplay()).toBe(true);
    });
  });

  describe('回放控制', () => {
    beforeEach(() => {
      replayable['_replayFrames'] = testFrames;
    });

    it('replayNext 应逐帧应用', () => {
      expect(replayable.replayNext()).toBe(true);
      expect(replayable.replayIndex).toBe(0);
      expect(replayable.appliedFrames).toHaveLength(1);
      expect(replayable.appliedFrames[0].frame.value).toBe('first');

      expect(replayable.replayNext()).toBe(true);
      expect(replayable.replayIndex).toBe(1);
      expect(replayable.appliedFrames[1].frame.value).toBe('second');
    });

    it('replayNext 到末尾应返回 false 并停止', () => {
      replayable.replayNext();
      replayable.replayNext();
      const result = replayable.replayNext();
      expect(result).toBe(true);
      expect(replayable.replayIndex).toBe(2);

      const endResult = replayable.replayNext();
      expect(endResult).toBe(false);
      expect(replayable.isReplaying).toBe(false);
    });

    it('replayPrev 应回退上一帧', () => {
      replayable.replayNext();
      replayable.replayNext();
      expect(replayable.replayIndex).toBe(1);

      expect(replayable.replayPrev()).toBe(true);
      expect(replayable.replayIndex).toBe(0);
      expect(replayable.appliedFrames).toHaveLength(3);
    });

    it('replayPrev 在起点应返回 false', () => {
      expect(replayable.replayPrev()).toBe(false);
    });

    it('replayGoto 应跳到指定帧', () => {
      replayable.replayGoto(2);
      expect(replayable.replayIndex).toBe(2);
      expect(replayable.appliedFrames[0].frame.value).toBe('third');
    });

    it('replayGoto 应限制边界', () => {
      replayable.replayGoto(999);
      expect(replayable.replayIndex).toBe(2);

      replayable.replayGoto(-100);
      expect(replayable.replayIndex).toBe(0);
    });
  });

  describe('startReplay / stopReplay', () => {
    beforeEach(() => {
      replayable['_replayFrames'] = testFrames;
    });

    it('startReplay 应从第一帧开始', () => {
      replayable.startReplay();
      expect(replayable.isReplaying).toBe(true);
      expect(replayable.replayIndex).toBe(0);
    });

    it('stopReplay 应重置状态', () => {
      replayable.startReplay();
      replayable.stopReplay();
      expect(replayable.isReplaying).toBe(false);
      expect(replayable.replayIndex).toBe(-1);
    });

    it('pauseReplay 和 resumeReplay 应工作', () => {
      replayable.startReplay();
      replayable.pauseReplay();
      expect(replayable.isReplaying).toBe(false);

      replayable.resumeReplay();
      expect(replayable.isReplaying).toBe(true);
    });
  });

  describe('setReplaySpeed', () => {
    it('应限制在 0.25 到 4 之间', () => {
      replayable.setReplaySpeed(10);
      expect(replayable['_replaySpeed']).toBe(4);

      replayable.setReplaySpeed(0.1);
      expect(replayable['_replaySpeed']).toBe(0.25);

      replayable.setReplaySpeed(2);
      expect(replayable['_replaySpeed']).toBe(2);
    });
  });

  describe('setFrameChangeHandler', () => {
    it('应在帧变化时调用回调', () => {
      const handler = vi.fn();
      replayable.setFrameChangeHandler(handler);
      replayable['_replayFrames'] = testFrames;

      replayable.replayNext();
      expect(handler).toHaveBeenCalledWith(testFrames[0], 0);
    });
  });

  describe('destroy', () => {
    it('应清理状态', () => {
      replayable['_replayFrames'] = testFrames;
      replayable.startReplay();
      replayable.destroy();

      expect(replayable.isReplaying).toBe(false);
      expect(replayable.replayIndex).toBe(-1);
      expect(replayable.replayFrames).toEqual([]);
    });
  });
});
