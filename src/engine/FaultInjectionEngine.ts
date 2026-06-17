import type {
  EngineState,
  EngineConfig,
  MechanicalFault,
  FaultScenario,
  FaultType,
  FaultDifficulty,
  FaultDiagnosis,
  DiagnosisEvaluation,
  UserDiagnosisSubmission,
  ComputationStep,
  AnimationDetail,
} from '@/types';
import { executeStep, deepCloneState } from './DifferenceEngine';
import { digitsToNumber } from '@/utils/math';

let faultIdCounter = 0;

function nextFaultId(): string {
  faultIdCounter++;
  return `fault-${Date.now()}-${faultIdCounter}`;
}

export function generateFaultId(): string {
  return nextFaultId();
}

export function createStuckWheelFault(
  columnIndex: number,
  wheelIndex: number,
  triggerStep: number
): MechanicalFault {
  return {
    id: nextFaultId(),
    type: 'stuck_wheel',
    columnIndex,
    wheelIndex,
    triggerStep,
    description: `第${columnIndex}列第${wheelIndex}位数字轮卡死`,
    causeDescription: `第${columnIndex}阶差分列第${wheelIndex}位数字轮机械卡死，齿轮无法转动，导致该位数值不变`,
    symptomDescription: `观察第${triggerStep}步后第${columnIndex}列的运算结果，该列第${wheelIndex}位数字轮数值未发生预期变化`,
    evidenceHints: [
      `检查第${triggerStep}步运算记录中第${columnIndex}列的值变化`,
      `对比独立验算表，该列结果与预期不符`,
      `该数字轮在动画中未发生旋转`,
      `进位杆可能已触发但对应数字轮未响应`,
    ],
  };
}

export function createMisalignedCarryFault(
  columnIndex: number,
  leverIndex: number,
  triggerStep: number
): MechanicalFault {
  return {
    id: nextFaultId(),
    type: 'misaligned_carry',
    columnIndex,
    leverIndex,
    triggerStep,
    description: `第${columnIndex}列第${leverIndex}位进位杆错位触发`,
    causeDescription: `第${columnIndex}阶差分列第${leverIndex}位进位杆弹簧松弛，导致进位信号错位传递至下一位数字轮`,
    symptomDescription: `第${triggerStep}步后，第${columnIndex}列出现不正确的进位，数值与预期偏差为10的幂次`,
    evidenceHints: [
      `检查第${triggerStep}步第${columnIndex}列的进位标记`,
      `运算记录中该步骤标记了异常进位`,
      `数值偏差恰好为10的整数倍`,
      `进位杆动画中该杆未正确回弹`,
    ],
  };
}

export function createGearDesyncFault(
  fromColumn: number,
  toColumn: number,
  triggerStep: number
): MechanicalFault {
  return {
    id: nextFaultId(),
    type: 'gear_desync',
    columnIndex: fromColumn,
    fromColumn,
    toColumn,
    triggerStep,
    description: `第${fromColumn}列与第${toColumn}列间齿轮不同步`,
    causeDescription: `第${fromColumn}列与第${toColumn}列之间的传动齿轮磨损，导致旋转角度偏移，加法运算结果错误`,
    symptomDescription: `第${triggerStep}步后，差分运算传递的值与预期不一致，相邻列的值出现系统性偏差`,
    evidenceHints: [
      `第${triggerStep}步齿轮动画中出现了角度偏移`,
      `对比差分表，第${fromColumn}列到第${toColumn}列的传递值有误`,
      `传动齿轮的旋转动画与正常情况不同`,
      `偏差值不是10的整数倍，说明不是进位问题`,
    ],
  };
}

export function createRollbackFailureFault(
  columnIndex: number,
  triggerStep: number
): MechanicalFault {
  return {
    id: nextFaultId(),
    type: 'rollback_failure',
    columnIndex,
    triggerStep,
    description: `第${columnIndex}列回退机制失效`,
    causeDescription: `第${columnIndex}阶差分列的棘轮回退机构卡死，导致回退操作无法恢复前一步状态`,
    symptomDescription: `执行回退操作后，第${columnIndex}列的数值未恢复到前一步的正确值`,
    evidenceHints: [
      `回退后第${columnIndex}列的值与预期不一致`,
      `历史栈中记录的快照与实际显示不匹配`,
      `回退操作后，运算记录与引擎状态不同步`,
      `其他列回退正常，只有该列异常`,
    ],
  };
}

export function applyStuckWheelFault(
  state: EngineState,
  fault: MechanicalFault
): EngineState {
  const newState = deepCloneState(state);
  if (fault.wheelIndex === undefined) return newState;
  const col = newState.columns[fault.columnIndex];
  if (!col) return newState;
  const wheel = col.wheels[fault.wheelIndex];
  if (!wheel) return newState;

  const prevDigit = wheel.prevDigit;
  wheel.digit = prevDigit;
  wheel.isCarrying = false;
  wheel.isError = true;

  const digits = col.wheels.map(w => w.digit);
  col.value = digitsToNumber(digits);
  col.isError = true;

  return newState;
}

