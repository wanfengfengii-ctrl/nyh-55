import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus, globalEventBus } from './EventBus';
import type { DomainEvent } from './types';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe('基础发布订阅', () => {
    it('应在发布事件时通知订阅者', () => {
      const handler = vi.fn();
      bus.subscribe('mechanical.initialized', handler);

      const event: DomainEvent = {
        id: 'test-1',
        type: 'mechanical.initialized',
        source: 'mechanical',
        timestamp: Date.now(),
        payload: { test: true },
      };

      bus.publish(event);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('应支持取消订阅', () => {
      const handler = vi.fn();
      const unsubscribe = bus.subscribe('mechanical.step.executed', handler);

      unsubscribe();
      bus.publish({
        id: 'test-2',
        type: 'mechanical.step.executed',
        source: 'mechanical',
        timestamp: Date.now(),
        payload: {},
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('同一事件可订阅多个处理器', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      bus.subscribe('animation.started', h1);
      bus.subscribe('animation.started', h2);

      bus.publish({
        id: 'test-3',
        type: 'animation.started',
        source: 'animation',
        timestamp: Date.now(),
        payload: {},
      });

      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
    });
  });

  describe('通配符订阅', () => {
    it('应支持 *.xxx 通配符', () => {
      const handler = vi.fn();
      bus.subscribe('*.started', handler);

      bus.publish({
        id: 't1',
        type: 'mechanical.started',
        source: 'mechanical',
        timestamp: 1,
        payload: {},
      });
      bus.publish({
        id: 't2',
        type: 'animation.started',
        source: 'animation',
        timestamp: 2,
        payload: {},
      });
      bus.publish({
        id: 't3',
        type: 'mechanical.step.executed',
        source: 'mechanical',
        timestamp: 3,
        payload: {},
      });

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('应支持 xxx.* 通配符', () => {
      const handler = vi.fn();
      bus.subscribe('mechanical.*', handler);

      bus.publish({
        id: 't1',
        type: 'mechanical.started',
        source: 'mechanical',
        timestamp: 1,
        payload: {},
      });
      bus.publish({
        id: 't2',
        type: 'animation.started',
        source: 'animation',
        timestamp: 2,
        payload: {},
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('应支持 *.* 匹配所有事件', () => {
      const handler = vi.fn();
      bus.subscribe('*', handler);

      bus.publish({
        id: 't1',
        type: 'mechanical.started',
        source: 'mechanical',
        timestamp: 1,
        payload: {},
      });
      bus.publish({
        id: 't2',
        type: 'animation.completed',
        source: 'animation',
        timestamp: 2,
        payload: {},
      });

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('全局单例', () => {
    it('globalEventBus 应为可用的单例', () => {
      expect(globalEventBus).toBeInstanceOf(EventBus);
    });
  });
});
