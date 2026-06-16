import { create } from 'zustand';
import type {
  ProgramCard,
  CardExecutionRecord,
  CardProgramState,
  EngineState,
  ComputationStep,
  EngineConfig,
} from '@/types';
import {
  DEFAULT_INITIAL_CARD,
  DEFAULT_STEP_CARD,
  DEFAULT_STOP_CARD,
  DEFAULT_ERROR_CARD,
} from '@/types';
import { validateCard, executeCard } from '@/engine/cardProgramEngine';
import { computeDiffTableIndependent } from '@/utils/math';

interface CardProgramStore extends CardProgramState {
  setCards: (cards: ProgramCard[]) => void;
  addCard: (card: ProgramCard) => void;
  removeCard: (cardId: string) => void;
  updateCard: (cardId: string, updates: Partial<ProgramCard>) => void;
  reorderCards: (fromIndex: number, toIndex: number) => void;
  validateAllCards: () => boolean;
  setCurrentCardIndex: (index: number) => void;
  startProgram: () => void;
  pauseProgram: () => void;
  resumeProgram: () => void;
  stopProgram: () => void;
  executeSingleCard: () => void;
  executeAllCards: () => void;
  stepBackCard: () => { cardIndex: number; engineState: EngineState; operationLog: ComputationStep[] } | null;
  resetProgram: () => void;
  setProgramError: (error: string | null) => void;
  addExecutionRecord: (record: CardExecutionRecord) => void;
  clearExecutionRecords: () => void;
  saveExecutionHistory: (cardIndex: number, engineState: EngineState, operationLog: ComputationStep[]) => void;
  popExecutionHistory: () => { cardIndex: number; engineState: EngineState; operationLog: ComputationStep[] } | null;
  executeCardStep: (
    getEngineState: () => EngineState | null,
    getOperationLog: () => ComputationStep[],
    initializeEngine: (config: Partial<EngineConfig>) => void,
    stepForward: () => void,
    stepBack: () => void,
    getConfig: () => EngineConfig,
    setIsRunning: (v: boolean) => void
  ) => { shouldStop: boolean; shouldContinue: boolean };
  verifyConsistency: (
    engineState: EngineState,
    operationLog: ComputationStep[],
    config: EngineConfig
  ) => { consistent: boolean; message: string };
}

