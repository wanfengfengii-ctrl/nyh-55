import type {
  EngineState,
  EngineConfig,
  ComputationStep,
  AnimationDetail,
  ProgramCard,
  CardExecutionRecord,
  EngineStoreSnapshot,
  FaultTrainingSession,
  UserDiagnosisSubmission,
  DiagnosisEvaluation,
  FaultScenarioStep,
  MechanicalFault,
  Participant,
  DemoRecording,
  DemoStepRecord,
  AnnotationTarget,
  Annotation,
} from '@/types';

export type DomainModuleId =
  | 'mechanical'
  | 'animation'
  | 'execution'
  | 'cardProgram'
  | 'collaboration'
  | 'faultTraining'
  | 'verification'
  | 'annotation'
  | 'recording';

export interface DomainEvent<T = unknown> {
  id: string;
  type: string;
  source: DomainModuleId;
  target?: DomainModuleId;
  timestamp: number;
  payload: T;
}

export interface EventHandler<T = unknown> {
  (event: DomainEvent<T>): void | Promise<void>;
}

export type EventSubscription = () => void;

export interface IEventBus {
  publish<T>(event: Omit<DomainEvent<T>, 'id' | 'timestamp'>): DomainEvent<T>;
  subscribe<T>(type: string, handler: EventHandler<T>): EventSubscription;
  unsubscribe(type: string, handler: EventHandler): void;
  clear(): void;
}

export interface IStateMachine<S extends string, E extends string> {
  currentState: S;
  transition(event: E): boolean;
  canTransition(event: E): boolean;
  getValidTransitions(): E[];
  subscribe(listener: (from: S, to: S, event: E) => void): () => void;
}

export interface ISnapshot<TSnapshot> {
  takeSnapshot(): TSnapshot;
  restoreSnapshot(snapshot: TSnapshot): void;
  canRestoreFrom(snapshot: TSnapshot): boolean;
}

export interface IExecutable {
  canStepForward(): boolean;
  stepForward(): void;
  canStepBack(): boolean;
  stepBack(): void;
  reset(): void;
  isIdle(): boolean;
}

export interface IReplayable<TFrame> {
  buildFrames(): TFrame[];
  canReplay(): boolean;
  startReplay(): void;
  pauseReplay(): void;
  resumeReplay(): void;
  stopReplay(): void;
  replayNext(): boolean;
  replayPrev(): boolean;
  replayGoto(index: number): void;
  setReplaySpeed(speed: number): void;
  isReplaying: boolean;
  replayIndex: number;
  replayFrames: TFrame[];
}

export interface ExecutionCommand {
  type: 'step_forward' | 'step_back' | 'reset' | 'initialize' | 'continuous_start' | 'continuous_stop';
  config?: Partial<EngineConfig>;
  operatorId?: string;
  operatorName?: string;
  narration?: string;
}

export interface ExecutionFrame {
  index: number;
  command: ExecutionCommand;
  engineSnapshot: EngineState;
  operationLogSnapshot: ComputationStep[];
  timestamp: number;
  operatorId?: string;
  operatorName?: string;
  annotations?: unknown[];
  narration?: string;
}

export interface MechanicalExecutionResult {
  newState: EngineState;
  animation: AnimationDetail;
  log: ComputationStep;
  error: { type: string; column: number; wheel: number; message: string } | null;
}

export type MechanicalPhase = 'idle' | 'adding' | 'carrying' | 'error' | 'complete';

export interface MechanicalEngineState {
  engineState: EngineState | null;
  config: EngineConfig;
  isInitialized: boolean;
  phase: MechanicalPhase;
  operationLog: ComputationStep[];
  error: { type: string; column: number; wheel: number; message: string } | null;
}

export type AnimationState = 'idle' | 'animating' | 'paused';

export interface AnimationControllerState {
  state: AnimationState;
  currentDetail: AnimationDetail | null;
  displayPhase: EngineState['phase'];
  speed: number;
}

export type CardProgramStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'error';

export interface CardProgramExecutionResult {
  success: boolean;
  shouldStop: boolean;
  shouldContinue: boolean;
  description: string;
  error?: string;
  engineStateAfter?: EngineState;
}

export interface CardProgramServiceState {
  cards: ProgramCard[];
  currentCardIndex: number;
  status: CardProgramStatus;
  executionRecords: CardExecutionRecord[];
  executionHistory: { cardIndex: number; engineSnapshot: EngineStoreSnapshot }[];
  error: string | null;
}

export type CollaborationStatus = 'disconnected' | 'waiting' | 'running' | 'paused' | 'error' | 'ended';

export interface CollaborationServiceState {
  isInSession: boolean;
  sessionId: string | null;
  sessionCode: string | null;
  sessionName: string;
  status: CollaborationStatus;
  userId: string;
  userName: string;
  userRole: 'host' | 'audience';
  participants: Participant[];
  currentPresenterId: string | null;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'out_of_sync';
  mismatchError: string | null;
}

export type FaultTrainingStatus = 'idle' | 'setup' | 'running' | 'diagnosing' | 'evaluated' | 'completed';

