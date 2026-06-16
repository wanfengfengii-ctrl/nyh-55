import type {
  EngineState,
  EngineConfig,
  ColumnState,
  DigitWheelState,
  CarryLeverState,
  ComputationStep,
  ErrorInfo,
  AnimationDetail,
} from '@/types';
import { numberToDigits, digitsToNumber, computeInitialDifferences } from '@/utils/math';

function createDigitWheels(value: number, numDigits: number): DigitWheelState[] {
  const digits = numberToDigits(value, numDigits);
  return digits.map((d) => ({
    digit: d,
    prevDigit: d,
    rotation: 0,
    isCarrying: false,
    isError: false,
  }));
}

function createCarryLevers(numDigits: number): CarryLeverState[] {
  const levers: CarryLeverState[] = [];
  for (let i = 0; i < numDigits - 1; i++) {
    levers.push({
      engaged: false,
      sourceWheel: i,
      targetWheel: i + 1,
      progress: 0,
    });
  }
  return levers;
}

function createColumn(order: number, value: number, numDigits: number): ColumnState {
  return {
    order,
    value,
    wheels: createDigitWheels(value, numDigits),
    carryLevers: createCarryLevers(numDigits),
    gearAngle: 0,
    isActive: false,
    isError: false,
  };
}

export function createEngineState(config: EngineConfig): EngineState {
  const { order, numDigits, modulus, initialValues, maxCrankTurns } = config;

  if (order <= 0) {
    throw new Error('差分阶数必须大于0');
  }

  const expectedCount = order + 1;
  const values = initialValues;
  if (values.length < expectedCount) {
    throw new Error(`需要 ${expectedCount} 个初始值，但只提供了 ${values.length} 个`);
  }

  for (let i = 0; i < expectedCount; i++) {
    if (values[i] < 0) {
      throw new Error(`初始值不能为负数: 第${i}个值 = ${values[i]}`);
    }
    if (values[i] >= modulus) {
      throw new Error(`初始值溢出: 第${i}个值 = ${values[i]} >= ${modulus}`);
    }
  }

  const diffValues = computeInitialDifferences(values);

  const columns: ColumnState[] = [];
  for (let i = 0; i <= order; i++) {
    columns.push(createColumn(i, diffValues[i], numDigits));
  }

  return {
    order,
    modulus,
    numDigits,
    columns,
    crankPosition: 0,
    crankTurns: 0,
    phase: 'idle',
    error: null,
    currentStep: 0,
    maxSteps: maxCrankTurns,
  };
}

interface DigitAddResult {
  newDigits: number[];
  carryEvents: { wheel: number; from: number; to: number; carryTo: number }[];
  overflow: boolean;
}

function addDigits(
  originalDigits: number[],
  addendDigits: number[],
  numDigits: number
): DigitAddResult {
  const result = [...originalDigits];
  const carryEvents: DigitAddResult['carryEvents'] = [];
  let overflow = false;

  for (let w = 0; w < numDigits; w++) {
    result[w] += addendDigits[w];
  }

  for (let w = 0; w < numDigits; w++) {
    while (result[w] >= 10) {
      const carryAmount = Math.floor(result[w] / 10);
      result[w] = result[w] % 10;

      if (w + 1 < numDigits) {
        result[w + 1] += carryAmount;
        carryEvents.push({
          wheel: w,
          from: result[w] + carryAmount * 10,
          to: result[w],
          carryTo: w + 1,
        });
      } else {
        overflow = true;
        carryEvents.push({
          wheel: w,
          from: result[w] + carryAmount * 10,
          to: result[w],
          carryTo: -1,
        });
      }
    }
  }

  return { newDigits: result, carryEvents, overflow };
}

export interface StepResult {
  newState: EngineState;
  animation: AnimationDetail;
  log: ComputationStep;
  error: ErrorInfo | null;
}

