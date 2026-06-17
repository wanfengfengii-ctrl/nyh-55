import type { EngineState, ComputationStep } from '@/types';

const COLORS = [
  '#C8A951', '#B88A50', '#2E8B57', '#4A9B7F', '#8B5A2B',
  '#A07D2E', '#6B8E23', '#20B2AA', '#CD853F', '#DEB887',
  '#B8860B', '#556B2F', '#8FBC8F', '#BC8F8F', '#DAA520',
];

export function generateId(prefix = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function randomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export function generateSessionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function computeStateHash(
  engineState: EngineState | null,
  operationLog: ComputationStep[],
  stepNumber: number
): Promise<string> {
  const data = {
    step: stepNumber,
    engine: engineState ? {
      crankTurns: engineState.crankTurns,
      currentStep: engineState.currentStep,
      phase: engineState.phase,
      columns: engineState.columns.map(c => ({
        order: c.order,
        value: c.value,
        wheels: c.wheels.map(w => w.digit),
      })),
      error: engineState.error,
    } : null,
    log: operationLog.map(s => ({
      stepNumber: s.stepNumber,
      newValues: s.newValues,
      crankTurn: s.crankTurn,
    })),
  };
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `h${Math.abs(hash).toString(36)}`;
}

export function getLocalUserId(): string {
  let id = localStorage.getItem('diff_engine_user_id');
  if (!id) {
    id = generateId('user');
    localStorage.setItem('diff_engine_user_id', id);
  }
  return id;
}

export function getLocalUserName(): string {
  let name = localStorage.getItem('diff_engine_user_name');
  if (!name) {
    const num = Math.floor(Math.random() * 1000);
    name = `访客${num}`;
    localStorage.setItem('diff_engine_user_name', name);
  }
  return name;
}

export function saveLocalUserName(name: string): void {
  localStorage.setItem('diff_engine_user_name', name);
}

export function getBroadcastChannelName(sessionId: string): string {
  return `diff-engine-collab-${sessionId}`;
}
