import type {
  EngineState,
  EngineConfig,
  ComputationStep,
  AnimationDetail,
} from '@/types';
import { DEFAULT_CONFIG } from '@/types';
import {
  createEngineState,
  executeStep as rawExecuteStep,
  deepCloneState,
} from '@/engine/DifferenceEngine';
import { StateMachine, MECHANICAL_TRANSITIONS } from '../core/StateMachine';
import { globalEventBus } from '../core/EventBus';
import type {
  MechanicalEngineState,
  MechanicalExecutionResult,
  IExecutable,
  ISnapshot,
  MechanicalInitializedPayload,
  MechanicalStepExecutedPayload,
  MechanicalStepRolledbackPayload,
} from '../core/types';

export class MechanicalEngine
  implements IExecutable, ISnapshot<MechanicalEngineState>
{
  private _config: EngineConfig = { ...DEFAULT_CONFIG };
  private _engineState: EngineState | null = null;
  private _operationLog: ComputationStep[] = [];
  private _historyStack: EngineState[] = [];
  private _stateMachine: StateMachine<
    'idle' | 'adding' | 'carrying' | 'error' | 'complete',
    'initialize' | 'step' | 'carry' | 'finish' | 'fail' | 'reset'
  >;
  private _error: MechanicalExecutionResult['error'] = null;
  private _lastAnimation: AnimationDetail | null = null;

  constructor() {
    this._stateMachine = new StateMachine('idle', MECHANICAL_TRANSITIONS);
  }

  get state(): MechanicalEngineState {
    return {
      engineState: this._engineState,
      config: { ...this._config },
      isInitialized: this._engineState !== null,
      phase: this._stateMachine.currentState,
      operationLog: [...this._operationLog],
      error: this._error,
    };
  }

  get engineState(): EngineState | null {
    return this._engineState;
  }

  get config(): EngineConfig {
    return { ...this._config };
  }

  get operationLog(): ComputationStep[] {
    return [...this._operationLog];
  }

  get historyStack(): EngineState[] {
    return [...this._historyStack];
  }

  get phase(): 'idle' | 'adding' | 'carrying' | 'error' | 'complete' {
    return this._stateMachine.currentState;
  }

  get lastAnimation(): AnimationDetail | null {
    return this._lastAnimation;
  }

  updateConfig(partial: Partial<EngineConfig>): void {
    this._config = { ...this._config, ...partial };
  }

  initialize(configOverride?: Partial<EngineConfig>): void {
    const cfg = { ...this._config, ...configOverride };
    this._config = cfg;
    const state = createEngineState(cfg);

    this._engineState = state;
    this._operationLog = [];
    this._historyStack = [];
    this._error = null;
    this._lastAnimation = null;
    this._stateMachine.forceSetState('idle');

    globalEventBus.publish<MechanicalInitializedPayload>({
      type: 'mechanical.initialized',
      source: 'mechanical',
      payload: { config: cfg, state },
    });
  }

  canStepForward(): boolean {
    if (!this._engineState) return false;
    if (this._stateMachine.currentState === 'error') return false;
    if (this._stateMachine.currentState === 'complete') return false;
    if (this._engineState.crankTurns >= this._engineState.maxSteps) return false;
    return true;
  }

  stepForward(): MechanicalExecutionResult | null {
    if (!this.canStepForward() || !this._engineState) return null;

    const snapshot = deepCloneState(this._engineState);
    const rawResult = rawExecuteStep(this._engineState, this._engineState.currentStep);
    const result: MechanicalExecutionResult = {
      newState: rawResult.newState,
      animation: rawResult.animation,
      log: rawResult.log,
      error: rawResult.error,
    };

    this._historyStack.push(snapshot);
    this._engineState = result.newState;
    this._operationLog.push(result.log);
    this._lastAnimation = result.animation;
    this._error = result.error;

    this._stateMachine.transition('step');
    if (result.animation.carryTriggers.length > 0) {
      this._stateMachine.transition('carry');
    }
    if (result.error) {
      this._stateMachine.transition('fail');
      globalEventBus.publish({
        type: 'mechanical.error',
        source: 'mechanical',
        payload: { error: result.error },
      });
    } else if (result.newState.phase === 'complete') {
      this._stateMachine.transition('finish');
      this._stateMachine.forceSetState('complete');
      globalEventBus.publish({
        type: 'mechanical.complete',
        source: 'mechanical',
        payload: { finalState: result.newState },
      });
    } else {
      this._stateMachine.transition('finish');
    }

    globalEventBus.publish<MechanicalStepExecutedPayload>({
      type: 'mechanical.step.executed',
      source: 'mechanical',
      payload: {
        previousState: snapshot,
        newState: result.newState,
        result,
      },
    });

    return result;
  }

  canStepBack(): boolean {
    if (this._stateMachine.currentState === 'adding') return false;
    if (this._stateMachine.currentState === 'carrying') return false;
    return this._historyStack.length > 0;
  }

  stepBack(): EngineState | null {
    if (!this.canStepBack()) return null;

    const prevState = this._historyStack[this._historyStack.length - 1];
    const poppedLog = this._operationLog[this._operationLog.length - 1];

    this._historyStack = this._historyStack.slice(0, -1);
    this._operationLog = this._operationLog.slice(0, -1);
    this._engineState = prevState;
    this._error = prevState.error ?? null;
    this._stateMachine.forceSetState(prevState.phase);

    globalEventBus.publish<MechanicalStepRolledbackPayload>({
      type: 'mechanical.step.rolledback',
      source: 'mechanical',
      payload: { restoredState: prevState, poppedLog },
    });

    return prevState;
  }

  reset(): void {
    this._engineState = null;
    this._operationLog = [];
    this._historyStack = [];
    this._error = null;
    this._lastAnimation = null;
    this._stateMachine.transition('reset');

    globalEventBus.publish({
      type: 'mechanical.reset',
      source: 'mechanical',
      payload: {},
    });
  }

  isIdle(): boolean {
    return this._stateMachine.currentState === 'idle';
  }

  setEngineStateDirect(state: EngineState): void {
    this._engineState = state;
    this._error = state.error ?? null;
    this._stateMachine.forceSetState(state.phase);
  }

  clearHistory(): void {
    this._historyStack = [];
  }

  clearOperationLog(): void {
    this._operationLog = [];
  }

  setOperationLog(logs: ComputationStep[]): void {
    this._operationLog = [...logs];
  }

  setHistoryStack(stack: EngineState[]): void {
    this._historyStack = stack.map((s) => deepCloneState(s));
  }

  takeSnapshot(): MechanicalEngineState {
    return JSON.parse(
      JSON.stringify({
        engineState: this._engineState,
        config: this._config,
        isInitialized: this._engineState !== null,
        phase: this._stateMachine.currentState,
        operationLog: this._operationLog,
        error: this._error,
      })
    );
  }

  restoreSnapshot(snapshot: MechanicalEngineState): void {
    if (!this.canRestoreFrom(snapshot)) return;

    this._config = JSON.parse(JSON.stringify(snapshot.config));
    this._engineState = snapshot.engineState
      ? JSON.parse(JSON.stringify(snapshot.engineState))
      : null;
    this._operationLog = JSON.parse(JSON.stringify(snapshot.operationLog));
    this._error = snapshot.error;
    this._stateMachine.forceSetState(snapshot.phase);
  }

  canRestoreFrom(snapshot: MechanicalEngineState): boolean {
    return snapshot && typeof snapshot === 'object' && 'config' in snapshot;
  }

  onPhaseChange(listener: (from: string, to: string) => void): () => void {
    return this._stateMachine.subscribe((from, to) => {
      listener(from, to);
    });
  }
}

export const mechanicalEngine = new MechanicalEngine();
