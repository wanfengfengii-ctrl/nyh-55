import type {
  EngineState,
  EngineConfig,
  ComputationStep,
  EngineStoreSnapshot,
  DemoRecording,
  DemoStepRecord,
} from '@/types';
import { mechanicalEngine } from '../mechanical/MechanicalEngine';
import { animationController } from '../animation/AnimationController';
import { globalEventBus } from '../core/EventBus';
import { BaseReplayable } from '../core/BaseReplayable';
import type {
  ExecutionCommand,
  ExecutionFrame,
  RecordingServiceState,
  ISnapshot,
  DemoControlAction,
} from '../core/types';

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class ExecutionCoordinator
  extends BaseReplayable<ExecutionFrame>
  implements ISnapshot<EngineStoreSnapshot>
{
  private _isRunning: boolean = false;
  private _continuousTimer: ReturnType<typeof setInterval> | null = null;
  private _onCommand?: (cmd: ExecutionCommand) => void;

  setCommandHandler(handler: (cmd: ExecutionCommand) => void): void {
    this._onCommand = handler;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  dispatchCommand(command: ExecutionCommand): void {
    this._onCommand?.(command);
    globalEventBus.publish({
      type: 'execution.command.dispatched',
      source: 'execution',
      payload: { command },
    });

    switch (command.type) {
      case 'initialize':
        this._executeInitialize(command.config);
        break;
      case 'step_forward':
        this._executeStepForward();
        break;
      case 'step_back':
        this._executeStepBack();
        break;
      case 'reset':
        this._executeReset();
        break;
      case 'continuous_start':
        this._startContinuous();
        break;
      case 'continuous_stop':
        this._stopContinuous();
        break;
    }
  }

  private _executeInitialize(config?: Partial<EngineConfig>): void {
    if (config) {
      mechanicalEngine.updateConfig(config);
    }
    mechanicalEngine.initialize(config);
  }

  private _executeStepForward(): void {
    if (animationController.isAnimating) return;
    if (!mechanicalEngine.canStepForward()) return;

    const result = mechanicalEngine.stepForward();
    if (!result) return;

    animationController.startAnimation(result.animation, () => {
      if (this._isRunning && !mechanicalEngine.canStepForward()) {
        this._stopContinuous();
      }
    });
  }

  private _executeStepBack(): void {
    if (animationController.isAnimating) return;
    if (this._isRunning) return;
    mechanicalEngine.stepBack();
    animationController.setDisplayPhase(
      mechanicalEngine.engineState?.phase ?? 'idle'
    );
  }

  private _executeReset(): void {
    this._stopContinuous();
    mechanicalEngine.reset();
    animationController.stopAnimation();
    animationController.setDisplayPhase('idle');
  }

  private _startContinuous(): void {
    if (animationController.isAnimating) return;
    if (!mechanicalEngine.canStepForward()) return;
    this._isRunning = true;
    this._scheduleContinuousTick();
  }

  private _stopContinuous(): void {
    this._isRunning = false;
    if (this._continuousTimer) {
      clearInterval(this._continuousTimer);
      this._continuousTimer = null;
    }
  }

  private _scheduleContinuousTick(): void {
    if (this._continuousTimer) {
      clearInterval(this._continuousTimer);
    }
    this._continuousTimer = setInterval(() => {
      this._continuousTick();
    }, 50);
  }

  private _continuousTick(): void {
    if (!this._isRunning) return;
    if (animationController.isAnimating) return;
    if (!mechanicalEngine.canStepForward()) {
      this._stopContinuous();
      return;
    }
    this._executeStepForward();
  }

  takeSnapshot(): EngineStoreSnapshot {
    const state = mechanicalEngine.state;
    return {
      engineState: state.engineState ? clone(state.engineState) : null,
      operationLog: clone(state.operationLog),
      historyStack: mechanicalEngine.historyStack.map((s) => clone(s)),
      isInitialized: state.isInitialized,
      isAnimating: animationController.isAnimating,
      animationDetail: animationController.currentDetail
        ? clone(animationController.currentDetail)
        : null,
      isRunning: this._isRunning,
      displayPhase: animationController.displayPhase,
      config: clone(state.config),
    };
  }

  restoreSnapshot(snapshot: EngineStoreSnapshot): void {
    if (!this.canRestoreFrom(snapshot)) return;

    if (snapshot.config) {
      mechanicalEngine.updateConfig(snapshot.config);
    }
    if (snapshot.engineState) {
      mechanicalEngine.setEngineStateDirect(clone(snapshot.engineState));
    }
    mechanicalEngine.setOperationLog(clone(snapshot.operationLog));
    mechanicalEngine.setHistoryStack(snapshot.historyStack);
    if (snapshot.animationDetail) {
      animationController.updateAnimationDetail(clone(snapshot.animationDetail));
    }
    animationController.setDisplayPhase(snapshot.displayPhase);
    this._isRunning = snapshot.isRunning;
  }

  canRestoreFrom(snapshot: EngineStoreSnapshot): boolean {
    return (
      snapshot &&
      typeof snapshot === 'object' &&
      'engineState' in snapshot &&
      'config' in snapshot
    );
  }

  public buildFrames(): ExecutionFrame[] {
    const logs = mechanicalEngine.operationLog;
    const frames: ExecutionFrame[] = [];
    const history = mechanicalEngine.historyStack;

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const prevSnapshot = history[i] ?? null;
      frames.push({
        index: i,
        command: { type: 'step_forward' },
        engineSnapshot: prevSnapshot ?? (mechanicalEngine.engineState as EngineState),
        operationLogSnapshot: logs.slice(0, i + 1),
        timestamp: log.timestamp,
      });
    }
    return frames;
  }

  protected applyFrame(frame: ExecutionFrame, _index: number): void {
    this.restoreSnapshot({
      engineState: clone(frame.engineSnapshot),
      operationLog: clone(frame.operationLogSnapshot),
      historyStack: [],
      isInitialized: true,
      isAnimating: false,
      animationDetail: null,
      isRunning: false,
      displayPhase: frame.engineSnapshot.phase,
      config: mechanicalEngine.config,
    });
  }

  destroy(): void {
    this._stopContinuous();
    super.destroy();
  }
}

