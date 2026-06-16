export type EnginePhase = 'idle' | 'adding' | 'carrying' | 'error' | 'complete';

export interface ErrorInfo {
  type: 'overflow' | 'negative' | 'invalid_state' | 'carry_overflow';
  column: number;
  wheel: number;
  message: string;
}

export interface DigitWheelState {
  digit: number;
  prevDigit: number;
  rotation: number;
  isCarrying: boolean;
  isError: boolean;
}

export interface CarryLeverState {
  engaged: boolean;
  sourceWheel: number;
  targetWheel: number;
  progress: number;
}

export interface ColumnState {
  order: number;
  value: number;
  wheels: DigitWheelState[];
  carryLevers: CarryLeverState[];
  gearAngle: number;
  isActive: boolean;
  isError: boolean;
}

export interface EngineState {
  order: number;
  modulus: number;
  numDigits: number;
  columns: ColumnState[];
  crankPosition: number;
  crankTurns: number;
  phase: EnginePhase;
  error: ErrorInfo | null;
  currentStep: number;
  maxSteps: number;
}

export interface AnimationDetail {
  type: 'add' | 'carry' | 'reset';
  fromOrder: number;
  toOrder: number;
  wheelChanges: { column: number; wheel: number; from: number; to: number }[];
  carryTriggers: { column: number; wheel: number }[];
  duration: number;
}

export interface ComputationStep {
  stepNumber: number;
  crankTurn: number;
  phase: 'add' | 'carry';
  fromOrder: number;
  toOrder: number;
  previousValues: number[];
  newValues: number[];
  carryTriggered: boolean;
  errorOccurred: boolean;
  description: string;
  timestamp: number;
}

export interface EngineConfig {
  order: number;
  numDigits: number;
  modulus: number;
  initialValues: number[];
  maxCrankTurns: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
  order: 2,
  numDigits: 6,
  modulus: 1000000,
  initialValues: [0, 1, 2],
  maxCrankTurns: 10,
};

export type CardType = 'initial' | 'step' | 'stop' | 'error_handler';
export type StepRuleType = 'add' | 'multiply' | 'set' | 'custom';
export type StopConditionType = 'max_turns' | 'value_equals' | 'value_exceeds' | 'value_below' | 'error_occurred';
export type ErrorStrategyType = 'stop_immediately' | 'skip_and_continue' | 'retry_once' | 'use_fallback';

export interface ProgramCard {
  id: string;
  type: CardType;
  label: string;
  description: string;
  config: CardConfig;
  isValid: boolean;
  validationError?: string;
}

export interface CardConfig {
  initial?: InitialCardConfig;
  step?: StepCardConfig;
  stop?: StopCardConfig;
  errorHandler?: ErrorHandlerCardConfig;
}

export interface InitialCardConfig {
  order: number;
  numDigits: number;
  initialValues: number[];
  maxCrankTurns: number;
}

export interface StepCardConfig {
  ruleType: StepRuleType;
  value: number;
  targetColumn?: number;
  repeatCount: number;
}

export interface StopCardConfig {
  conditionType: StopConditionType;
  targetValue?: number;
  targetColumn?: number;
  maxTurns?: number;
}

export interface ErrorHandlerCardConfig {
  strategy: ErrorStrategyType;
  fallbackValue?: number;
  maxRetries?: number;
}

export interface CardExecutionRecord {
  cardId: string;
  cardType: CardType;
  cardLabel: string;
  startTime: number;
  endTime: number;
  success: boolean;
  error?: string;
  engineStateSnapshot?: EngineState;
  operationLogIndex: number;
  description: string;
}

export interface CardProgramState {
  cards: ProgramCard[];
  currentCardIndex: number;
  executionRecords: CardExecutionRecord[];
  isProgramRunning: boolean;
  isProgramPaused: boolean;
  programError: string | null;
  executionHistory: { cardIndex: number; engineState: EngineState; operationLog: ComputationStep[] }[];
}

export const DEFAULT_INITIAL_CARD: ProgramCard = {
  id: 'init-1',
  type: 'initial',
  label: '初始化数列',
  description: '设置差分机初始参数',
  isValid: true,
  config: {
    initial: {
      order: 2,
      numDigits: 6,
      initialValues: [0, 1, 4],
      maxCrankTurns: 10,
    },
  },
};

export const DEFAULT_STEP_CARD: ProgramCard = {
  id: 'step-1',
  type: 'step',
  label: '步进执行',
  description: '按规则执行步进',
  isValid: true,
  config: {
    step: {
      ruleType: 'add',
      value: 1,
      repeatCount: 1,
    },
  },
};

export const DEFAULT_STOP_CARD: ProgramCard = {
  id: 'stop-1',
  type: 'stop',
  label: '停止条件',
  description: '达到条件时停止执行',
  isValid: true,
  config: {
    stop: {
      conditionType: 'max_turns',
      maxTurns: 10,
    },
  },
};

export const DEFAULT_ERROR_CARD: ProgramCard = {
  id: 'error-1',
  type: 'error_handler',
  label: '异常处理',
  description: '处理执行中的异常',
  isValid: true,
  config: {
    errorHandler: {
      strategy: 'stop_immediately',
      maxRetries: 0,
    },
  },
};
