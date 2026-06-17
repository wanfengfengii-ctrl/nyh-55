import { create } from 'zustand';
import type {
  FaultScenario,
  FaultTrainingSession,
  FaultTrainingRecord,
  FaultTrainingHistory,
  FaultTrainingAction,
  FaultDifficulty,
  UserDiagnosisSubmission,
  DiagnosisEvaluation,
  ComputationStep,
  FaultScenarioStep,
  FaultReplayFrame,
  FaultDiagnosis,
} from '@/types';
import {
  generateRandomScenario,
  executeFaultyStep,
  evaluateDiagnosis,
  computeTrainingScore,
} from '@/engine/FaultInjectionEngine';
import { createEngineState, deepCloneState } from '@/engine/DifferenceEngine';

const RECORDS_KEY = 'fault_training_records';

interface FaultTrainingStore {
  activeSession: FaultTrainingSession | null;
  scenarioSteps: FaultScenarioStep[];
  history: FaultTrainingHistory;
  replayFrames: FaultReplayFrame[];
  isReplaying: boolean;
  replayIndex: number;
  replayTimer: ReturnType<typeof setInterval> | null;
  replaySpeed: number;
  timerInterval: ReturnType<typeof setInterval> | null;
  showCorrectComparison: boolean;
  showEvaluationDetail: DiagnosisEvaluation | null;

  startTraining: (difficulty?: FaultDifficulty, scenario?: FaultScenario) => void;
  stepForward: () => void;
  stepBack: () => void;
  submitDiagnosis: (submission: UserDiagnosisSubmission) => DiagnosisEvaluation;
  requestHint: () => string[];
  toggleTimer: () => void;
  endTraining: () => void;
  resetTraining: () => void;
  setShowCorrectComparison: (show: boolean) => void;
  setShowEvaluationDetail: (eval_: DiagnosisEvaluation | null) => void;

  startReplay: () => void;
  pauseReplay: () => void;
  resumeReplay: () => void;
  stopReplay: () => void;
  setReplaySpeed: (speed: number) => void;
  replayNextStep: () => boolean;
  replayPrevStep: () => boolean;
  replayGotoStep: (index: number) => void;
  buildReplayFrames: () => void;

  loadHistory: () => void;
  clearHistory: () => void;
}

