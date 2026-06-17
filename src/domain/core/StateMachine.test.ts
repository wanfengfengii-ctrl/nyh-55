import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateMachine } from './StateMachine';
import { MECHANICAL_TRANSITIONS } from './StateMachine';

type TestState = 'idle' | 'running' | 'paused' | 'complete';
type TestEvent = 'start' | 'pause' | 'resume' | 'finish' | 'reset';

const TEST_TRANSITIONS: Record<TestState, Partial<Record<TestEvent, TestState>>> = {
  idle: { start: 'running' },
  running: { pause: 'paused', finish: 'complete' },
  paused: { resume: 'running', reset: 'idle' },
  complete: { reset: 'idle' },
};

describe('StateMachine', () => {
  let sm: StateMachine<TestState, TestEvent>;

  beforeEach(() => {
    sm = new StateMachine<TestState, TestEvent>('idle', TEST_TRANSITIONS);
  });

  describe('基础状态流转', () => {
    it('应使用初始状态创建', () => {
      expect(sm.currentState).toBe('idle');
    });

    it('应按合法转移表进行状态转换', () => {
      sm.transition('start');
      expect(sm.currentState).toBe('running');

      sm.transition('pause');
      expect(sm.currentState).toBe('paused');

      sm.transition('resume');
      expect(sm.currentState).toBe('running');

      sm.transition('finish');
      expect(sm.currentState).toBe('complete');
    });

    it('在非法转换时应保持原状态', () => {
      sm.transition('pause');
      expect(sm.currentState).toBe('idle');

      sm.transition('finish');
      expect(sm.currentState).toBe('idle');
    });
  });

  describe('canTransition', () => {
    it('应正确报告是否可转换', () => {
      expect(sm.canTransition('start')).toBe(true);
      expect(sm.canTransition('pause')).toBe(false);

      sm.transition('start');
      expect(sm.canTransition('pause')).toBe(true);
      expect(sm.canTransition('resume')).toBe(false);
    });
  });

  describe('订阅机制', () => {
    it('应在状态转换时通知订阅者', () => {
      const handler = vi.fn();
      const unsubscribe = sm.subscribe(handler);

      sm.transition('start');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('idle', 'running');

      unsubscribe();
      sm.transition('pause');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('应支持多个订阅者', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      sm.subscribe(h1);
      sm.subscribe(h2);

      sm.transition('start');
      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
    });

    it('在非法转换时不应触发订阅', () => {
      const handler = vi.fn();
      sm.subscribe(handler);

      sm.transition('finish');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('MECHANICAL_TRANSITIONS 预设', () => {
    it('应包含正确的机械状态转移', () => {
      const machine = new StateMachine('idle', MECHANICAL_TRANSITIONS);
      expect(machine.currentState).toBe('idle');

      machine.transition('initialize');
      expect(machine.currentState).toBe('idle');
    });
  });
});
