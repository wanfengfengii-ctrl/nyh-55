import type {
  FaultScenario,
  FaultTrainingSession,
  FaultTrainingRecord,
  FaultTrainingAction,
  FaultDifficulty,
  UserDiagnosisSubmission,
  DiagnosisEvaluation,
  ComputationStep,
  FaultScenarioStep,
  FaultReplayFrame,
  EngineState,
} from '@/types';
import {
  generateRandomScenario,
  executeFaultyStep,
  evaluateDiagnosis,
  computeTrainingScore,
} from '@/engine/FaultInjectionEngine';
import { createEngineState, deepCloneState } from '@/engine/DifferenceEngine';
import { StateMachine, FAULT_TRAINING_TRANSITIONS } from '../core/StateMachine';
import { BaseReplayable } from '../core/BaseReplayable';
import type {
  FaultTrainingServiceState,
  FaultTrainingDiagnosisSubmittedPayload,
  FaultTrainingStepPayload,
  ISnapshot,
} from '../core/types';
import { globalEventBus } from '../core/EventBus';

const RECORDS_KEY = 'fault_training_records';

type FaultStatus =
  | 'idle'
  | 'setup'
  | 'running'
  | 'diagnosing'
  | 'evaluated'
  | 'completed';
type FaultEvent =
  | 'start'
  | 'step'
  | 'complete_steps'
  | 'diagnose'
  | 'all_diagnosed'
  | 'finish'
  | 'reset';

type StateListener = (state: FaultTrainingServiceState) => void;

