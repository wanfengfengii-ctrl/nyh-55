import type { AnimationDetail, EngineState } from '@/types';
import { StateMachine, ANIMATION_TRANSITIONS } from '../core/StateMachine';
import { globalEventBus } from '../core/EventBus';
import type {
  AnimationControllerState,
  AnimationStartedPayload,
  AnimationPhaseChangedPayload,
} from '../core/types';

export class AnimationController {
  private _stateMachine: StateMachine<'idle' | 'animating' | 'paused', 'start' | 'pause' | 'resume' | 'complete' | 'stop'>;
  private _currentDetail: AnimationDetail | null = null;
  private _displayPhase: EngineState['phase'] = 'idle';
  private _speed: number = 1;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _carryPhaseDelay = 500;
  private _onAnimationComplete?: () => void;
  private _phaseChangeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this._stateMachine = new StateMachine('idle', ANIMATION_TRANSITIONS);
  }

  get state(): AnimationControllerState {
    return {
      state: this._stateMachine.currentState,
      currentDetail: this._currentDetail ? { ...this._currentDetail } : null,
      displayPhase: this._displayPhase,
      speed: this._speed,
    };
  }

  get isAnimating(): boolean {
    return this._stateMachine.currentState === 'animating';
  }

  get isPaused(): boolean {
    return this._stateMachine.currentState === 'paused';
  }

  get isIdle(): boolean {
    return this._stateMachine.currentState === 'idle';
  }

  get currentDetail(): AnimationDetail | null {
    return this._currentDetail ? { ...this._currentDetail } : null;
  }

  get displayPhase(): EngineState['phase'] {
    return this._displayPhase;
  }

  get speed(): number {
    return this._speed;
  }

  setSpeed(speed: number): void {
    this._speed = Math.max(0.25, Math.min(4, speed));
  }

  setDisplayPhase(phase: EngineState['phase']): void {
    const from = this._displayPhase;
    this._displayPhase = phase;
    if (from !== phase) {
      globalEventBus.publish<AnimationPhaseChangedPayload>({
        type: 'animation.phase.changed',
        source: 'animation',
        payload: { from, to: phase },
      });
    }
  }

  startAnimation(detail: AnimationDetail, onComplete?: () => void): void {
    if (this._stateMachine.currentState === 'animating') {
      this.stopAnimation();
    }

    this._currentDetail = detail;
    this._onAnimationComplete = onComplete;
    this._stateMachine.transition('start');
    this.setDisplayPhase('adding');

    globalEventBus.publish<AnimationStartedPayload>({
      type: 'animation.started',
      source: 'animation',
      payload: { detail, duration: detail.duration },
    });

    if (detail.carryTriggers.length > 0) {
      this._phaseChangeTimer = setTimeout(() => {
        if (this._stateMachine.currentState === 'animating') {
          this.setDisplayPhase('carrying');
        }
      }, this._carryPhaseDelay / this._speed);
    }

    this._timer = setTimeout(() => {
      this.completeAnimation();
    }, detail.duration / this._speed);
  }

  completeAnimation(): void {
    if (this._stateMachine.currentState !== 'animating') return;
    this._stateMachine.transition('complete');
    const oldDetail = this._currentDetail;
    this._currentDetail = null;

    globalEventBus.publish({
      type: 'animation.completed',
      source: 'animation',
      payload: { completedDetail: oldDetail },
    });

    this._onAnimationComplete?.();
    this._onAnimationComplete = undefined;
  }

  pauseAnimation(): void {
    if (this._stateMachine.currentState !== 'animating') return;
    this._stateMachine.transition('pause');
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._phaseChangeTimer) {
      clearTimeout(this._phaseChangeTimer);
      this._phaseChangeTimer = null;
    }
  }

  resumeAnimation(): void {
    if (this._stateMachine.currentState !== 'paused') return;
    this._stateMachine.transition('resume');
    if (this._currentDetail) {
      this._timer = setTimeout(() => {
        this.completeAnimation();
      }, this._currentDetail.duration / (2 * this._speed));
    }
  }

  stopAnimation(): void {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._phaseChangeTimer) {
      clearTimeout(this._phaseChangeTimer);
      this._phaseChangeTimer = null;
    }
    this._stateMachine.transition('stop');
    this._currentDetail = null;
    this._onAnimationComplete = undefined;
  }

  updateAnimationDetail(detail: AnimationDetail): void {
    this._currentDetail = detail;
    globalEventBus.publish({
      type: 'animation.updated',
      source: 'animation',
      payload: { detail },
    });
  }

  destroy(): void {
    this.stopAnimation();
  }
}

export const animationController = new AnimationController();
