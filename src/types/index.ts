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
  executionHistory: { cardIndex: number; engineSnapshot: EngineStoreSnapshot }[];
}

export interface EngineStoreSnapshot {
  engineState: EngineState | null;
  operationLog: ComputationStep[];
  historyStack: EngineState[];
  isInitialized: boolean;
  isAnimating: boolean;
  animationDetail: AnimationDetail | null;
  isRunning: boolean;
  displayPhase: EngineState['phase'];
  config: EngineConfig;
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

export type UserRole = 'host' | 'audience';

export interface Participant {
  id: string;
  name: string;
  role: UserRole;
  joinedAt: number;
  lastSeen: number;
  avatarColor: string;
  stateHash: string | null;
}

export type SessionStatus = 'waiting' | 'running' | 'paused' | 'error' | 'ended';

export interface CollaborativeSession {
  id: string;
  name: string;
  hostId: string;
  createdAt: number;
  status: SessionStatus;
  participants: Map<string, Participant>;
  currentPresenterId: string;
  engineConfig: EngineConfig | null;
}

export type AnnotationTargetType = 'wheel' | 'lever' | 'gear' | 'column' | 'step';

export interface AnnotationTarget {
  type: AnnotationTargetType;
  columnIndex?: number;
  wheelIndex?: number;
  leverIndex?: number;
  stepNumber?: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface Annotation {
  id: string;
  sessionId: string;
  authorId: string;
  authorName: string;
  target: AnnotationTarget;
  content: string;
  stepNumber: number;
  createdAt: number;
  updatedAt: number;
  resolved: boolean;
  color: string;
}

export interface DemoStepRecord {
  stepNumber: number;
  engineSnapshot: EngineState;
  operationLogSnapshot: ComputationStep[];
  operatorId: string;
  operatorName: string;
  timestamp: number;
  annotations: Annotation[];
  narrationText?: string;
  controlAction: 'step_forward' | 'step_back' | 'reset' | 'continuous_start' | 'continuous_stop' | 'initialize';
}

export interface DemoRecording {
  id: string;
  sessionId: string;
  sessionName: string;
  startTime: number;
  endTime: number | null;
  steps: DemoStepRecord[];
  hostId: string;
  hostName: string;
  annotations: Annotation[];
  isComplete: boolean;
}

export type CollabMessageType =
  | 'session_created'
  | 'session_joined'
  | 'session_left'
  | 'participant_joined'
  | 'participant_left'
  | 'participant_updated'
  | 'control_step_forward'
  | 'control_step_back'
  | 'control_reset'
  | 'control_continuous_start'
  | 'control_continuous_stop'
  | 'control_initialize'
  | 'state_sync'
  | 'state_hash_check'
  | 'state_mismatch'
  | 'annotation_added'
  | 'annotation_updated'
  | 'annotation_resolved'
  | 'recording_started'
  | 'recording_stopped'
  | 'session_status_changed'
  | 'presenter_changed'
  | 'error_alert'
  | 'session_info'
  | 'session_info_request';

export interface CollabMessage<T = unknown> {
  id: string;
  type: CollabMessageType;
  sessionId: string;
  senderId: string;
  senderName: string;
  timestamp: number;
  payload: T;
}

export interface StateSyncPayload {
  engineSnapshot: EngineState | null;
  operationLog: ComputationStep[];
  historyStack: EngineState[];
  isAnimating: boolean;
  isRunning: boolean;
  displayPhase: EngineState['phase'];
  config: EngineConfig;
  sequence: number;
}

export interface StateHashPayload {
  stepNumber: number;
  stateHash: string;
  participantId: string;
}

export interface StateMismatchPayload {
  detectedBy: string;
  expectedHash: string;
  actualHash: string;
  stepNumber: number;
  hostStateSnapshot?: StateSyncPayload;
}

export interface ControlPayload {
  config?: Partial<EngineConfig>;
}

export interface SessionStatusPayload {
  status: SessionStatus;
  reason?: string;
}

export type FaultType = 'stuck_wheel' | 'misaligned_carry' | 'gear_desync' | 'rollback_failure';

export interface MechanicalFault {
  id: string;
  type: FaultType;
  columnIndex: number;
  wheelIndex?: number;
  leverIndex?: number;
  fromColumn?: number;
  toColumn?: number;
  triggerStep: number;
  description: string;
  causeDescription: string;
  symptomDescription: string;
  expectedValue?: number;
  actualValue?: number;
  evidenceHints: string[];
}

export type FaultDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface FaultScenario {
  id: string;
  title: string;
  description: string;
  difficulty: FaultDifficulty;
  faults: MechanicalFault[];
  engineConfig: EngineConfig;
  correctDiagnoses: FaultDiagnosis[];
  hintAnnotations: Annotation[];
  timeLimitSeconds: number;
  baseScore: number;
}

export interface FaultDiagnosis {
  faultId: string;
  faultType: FaultType;
  columnIndex: number;
  wheelIndex?: number;
  leverIndex?: number;
  stepNumber: number;
  causeDescription: string;
}

export interface UserDiagnosisSubmission {
  faultType: FaultType;
  columnIndex: number;
  wheelIndex?: number;
  leverIndex?: number;
  stepNumber: number;
  causeDescription: string;
}

export interface DiagnosisEvaluation {
  isCorrect: boolean;
  partialCredit: number;
  matchedFaultId: string | null;
  explanation: string;
  evidence: string[];
  standardAnswer: FaultDiagnosis;
  userAnswer: UserDiagnosisSubmission;
}

export interface FaultTrainingSession {
  id: string;
  scenarioId: string;
  scenario: FaultScenario;
  startTime: number;
  endTime: number | null;
  elapsedSeconds: number;
  status: 'setup' | 'running' | 'diagnosing' | 'evaluated' | 'completed';
  submissions: UserDiagnosisSubmission[];
  evaluations: DiagnosisEvaluation[];
  score: number;
  maxScore: number;
  currentStep: number;
  faultInjectedSteps: number[];
  userActions: FaultTrainingAction[];
  faultyOperationLog: ComputationStep[];
  correctOperationLog: ComputationStep[];
  faultyEngineState: EngineState | null;
  correctEngineState: EngineState | null;
  revealedHints: number;
  timerRunning: boolean;
}

export interface FaultTrainingAction {
  timestamp: number;
  actionType: 'step_forward' | 'step_back' | 'submit_diagnosis' | 'request_hint' | 'toggle_annotation' | 'pause_timer' | 'resume_timer';
  data?: Record<string, unknown>;
}

export interface FaultTrainingRecord {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  difficulty: FaultDifficulty;
  startTime: number;
  endTime: number;
  score: number;
  maxScore: number;
  accuracy: number;
  elapsedSeconds: number;
  submissionsCount: number;
  correctCount: number;
  partialCount: number;
  hintCount: number;
}

export interface FaultTrainingHistory {
  records: FaultTrainingRecord[];
  totalScore: number;
  totalSessions: number;
  averageAccuracy: number;
  bestScore: number;
}

export interface FaultScenarioStep {
  stepNumber: number;
  engineSnapshot: EngineState;
  correctSnapshot: EngineState;
  faultyOperationLog: ComputationStep[];
  correctOperationLog: ComputationStep[];
  activeFaults: MechanicalFault[];
  annotations: Annotation[];
  userAction?: FaultTrainingAction;
}

export interface FaultReplayFrame {
  stepIndex: number;
  step: FaultScenarioStep;
  userAction: FaultTrainingAction | null;
  elapsedAtStep: number;
}

export interface SessionInfoPayload {
  sessionId: string;
  sessionCode: string;
  sessionName: string;
  hostId: string;
  hostName: string;
  createdAt: number;
  participantCount: number;
  currentStatus: SessionStatus;
  engineConfig?: EngineConfig | null;
}
