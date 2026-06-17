import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnnotationService } from './AnnotationService';
import type { AnnotationTarget } from '@/types';

describe('AnnotationService', () => {
  let service: AnnotationService;

  beforeEach(() => {
    service = new AnnotationService();
    service.setUserContext('user-1', 'Test User');
    service.setSessionContext('session-1');
  });

  describe('addAnnotation', () => {
    it('应成功添加批注', () => {
      const target: AnnotationTarget = { type: 'step', stepNumber: 1 };
      const ann = service.addAnnotation(target, '这是测试批注');

      expect(ann).not.toBeNull();
      expect(ann?.id).toBeTruthy();
      expect(ann?.content).toBe('这是测试批注');
      expect(ann?.authorId).toBe('user-1');
      expect(ann?.resolved).toBe(false);
    });

    it('未设置会话时不应添加批注', () => {
      service.setSessionContext(null);
      const target: AnnotationTarget = { type: 'step', stepNumber: 1 };
      const ann = service.addAnnotation(target, 'test');
      expect(ann).toBeNull();
    });
  });

  describe('updateAnnotation', () => {
    it('应更新存在的批注', () => {
      const target: AnnotationTarget = { type: 'step', stepNumber: 1 };
      const created = service.addAnnotation(target, 'original');
      expect(created).not.toBeNull();

      const updated = service.updateAnnotation(created!.id, 'updated content');
      expect(updated).not.toBeNull();
      expect(updated?.content).toBe('updated content');
    });

    it('不存在的批注应返回 null', () => {
      const result = service.updateAnnotation('non-existent', 'test');
      expect(result).toBeNull();
    });
  });

  describe('resolveAnnotation', () => {
    it('应标记批注为已解决', () => {
      const target: AnnotationTarget = { type: 'step', stepNumber: 1 };
      const created = service.addAnnotation(target, 'test');

      service.resolveAnnotation(created!.id, true);
      const all = service.getAllAnnotations();
      const found = all.find((a) => a.id === created!.id);
      expect(found?.resolved).toBe(true);
    });
  });

  describe('removeAnnotation', () => {
    it('应删除批注', () => {
      const target: AnnotationTarget = { type: 'step', stepNumber: 1 };
      const created = service.addAnnotation(target, 'to remove');
      expect(service.getAllAnnotations()).toHaveLength(1);

      service.removeAnnotation(created!.id);
      expect(service.getAllAnnotations()).toHaveLength(0);
    });
  });

  describe('查询方法', () => {
    beforeEach(() => {
      service.addAnnotation({ type: 'step', stepNumber: 1 }, 'step 1');
      service.addAnnotation({ type: 'step', stepNumber: 1 }, 'step 1 again');
      service.addAnnotation({ type: 'step', stepNumber: 2 }, 'step 2');
      service.addAnnotation({ type: 'column', columnIndex: 0 }, 'col 0');
    });

    it('getAnnotationsForStep 应按步骤筛选', () => {
      const step1 = service.getAnnotationsForStep(1);
      expect(step1).toHaveLength(2);

      const step2 = service.getAnnotationsForStep(2);
      expect(step2).toHaveLength(1);
      expect(step2[0].content).toBe('step 2');
    });

    it('getAnnotationsForTarget 应按目标筛选', () => {
      const col0 = service.getAnnotationsForTarget({ type: 'column', columnIndex: 0 });
      expect(col0).toHaveLength(1);
      expect(col0[0].content).toBe('col 0');
    });
  });

  describe('onChange 订阅', () => {
    it('应在变化时通知订阅者', () => {
      const handler = vi.fn();
      service.onChange(handler);

      service.addAnnotation({ type: 'step', stepNumber: 1 }, 'test');
      expect(handler).toHaveBeenCalled();
    });

    it('应返回取消订阅函数', () => {
      const handler = vi.fn();
      const off = service.onChange(handler);

      off();
      service.addAnnotation({ type: 'step', stepNumber: 1 }, 'test');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('快照', () => {
    it('takeSnapshot 和 restoreSnapshot 应工作', () => {
      service.addAnnotation({ type: 'step', stepNumber: 1 }, 'before');
      const snap = service.takeSnapshot();

      service.addAnnotation({ type: 'step', stepNumber: 2 }, 'after');
      expect(service.getAllAnnotations()).toHaveLength(2);

      service.restoreSnapshot(snap);
      expect(service.getAllAnnotations()).toHaveLength(1);
      expect(service.getAllAnnotations()[0].content).toBe('before');
    });
  });
});