export function applyMisalignedCarryFault(
  state: EngineState,
  fault: MechanicalFault
): EngineState {
  const newState = deepCloneState(state);
  if (fault.leverIndex === undefined) return newState;
  const col = newState.columns[fault.columnIndex];
  if (!col) return newState;

  const leverIdx = fault.leverIndex;
  if (leverIdx + 1 < col.wheels.length) {
    const targetWheel = col.wheels[leverIdx + 1];
    targetWheel.digit = (targetWheel.digit + 1) % 10;
    targetWheel.isCarrying = true;
    targetWheel.isError = true;

    col.carryLevers[leverIdx].engaged = true;
    col.carryLevers[leverIdx].progress = 1;
  }

  const digits = col.wheels.map(w => w.digit);
  col.value = digitsToNumber(digits);
  col.isError = true;

  return newState;
}

export function applyGearDesyncFault(
  state: EngineState,
  fault: MechanicalFault
): EngineState {
  const newState = deepCloneState(state);
  const fromCol = fault.fromColumn !== undefined ? fault.fromColumn : fault.columnIndex;
  const toCol = fault.toColumn !== undefined ? fault.toColumn : fromCol - 1;
  if (toCol < 0 || toCol >= newState.columns.length) return newState;

  const targetCol = newState.columns[toCol];
  if (!targetCol) return newState;

  const offset = 1;
  for (let w = 0; w < targetCol.wheels.length; w++) {
    const wheel = targetCol.wheels[w];
    wheel.digit = (wheel.digit + offset) % 10;
    wheel.isError = true;
  }

  const digits = targetCol.wheels.map(w => w.digit);
  targetCol.value = digitsToNumber(digits);
  targetCol.isError = true;
  targetCol.gearAngle += Math.PI / 10;

  return newState;
}

export function applyRollbackFailureFault(
  state: EngineState,
  fault: MechanicalFault
): EngineState {
  const newState = deepCloneState(state);
  const col = newState.columns[fault.columnIndex];
  if (!col) return newState;

  for (const wheel of col.wheels) {
    wheel.isError = true;
  }
  col.isError = true;

  return newState;
}

export function applyFaults(
  state: EngineState,
  faults: MechanicalFault[],
  currentStep: number
): EngineState {
  let result = deepCloneState(state);
  for (const fault of faults) {
    if (fault.triggerStep === currentStep) {
      switch (fault.type) {
        case 'stuck_wheel':
          result = applyStuckWheelFault(result, fault);
          break;
        case 'misaligned_carry':
          result = applyMisalignedCarryFault(result, fault);
          break;
        case 'gear_desync':
          result = applyGearDesyncFault(result, fault);
          break;
        case 'rollback_failure':
          result = applyRollbackFailureFault(result, fault);
          break;
      }
    }
  }
  return result;
}

export function executeFaultyStep(
  state: EngineState,
  faults: MechanicalFault[],
  stepIndex: number
): { faultyState: EngineState; correctState: EngineState; animation: AnimationDetail; log: ComputationStep } {
  const correctResult = executeStep(state, stepIndex);
  const correctState = correctResult.newState;

  const faultyState = applyFaults(correctState, faults, state.currentStep + 1);

  const log: ComputationStep = {
    ...correctResult.log,
    errorOccurred: correctResult.log.errorOccurred || faults.some(f => f.triggerStep === state.currentStep + 1),
    description: faultyState !== correctState
      ? `${correctResult.log.description} [故障已注入]`
      : correctResult.log.description,
  };

  const animation = correctResult.animation;

  return { faultyState, correctState, animation, log };
}

export const FAULT_TYPE_LABELS: Record<FaultType, string> = {
  stuck_wheel: '卡轮',
  misaligned_carry: '错位进位',
  gear_desync: '齿轮不同步',
  rollback_failure: '回退失效',
};

export const FAULT_DIFFICULTY_LABELS: Record<FaultDifficulty, string> = {
  beginner: '初级',
  intermediate: '中级',
  advanced: '高级',
  expert: '专家',
};

export const FAULT_DIFFICULTY_SCORES: Record<FaultDifficulty, number> = {
  beginner: 100,
  intermediate: 200,
  advanced: 350,
  expert: 500,
};

export const FAULT_DIFFICULTY_TIME_LIMITS: Record<FaultDifficulty, number> = {
  beginner: 300,
  intermediate: 240,
  advanced: 180,
  expert: 120,
};

