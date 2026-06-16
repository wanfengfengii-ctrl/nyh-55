import { create } from 'zustand';
import type {
  EngineState,
  EngineConfig,
  ComputationStep,
  AnimationDetail,
} from '@/types';
import { DEFAULT_CONFIG } from '@/types';
import { createEngineState, executeStep, deepCloneState } from '@/engine/DifferenceEngine';

interface EngineStore {
  engineState: EngineState | null;
  config: EngineConfig;
  isAnimating: boolean;
  animationDetail: AnimationDetail | null;
  operationLog: ComputationStep[];
  historyStack: EngineState[];
  isInitialized: boolean;
  isRunning: boolean;
  displayPhase: EngineState['phase'];

  initialize: (config?: Partial<EngineConfig>) => void;
  stepForward: () => void;
  stepBack: () => void;
  reset: () => void;
  setAnimating: (v: boolean) => void;
  setAnimationDetail: (d: AnimationDetail | null) => void;
  updateConfig: (partial: Partial<EngineConfig>) => void;
  startContinuous: () => void;
  stopContinuous: () => void;
  continuousTick: () => void;
  setDisplayPhase: (p: EngineState['phase']) => void;
  setIsRunning: (v: boolean) => void;
}

export const useEngineStore = create<EngineStore>((set, get) => ({
  engineState: null,
  config: { ...DEFAULT_CONFIG },
  isAnimating: false,
  animationDetail: null,
  operationLog: [],
  historyStack: [],
  isInitialized: false,
  isRunning: false,
  displayPhase: 'idle',

  initialize: (configOverride) => {
    const cfg = { ...get().config, ...configOverride };
    try {
      const state = createEngineState(cfg);
      set({
        engineState: state,
        config: cfg,
        isInitialized: true,
        operationLog: [],
        historyStack: [],
        isAnimating: false,
        animationDetail: null,
        isRunning: false,
        displayPhase: 'idle',
      });
    } catch (e) {
      console.error('初始化差分机失败:', e);
    }
  },

  stepForward: () => {
    const { engineState, isAnimating, isRunning } = get();
    if (!engineState || isAnimating) return;
    if (engineState.phase === 'error' || engineState.phase === 'complete') return;

    const snapshot = deepCloneState(engineState);
    const result = executeStep(engineState, engineState.currentStep);

    const hasCarry = result.animation.carryTriggers.length > 0;

    set((s) => ({
      engineState: result.newState,
      operationLog: [...s.operationLog, result.log],
      historyStack: [...s.historyStack, snapshot],
      animationDetail: result.animation,
      isAnimating: true,
      displayPhase: 'adding',
    }));

    if (hasCarry) {
      setTimeout(() => {
      if (get().isAnimating) {
        set({ displayPhase: 'carrying' });
      }
      }, 500);
    }

    if (result.error && isRunning) {
      set({ isRunning: false });
    }
  },

  stepBack: () => {
    const { historyStack, isAnimating, isRunning } = get();
    if (isAnimating || isRunning || historyStack.length === 0) return;

    const prevState = historyStack[historyStack.length - 1];
    set((s) => ({
      engineState: prevState,
      historyStack: s.historyStack.slice(0, -1),
      operationLog: s.operationLog.slice(0, -1),
      animationDetail: null,
      isAnimating: false,
      displayPhase: prevState.phase,
    }));
  },

  reset: () => {
    set({
      engineState: null,
      isInitialized: false,
      operationLog: [],
      historyStack: [],
      isAnimating: false,
      animationDetail: null,
      isRunning: false,
      displayPhase: 'idle',
    });
  },

  setAnimating: (v) => {
    set({ isAnimating: v });
    if (!v) {
      const { isRunning, engineState } = get();
      set({ displayPhase: engineState?.phase ?? 'idle' });
      if (isRunning && engineState) {
        if (engineState.phase === 'error' || engineState.phase === 'complete') {
          set({ isRunning: false });
        }
      }
    }
  },
  setAnimationDetail: (d) => set({ animationDetail: d }),
  setDisplayPhase: (p) => set({ displayPhase: p }),

  setIsRunning: (v) => set({ isRunning: v }),

  updateConfig: (partial) => {
    set((s) => ({ config: { ...s.config, ...partial } }));
  },

  startContinuous: () => {
    const { engineState, isAnimating } = get();
    if (!engineState || isAnimating) return;
    if (engineState.phase === 'error' || engineState.phase === 'complete') return;
    set({ isRunning: true });
  },

  stopContinuous: () => {
    set({ isRunning: false });
  },

  continuousTick: () => {
    const { isRunning, isAnimating, engineState } = get();
    if (!isRunning || isAnimating) return;
    if (!engineState || engineState.phase === 'error' || engineState.phase === 'complete') {
      set({ isRunning: false });
      return;
    }
    get().stepForward();
  },
}));