export interface FaultTrainingServiceState {
  activeSession: FaultTrainingSession | null;
  scenarioSteps: FaultScenarioStep[];
  status: FaultTrainingStatus;
  showCorrectComparison: boolean;
  showEvaluationDetail: DiagnosisEvaluation | null;
}

export type DemoControlAction = DemoStepRecord['controlAction'];

export interface RecordingServiceState {
  activeRecording: DemoRecording | null;
  savedRecordings: DemoRecording[];
  isRecording: boolean;
  replayFrames: DemoStepRecord[];
  isReplaying: boolean;
  replayIndex: number;
  replaySpeed: number;
  currentNarration: string;
}

export type MechanicalEvent =
  | 'mechanical.initialized'
  | 'mechanical.step.executed'
  | 'mechanical.step.rolledback'
  | 'mechanical.reset'
  | 'mechanical.error'
  | 'mechanical.complete';

export type AnimationEvent =
  | 'animation.started'
  | 'animation.updated'
  | 'animation.completed'
  | 'animation.phase.changed';

export type ExecutionEvent =
  | 'execution.command.dispatched'
  | 'execution.frame.recorded'
  | 'execution.history.pushed'
  | 'execution.history.popped'
  | 'execution.replay.started'
  | 'execution.replay.stopped';

export type CardProgramEvent =
  | 'cardprogram.started'
  | 'cardprogram.card.executed'
  | 'cardprogram.paused'
  | 'cardprogram.resumed'
  | 'cardprogram.stopped'
  | 'cardprogram.error';

export type CollaborationEvent =
  | 'collab.session.created'
  | 'collab.session.joined'
  | 'collab.session.left'
  | 'collab.participant.joined'
  | 'collab.participant.left'
  | 'collab.state.sync.received'
  | 'collab.control.received'
  | 'collab.state.mismatch';

export type FaultTrainingEvent =
  | 'fault.training.started'
  | 'fault.training.step.executed'
  | 'fault.training.diagnosis.submitted'
  | 'fault.training.hint.requested'
  | 'fault.training.completed'
  | 'fault.training.reset';

export interface MechanicalInitializedPayload {
  config: EngineConfig;
  state: EngineState;
}

export interface MechanicalStepExecutedPayload {
  previousState: EngineState;
  newState: EngineState;
  result: MechanicalExecutionResult;
}

export interface MechanicalStepRolledbackPayload {
  restoredState: EngineState;
  poppedLog: ComputationStep;
}

export interface AnimationStartedPayload {
  detail: AnimationDetail;
  duration: number;
}

export interface AnimationPhaseChangedPayload {
  from: EngineState['phase'];
  to: EngineState['phase'];
}

export interface ExecutionCommandDispatchedPayload {
  command: ExecutionCommand;
}

export interface CardProgramCardExecutedPayload {
  cardIndex: number;
  card: ProgramCard;
  result: CardProgramExecutionResult;
  record: CardExecutionRecord;
}

export interface FaultTrainingDiagnosisSubmittedPayload {
  submission: UserDiagnosisSubmission;
  evaluation: DiagnosisEvaluation;
}

export interface FaultTrainingStepPayload {
  step: FaultScenarioStep;
  activeFaults: MechanicalFault[];
}

export interface IVerifiable {
  verify(): VerificationResult;
}

export interface VerificationResult {
  consistent: boolean;
  message: string;
  mismatches?: Array<{
    step?: number;
    column?: number;
    expected: number;
    actual: number;
    detail?: string;
  }>;
}

export interface IErrorHandleable {
  getLastError(): DomainError | null;
  clearError(): void;
  onError(handler: (error: DomainError) => void): () => void;
}

export interface DomainError {
  code: string;
  message: string;
  module: DomainModuleId;
  timestamp: number;
  context?: Record<string, unknown>;
  recoverable: boolean;
}

export interface IAnnotatable {
  addAnnotation(
    target: AnnotationTarget,
    content: string,
    stepNumber: number
  ): Annotation | null;
  getAnnotationsForStep(stepNumber: number): Annotation[];
  getAnnotationsForTarget(target: AnnotationTarget): Annotation[];
  resolveAnnotation(id: string, resolved: boolean): void;
  removeAnnotation(id: string): void;
}

export interface IRecordable<TFrame> {
  startRecording(meta?: Record<string, unknown>): void;
  stopRecording(): { id: string; frames: TFrame[] } | null;
  isRecording: boolean;
  recordFrame(frame: TFrame): void;
  getActiveRecording(): { id: string; frames: TFrame[] } | null;
}

export interface VerificationEventPayload {
  result: VerificationResult;
  verifiedAt: number;
  sourceModule: DomainModuleId;
}

export type VerificationEvent = 'verification.completed' | 'verification.failed';

export type AllDomainEvents =
  | MechanicalEvent
  | AnimationEvent
  | ExecutionEvent
  | CardProgramEvent
  | CollaborationEvent
  | FaultTrainingEvent
  | VerificationEvent;

export function createEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createDomainError(
  module: DomainModuleId,
  code: string,
  message: string,
  context?: Record<string, unknown>,
  recoverable = true
): DomainError {
  return {
    code,
    message,
    module,
    timestamp: Date.now(),
    context,
    recoverable,
  };
}
