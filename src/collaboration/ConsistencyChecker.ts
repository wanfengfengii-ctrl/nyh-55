import type { EngineState, ComputationStep, StateMismatchPayload } from '@/types';
import { computeStateHash } from '@/collaboration/utils';
import { useCollabStore } from '@/store/collabStore';
import { useEngineStore } from '@/store/engineStore';
import { computeDiffTableIndependent } from '@/utils/math';

export interface ConsistencyReport {
  stepNumber: number;
  engineHash: string;
  expectedHash: string | null;
  matches: boolean;
  details: string;
  mathVerified: boolean;
  mathDetails: string;
}

export class ConsistencyChecker {
  private lastReportedMismatch: string | null = null;

  async checkCurrentState(): Promise<ConsistencyReport> {
    const engine = useEngineStore.getState();
    const collab = useCollabStore.getState();
    const { engineState, operationLog, config } = engine;
    const stepNumber = engineState?.currentStep ?? 0;

    const engineHash = await computeStateHash(engineState, operationLog, stepNumber);
    collab.setLastStateHash(engineHash);

    const report: ConsistencyReport = {
      stepNumber,
      engineHash,
      expectedHash: null,
      matches: true,
      details: '状态一致',
      mathVerified: true,
      mathDetails: '',
    };

    if (collab.isInSession) {
      collab.sendStateHash({
        stepNumber,
        stateHash: engineHash,
        participantId: collab.userId,
      });

      const presenter = collab.participants.find(
        (p) => p.id === collab.currentPresenterId && p.id !== collab.userId
      );
      if (presenter && presenter.stateHash) {
        report.expectedHash = presenter.stateHash;
        if (presenter.stateHash !== engineHash) {
          report.matches = false;
          report.details = `与主讲人状态不一致: 本地=${engineHash}, 主讲人=${presenter.stateHash}`;
          this.reportMismatch(stepNumber, engineHash, presenter.stateHash);
        }
      }
    }

    if (engineState && operationLog.length > 0) {
      try {
        const { mathVerified, message } = this.verifyMathConsistency(
          engineState,
          operationLog,
          config
        );
        report.mathVerified = mathVerified;
        report.mathDetails = message;
        if (!mathVerified) {
          report.matches = false;
          if (collab.isPresenter()) {
            collab.sendErrorAlert(`数学一致性校验失败: ${message}`);
          }
        }
      } catch (e) {
        report.mathVerified = false;
        report.mathDetails = e instanceof Error ? e.message : '未知校验错误';
      }
    }

    return report;
  }

  private verifyMathConsistency(
    engineState: EngineState,
    operationLog: ComputationStep[],
    config: ReturnType<typeof useEngineStore.getState>['config']
  ): { mathVerified: boolean; message: string } {
    if (!config.initialValues || config.initialValues.length === 0) {
      return { mathVerified: true, message: '无初始配置' };
    }

    const independentTable = computeDiffTableIndependent(
      config.initialValues,
      config.order,
      config.maxCrankTurns
    );

    const currentX = engineState.currentStep;

    if (currentX >= independentTable.length) {
      return { mathVerified: true, message: `x=${currentX} 超出独立验证范围` };
    }

    const expectedResult = independentTable[currentX]?.values?.[0];
    const actualResult = engineState.columns?.[0]?.value;

    if (expectedResult === undefined) {
      return { mathVerified: true, message: `x=${currentX} 无独立推算值` };
    }

    if (actualResult !== expectedResult) {
      return {
        mathVerified: false,
        message: `x=${currentX} 时结果不一致: 引擎=${actualResult}, 数学推算=${expectedResult}`,
      };
    }

    return {
      mathVerified: true,
      message: `x=${currentX} 引擎结果=${actualResult} 与数学推算一致`,
    };
  }

  private reportMismatch(
    stepNumber: number,
    actualHash: string,
    expectedHash: string
  ) {
    const key = `${stepNumber}-${actualHash}-${expectedHash}`;
    if (this.lastReportedMismatch === key) return;
    this.lastReportedMismatch = key;

    const collab = useCollabStore.getState();
    const engine = useEngineStore.getState();

    const payload: StateMismatchPayload = {
      detectedBy: collab.userName,
      expectedHash,
      actualHash,
      stepNumber,
    };

    if (collab.isPresenter()) {
      payload.hostStateSnapshot = {
        engineSnapshot: JSON.parse(JSON.stringify(engine.engineState)),
        operationLog: [...engine.operationLog],
        historyStack: engine.historyStack.map((s) => JSON.parse(JSON.stringify(s))),
        isAnimating: engine.isAnimating,
        isRunning: engine.isRunning,
        displayPhase: engine.displayPhase,
        config: { ...engine.config },
        sequence: collab.sequenceNumber,
      };
    }

    collab.sendStateMismatch(payload);
  }

  reset() {
    this.lastReportedMismatch = null;
  }
}

export const consistencyChecker = new ConsistencyChecker();