export function executeStep(
  state: EngineState,
  stepIndex: number
): StepResult {
  if (state.phase === 'error') {
    return {
      newState: state,
      animation: { type: 'reset', fromOrder: 0, toOrder: 0, wheelChanges: [], carryTriggers: [], duration: 0 },
      log: createErrorLog(state, stepIndex),
      error: state.error,
    };
  }

  if (state.crankTurns >= state.maxSteps) {
    return {
      newState: { ...state, phase: 'complete' },
      animation: { type: 'reset', fromOrder: 0, toOrder: 0, wheelChanges: [], carryTriggers: [], duration: 0 },
      log: createCompleteLog(state, stepIndex),
      error: null,
    };
  }

  const newColumns = state.columns.map((col) => ({
    ...col,
    wheels: col.wheels.map((w) => ({ ...w, prevDigit: w.digit, isCarrying: false, isError: false })),
    carryLevers: col.carryLevers.map((l) => ({ ...l, engaged: false, progress: 0 })),
    isActive: false,
    isError: false,
  }));

  const previousValues = newColumns.map((c) => c.value);
  const wheelChanges: AnimationDetail['wheelChanges'] = [];
  const carryTriggers: AnimationDetail['carryTriggers'] = [];
  let carryOccurred = false;
  let stepError: ErrorInfo | null = null;

  for (let k = 1; k <= state.order; k++) {
    const fromCol = newColumns[k];
    const toColIdx = newColumns.findIndex((c) => c.order === k - 1);
    const toCol = newColumns[toColIdx];

    const addend = fromCol.value;
    const originalValue = toCol.value;
    const originalDigits = numberToDigits(originalValue, state.numDigits);
    const addendDigits = numberToDigits(addend, state.numDigits);

    const { newDigits, carryEvents, overflow } = addDigits(originalDigits, addendDigits, state.numDigits);

    const newValue = digitsToNumber(newDigits);

    for (let w = 0; w < state.numDigits; w++) {
      if (newDigits[w] !== originalDigits[w]) {
        wheelChanges.push({
          column: k - 1,
          wheel: w,
          from: originalDigits[w],
          to: newDigits[w],
        });
      }
    }

    for (const carry of carryEvents) {
      carryTriggers.push({ column: k - 1, wheel: carry.wheel });
      carryOccurred = true;
    }

    toCol.value = newValue;
    toCol.wheels = newDigits.map((d, i) => ({
      digit: d,
      prevDigit: originalDigits[i],
      rotation: 0,
      isCarrying: carryEvents.some((ce) => ce.wheel === i),
      isError: false,
    }));

    for (const carry of carryEvents) {
      if (carry.wheel < state.numDigits - 1 && carry.wheel < toCol.carryLevers.length) {
        toCol.carryLevers[carry.wheel].engaged = true;
        toCol.carryLevers[carry.wheel].progress = 1;
      }
    }

    toCol.isActive = true;
    toCol.gearAngle += (2 * Math.PI) / 10;

    if (overflow) {
      stepError = {
        type: 'overflow',
        column: k - 1,
        wheel: state.numDigits - 1,
        message: `第${k - 1}阶差分列数值溢出: ${originalValue} + ${addend} 超出 ${state.numDigits} 位数字轮范围`,
      };
      toCol.isError = true;
      for (let w = 0; w < state.numDigits; w++) {
        toCol.wheels[w].isError = true;
      }
      for (let w = 0; w < toCol.carryLevers.length; w++) {
        toCol.carryLevers[w].engaged = true;
        toCol.carryLevers[w].progress = 1;
      }
    }

    if (newValue < 0) {
      stepError = {
        type: 'negative',
        column: k - 1,
        wheel: 0,
        message: `第${k - 1}阶差分列出现负数值: ${newValue}`,
      };
      toCol.isError = true;
      for (let w = 0; w < state.numDigits; w++) {
        toCol.wheels[w].isError = true;
      }
    }

    if (stepError) break;
  }

  const newValues = newColumns.map((c) => c.value);
  const newPhase: EngineState['phase'] = stepError
    ? 'error'
    : state.crankTurns + 1 >= state.maxSteps
      ? 'complete'
      : 'idle';

  const newState: EngineState = {
    ...state,
    columns: newColumns,
    crankPosition: (state.crankPosition + 1) % 10,
    crankTurns: state.crankTurns + 1,
    phase: newPhase,
    error: stepError,
    currentStep: state.currentStep + 1,
  };

  const animation: AnimationDetail = {
    type: 'add',
    fromOrder: state.order,
    toOrder: 0,
    wheelChanges,
    carryTriggers,
    duration: 1200,
  };

  const log: ComputationStep = {
    stepNumber: state.currentStep + 1,
    crankTurn: state.crankTurns + 1,
    phase: 'add',
    fromOrder: state.order,
    toOrder: 0,
    previousValues,
    newValues,
    carryTriggered: carryOccurred,
    errorOccurred: stepError !== null,
    description: stepError
      ? stepError.message
      : `手柄第${state.crankTurns + 1}转: f(${state.crankTurns + 1})=${newColumns[0].value}`,
    timestamp: Date.now(),
  };

  return { newState, animation, log, error: stepError };
}

function createErrorLog(state: EngineState, stepIndex: number): ComputationStep {
  return {
    stepNumber: stepIndex,
    crankTurn: state.crankTurns,
    phase: 'add',
    fromOrder: 0,
    toOrder: 0,
    previousValues: state.columns.map((c) => c.value),
    newValues: state.columns.map((c) => c.value),
    carryTriggered: false,
    errorOccurred: true,
    description: `错误状态，无法继续运算: ${state.error?.message ?? '未知错误'}`,
    timestamp: Date.now(),
  };
}

function createCompleteLog(state: EngineState, stepIndex: number): ComputationStep {
  return {
    stepNumber: stepIndex,
    crankTurn: state.crankTurns,
    phase: 'add',
    fromOrder: 0,
    toOrder: 0,
    previousValues: state.columns.map((c) => c.value),
    newValues: state.columns.map((c) => c.value),
    carryTriggered: false,
    errorOccurred: false,
    description: '运算已完成',
    timestamp: Date.now(),
  };
}

export function deepCloneState(state: EngineState): EngineState {
  return JSON.parse(JSON.stringify(state));
}