export const FAULT_DIFFICULTY_FAULT_COUNTS: Record<FaultDifficulty, [number, number]> = {
  beginner: [1, 1],
  intermediate: [1, 2],
  advanced: [2, 3],
  expert: [2, 4],
};

export function evaluateDiagnosis(
  submission: UserDiagnosisSubmission,
  correctDiagnoses: FaultDiagnosis[],
  faults: MechanicalFault[]
): DiagnosisEvaluation {
  let bestMatch: { diagnosis: FaultDiagnosis; fault: MechanicalFault; score: number } | null = null;

  for (const diag of correctDiagnoses) {
    const fault = faults.find(f => f.id === diag.faultId);
    if (!fault) continue;

    let score = 0;

    if (submission.faultType === diag.faultType) score += 30;

    if (submission.columnIndex === diag.columnIndex) score += 20;

    if (submission.stepNumber === diag.stepNumber) score += 20;

    if (diag.wheelIndex !== undefined && submission.wheelIndex === diag.wheelIndex) score += 10;
    if (diag.leverIndex !== undefined && submission.leverIndex === diag.leverIndex) score += 10;

    if (submission.stepNumber > 0 && Math.abs(submission.stepNumber - diag.stepNumber) <= 1) score += 5;

    const causeSimilarity = computeTextSimilarity(submission.causeDescription, fault.causeDescription);
    score += Math.round(causeSimilarity * 10);

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { diagnosis: diag, fault, score };
    }
  }

  if (!bestMatch) {
    return {
      isCorrect: false,
      partialCredit: 0,
      matchedFaultId: null,
      explanation: '未能匹配到任何已知故障。请仔细观察动画和运算记录中的异常。',
      evidence: ['对比独立验算表与引擎结果', '检查每一步的进位标记', '观察数字轮旋转动画'],
      standardAnswer: correctDiagnoses[0],
      userAnswer: submission,
    };
  }

  const isCorrect = bestMatch.score >= 70;
  const partialCredit = Math.min(1, bestMatch.score / 100);

  return {
    isCorrect,
    partialCredit,
    matchedFaultId: bestMatch.diagnosis.faultId,
    explanation: generateExplanation(submission, bestMatch.diagnosis, bestMatch.fault),
    evidence: bestMatch.fault.evidenceHints,
    standardAnswer: bestMatch.diagnosis,
    userAnswer: submission,
  };
}

function computeTextSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const keywordsA = a.toLowerCase().split(/[\s,，。.、]+/).filter(w => w.length > 1);
  const keywordsB = b.toLowerCase().split(/[\s,，。.、]+/).filter(w => w.length > 1);
  if (keywordsA.length === 0 || keywordsB.length === 0) return 0;

  let matches = 0;
  for (const ka of keywordsA) {
    for (const kb of keywordsB) {
      if (ka === kb || ka.includes(kb) || kb.includes(ka)) {
        matches++;
        break;
      }
    }
  }

  return matches / Math.max(keywordsA.length, keywordsB.length);
}

function generateExplanation(
  submission: UserDiagnosisSubmission,
  correct: FaultDiagnosis,
  fault: MechanicalFault
): string {
  const parts: string[] = [];

  if (submission.faultType === correct.faultType) {
    parts.push(`✓ 故障类型判断正确：${FAULT_TYPE_LABELS[correct.faultType]}`);
  } else {
    parts.push(`✗ 故障类型判断有误：您选择"${FAULT_TYPE_LABELS[submission.faultType]}"，正确答案为"${FAULT_TYPE_LABELS[correct.faultType]}"`);
  }

  if (submission.columnIndex === correct.columnIndex) {
    parts.push(`✓ 故障列定位正确：第${correct.columnIndex}列`);
  } else {
    parts.push(`✗ 故障列定位有误：您选择第${submission.columnIndex}列，正确为第${correct.columnIndex}列`);
  }

  if (submission.stepNumber === correct.stepNumber) {
    parts.push(`✓ 故障步骤判断正确：第${correct.stepNumber}步`);
  } else if (Math.abs(submission.stepNumber - correct.stepNumber) <= 1) {
    parts.push(`≈ 故障步骤接近：您选择第${submission.stepNumber}步，正确为第${correct.stepNumber}步`);
  } else {
    parts.push(`✗ 故障步骤判断有误：您选择第${submission.stepNumber}步，正确为第${correct.stepNumber}步`);
  }

  parts.push(`\n标准原因：${fault.causeDescription}`);
  parts.push(`故障表现：${fault.symptomDescription}`);

  return parts.join('\n');
}

