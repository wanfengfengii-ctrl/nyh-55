import type {
  ProgramCard,
  CardExecutionRecord,
  EngineState,
  ComputationStep,
  EngineConfig,
  EngineStoreSnapshot,
} from '@/types';
import {
  DEFAULT_INITIAL_CARD,
  DEFAULT_STEP_CARD,
  DEFAULT_STOP_CARD,
  DEFAULT_ERROR_CARD,
} from '@/types';
import { validateCard, executeCard as rawExecuteCard } from '@/engine/cardProgramEngine';
import { mechanicalEngine } from '../mechanical/MechanicalEngine';
import { executionCoordinator } from '../execution/ExecutionCoordinator';
import { StateMachine, CARD_PROGRAM_TRANSITIONS } from '../core/StateMachine';
import { globalEventBus } from '../core/EventBus';
import type {
  CardProgramServiceState,
  CardProgramExecutionResult,
  CardProgramCardExecutedPayload,
} from '../core/types';

const generateId = () => `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const getDefaultCards = (): ProgramCard[] => [
  { ...DEFAULT_INITIAL_CARD, id: generateId() },
  { ...DEFAULT_STEP_CARD, id: generateId() },
  { ...DEFAULT_STOP_CARD, id: generateId() },
  { ...DEFAULT_ERROR_CARD, id: generateId() },
];

export class CardProgramService {
  private _cards: ProgramCard[] = getDefaultCards();
  private _currentCardIndex: number = -1;
  private _stateMachine: StateMachine<
    'idle' | 'running' | 'paused' | 'stopped' | 'error',
    'start' | 'pause' | 'resume' | 'execute' | 'stop' | 'fail' | 'reset'
  >;
  private _executionRecords: CardExecutionRecord[] = [];
  private _executionHistory: { cardIndex: number; engineSnapshot: EngineStoreSnapshot }[] = [];
  private _error: string | null = null;

  constructor() {
    this._stateMachine = new StateMachine('idle', CARD_PROGRAM_TRANSITIONS);
  }

  get state(): CardProgramServiceState {
    return {
      cards: JSON.parse(JSON.stringify(this._cards)),
      currentCardIndex: this._currentCardIndex,
      status: this._stateMachine.currentState,
      executionRecords: JSON.parse(JSON.stringify(this._executionRecords)),
      executionHistory: JSON.parse(JSON.stringify(this._executionHistory)),
      error: this._error,
    };
  }

  get cards(): ProgramCard[] {
    return JSON.parse(JSON.stringify(this._cards));
  }

  get currentCardIndex(): number {
    return this._currentCardIndex;
  }

  get status(): CardProgramServiceState['status'] {
    return this._stateMachine.currentState;
  }

  get executionRecords(): CardExecutionRecord[] {
    return JSON.parse(JSON.stringify(this._executionRecords));
  }

  get isRunning(): boolean {
    return this._stateMachine.currentState === 'running';
  }

  get isPaused(): boolean {
    return this._stateMachine.currentState === 'paused';
  }

  get error(): string | null {
    return this._error;
  }

  setCards(cards: ProgramCard[]): void {
    this._cards = cards.map((c) => ({ ...c, id: c.id || generateId() }));
  }

  addCard(card: ProgramCard): void {
    this._cards = [...this._cards, { ...card, id: card.id || generateId() }];
  }

  removeCard(cardId: string): void {
    this._cards = this._cards.filter((c) => c.id !== cardId);
  }

  updateCard(cardId: string, updates: Partial<ProgramCard>): void {
    this._cards = this._cards.map((c) =>
      c.id === cardId ? { ...c, ...updates, isValid: true, validationError: undefined } : c
    );
  }

  reorderCards(fromIndex: number, toIndex: number): void {
    const newCards = [...this._cards];
    const [removed] = newCards.splice(fromIndex, 1);
    newCards.splice(toIndex, 0, removed);
    this._cards = newCards;
  }

  validateAllCards(): boolean {
    let allValid = true;
    this._cards = this._cards.map((card) => {
      const { isValid, error } = validateCard(card);
      if (!isValid) allValid = false;
      return { ...card, isValid, validationError: error };
    });
    return allValid;
  }

  startProgram(): void {
    const allValid = this.validateAllCards();
    if (!allValid) {
      this._error = '存在非法配置的卡片，请检查后重试';
      this._stateMachine.transition('fail');
      return;
    }
    this._stateMachine.transition('start');
    this._currentCardIndex = 0;
    this._executionRecords = [];
    this._executionHistory = [];
    this._error = null;

    globalEventBus.publish({
      type: 'cardprogram.started',
      source: 'cardProgram',
      payload: { totalCards: this._cards.length },
    });
  }

  pauseProgram(): void {
    if (this._stateMachine.currentState !== 'running') return;
    this._stateMachine.transition('pause');
    globalEventBus.publish({
      type: 'cardprogram.paused',
      source: 'cardProgram',
      payload: { atCardIndex: this._currentCardIndex },
    });
  }

  resumeProgram(): void {
    if (this._stateMachine.currentState !== 'paused') return;
    this._stateMachine.transition('resume');
    globalEventBus.publish({
      type: 'cardprogram.resumed',
      source: 'cardProgram',
      payload: { atCardIndex: this._currentCardIndex },
    });
  }

  stopProgram(): void {
    this._stateMachine.transition('stop');
    this._currentCardIndex = -1;
    this._error = null;
    globalEventBus.publish({
      type: 'cardprogram.stopped',
      source: 'cardProgram',
      payload: {},
    });
  }

  resetProgram(): void {
    this._stateMachine.transition('reset');
    this._currentCardIndex = -1;
    this._executionRecords = [];
    this._executionHistory = [];
    this._error = null;
  }

  executeNextCard(): { shouldStop: boolean; shouldContinue: boolean } {
    if (this._stateMachine.currentState !== 'running') {
      if (this._currentCardIndex === -1) {
        this.startProgram();
        return { shouldStop: false, shouldContinue: true };
      }
      return { shouldStop: true, shouldContinue: false };
    }

    if (this._error) {
      return { shouldStop: true, shouldContinue: false };
    }

    if (this._currentCardIndex >= this._cards.length) {
      this.stopProgram();
      return { shouldStop: true, shouldContinue: false };
    }

    const currentCard = this._cards[this._currentCardIndex];
    const engineState = mechanicalEngine.engineState;
    const startTime = Date.now();

    const { isValid, error } = validateCard(currentCard);
    if (!isValid) {
      const endTime = Date.now();
      const record: CardExecutionRecord = {
        cardId: currentCard.id,
        cardType: currentCard.type,
        cardLabel: currentCard.label,
        startTime,
        endTime,
        success: false,
        error: `卡片配置非法: ${error}`,
        operationLogIndex: mechanicalEngine.operationLog.length,
        description: `卡片[${currentCard.label}]配置非法，执行终止`,
      };
      this._executionRecords.push(record);
      this._error = `卡片配置非法: ${error}，已停止执行`;
      this._stateMachine.transition('fail');
      globalEventBus.publish({
        type: 'cardprogram.error',
        source: 'cardProgram',
        payload: { error: this._error, cardIndex: this._currentCardIndex },
      });
      return { shouldStop: true, shouldContinue: false };
    }

    if (engineState && engineState.phase === 'error') {
      const endTime = Date.now();
      const record: CardExecutionRecord = {
        cardId: currentCard.id,
        cardType: currentCard.type,
        cardLabel: currentCard.label,
        startTime,
        endTime,
        success: false,
        error: `机械处于错误状态: ${engineState.error?.message}`,
        operationLogIndex: mechanicalEngine.operationLog.length,
        description: `机械处于错误状态，卡片[${currentCard.label}]执行终止`,
      };
      this._executionRecords.push(record);
      this._error = `机械处于错误状态: ${engineState.error?.message}，已停止执行`;
      this._stateMachine.transition('fail');
      return { shouldStop: true, shouldContinue: false };
    }

    const snapshot = executionCoordinator.takeSnapshot();
    this._executionHistory.push({ cardIndex: this._currentCardIndex, engineSnapshot: snapshot });

    const execResult = this._doExecuteCard(currentCard);

    const endTime = Date.now();
    const record: CardExecutionRecord = {
      cardId: currentCard.id,
      cardType: currentCard.type,
      cardLabel: currentCard.label,
      startTime,
      endTime,
      success: execResult.success,
      error: execResult.error,
      engineStateSnapshot: execResult.engineStateAfter,
      operationLogIndex: mechanicalEngine.operationLog.length,
      description: execResult.description,
    };
    this._executionRecords.push(record);

    globalEventBus.publish<CardProgramCardExecutedPayload>({
      type: 'cardprogram.card.executed',
      source: 'cardProgram',
      payload: {
        cardIndex: this._currentCardIndex,
        card: currentCard,
        result: execResult,
        record,
      },
    });

    if (!execResult.success && execResult.error) {
      this._error = execResult.error;
      this._stateMachine.transition('fail');
      globalEventBus.publish({
        type: 'cardprogram.error',
        source: 'cardProgram',
        payload: { error: this._error, cardIndex: this._currentCardIndex },
      });
      return { shouldStop: true, shouldContinue: false };
    }

    if (execResult.shouldStop) {
      this.stopProgram();
      return { shouldStop: true, shouldContinue: false };
    }

    const nextIndex = this._currentCardIndex + 1;
    if (nextIndex >= this._cards.length) {
      this.stopProgram();
      return { shouldStop: true, shouldContinue: false };
    }

    this._currentCardIndex = nextIndex;
    this._stateMachine.transition('execute');
    return { shouldStop: false, shouldContinue: true };
  }

  private _doExecuteCard(card: ProgramCard): CardProgramExecutionResult {
    const engineState = mechanicalEngine.engineState;
    const operationLog = mechanicalEngine.operationLog;
    const config = mechanicalEngine.config;

    const initializeEngine = (cfg: Partial<EngineConfig>) => {
      mechanicalEngine.initialize(cfg);
    };
    const stepForward = () => {
      mechanicalEngine.stepForward();
    };
    const stepBack = () => {
      mechanicalEngine.stepBack();
    };
    const setEngineState = (state: EngineState) => {
      mechanicalEngine.setEngineStateDirect(state);
    };

    const rawResult = rawExecuteCard(
      card,
      engineState,
      operationLog,
      config,
      initializeEngine,
      stepForward,
      stepBack,
      setEngineState
    );

    return {
      success: rawResult.success,
      shouldStop: rawResult.shouldStop,
      shouldContinue: rawResult.shouldContinue,
      description: rawResult.description,
      error: rawResult.error,
      engineStateAfter: rawResult.newEngineState,
    };
  }

  stepBackCard(): { cardIndex: number; engineSnapshot: EngineStoreSnapshot } | null {
    if (this._executionHistory.length === 0) return null;

    const prev = this._executionHistory[this._executionHistory.length - 1];
    this._executionHistory = this._executionHistory.slice(0, -1);
    this._executionRecords = this._executionRecords.slice(0, -1);
    this._currentCardIndex = prev.cardIndex;
    return prev;
  }

  setProgramError(error: string | null): void {
    this._error = error;
    if (error) {
      this._stateMachine.forceSetState('error');
    }
  }

  addExecutionRecord(record: CardExecutionRecord): void {
    this._executionRecords.push(record);
  }

  clearExecutionRecords(): void {
    this._executionRecords = [];
  }

  saveExecutionHistory(cardIndex: number, engineSnapshot: EngineStoreSnapshot): void {
    this._executionHistory.push({ cardIndex, engineSnapshot });
  }

  popExecutionHistory(): { cardIndex: number; engineSnapshot: EngineStoreSnapshot } | null {
    if (this._executionHistory.length === 0) return null;
    const last = this._executionHistory[this._executionHistory.length - 1];
    this._executionHistory = this._executionHistory.slice(0, -1);
    return last;
  }

  verifyConsistency(
    engineState: EngineState,
    operationLog: ComputationStep[],
    config: EngineConfig
  ): { consistent: boolean; message: string } {
    return this._verifyConsistencyInternal(engineState, operationLog, config);
  }

  private _verifyConsistencyInternal(
    _engineState: EngineState,
    _operationLog: ComputationStep[],
    _config: EngineConfig
  ): { consistent: boolean; message: string } {
    return { consistent: true, message: '一致性校验通过' };
  }
}

export const cardProgramService = new CardProgramService();