export class RecordingService
  extends BaseReplayable<DemoStepRecord>
  implements ISnapshot<RecordingServiceState>
{
  private _activeRecording: DemoRecording | null = null;
  private _savedRecordings: DemoRecording[] = [];
  private _isRecording: boolean = false;
  private _currentNarration: string = '';
  private readonly STORAGE_KEY = 'diff_engine_demo_recordings';

  get state(): RecordingServiceState {
    return {
      activeRecording: this._activeRecording ? clone(this._activeRecording) : null,
      savedRecordings: clone(this._savedRecordings),
      isRecording: this._isRecording,
      replayFrames: clone(this._replayFrames),
      isReplaying: this._isReplaying,
      replayIndex: this._replayIndex,
      replaySpeed: this._replaySpeed,
      currentNarration: this._currentNarration,
    };
  }

  get isRecording(): boolean {
    return this._isRecording;
  }

  get activeRecording(): DemoRecording | null {
    return this._activeRecording ? clone(this._activeRecording) : null;
  }

  get savedRecordings(): DemoRecording[] {
    return clone(this._savedRecordings);
  }

  setNarration(text: string): void {
    this._currentNarration = text;
  }

  startRecording(
    initialState: EngineState,
    operationLog: ComputationStep[],
    sessionInfo: {
      sessionId?: string;
      sessionName?: string;
      hostId: string;
      hostName: string;
      operatorId: string;
      operatorName: string;
    }
  ): void {
    if (this._isRecording) return;

    const recording: DemoRecording = {
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId: sessionInfo.sessionId || 'local',
      sessionName: sessionInfo.sessionName || '',
      startTime: Date.now(),
      endTime: null,
      steps: [
        {
          stepNumber: 0,
          engineSnapshot: clone(initialState),
          operationLogSnapshot: clone(operationLog),
          operatorId: sessionInfo.operatorId,
          operatorName: sessionInfo.operatorName,
          timestamp: Date.now(),
          annotations: [],
          controlAction: 'initialize',
        },
      ],
      hostId: sessionInfo.hostId,
      hostName: sessionInfo.hostName,
      annotations: [],
      isComplete: false,
    };

    this._activeRecording = recording;
    this._isRecording = true;
    this._currentNarration = '';
  }

  recordStep(
    action: DemoControlAction,
    engineState: EngineState,
    operationLog: ComputationStep[],
    operatorInfo: {
      operatorId: string;
      operatorName: string;
    },
    annotations: unknown[] = [],
    narration?: string
  ): void {
    if (!this._isRecording || !this._activeRecording) return;

    const stepRecord: DemoStepRecord = {
      stepNumber: this._activeRecording.steps.length,
      engineSnapshot: clone(engineState),
      operationLogSnapshot: clone(operationLog),
      operatorId: operatorInfo.operatorId,
      operatorName: operatorInfo.operatorName,
      timestamp: Date.now(),
      annotations: annotations as DemoStepRecord['annotations'],
      controlAction: action,
      narrationText: narration || this._currentNarration || undefined,
    };

    this._activeRecording = {
      ...this._activeRecording,
      steps: [...this._activeRecording.steps, stepRecord],
    };
    this._currentNarration = '';
  }

  stopRecording(annotations: unknown[] = []): DemoRecording | null {
    if (!this._activeRecording) return null;

    const finalRecording: DemoRecording = {
      ...this._activeRecording,
      endTime: Date.now(),
      isComplete: true,
      annotations: annotations as DemoRecording['annotations'],
    };

    this._savedRecordings = [finalRecording, ...this._savedRecordings].slice(0, 50);
    this._activeRecording = null;
    this._isRecording = false;
    this._persistToStorage();
    return finalRecording;
  }

  buildFrames(): DemoStepRecord[] {
    const recording = this._activeRecording || this._savedRecordings[0];
    this._replayFrames = recording ? clone(recording.steps) : [];
    return this._replayFrames;
  }

  protected applyFrame(frame: DemoStepRecord, _index: number): void {
    if (frame.engineSnapshot) {
      mechanicalEngine.setEngineStateDirect(clone(frame.engineSnapshot));
    }
    mechanicalEngine.setOperationLog(clone(frame.operationLogSnapshot));
  }

  setReplaySpeed(speed: number): void {
    this._replaySpeed = Math.max(0.25, Math.min(4, speed));
    super.setReplaySpeed(speed);
  }

  deleteSavedRecording(id: string): void {
    this._savedRecordings = this._savedRecordings.filter((r) => r.id !== id);
    this._persistToStorage();
  }

  clearSavedRecordings(): void {
    this._savedRecordings = [];
    this._persistToStorage();
  }

  loadFromStorage(): void {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        this._savedRecordings = JSON.parse(data) as DemoRecording[];
      }
    } catch (e) {
      console.warn('[RecordingService] Failed to load:', e);
    }
  }

  private _persistToStorage(): void {
    try {
      localStorage.setItem(
        this.STORAGE_KEY,
        JSON.stringify(
          this._savedRecordings.map((r) => ({
            ...r,
            steps: r.steps.slice(0, 200),
          }))
        )
      );
    } catch (e) {
      console.warn('[RecordingService] Failed to save:', e);
    }
  }

  exportAsJSON(recording: DemoRecording): string {
    return JSON.stringify(recording, null, 2);
  }

  importFromJSON(json: string): DemoRecording | null {
    try {
      const parsed = JSON.parse(json) as DemoRecording;
      if (!parsed.id || !parsed.steps) return null;
      const imported: DemoRecording = {
        ...parsed,
        id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        steps: parsed.steps.map((s, i) => ({ ...s, stepNumber: i })),
      };
      this._savedRecordings = [imported, ...this._savedRecordings].slice(0, 50);
      this._persistToStorage();
      return imported;
    } catch (e) {
      console.error('[RecordingService] Import failed:', e);
      return null;
    }
  }

  takeSnapshot(): RecordingServiceState {
    return clone(this.state);
  }

  restoreSnapshot(snapshot: RecordingServiceState): void {
    if (!this.canRestoreFrom(snapshot)) return;
    this._activeRecording = snapshot.activeRecording
      ? clone(snapshot.activeRecording)
      : null;
    this._savedRecordings = clone(snapshot.savedRecordings);
    this._isRecording = snapshot.isRecording;
    this._replayFrames = clone(snapshot.replayFrames);
    this._isReplaying = snapshot.isReplaying;
    this._replayIndex = snapshot.replayIndex;
    this._replaySpeed = snapshot.replaySpeed;
    this._currentNarration = snapshot.currentNarration;
  }

  canRestoreFrom(snapshot: RecordingServiceState): boolean {
    return (
      snapshot && typeof snapshot === 'object' && 'savedRecordings' in snapshot
    );
  }

  destroy(): void {
    super.destroy();
  }
}

export const executionCoordinator = new ExecutionCoordinator();
export const recordingService = new RecordingService();