export function generateRandomScenario(difficulty: FaultDifficulty): FaultScenario {
  const [minFaults, maxFaults] = FAULT_DIFFICULTY_FAULT_COUNTS[difficulty];
  const faultCount = minFaults + Math.floor(Math.random() * (maxFaults - minFaults + 1));
  const baseScore = FAULT_DIFFICULTY_SCORES[difficulty];
  const timeLimit = FAULT_DIFFICULTY_TIME_LIMITS[difficulty];

  const order = difficulty === 'beginner' ? 2 : difficulty === 'intermediate' ? 2 : 3;
  const numDigits = 6;
  const maxCrankTurns = difficulty === 'expert' ? 15 : 10;

  const initialValues = generateInitialValues(order);
  const modulus = Math.pow(10, numDigits);

  const config: EngineConfig = {
    order,
    numDigits,
    modulus,
    initialValues,
    maxCrankTurns,
  };

  const faults: MechanicalFault[] = [];
  const correctDiagnoses: FaultDiagnosis[] = [];
  const availableFaultTypes: FaultType[] = getAvailableFaultTypes(difficulty);

  for (let i = 0; i < faultCount; i++) {
    const faultType = availableFaultTypes[Math.floor(Math.random() * availableFaultTypes.length)];
    const triggerStep = 1 + Math.floor(Math.random() * Math.min(maxCrankTurns - 1, 5));
    const colIdx = 1 + Math.floor(Math.random() * order);

    let fault: MechanicalFault;

    switch (faultType) {
      case 'stuck_wheel':
        fault = createStuckWheelFault(colIdx, Math.floor(Math.random() * 3), triggerStep);
        break;
      case 'misaligned_carry':
        fault = createMisalignedCarryFault(colIdx, Math.floor(Math.random() * (numDigits - 1)), triggerStep);
        break;
      case 'gear_desync':
        fault = createGearDesyncFault(colIdx, colIdx - 1, triggerStep);
        break;
      case 'rollback_failure':
        fault = createRollbackFailureFault(colIdx, triggerStep);
        break;
      default:
        fault = createStuckWheelFault(colIdx, 0, triggerStep);
    }

    faults.push(fault);
    correctDiagnoses.push({
      faultId: fault.id,
      faultType: fault.type,
      columnIndex: fault.columnIndex,
      wheelIndex: fault.wheelIndex,
      leverIndex: fault.leverIndex,
      stepNumber: fault.triggerStep,
      causeDescription: fault.causeDescription,
    });
  }

  const diffLabel = FAULT_DIFFICULTY_LABELS[difficulty];
  const id = `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    title: `${diffLabel}故障排查训练 #${Math.floor(Math.random() * 9000 + 1000)}`,
    description: `包含${faultCount}个机械故障的${diffLabel}训练场景，请仔细观察运算过程，找出故障的位置和原因`,
    difficulty,
    faults,
    engineConfig: config,
    correctDiagnoses,
    hintAnnotations: [],
    timeLimitSeconds: timeLimit,
    baseScore,
  };
}

function getAvailableFaultTypes(difficulty: FaultDifficulty): FaultType[] {
  switch (difficulty) {
    case 'beginner':
      return ['stuck_wheel', 'misaligned_carry'];
    case 'intermediate':
      return ['stuck_wheel', 'misaligned_carry', 'gear_desync'];
    case 'advanced':
    case 'expert':
      return ['stuck_wheel', 'misaligned_carry', 'gear_desync', 'rollback_failure'];
  }
}

function generateInitialValues(order: number): number[] {
  const values: number[] = [];
  const count = order + 1;

  const a = Math.floor(Math.random() * 3) + 1;
  const b = Math.floor(Math.random() * 5) + 1;
  const c = Math.floor(Math.random() * 10);

  for (let x = 0; x < count; x++) {
    let val: number;
    if (order >= 2) {
      val = a * x * x + b * x + c;
    } else {
      val = b * x + c;
    }
    if (val < 0) val = Math.abs(val);
    if (val >= 1000000) val = val % 1000000;
    values.push(val);
  }

  return values;
}

export function computeTrainingScore(
  evaluations: DiagnosisEvaluation[],
  baseScore: number,
  elapsedSeconds: number,
  timeLimitSeconds: number,
  hintsUsed: number,
  totalFaults: number
): { score: number; maxScore: number } {
  const maxScore = baseScore;
  let rawScore = 0;

  for (const eval_ of evaluations) {
    if (eval_.isCorrect) {
      rawScore += 100 / totalFaults;
    } else if (eval_.partialCredit > 0) {
      rawScore += (eval_.partialCredit * 60) / totalFaults;
    }
  }

  const timeRatio = Math.max(0, 1 - (elapsedSeconds / timeLimitSeconds) * 0.3);
  const hintPenalty = hintsUsed * 0.1;

  const finalScore = Math.round(Math.max(0, rawScore * timeRatio * (1 - hintPenalty) * baseScore / 100));

  return { score: Math.min(finalScore, maxScore), maxScore };
}
