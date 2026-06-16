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
