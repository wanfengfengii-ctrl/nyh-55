import type {
  EngineState,
  EngineConfig,
  ComputationStep,
  CardExecutionRecord,
} from '@/types';
import { computeDiffTableIndependent } from '@/utils/math';
import type {
  IVerifiable,
  VerificationResult,
  VerificationEventPayload,
} from '../core/types';
import { globalEventBus } from '../core/EventBus';

type SnapshotProvider = () => {
  engineState: EngineState | null;
  operationLog: ComputationStep[];
  config: EngineConfig;
  executionRecords?: CardExecutionRecord[];
};

export class VerificationService implements IVerifiable {
  private _snapshotProvider: SnapshotProvider;
  private _lastResult: VerificationResult | null = null;
  private _autoVerify: boolean = false;
  private _autoVerifyInterval: ReturnType<typeof setInterval> | null = null;

  constructor(provider: SnapshotProvider) {
    this._snapshotProvider = provider;
  }

  get lastResult(): VerificationResult | null {
    return this._lastResult;
  }

  get isAutoVerifyEnabled(): boolean {
    return this._autoVerify;
  }

  setAutoVerify(enabled: boolean, intervalMs = 5000): void {
    this._autoVerify = enabled;
    if (this._autoVerifyInterval) {
      clearInterval(this._autoVerifyInterval);
      this._autoVerifyInterval = null;
    }
    if (enabled) {
      this._autoVerifyInterval = setInterval(() => {
        this.verify();
      }, intervalMs);
    }
  }

  verify(): VerificationResult {
    const { engineState, operationLog, config, executionRecords } =
      this._snapshotProvider();

    if (!engineState) {
      const result: VerificationResult = {
        consistent: true,
        message: '引擎未初始化，跳过验算',
      };
      this._lastResult = result;
      return result;
    }

    const mismatches: VerificationResult['mismatches'] = [];

    const independentTable = computeDiffTableIndependent(
      config.initialValues,
      config.order,
      config.maxCrankTurns
    );

    const engineRows: Map<number, number[]> = new Map();
    if (operationLog.length > 0) {
      engineRows.set(0, operationLog[0].previousValues);
    } else {
      engineRows.set(0, engineState.columns.map((c) => c.value));
    }

    for (let i = 0; i < operationLog.length; i++) {
      const step = operationLog[i];
      if (step.phase === 'add' && step.newValues.length > 0) {
        engineRows.set(step.crankTurn, step.newValues);
      }
    }

    for (let x = 0; x <= engineState.currentStep; x++) {
      const engineVal = engineRows.get(x);
      const indepVal = independentTable[x]?.values;
      if (!engineVal || !indepVal) continue;
      if (engineVal[0] !== indepVal[0]) {
        mismatches.push({
          step: x,
          column: 0,
          expected: indepVal[0],
          actual: engineVal[0],
          detail: `x=${x} 时结果不一致: 引擎=${engineVal[0]}, 独立验算=${indepVal[0]}`,
        });
      }
    }

    if (executionRecords) {
      for (const record of executionRecords) {
        if (record.engineStateSnapshot) {
          for (let x = 0; x <= record.engineStateSnapshot.currentStep; x++) {
            const engineVal = engineRows.get(x);
            const indepVal = independentTable[x]?.values;
            if (!engineVal || !indepVal) continue;
            if (engineVal[0] !== indepVal[0]) {
              mismatches.push({
                step: x,
                column: 0,
                expected: indepVal[0],
                actual: engineVal[0],
                detail: `卡片[${record.cardLabel}]执行后 x=${x} 时结果不一致: 引擎=${engineVal[0]}, 独立验算=${indepVal[0]}`,
              });
            }
          }
        }
      }
    }

    const result: VerificationResult =
      mismatches.length > 0
        ? {
            consistent: false,
            message: `检测到 ${mismatches.length} 处不一致`,
            mismatches,
          }
        : {
            consistent: true,
            message: '机械结果、卡片执行记录与差分表推算结果完全一致',
          };

    this._lastResult = result;

    globalEventBus.publish<VerificationEventPayload>({
      type: result.consistent ? 'verification.completed' : 'verification.failed',
      source: 'verification',
      payload: {
        result,
        verifiedAt: Date.now(),
        sourceModule: 'verification',
      },
    });

    return result;
  }

  verifyAgainstReference(
    referenceState: EngineState,
    candidateState: EngineState
  ): VerificationResult {
    const mismatches: VerificationResult['mismatches'] = [];

    const maxCols = Math.max(
      referenceState.columns.length,
      candidateState.columns.length
    );

    for (let c = 0; c < maxCols; c++) {
      const refCol = referenceState.columns[c];
      const candCol = candidateState.columns[c];
      if (!refCol || !candCol) continue;
      if (refCol.value !== candCol.value) {
        mismatches.push({
          step: candidateState.currentStep,
          column: c,
          expected: refCol.value,
          actual: candCol.value,
          detail: `第 ${c} 列值不一致: 参考=${refCol.value}, 候选=${candCol.value}`,
        });
      }
    }

    if (referenceState.crankTurns !== candidateState.crankTurns) {
      mismatches.push({
        expected: referenceState.crankTurns,
        actual: candidateState.crankTurns,
        detail: `手柄转动次数不一致`,
      });
    }

    return mismatches.length > 0
      ? {
          consistent: false,
          message: `状态对比检测到 ${mismatches.length} 处差异`,
          mismatches,
        }
      : {
          consistent: true,
          message: '两个引擎状态完全一致',
        };
  }

  destroy(): void {
    this.setAutoVerify(false);
  }
}

export const verificationService = new VerificationService(() => ({
  engineState: null,
  operationLog: [],
  config: {
    order: 2,
    numDigits: 6,
    modulus: 10,
    initialValues: [],
    maxCrankTurns: 100,
  },
}));