function cloneState<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class FaultTrainingService
  extends BaseReplayable<FaultReplayFrame>
  implements ISnapshot<FaultTrainingServiceState>
{
  private _stateMachine: StateMachine<FaultStatus, FaultEvent>;
  private _activeSession: FaultTrainingSession | null = null;
  private _scenarioSteps: FaultScenarioStep[] = [];
  private _history: {
    records: FaultTrainingRecord[];
    totalScore: number;
    totalSessions: number;
    averageAccuracy: number;
    bestScore: number;
  };
  private _showCorrectComparison: boolean = false;
  private _showEvaluationDetail: DiagnosisEvaluation | null = null;
  private _timerInterval: ReturnType<typeof setInterval> | null = null;

  private _stateListeners: Set<StateListener> = new Set();

  constructor() {
    super();
    this._stateMachine = new StateMachine<FaultStatus, FaultEvent>(
      'idle',
      FAULT_TRAINING_TRANSITIONS
    );
    this._history = {
      records: [],
      totalScore: 0,
      totalSessions: 0,
      averageAccuracy: 0,
      bestScore: 0,
    };
  }

  get state(): FaultTrainingServiceState {
    return {
      activeSession: this._activeSession ? cloneState(this._activeSession) : null,
      scenarioSteps: cloneState(this._scenarioSteps),
      status: this._stateMachine.currentState,
      showCorrectComparison: this._showCorrectComparison,
      showEvaluationDetail: this._showEvaluationDetail
        ? cloneState(this._showEvaluationDetail)
        : null,
    };
  }

  get activeSession(): FaultTrainingSession | null {
    return this._activeSession ? cloneState(this._activeSession) : null;
  }

  get scenarioSteps(): FaultScenarioStep[] {
    return cloneState(this._scenarioSteps);
  }

  get history() {
    return cloneState(this._history);
  }

  get showCorrectComparison(): boolean {
    return this._showCorrectComparison;
  }

  get showEvaluationDetail(): DiagnosisEvaluation | null {
    return this._showEvaluationDetail ? cloneState(this._showEvaluationDetail) : null;
  }

  subscribeState(listener: StateListener): () => void {
    this._stateListeners.add(listener);
    return () => this._stateListeners.delete(listener);
  }

  private _notify(): void {
    const snap = this.state;
    this._stateListeners.forEach((l) => {
      try {
        l(snap);
      } catch (e) {
        console.error('[FaultTrainingService] State listener error:', e);
      }
    });
  }

  private _recordAction(
    actionType: FaultTrainingAction['actionType'],
    data?: Record<string, unknown>
  ): void {
    if (!this._activeSession) return;
    const action: FaultTrainingAction = {
      timestamp: Date.now(),
      actionType,
      data,
    };
    this._activeSession = {
      ...this._activeSession,
      userActions: [...this._activeSession.userActions, action],
    };
  }

  private _startTimer(): void {
    this._stopTimer();
    this._timerInterval = setInterval(() => {
      if (!this._activeSession || !this._activeSession.timerRunning) return;
      this._activeSession = {
        ...this._activeSession,
        elapsedSeconds: this._activeSession.elapsedSeconds + 1,
      };
      this._notify();
    }, 1000);
  }

  private _stopTimer(): void {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
  }

  private _saveRecord(session: FaultTrainingSession): void {
    const correctCount = session.evaluations.filter((e) => e.isCorrect).length;
    const partialCount = session.evaluations.filter(
      (e) => !e.isCorrect && e.partialCredit > 0
    ).length;
    const accuracy = session.maxScore > 0 ? session.score / session.maxScore : 0;

    const record: FaultTrainingRecord = {
      id: session.id,
      scenarioId: session.scenarioId,
      scenarioTitle: session.scenario.title,
      difficulty: session.scenario.difficulty,
      startTime: session.startTime,
      endTime: session.endTime ?? Date.now(),
      score: session.score,
      maxScore: session.maxScore,
      accuracy,
      elapsedSeconds: session.elapsedSeconds,
      submissionsCount: session.submissions.length,
      correctCount,
      partialCount,
      hintCount: session.revealedHints,
    };

    try {
      const existing = JSON.parse(
        localStorage.getItem(RECORDS_KEY) || '[]'
      ) as FaultTrainingRecord[];
      const updated = [record, ...existing].slice(0, 100);
      localStorage.setItem(RECORDS_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }

    const records = [record, ...this._history.records].slice(0, 100);
    const totalScore = records.reduce((sum, r) => sum + r.score, 0);
    const totalSessions = records.length;
    const averageAccuracy =
      totalSessions > 0
        ? records.reduce((sum, r) => sum + r.accuracy, 0) / totalSessions
        : 0;
    const bestScore =
      records.length > 0 ? Math.max(...records.map((r) => r.score)) : 0;

    this._history = {
      records,
      totalScore,
      totalSessions,
      averageAccuracy,
      bestScore,
    };
  }

  startTraining(difficulty: FaultDifficulty = 'beginner', scenario?: FaultScenario): void {
    this._stopTimer();
    const chosenScenario = scenario || generateRandomScenario(difficulty);

    try {
      const initialState = createEngineState(chosenScenario.engineConfig);
      const correctInitialState = deepCloneState(initialState);

      const session: FaultTrainingSession = {
        id: `training-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        scenarioId: chosenScenario.id,
        scenario: chosenScenario,
        startTime: Date.now(),
        endTime: null,
        elapsedSeconds: 0,
        status: 'running',
        submissions: [],
        evaluations: [],
        score: 0,
        maxScore: chosenScenario.baseScore,
        currentStep: 0,
        faultInjectedSteps: chosenScenario.faults.map((f) => f.triggerStep),
        userActions: [],
        faultyOperationLog: [],
        correctOperationLog: [],
        faultyEngineState: initialState,
        correctEngineState: correctInitialState,
        revealedHints: 0,
        timerRunning: true,
      };

      const firstStep: FaultScenarioStep = {
        stepNumber: 0,
        engineSnapshot: deepCloneState(initialState),
        correctSnapshot: deepCloneState(correctInitialState),
        faultyOperationLog: [],
        correctOperationLog: [],
        activeFaults: [],
        annotations: [],
      };

      this._activeSession = session;
      this._scenarioSteps = [firstStep];
      this._showCorrectComparison = false;
      this._showEvaluationDetail = null;
      this._replayFrames = [];
      this._isReplaying = false;
      this._replayIndex = -1;

      this._stateMachine.transition('start');
      this._stateMachine.transition('step');

      globalEventBus.publish({
        type: 'fault.training.started',
        source: 'faultTraining',
        payload: { sessionId: session.id, scenario: chosenScenario },
      });

      this._startTimer();
      this._notify();
    } catch (e) {
      console.error('Failed to start training:', e);
    }
  }

  stepForward(): void {
    const session = this._activeSession;
    if (!session || session.status !== 'running') return;
    if (
      session.faultyEngineState?.phase === 'error' ||
      session.faultyEngineState?.phase === 'complete'
    )
      return;

    const currentState = session.faultyEngineState;
    if (!currentState) return;

    const { faultyState, correctState, log } = executeFaultyStep(
      currentState,
      session.scenario.faults,
      session.currentStep
    );

    const correctLog: ComputationStep = {
      stepNumber: session.currentStep + 1,
      crankTurn: currentState.crankTurns + 1,
      phase: 'add',
      fromOrder: currentState.order,
      toOrder: 0,
      previousValues: currentState.columns.map((c) => c.value),
      newValues: correctState.columns.map((c) => c.value),
      carryTriggered: log.carryTriggered,
      errorOccurred: false,
      description: `手柄第${currentState.crankTurns + 1}转: f(${currentState.crankTurns + 1})=${correctState.columns[0].value}`,
      timestamp: Date.now(),
    };

    const activeFaults = session.scenario.faults.filter(
      (f) => f.triggerStep === session.currentStep + 1
    );

    const newStep: FaultScenarioStep = {
      stepNumber: session.currentStep + 1,
      engineSnapshot: deepCloneState(faultyState),
      correctSnapshot: deepCloneState(correctState),
      faultyOperationLog: [...session.faultyOperationLog, log],
      correctOperationLog: [...session.correctOperationLog, correctLog],
      activeFaults,
      annotations: [],
    };

    const isComplete =
      faultyState.phase === 'complete' ||
      faultyState.crankTurns >= faultyState.maxSteps;

    this._activeSession = {
      ...session,
      currentStep: session.currentStep + 1,
      faultyEngineState: faultyState,
      correctEngineState: correctState,
      faultyOperationLog: [...session.faultyOperationLog, log],
      correctOperationLog: [...session.correctOperationLog, correctLog],
      status: isComplete ? 'diagnosing' : session.status,
    };
    this._scenarioSteps = [...this._scenarioSteps, newStep];

    this._recordAction('step_forward', { stepNumber: session.currentStep + 1 });

    globalEventBus.publish<FaultTrainingStepPayload>({
      type: 'fault.training.step.executed',
      source: 'faultTraining',
      payload: { step: newStep, activeFaults },
    });

    if (isComplete) {
      this._stopTimer();
      this._stateMachine.transition('complete_steps');
    } else {
      this._stateMachine.transition('step');
    }

    this._notify();
  }

  stepBack(): void {
    const session = this._activeSession;
    const steps = this._scenarioSteps;
    if (!session || steps.length <= 1) return;

    const prevStep = steps[steps.length - 2];
    const newSteps = steps.slice(0, -1);

    this._activeSession = {
      ...session,
      currentStep: prevStep.stepNumber,
      faultyEngineState: deepCloneState(prevStep.engineSnapshot),
      correctEngineState: deepCloneState(prevStep.correctSnapshot),
      faultyOperationLog: [...prevStep.faultyOperationLog],
      correctOperationLog: [...prevStep.correctOperationLog],
      status: 'running',
    };
    this._scenarioSteps = newSteps;

    this._recordAction('step_back', { stepNumber: prevStep.stepNumber });

    if (session.status !== 'running') {
      this._stateMachine.forceSetState('running');
    }
    this._notify();
  }

  submitDiagnosis(submission: UserDiagnosisSubmission): DiagnosisEvaluation {
    const session = this._activeSession;
    if (!session) {
      const emptyDiagnosis = {
        faultId: '',
        faultType: submission.faultType,
        columnIndex: submission.columnIndex,
        stepNumber: submission.stepNumber,
        causeDescription: '',
      };
      return {
        isCorrect: false,
        partialCredit: 0,
        matchedFaultId: null,
        explanation: '无活跃训练会话',
        evidence: [],
        standardAnswer: emptyDiagnosis,
        userAnswer: submission,
      };
    }

    const evaluation = evaluateDiagnosis(
      submission,
      session.scenario.correctDiagnoses,
      session.scenario.faults
    );

    const allEvaluations = [...session.evaluations, evaluation];
    const allSubmissions = [...session.submissions, submission];

    const { score, maxScore } = computeTrainingScore(
      allEvaluations,
      session.scenario.baseScore,
      session.elapsedSeconds,
      session.scenario.timeLimitSeconds,
      session.revealedHints,
      session.scenario.faults.length
    );

    const allDiagnosed = allEvaluations.length >= session.scenario.faults.length;
    const newStatus = allDiagnosed ? 'evaluated' : session.status;

    this._activeSession = {
      ...session,
      evaluations: allEvaluations,
      submissions: allSubmissions,
      score,
      maxScore,
      status: newStatus,
    };
    this._showEvaluationDetail = evaluation;

    this._recordAction('submit_diagnosis', { submission, evaluation });

    globalEventBus.publish<FaultTrainingDiagnosisSubmittedPayload>({
      type: 'fault.training.diagnosis.submitted',
      source: 'faultTraining',
      payload: { submission, evaluation },
    });

    if (allDiagnosed) {
      this._stopTimer();
      this._stateMachine.transition('all_diagnosed');
    } else {
      this._stateMachine.transition('diagnose');
    }

    this._notify();
    return evaluation;
  }

  requestHint(): string[] {
    const session = this._activeSession;
    if (!session) return [];

    const hints: string[] = [];
    const remainingFaults = session.scenario.faults.filter(
      (f) =>
        !session.evaluations.some(
          (e) => e.matchedFaultId === f.id && e.isCorrect
        )
    );

    for (const fault of remainingFaults) {
      const hintLevel = session.revealedHints % fault.evidenceHints.length;
      hints.push(fault.evidenceHints[hintLevel]);
    }

    this._activeSession = {
      ...session,
      revealedHints: session.revealedHints + 1,
    };

    this._recordAction('request_hint', { hintsCount: hints.length });
    globalEventBus.publish({
      type: 'fault.training.hint.requested',
      source: 'faultTraining',
      payload: { hints },
    });

    this._notify();
    return hints;
  }

  toggleTimer(): void {
    const session = this._activeSession;
    if (!session) return;

    const newRunning = !session.timerRunning;
    this._activeSession = {
      ...session,
      timerRunning: newRunning,
    };

    this._recordAction(newRunning ? 'resume_timer' : 'pause_timer');

    if (newRunning) {
      this._startTimer();
    } else {
      this._stopTimer();
    }
    this._notify();
  }

  endTraining(): void {
    const session = this._activeSession;
    if (!session) return;

    this._stopTimer();

    const finalSession: FaultTrainingSession = {
      ...session,
      endTime: Date.now(),
      status: 'completed',
      timerRunning: false,
    };

    this._activeSession = finalSession;
    this._saveRecord(finalSession);

    this._stateMachine.transition('finish');
    globalEventBus.publish({
      type: 'fault.training.completed',
      source: 'faultTraining',
      payload: { session: finalSession },
    });

    this.buildFrames();
    this._notify();
  }

  resetTraining(): void {
    this._stopTimer();
    this._activeSession = null;
    this._scenarioSteps = [];
    this._replayFrames = [];
    this._isReplaying = false;
    this._replayIndex = -1;
    this._showCorrectComparison = false;
    this._showEvaluationDetail = null;

    this._stateMachine.transition('reset');
    globalEventBus.publish({
      type: 'fault.training.reset',
      source: 'faultTraining',
      payload: {},
    });

    this._notify();
  }

  setShowCorrectComparison(show: boolean): void {
    this._showCorrectComparison = show;
    this._notify();
  }

  setShowEvaluationDetail(eval_: DiagnosisEvaluation | null): void {
    this._showEvaluationDetail = eval_;
    this._notify();
  }

  public buildFrames(): FaultReplayFrame[] {
    const steps = this._scenarioSteps;
    const session = this._activeSession;
    if (!session) return [];

    const frames: FaultReplayFrame[] = steps.map((step, idx) => {
      const action = session.userActions.find(
        (a) =>
          a.actionType === 'step_forward' && a.data?.stepNumber === step.stepNumber
      ) || null;
      return {
        stepIndex: idx,
        step,
        userAction: action,
        elapsedAtStep: 0,
      };
    });

    this._replayFrames = frames;
    return frames;
  }

  protected applyFrame(frame: FaultReplayFrame, _index: number): void {
    const session = this._activeSession;
    if (!session) return;

    this._activeSession = {
      ...session,
      faultyEngineState: deepCloneState(frame.step.engineSnapshot),
      correctEngineState: deepCloneState(frame.step.correctSnapshot),
      faultyOperationLog: [...frame.step.faultyOperationLog],
      correctOperationLog: [...frame.step.correctOperationLog],
      currentStep: frame.step.stepNumber,
    };
    this._notify();
  }

  loadHistory(): void {
    try {
      const data = localStorage.getItem(RECORDS_KEY);
      if (data) {
        const records = JSON.parse(data) as FaultTrainingRecord[];
        const totalScore = records.reduce((sum, r) => sum + r.score, 0);
        const totalSessions = records.length;
        const averageAccuracy =
          totalSessions > 0
            ? records.reduce((sum, r) => sum + r.accuracy, 0) / totalSessions
            : 0;
        const bestScore =
          records.length > 0 ? Math.max(...records.map((r) => r.score)) : 0;

        this._history = {
          records,
          totalScore,
          totalSessions,
          averageAccuracy,
          bestScore,
        };
      }
    } catch {
      // ignore
    }
  }

  clearHistory(): void {
    localStorage.removeItem(RECORDS_KEY);
    this._history = {
      records: [],
      totalScore: 0,
      totalSessions: 0,
      averageAccuracy: 0,
      bestScore: 0,
    };
  }

  takeSnapshot(): FaultTrainingServiceState {
    return cloneState(this.state);
  }

  restoreSnapshot(snapshot: FaultTrainingServiceState): void {
    if (!this.canRestoreFrom(snapshot)) return;
    this._activeSession = snapshot.activeSession
      ? cloneState(snapshot.activeSession)
      : null;
    this._scenarioSteps = cloneState(snapshot.scenarioSteps);
    this._stateMachine.forceSetState(snapshot.status);
    this._showCorrectComparison = snapshot.showCorrectComparison;
    this._showEvaluationDetail = snapshot.showEvaluationDetail
      ? cloneState(snapshot.showEvaluationDetail)
      : null;
    this._notify();
  }

  canRestoreFrom(snapshot: FaultTrainingServiceState): boolean {
    return (
      snapshot && typeof snapshot === 'object' && 'scenarioSteps' in snapshot
    );
  }

  destroy(): void {
    this._stopTimer();
    super.destroy();
  }
}

export const faultTrainingService = new FaultTrainingService();
