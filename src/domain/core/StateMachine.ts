import type { IStateMachine } from './types';

type TransitionMap<S extends string, E extends string> = Partial<Record<E, S>>;
type StateTransitionTable<S extends string, E extends string> = Record<S, TransitionMap<S, E>>;

export class StateMachine<S extends string, E extends string> implements IStateMachine<S, E> {
  private _currentState: S;
  private transitions: StateTransitionTable<S, E>;
  private listeners: Set<(from: S, to: S, event: E) => void> = new Set();

  constructor(
    initialState: S,
    transitions: StateTransitionTable<S, E>
  ) {
    this._currentState = initialState;
    this.transitions = transitions;
  }

  get currentState(): S {
    return this._currentState;
  }

  canTransition(event: E): boolean {
    const table = this.transitions[this._currentState];
    return table ? event in table : false;
  }

  getValidTransitions(): E[] {
    const table = this.transitions[this._currentState];
    return table ? (Object.keys(table) as E[]) : [];
  }

  transition(event: E): boolean {
    if (!this.canTransition(event)) {
      return false;
    }
    const from = this._currentState;
    const to = this.transitions[from][event] as S;
    this._currentState = to;
    this.listeners.forEach((listener) => {
      try {
        listener(from, to, event);
      } catch (e) {
        console.error('[StateMachine] Listener error:', e);
      }
    });
    return true;
  }

  subscribe(listener: (from: S, to: S, event: E) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  forceSetState(state: S): void {
    const from = this._currentState;
    this._currentState = state;
    this.listeners.forEach((listener) => {
      try {
        listener(from, state, '__force__' as unknown as E);
      } catch (_e) {
        // ignore
      }
    });
  }
}

export const MECHANICAL_TRANSITIONS: StateTransitionTable<
  'idle' | 'adding' | 'carrying' | 'error' | 'complete',
  'initialize' | 'step' | 'carry' | 'finish' | 'fail' | 'reset'
> = {
  idle: {
    initialize: 'idle',
    step: 'adding',
    reset: 'idle',
  },
  adding: {
    carry: 'carrying',
    finish: 'idle',
    fail: 'error',
    reset: 'idle',
  },
  carrying: {
    finish: 'idle',
    fail: 'error',
    reset: 'idle',
  },
  error: {
    reset: 'idle',
  },
  complete: {
    reset: 'idle',
  },
};

export const CARD_PROGRAM_TRANSITIONS: StateTransitionTable<
  'idle' | 'running' | 'paused' | 'stopped' | 'error',
  'start' | 'pause' | 'resume' | 'execute' | 'stop' | 'fail' | 'reset'
> = {
  idle: {
    start: 'running',
    reset: 'idle',
  },
  running: {
    pause: 'paused',
    execute: 'running',
    stop: 'stopped',
    fail: 'error',
    reset: 'idle',
  },
  paused: {
    resume: 'running',
    stop: 'stopped',
    reset: 'idle',
  },
  stopped: {
    start: 'running',
    reset: 'idle',
  },
  error: {
    reset: 'idle',
    stop: 'stopped',
  },
};

export const COLLABORATION_TRANSITIONS: StateTransitionTable<
  'disconnected' | 'waiting' | 'running' | 'paused' | 'error' | 'ended',
  'create' | 'join' | 'leave' | 'start' | 'pause' | 'resume' | 'mismatch' | 'end'
> = {
  disconnected: {
    create: 'waiting',
    join: 'waiting',
  },
  waiting: {
    leave: 'disconnected',
    start: 'running',
    end: 'ended',
  },
  running: {
    pause: 'paused',
    leave: 'disconnected',
    mismatch: 'error',
    end: 'ended',
  },
  paused: {
    resume: 'running',
    leave: 'disconnected',
    end: 'ended',
  },
  error: {
    leave: 'disconnected',
    end: 'ended',
  },
  ended: {
    leave: 'disconnected',
  },
};

export const FAULT_TRAINING_TRANSITIONS: StateTransitionTable<
  'idle' | 'setup' | 'running' | 'diagnosing' | 'evaluated' | 'completed',
  'start' | 'step' | 'complete_steps' | 'diagnose' | 'all_diagnosed' | 'finish' | 'reset'
> = {
  idle: {
    start: 'setup',
    reset: 'idle',
  },
  setup: {
    step: 'running',
    reset: 'idle',
  },
  running: {
    step: 'running',
    complete_steps: 'diagnosing',
    reset: 'idle',
  },
  diagnosing: {
    diagnose: 'diagnosing',
    all_diagnosed: 'evaluated',
    reset: 'idle',
  },
  evaluated: {
    finish: 'completed',
    reset: 'idle',
  },
  completed: {
    reset: 'idle',
  },
};

export const ANIMATION_TRANSITIONS: StateTransitionTable<
  'idle' | 'animating' | 'paused',
  'start' | 'pause' | 'resume' | 'complete' | 'stop'
> = {
  idle: {
    start: 'animating',
  },
  animating: {
    pause: 'paused',
    complete: 'idle',
    stop: 'idle',
  },
  paused: {
    resume: 'animating',
    stop: 'idle',
  },
};