export const useFaultTrainingStore = create<FaultTrainingStore>((set, get) => {
  const recordAction = (actionType: FaultTrainingAction['actionType'], data?: Record<string, unknown>) => {
    const session = get().activeSession;
    if (!session) return;
    const action: FaultTrainingAction = {
      timestamp: Date.now(),
      actionType,
      data,
    };
    set({
      activeSession: {
        ...session,
        userActions: [...session.userActions, action],
      },
    });
  };

  const startTimer = () => {
    const existing = get().timerInterval;
    if (existing) clearInterval(existing);

    const interval = setInterval(() => {
      const session = get().activeSession;
      if (!session || !session.timerRunning) return;
      set({
        activeSession: {
          ...session,
          elapsedSeconds: session.elapsedSeconds + 1,
        },
      });
    }, 1000);

    set({ timerInterval: interval });
  };

  const stopTimer = () => {
    const interval = get().timerInterval;
    if (interval) {
      clearInterval(interval);
      set({ timerInterval: null });
    }
  };

  const saveRecord = (session: FaultTrainingSession) => {
    const correctCount = session.evaluations.filter(e => e.isCorrect).length;
    const partialCount = session.evaluations.filter(e => !e.isCorrect && e.partialCredit > 0).length;
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
      const existing = JSON.parse(localStorage.getItem(RECORDS_KEY) || '[]') as FaultTrainingRecord[];
      const updated = [record, ...existing].slice(0, 100);
      localStorage.setItem(RECORDS_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }

    set((s) => {
      const records = [record, ...s.history.records].slice(0, 100);
      const totalScore = records.reduce((sum, r) => sum + r.score, 0);
      const totalSessions = records.length;
      const averageAccuracy = totalSessions > 0 ? records.reduce((sum, r) => sum + r.accuracy, 0) / totalSessions : 0;
      const bestScore = records.length > 0 ? Math.max(...records.map(r => r.score)) : 0;

      return {
        history: {
          records,
          totalScore,
          totalSessions,
          averageAccuracy,
          bestScore,
        },
      };
    });
  };

  return {
    activeSession: null,
    scenarioSteps: [],
    history: {
      records: [],
      totalScore: 0,
      totalSessions: 0,
      averageAccuracy: 0,
      bestScore: 0,
    },
    replayFrames: [],
    isReplaying: false,
    replayIndex: -1,
    replayTimer: null,
    replaySpeed: 1,
    timerInterval: null,
    showCorrectComparison: false,
    showEvaluationDetail: null,

    startTraining: (difficulty = 'beginner', scenario) => {
      stopTimer();
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
          faultInjectedSteps: chosenScenario.faults.map(f => f.triggerStep),
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

        set({
          activeSession: session,
          scenarioSteps: [firstStep],
          replayFrames: [],
          showCorrectComparison: false,
          showEvaluationDetail: null,
        });

        startTimer();
      } catch (e) {
        console.error('Failed to start training:', e);
      }
    },

    stepForward: () => {
      const session = get().activeSession;
      if (!session || session.status !== 'running') return;
      if (session.faultyEngineState?.phase === 'error' || session.faultyEngineState?.phase === 'complete') return;

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
        previousValues: currentState.columns.map(c => c.value),
        newValues: correctState.columns.map(c => c.value),
        carryTriggered: log.carryTriggered,
        errorOccurred: false,
        description: `手柄第${currentState.crankTurns + 1}转: f(${currentState.crankTurns + 1})=${correctState.columns[0].value}`,
        timestamp: Date.now(),
      };

      const activeFaults = session.scenario.faults.filter(f => f.triggerStep === session.currentStep + 1);

      const newStep: FaultScenarioStep = {
        stepNumber: session.currentStep + 1,
        engineSnapshot: deepCloneState(faultyState),
        correctSnapshot: deepCloneState(correctState),
        faultyOperationLog: [...session.faultyOperationLog, log],
        correctOperationLog: [...session.correctOperationLog, correctLog],
        activeFaults,
        annotations: [],
      };

      const isComplete = faultyState.phase === 'complete' || faultyState.crankTurns >= faultyState.maxSteps;

      set({
        activeSession: {
          ...session,
          currentStep: session.currentStep + 1,
          faultyEngineState: faultyState,
          correctEngineState: correctState,
          faultyOperationLog: [...session.faultyOperationLog, log],
          correctOperationLog: [...session.correctOperationLog, correctLog],
          status: isComplete ? 'diagnosing' : session.status,
        },
        scenarioSteps: [...get().scenarioSteps, newStep],
      });

      recordAction('step_forward', { stepNumber: session.currentStep + 1 });

      if (isComplete) {
        stopTimer();
      }
    },

    stepBack: () => {
      const session = get().activeSession;
      const steps = get().scenarioSteps;
      if (!session || steps.length <= 1) return;

      const prevStep = steps[steps.length - 2];
      const newSteps = steps.slice(0, -1);

      set({
        activeSession: {
          ...session,
          currentStep: prevStep.stepNumber,
          faultyEngineState: deepCloneState(prevStep.engineSnapshot),
          correctEngineState: deepCloneState(prevStep.correctSnapshot),
          faultyOperationLog: [...prevStep.faultyOperationLog],
          correctOperationLog: [...prevStep.correctOperationLog],
          status: 'running',
        },
        scenarioSteps: newSteps,
      });

      recordAction('step_back', { stepNumber: prevStep.stepNumber });
    },

    submitDiagnosis: (submission) => {
      const session = get().activeSession;
      if (!session) {
        const emptyDiagnosis: FaultDiagnosis = {
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

      set({
        activeSession: {
          ...session,
          evaluations: allEvaluations,
          submissions: allSubmissions,
          score,
          maxScore,
          status: newStatus,
        },
        showEvaluationDetail: evaluation,
      });

      recordAction('submit_diagnosis', { submission, evaluation });

      if (newStatus === 'evaluated') {
        stopTimer();
      }

      return evaluation;
    },

    requestHint: () => {
      const session = get().activeSession;
      if (!session) return [];

      const hints: string[] = [];
      const remainingFaults = session.scenario.faults.filter(
        f => !session.evaluations.some(e => e.matchedFaultId === f.id && e.isCorrect)
      );

      for (const fault of remainingFaults) {
        const hintLevel = session.revealedHints % fault.evidenceHints.length;
        hints.push(fault.evidenceHints[hintLevel]);
      }

      set({
        activeSession: {
          ...session,
          revealedHints: session.revealedHints + 1,
        },
      });

      recordAction('request_hint', { hintsCount: hints.length });

      return hints;
    },

    toggleTimer: () => {
      const session = get().activeSession;
      if (!session) return;

      const newRunning = !session.timerRunning;
      set({
        activeSession: {
          ...session,
          timerRunning: newRunning,
        },
      });

      recordAction(newRunning ? 'resume_timer' : 'pause_timer');

      if (newRunning) {
        startTimer();
      } else {
        const interval = get().timerInterval;
        if (interval) clearInterval(interval);
        set({ timerInterval: null });
      }
    },

    endTraining: () => {
      const session = get().activeSession;
      if (!session) return;

      stopTimer();

      const finalSession: FaultTrainingSession = {
        ...session,
        endTime: Date.now(),
        status: 'completed',
        timerRunning: false,
      };

      set({ activeSession: finalSession });
      saveRecord(finalSession);

      get().buildReplayFrames();
    },

    resetTraining: () => {
      stopTimer();
      set({
        activeSession: null,
        scenarioSteps: [],
        replayFrames: [],
        isReplaying: false,
        replayIndex: -1,
        showCorrectComparison: false,
        showEvaluationDetail: null,
      });
    },

    setShowCorrectComparison: (show) => set({ showCorrectComparison: show }),
    setShowEvaluationDetail: (eval_) => set({ showEvaluationDetail: eval_ }),

    startReplay: () => {
      const steps = get().scenarioSteps;
      const session = get().activeSession;
      if (!session || steps.length === 0) return;

      get().buildReplayFrames();

      set({
        isReplaying: true,
        replayIndex: -1,
      });

      get().replayNextStep();

      const interval = Math.max(300, 1500 / get().replaySpeed);
      const timer = setInterval(() => {
        if (get().isReplaying) {
          const hasMore = get().replayNextStep();
          if (!hasMore) {
            const t = get().replayTimer;
            if (t) clearInterval(t);
            set({ isReplaying: false, replayTimer: null });
          }
        }
      }, interval);
      set({ replayTimer: timer });
    },

    pauseReplay: () => {
      const timer = get().replayTimer;
      if (timer) clearInterval(timer);
      set({ isReplaying: false, replayTimer: null });
    },

    resumeReplay: () => {
      if (get().isReplaying) return;
      set({ isReplaying: true });
      const interval = Math.max(300, 1500 / get().replaySpeed);
      const timer = setInterval(() => {
        if (get().isReplaying) {
          const hasMore = get().replayNextStep();
          if (!hasMore) {
            const t = get().replayTimer;
            if (t) clearInterval(t);
            set({ isReplaying: false, replayTimer: null });
          }
        }
      }, interval);
      set({ replayTimer: timer });
    },

    stopReplay: () => {
      const timer = get().replayTimer;
      if (timer) clearInterval(timer);
      set({
        isReplaying: false,
        replayIndex: -1,
        replayTimer: null,
      });
    },

    setReplaySpeed: (speed) => {
      set({ replaySpeed: Math.max(0.25, Math.min(4, speed)) });
      if (get().isReplaying) {
        get().pauseReplay();
        get().resumeReplay();
      }
    },

    replayNextStep: () => {
      const frames = get().replayFrames;
      const nextIdx = get().replayIndex + 1;
      if (nextIdx >= frames.length) return false;

      const frame = frames[nextIdx];
      const session = get().activeSession;
      if (session) {
        set({
          activeSession: {
            ...session,
            faultyEngineState: deepCloneState(frame.step.engineSnapshot),
            correctEngineState: deepCloneState(frame.step.correctSnapshot),
            faultyOperationLog: [...frame.step.faultyOperationLog],
            correctOperationLog: [...frame.step.correctOperationLog],
            currentStep: frame.step.stepNumber,
          },
        });
      }
      set({ replayIndex: nextIdx });
      return true;
    },

    replayPrevStep: () => {
      const frames = get().replayFrames;
      const prevIdx = get().replayIndex - 1;
      if (prevIdx < 0) return false;

      const frame = frames[prevIdx];
      const session = get().activeSession;
      if (session) {
        set({
          activeSession: {
            ...session,
            faultyEngineState: deepCloneState(frame.step.engineSnapshot),
            correctEngineState: deepCloneState(frame.step.correctSnapshot),
            faultyOperationLog: [...frame.step.faultyOperationLog],
            correctOperationLog: [...frame.step.correctOperationLog],
            currentStep: frame.step.stepNumber,
          },
        });
      }
      set({ replayIndex: prevIdx });
      return true;
    },

    replayGotoStep: (index) => {
      const frames = get().replayFrames;
      const targetIdx = Math.max(0, Math.min(frames.length - 1, index));
      const frame = frames[targetIdx];
      const session = get().activeSession;
      if (session && frame) {
        set({
          activeSession: {
            ...session,
            faultyEngineState: deepCloneState(frame.step.engineSnapshot),
            correctEngineState: deepCloneState(frame.step.correctSnapshot),
            faultyOperationLog: [...frame.step.faultyOperationLog],
            correctOperationLog: [...frame.step.correctOperationLog],
            currentStep: frame.step.stepNumber,
          },
        });
      }
      set({ replayIndex: targetIdx });
    },

    loadHistory: () => {
      try {
        const data = localStorage.getItem(RECORDS_KEY);
        if (data) {
          const records = JSON.parse(data) as FaultTrainingRecord[];
          const totalScore = records.reduce((sum, r) => sum + r.score, 0);
          const totalSessions = records.length;
          const averageAccuracy = totalSessions > 0 ? records.reduce((sum, r) => sum + r.accuracy, 0) / totalSessions : 0;
          const bestScore = records.length > 0 ? Math.max(...records.map(r => r.score)) : 0;

          set({
            history: {
              records,
              totalScore,
              totalSessions,
              averageAccuracy,
              bestScore,
            },
          });
        }
      } catch {
        // ignore
      }
    },

    clearHistory: () => {
      localStorage.removeItem(RECORDS_KEY);
      set({
        history: {
          records: [],
          totalScore: 0,
          totalSessions: 0,
          averageAccuracy: 0,
          bestScore: 0,
        },
      });
    },

    buildReplayFrames: () => {
      const steps = get().scenarioSteps;
      const session = get().activeSession;
      if (!session) return;

      const frames: FaultReplayFrame[] = steps.map((step, idx) => {
        const action = session.userActions.find(
          a => a.actionType === 'step_forward' && a.data?.stepNumber === step.stepNumber
        ) || null;
        return {
          stepIndex: idx,
          step,
          userAction: action,
          elapsedAtStep: 0,
        };
      });

      set({ replayFrames: frames });
    },
  };
});