const generateId = () => `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const getDefaultCards = (): ProgramCard[] => [
  { ...DEFAULT_INITIAL_CARD, id: generateId() },
  { ...DEFAULT_STEP_CARD, id: generateId() },
  { ...DEFAULT_STOP_CARD, id: generateId() },
  { ...DEFAULT_ERROR_CARD, id: generateId() },
];

export const useCardProgramStore = create<CardProgramStore>((set, get) => ({
  cards: getDefaultCards(),
  currentCardIndex: -1,
  executionRecords: [],
  isProgramRunning: false,
  isProgramPaused: false,
  programError: null,
  executionHistory: [],

  setCards: (cards) => set({ cards }),

  addCard: (card) => set((s) => ({ cards: [...s.cards, { ...card, id: generateId() }] })),

  removeCard: (cardId) => set((s) => ({
    cards: s.cards.filter((c) => c.id !== cardId),
  })),

  updateCard: (cardId, updates) => set((s) => ({
    cards: s.cards.map((c) =>
      c.id === cardId ? { ...c, ...updates, isValid: true, validationError: undefined } : c
    ),
  })),

  reorderCards: (fromIndex, toIndex) => set((s) => {
    const newCards = [...s.cards];
    const [removed] = newCards.splice(fromIndex, 1);
    newCards.splice(toIndex, 0, removed);
    return { cards: newCards };
  }),

  validateAllCards: () => {
    const { cards } = get();
    let allValid = true;
    const validatedCards = cards.map((card) => {
      const { isValid, error } = validateCard(card);
      if (!isValid) allValid = false;
      return { ...card, isValid, validationError: error };
    });
    set({ cards: validatedCards });
    return allValid;
  },

  setCurrentCardIndex: (index) => set({ currentCardIndex: index }),

  startProgram: () => {
    const { validateAllCards } = get();
    const allValid = validateAllCards();
    if (!allValid) {
      set({ programError: '存在非法配置的卡片，请检查后重试' });
      return;
    }
    set({
      currentCardIndex: 0,
      isProgramRunning: true,
      isProgramPaused: false,
      programError: null,
      executionRecords: [],
      executionHistory: [],
    });
  },

  pauseProgram: () => set({ isProgramPaused: true }),

  resumeProgram: () => set({ isProgramPaused: false }),

  stopProgram: () => set({
    isProgramRunning: false,
    isProgramPaused: false,
    currentCardIndex: -1,
    programError: null,
  }),

  executeSingleCard: () => {
    const { validateAllCards, currentCardIndex, cards } = get();
    
    if (currentCardIndex === -1) {
      const allValid = validateAllCards();
      if (!allValid) {
        set({ programError: '存在非法配置的卡片，请检查后重试' });
        return;
      }
      set({
        currentCardIndex: 0,
        isProgramRunning: true,
        isProgramPaused: false,
        programError: null,
        executionRecords: [],
        executionHistory: [],
      });
      return;
    }

    if (currentCardIndex >= cards.length) {
      set({ isProgramRunning: false, programError: '所有卡片已执行完毕' });
      return;
    }
  },

  executeAllCards: () => {
    const { validateAllCards } = get();
    const allValid = validateAllCards();
    if (!allValid) {
      set({ programError: '存在非法配置的卡片，请检查后重试' });
      return;
    }
    set({
      currentCardIndex: 0,
      isProgramRunning: true,
      isProgramPaused: false,
      programError: null,
      executionRecords: [],
      executionHistory: [],
    });
  },

  stepBackCard: () => {
    const { executionHistory } = get();
    if (executionHistory.length === 0) return null;
    
    const prev = executionHistory[executionHistory.length - 1];
    set({
      currentCardIndex: prev.cardIndex,
      executionHistory: executionHistory.slice(0, -1),
      executionRecords: get().executionRecords.slice(0, -1),
    });
    return prev;
  },

  resetProgram: () => set({
    currentCardIndex: -1,
    isProgramRunning: false,
    isProgramPaused: false,
    programError: null,
    executionRecords: [],
    executionHistory: [],
  }),

  setProgramError: (error) => set({ programError: error }),

  addExecutionRecord: (record) => set((s) => ({
    executionRecords: [...s.executionRecords, record],
  })),

  clearExecutionRecords: () => set({ executionRecords: [] }),

  saveExecutionHistory: (cardIndex, engineState, operationLog) => set((s) => ({
    executionHistory: [...s.executionHistory, { cardIndex, engineState, operationLog }],
  })),

  popExecutionHistory: () => {
    const { executionHistory } = get();
    if (executionHistory.length === 0) return null;
    const last = executionHistory[executionHistory.length - 1];
    set({ executionHistory: executionHistory.slice(0, -1) });
    return last;
  },

  executeCardStep: (
    getEngineState,
    getOperationLog,
    initializeEngine,
    stepForward,
    stepBack,
    getConfig,
    setIsRunning
  ) => {
    const {
      cards,
      currentCardIndex,
      isProgramRunning,
      isProgramPaused,
      programError,
      addExecutionRecord,
      setCurrentCardIndex,
      setProgramError,
      saveExecutionHistory,
      stopProgram,
    } = get();

    if (!isProgramRunning || isProgramPaused || programError) {
      return { shouldStop: true, shouldContinue: false };
    }

    if (currentCardIndex >= cards.length) {
      stopProgram();
      return { shouldStop: true, shouldContinue: false };
    }

    const currentCard = cards[currentCardIndex];
    const engineState = getEngineState();

    const startTime = Date.now();
    const { isValid, error } = validateCard(currentCard);

    if (!isValid) {
      const endTime = Date.now();
      addExecutionRecord({
        cardId: currentCard.id,
        cardType: currentCard.type,
        cardLabel: currentCard.label,
        startTime,
        endTime,
        success: false,
        error: `卡片配置非法: ${error}`,
        operationLogIndex: getOperationLog().length,
        description: `卡片[${currentCard.label}]配置非法，执行终止`,
      });
      setProgramError(`卡片配置非法: ${error}，已停止执行`);
      setIsRunning(false);
      return { shouldStop: true, shouldContinue: false };
    }

    if (engineState && engineState.phase === 'error') {
      const endTime = Date.now();
      addExecutionRecord({
        cardId: currentCard.id,
        cardType: currentCard.type,
        cardLabel: currentCard.label,
        startTime,
        endTime,
        success: false,
        error: `机械处于错误状态: ${engineState.error?.message}`,
        operationLogIndex: getOperationLog().length,
        description: `机械处于错误状态，卡片[${currentCard.label}]执行终止`,
      });
      setProgramError(`机械处于错误状态: ${engineState.error?.message}，已停止执行`);
      setIsRunning(false);
      return { shouldStop: true, shouldContinue: false };
    }

    const execResult = executeCard(
      currentCard,
      engineState,
      getOperationLog(),
      getConfig(),
      initializeEngine,
      stepForward,
      stepBack
    );

    const endTime = Date.now();

    if (engineState) {
      saveExecutionHistory(currentCardIndex, JSON.parse(JSON.stringify(engineState)), [...getOperationLog()]);
    }

    addExecutionRecord({
      cardId: currentCard.id,
      cardType: currentCard.type,
      cardLabel: currentCard.label,
      startTime,
      endTime,
      success: execResult.success,
      error: execResult.error,
      engineStateSnapshot: execResult.newEngineState,
      operationLogIndex: getOperationLog().length,
      description: execResult.description,
    });

    if (!execResult.success && execResult.error) {
      setProgramError(execResult.error);
      setIsRunning(false);
      return { shouldStop: true, shouldContinue: false };
    }

    if (execResult.shouldStop) {
      stopProgram();
      return { shouldStop: true, shouldContinue: false };
    }

    const nextIndex = currentCardIndex + 1;
    if (nextIndex >= cards.length) {
      stopProgram();
      return { shouldStop: true, shouldContinue: false };
    }

    setCurrentCardIndex(nextIndex);
    return { shouldStop: false, shouldContinue: true };
  },

  verifyConsistency: (engineState, operationLog, config) => {
    const independentTable = computeDiffTableIndependent(
      config.initialValues,
      config.order,
      config.maxCrankTurns
    );

    const engineRows: Map<number, number[]> = new Map();
    if (operationLog.length > 0) {
      engineRows.set(0, operationLog[0].previousValues);
    } else if (engineState) {
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
        return {
          consistent: false,
          message: `x=${x} 时结果不一致: 引擎=${engineVal[0]}, 独立验算=${indepVal[0]}`,
        };
      }
    }

    const { executionRecords } = get();
    for (const record of executionRecords) {
      if (record.engineStateSnapshot) {
        for (let x = 0; x <= record.engineStateSnapshot.currentStep; x++) {
          const engineVal = engineRows.get(x);
          const indepVal = independentTable[x]?.values;
          if (!engineVal || !indepVal) continue;
          if (engineVal[0] !== indepVal[0]) {
            return {
              consistent: false,
              message: `卡片[${record.cardLabel}]执行后 x=${x} 时结果不一致: 引擎=${engineVal[0]}, 独立验算=${indepVal[0]}`,
            };
          }
        }
      }
    }

    return { consistent: true, message: '机械结果、卡片执行记录与差分表推算结果完全一致' };
  },
}));
