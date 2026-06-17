import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VerificationService } from './VerificationService';
import type { EngineState, EngineConfig, ComputationStep } from '@/types';
import { DEFAULT_CONFIG } from '@/types';

function makeEngineState(columns: number[], step = 0): EngineState {
  return {
    columns: columns.map((v, i) => ({
      index: i,
      value: v,
      displayValue: v,
      order: i,
    })),
    currentStep: step,
    phase: step === 0 ? 'idle' : 'adding',
    crankTurns: step,
    carryFlags: [],
  };
}

describe('VerificationService', () => {
  const makeProvider = (state: EngineState | null, log: ComputationStep[] = []) => {
    return () => ({
      engineState: state,
      operationLog: log,
      config: DEFAULT_CONFIG as EngineConfig,
    });
  };

  describe('verifyAgainstReference', () => {
    it('相同状态应返回一致', () => {
      const service = new VerificationService(makeProvider(null));
      const ref = makeEngineState([1, 2, 3, 0]);
      const cand = makeEngineState([1, 2, 3, 0]);

      const result = service.verifyAgainstReference(ref, cand);
      expect(result.consistent).toBe(true);
      expect(result.mismatches).toHaveLength(0);
    });

    it('列值不同应返回不一致', () => {
      const service = new VerificationService(makeProvider(null));
      const ref = makeEngineState([1, 2, 3, 0]);
      const cand = makeEngineState([1, 99, 3, 0]);

      const result = service.verifyAgainstReference(ref, cand);
      expect(result.consistent).toBe(false);
      expect(result.mismatches.length).toBeGreaterThan(0);
    });

    it('手柄转动次数不同应返回不一致', () => {
      const service = new VerificationService(makeProvider(null));
      const ref = makeEngineState([1, 2, 3, 0], 5);
      const cand = makeEngineState([1, 2, 3, 0], 3);

      const result = service.verifyAgainstReference(ref, cand);
      expect(result.consistent).toBe(false);
    });
  });

  describe('setAutoVerify', () => {
    it('应正确设置自动验算标志', () => {
      const service = new VerificationService(makeProvider(null));
      expect(service.isAutoVerifyEnabled).toBe(false);

      service.setAutoVerify(true);
      expect(service.isAutoVerifyEnabled).toBe(true);

      service.setAutoVerify(false);
      expect(service.isAutoVerifyEnabled).toBe(false);
    });
  });

  describe('destroy', () => {
    it('应安全销毁', () => {
      const service = new VerificationService(makeProvider(null));
      service.setAutoVerify(true);
      expect(() => service.destroy()).not.toThrow();
      expect(service.isAutoVerifyEnabled).toBe(false);
    });
  });
});
