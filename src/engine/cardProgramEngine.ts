import type {
  ProgramCard,
  EngineState,
  ComputationStep,
  EngineConfig,
} from '@/types';
import { createEngineState, deepCloneState } from '@/engine/DifferenceEngine';
import { numberToDigits } from '@/utils/math';
import { useEngineStore } from '@/store/engineStore';

export interface ValidateResult {
  isValid: boolean;
  error?: string;
}

export interface ExecuteResult {
  success: boolean;
  error?: string;
  shouldStop: boolean;
  shouldContinue: boolean;
  newEngineState?: EngineState;
  description: string;
}

export function validateCard(card: ProgramCard): ValidateResult {
  if (!card.id || !card.type) {
    return { isValid: false, error: '卡片缺少必要属性' };
  }

  switch (card.type) {
    case 'initial':
      return validateInitialCard(card);
    case 'step':
      return validateStepCard(card);
    case 'stop':
      return validateStopCard(card);
    case 'error_handler':
      return validateErrorHandlerCard(card);
    default:
      return { isValid: false, error: `未知卡片类型: ${card.type}` };
  }
}

function validateInitialCard(card: ProgramCard): ValidateResult {
  const config = card.config.initial;
  if (!config) {
    return { isValid: false, error: '初始化卡片缺少配置' };
  }

  if (config.order <= 0) {
    return { isValid: false, error: '差分阶数必须大于0' };
  }

  if (config.order > 6) {
    return { isValid: false, error: '差分阶数最大为6' };
  }

  if (config.numDigits <= 0) {
    return { isValid: false, error: '数字轮位数必须大于0' };
  }

  if (config.numDigits > 10) {
    return { isValid: false, error: '数字轮位数最大为10' };
  }

  const requiredValues = config.order + 1;
  if (!config.initialValues || config.initialValues.length < requiredValues) {
    return {
      isValid: false,
      error: `需要 ${requiredValues} 个初始值，但只提供了 ${config.initialValues?.length || 0} 个`,
    };
  }

  const modulus = Math.pow(10, config.numDigits);
  for (let i = 0; i < requiredValues; i++) {
    const val = config.initialValues[i];
    if (typeof val !== 'number' || isNaN(val)) {
      return { isValid: false, error: `第${i + 1}个初始值不是有效数字` };
    }
    if (val < 0) {
      return { isValid: false, error: `第${i + 1}个初始值不能为负数: ${val}` };
    }
    if (val >= modulus) {
      return { isValid: false, error: `第${i + 1}个初始值溢出: ${val} >= ${modulus}` };
    }
  }

  if (config.maxCrankTurns <= 0) {
    return { isValid: false, error: '最大转动次数必须大于0' };
  }

  if (config.maxCrankTurns > 100) {
    return { isValid: false, error: '最大转动次数最大为100' };
  }

  return { isValid: true };
}

function validateStepCard(card: ProgramCard): ValidateResult {
  const config = card.config.step;
  if (!config) {
    return { isValid: false, error: '步进卡片缺少配置' };
  }

  if (!['add', 'multiply', 'set', 'custom'].includes(config.ruleType)) {
    return { isValid: false, error: `无效的步进规则类型: ${config.ruleType}` };
  }

  if (typeof config.value !== 'number' || isNaN(config.value)) {
    return { isValid: false, error: '步进值必须是有效数字' };
  }

  if (config.repeatCount <= 0) {
    return { isValid: false, error: '重复次数必须大于0' };
  }

  if (config.repeatCount > 100) {
    return { isValid: false, error: '重复次数最大为100' };
  }

  if (config.targetColumn !== undefined) {
    if (config.targetColumn < 0) {
      return { isValid: false, error: '目标列索引不能为负数' };
    }
    if (config.targetColumn > 6) {
      return { isValid: false, error: '目标列索引最大为6' };
    }
  }

  return { isValid: true };
}

function validateStopCard(card: ProgramCard): ValidateResult {
  const config = card.config.stop;
  if (!config) {
    return { isValid: false, error: '停止卡片缺少配置' };
  }

  if (!['max_turns', 'value_equals', 'value_exceeds', 'value_below', 'error_occurred'].includes(config.conditionType)) {
    return { isValid: false, error: `无效的停止条件类型: ${config.conditionType}` };
  }

  switch (config.conditionType) {
    case 'max_turns':
      if (config.maxTurns === undefined || config.maxTurns <= 0) {
        return { isValid: false, error: '最大转动次数必须大于0' };
      }
      if (config.maxTurns > 100) {
        return { isValid: false, error: '最大转动次数最大为100' };
      }
      break;
    case 'value_equals':
    case 'value_exceeds':
    case 'value_below':
      if (config.targetValue === undefined || typeof config.targetValue !== 'number') {
        return { isValid: false, error: '目标值必须是有效数字' };
      }
      if (config.targetColumn === undefined || config.targetColumn < 0) {
        return { isValid: false, error: '目标列索引必须大于等于0' };
      }
      if (config.targetColumn > 6) {
        return { isValid: false, error: '目标列索引最大为6' };
      }
      break;
    case 'error_occurred':
      break;
  }

  return { isValid: true };
}

function validateErrorHandlerCard(card: ProgramCard): ValidateResult {
  const config = card.config.errorHandler;
  if (!config) {
    return { isValid: false, error: '异常处理卡片缺少配置' };
  }

  if (!['stop_immediately', 'skip_and_continue', 'retry_once', 'use_fallback'].includes(config.strategy)) {
    return { isValid: false, error: `无效的异常处理策略: ${config.strategy}` };
  }

  if (config.strategy === 'use_fallback') {
    if (config.fallbackValue === undefined || typeof config.fallbackValue !== 'number') {
      return { isValid: false, error: '回退值必须是有效数字' };
    }
    if (config.fallbackValue < 0) {
      return { isValid: false, error: '回退值不能为负数' };
    }
  }

  if (config.maxRetries !== undefined) {
    if (config.maxRetries < 0) {
      return { isValid: false, error: '最大重试次数不能为负数' };
    }
    if (config.maxRetries > 5) {
      return { isValid: false, error: '最大重试次数最大为5' };
    }
  }

  return { isValid: true };
}

export function executeCard(
  card: ProgramCard,
  engineState: EngineState | null,
  operationLog: ComputationStep[],
  config: EngineConfig,
  initializeEngine: (config: Partial<EngineConfig>) => void,
  stepForward: () => void,
  _stepBack: () => void,
  setEngineState: (state: EngineState) => void
): ExecuteResult {
  switch (card.type) {
    case 'initial':
      return executeInitialCard(card, engineState, initializeEngine);
    case 'step':
      return executeStepCard(card, engineState, stepForward, setEngineState);
    case 'stop':
      return executeStopCard(card, engineState, operationLog, config);
    case 'error_handler':
      return executeErrorHandlerCard(card, engineState, setEngineState);
    default:
      return {
        success: false,
        error: `未知卡片类型: ${card.type}`,
        shouldStop: true,
        shouldContinue: false,
        description: `执行失败: 未知卡片类型`,
      };
  }
}

function executeInitialCard(
  card: ProgramCard,
  engineState: EngineState | null,
  initializeEngine: (config: Partial<EngineConfig>) => void
): ExecuteResult {
  const config = card.config.initial;
  if (!config) {
    return {
      success: false,
      error: '初始化卡片缺少配置',
      shouldStop: true,
      shouldContinue: false,
      description: '执行失败: 初始化卡片缺少配置',
    };
  }

  const modulus = Math.pow(10, config.numDigits);
  const requiredCount = config.order + 1;

  try {
    const testState = createEngineState({
      order: config.order,
      numDigits: config.numDigits,
      modulus,
      initialValues: config.initialValues.slice(0, requiredCount),
      maxCrankTurns: config.maxCrankTurns,
    });

    if (testState.phase === 'error') {
      return {
        success: false,
        error: testState.error?.message || '初始化机械状态失败',
        shouldStop: true,
        shouldContinue: false,
        description: `执行失败: ${testState.error?.message || '初始化机械状态失败'}`,
      };
    }

    initializeEngine({
      order: config.order,
      numDigits: config.numDigits,
      modulus,
      initialValues: config.initialValues.slice(0, requiredCount),
      maxCrankTurns: config.maxCrankTurns,
    });

    return {
      success: true,
      shouldStop: false,
      shouldContinue: true,
      newEngineState: testState,
      description: `初始化成功: 阶数=${config.order}, 初始值=[${config.initialValues.slice(0, requiredCount).join(', ')}], 最大转数=${config.maxCrankTurns}`,
    };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : '初始化失败';
    return {
      success: false,
      error: errorMsg,
      shouldStop: true,
      shouldContinue: false,
      description: `执行失败: ${errorMsg}`,
    };
  }
}

function applyColumnValueChange(
  engineState: EngineState,
  targetColumn: number,
  newValue: number,
  numDigits: number
): EngineState {
  const newColumns = engineState.columns.map((col, idx) => {
    if (idx !== targetColumn) return col;
    const newDigits = numberToDigits(newValue, numDigits);
    return {
      ...col,
      value: newValue,
      wheels: col.wheels.map((w, wi) => ({
        ...w,
        digit: newDigits[wi],
        prevDigit: w.digit,
        isError: false,
      })),
      isError: false,
    };
  });
  return { ...engineState, columns: newColumns };
}

function executeStepCard(
  card: ProgramCard,
  engineState: EngineState | null,
  stepForward: () => void,
  setEngineState: (state: EngineState) => void
): ExecuteResult {
  const config = card.config.step;
  if (!config) {
    return {
      success: false,
      error: '步进卡片缺少配置',
      shouldStop: true,
      shouldContinue: false,
      description: '执行失败: 步进卡片缺少配置',
    };
  }

  if (!engineState) {
    return {
      success: false,
      error: '机械未初始化，无法执行步进',
      shouldStop: true,
      shouldContinue: false,
      description: '执行失败: 机械未初始化',
    };
  }

  if (engineState.phase === 'error') {
    return {
      success: false,
      error: `机械处于错误状态: ${engineState.error?.message}`,
      shouldStop: true,
      shouldContinue: false,
      description: `执行失败: 机械处于错误状态`,
    };
  }

  if (engineState.phase === 'complete') {
    return {
      success: false,
      error: '机械已完成计算，无法继续步进',
      shouldStop: true,
      shouldContinue: false,
      description: '执行失败: 机械已完成计算',
    };
  }

  const ruleType = config.ruleType;
  const value = config.value;
  const targetColumn = config.targetColumn ?? 0;
  let actualSteps = 0;
  let ruleDescription = '';

  switch (ruleType) {
    case 'add': {
      actualSteps = Math.min(config.repeatCount, engineState.maxSteps - engineState.crankTurns);
      ruleDescription = `加法步进: 执行${actualSteps}步`;
      break;
    }

    case 'multiply': {
      const totalSteps = Math.max(1, Math.round(Math.abs(value))) * config.repeatCount;
      actualSteps = Math.min(totalSteps, engineState.maxSteps - engineState.crankTurns);
      ruleDescription = `乘法步进: 倍数=${value}, 重复=${config.repeatCount}, 实际执行${actualSteps}步`;
      break;
    }

    case 'set': {
      if (targetColumn < 0 || targetColumn >= engineState.columns.length) {
        return {
          success: false,
          error: `目标列索引 ${targetColumn} 超出范围`,
          shouldStop: true,
          shouldContinue: false,
          description: `执行失败: 目标列索引超出范围`,
        };
      }
      const modulus = Math.pow(10, engineState.numDigits);
      if (value < 0 || value >= modulus) {
        return {
          success: false,
          error: `设置值 ${value} 超出范围 [0, ${modulus})`,
          shouldStop: true,
          shouldContinue: false,
          description: `执行失败: 设置值超出范围`,
        };
      }

      const modifiedState = applyColumnValueChange(
        deepCloneState(engineState),
        targetColumn,
        value,
        engineState.numDigits
      );
      setEngineState(modifiedState);
      useEngineStore.setState({ engineState: modifiedState });

      actualSteps = Math.min(config.repeatCount, engineState.maxSteps - engineState.crankTurns);
      ruleDescription = `设置步进: 第${targetColumn}列设为${value}, 然后执行${actualSteps}步`;
      break;
    }

    case 'custom': {
      if (targetColumn < 0 || targetColumn >= engineState.columns.length) {
        return {
          success: false,
          error: `目标列索引 ${targetColumn} 超出范围`,
          shouldStop: true,
          shouldContinue: false,
          description: `执行失败: 目标列索引超出范围`,
        };
      }
      const currentVal = engineState.columns[targetColumn].value;
      const modulus = Math.pow(10, engineState.numDigits);
      const newVal = currentVal + value;

      if (newVal < 0 || newVal >= modulus) {
        return {
          success: false,
          error: `自定义运算后值 ${newVal} 超出范围 [0, ${modulus})`,
          shouldStop: true,
          shouldContinue: false,
          description: `执行失败: 自定义运算后值超出范围`,
        };
      }

      const modifiedState = applyColumnValueChange(
        deepCloneState(engineState),
        targetColumn,
        newVal,
        engineState.numDigits
      );
      setEngineState(modifiedState);
      useEngineStore.setState({ engineState: modifiedState });

      actualSteps = Math.min(config.repeatCount, engineState.maxSteps - engineState.crankTurns);
      ruleDescription = `自定义步进: 第${targetColumn}列 ${currentVal}+${value}=${newVal}, 然后执行${actualSteps}步`;
      break;
    }

    default: {
      actualSteps = Math.min(config.repeatCount, engineState.maxSteps - engineState.crankTurns);
      ruleDescription = `默认步进: 执行${actualSteps}步`;
    }
  }

  if (actualSteps <= 0) {
    return {
      success: false,
      error: '已达到最大转动次数',
      shouldStop: true,
      shouldContinue: false,
      description: '执行失败: 已达到最大转动次数',
    };
  }

  for (let i = 0; i < actualSteps; i++) {
    const currentEngineState = useEngineStore.getState().engineState;
    if (!currentEngineState || currentEngineState.phase === 'error' || currentEngineState.phase === 'complete') {
      break;
    }
    stepForward();
  }

  const currentState = useEngineStore.getState().engineState;

  if (currentState?.phase === 'error') {
    return {
      success: false,
      error: `步进执行中发生错误: ${currentState.error?.message}`,
      shouldStop: true,
      shouldContinue: false,
      newEngineState: currentState,
      description: `执行失败: ${currentState.error?.message}`,
    };
  }

  return {
    success: true,
    shouldStop: false,
    shouldContinue: true,
    newEngineState: currentState || undefined,
    description: `${ruleDescription}, 当前f(x)=${currentState?.columns[0]?.value ?? '-'}`,
  };
}

function executeStopCard(
  card: ProgramCard,
  engineState: EngineState | null,
  operationLog: ComputationStep[],
  config: EngineConfig
): ExecuteResult {
  const stopConfig = card.config.stop;
  if (!stopConfig) {
    return {
      success: false,
      error: '停止卡片缺少配置',
      shouldStop: true,
      shouldContinue: false,
      description: '执行失败: 停止卡片缺少配置',
    };
  }

  if (!engineState) {
    return {
      success: true,
      shouldStop: true,
      shouldContinue: false,
      description: '停止条件: 机械未初始化，停止执行',
    };
  }

  let shouldStop = false;
  let description = '';

  switch (stopConfig.conditionType) {
    case 'max_turns':
      shouldStop = engineState.crankTurns >= (stopConfig.maxTurns || config.maxCrankTurns);
      description = shouldStop
        ? `停止条件触发: 已达到最大转动次数 ${engineState.crankTurns}/${stopConfig.maxTurns}`
        : `停止条件未触发: 当前转动次数 ${engineState.crankTurns}/${stopConfig.maxTurns}`;
      break;

    case 'value_equals': {
      const targetCol = stopConfig.targetColumn ?? 0;
      const currentValue = engineState.columns[targetCol]?.value;
      shouldStop = currentValue === stopConfig.targetValue;
      description = shouldStop
        ? `停止条件触发: 第${targetCol}列值 ${currentValue} 等于目标值 ${stopConfig.targetValue}`
        : `停止条件未触发: 第${targetCol}列值 ${currentValue} ≠ ${stopConfig.targetValue}`;
      break;
    }

    case 'value_exceeds': {
      const targetCol = stopConfig.targetColumn ?? 0;
      const currentValue = engineState.columns[targetCol]?.value;
      shouldStop = currentValue > (stopConfig.targetValue ?? 0);
      description = shouldStop
        ? `停止条件触发: 第${targetCol}列值 ${currentValue} 超过目标值 ${stopConfig.targetValue}`
        : `停止条件未触发: 第${targetCol}列值 ${currentValue} ≤ ${stopConfig.targetValue}`;
      break;
    }

    case 'value_below': {
      const targetCol = stopConfig.targetColumn ?? 0;
      const currentValue = engineState.columns[targetCol]?.value;
      shouldStop = currentValue < (stopConfig.targetValue ?? 0);
      description = shouldStop
        ? `停止条件触发: 第${targetCol}列值 ${currentValue} 低于目标值 ${stopConfig.targetValue}`
        : `停止条件未触发: 第${targetCol}列值 ${currentValue} ≥ ${stopConfig.targetValue}`;
      break;
    }

    case 'error_occurred':
      shouldStop = engineState.phase === 'error';
      description = shouldStop
        ? `停止条件触发: 检测到错误状态 - ${engineState.error?.message}`
        : `停止条件未触发: 当前无错误`;
      break;
  }

  return {
    success: true,
    shouldStop,
    shouldContinue: !shouldStop,
    newEngineState: engineState,
    description,
  };
}

function executeErrorHandlerCard(
  card: ProgramCard,
  engineState: EngineState | null,
  setEngineState: (state: EngineState) => void
): ExecuteResult {
  const handlerConfig = card.config.errorHandler;
  if (!handlerConfig) {
    return {
      success: false,
      error: '异常处理卡片缺少配置',
      shouldStop: true,
      shouldContinue: false,
      description: '执行失败: 异常处理卡片缺少配置',
    };
  }

  if (!engineState) {
    return {
      success: true,
      shouldStop: false,
      shouldContinue: true,
      description: '异常处理: 机械未初始化，无需处理',
    };
  }

  const hasError = engineState.phase === 'error';

  if (!hasError) {
    return {
      success: true,
      shouldStop: false,
      shouldContinue: true,
      newEngineState: engineState,
      description: `异常处理: 当前无错误，策略=${handlerConfig.strategy}`,
    };
  }

  const errorMsg = engineState.error?.message || '未知错误';
  const errorColumn = engineState.error?.column ?? 0;

  switch (handlerConfig.strategy) {
    case 'stop_immediately':
      return {
        success: false,
        error: `检测到错误，已立即停止: ${errorMsg}`,
        shouldStop: true,
        shouldContinue: false,
        newEngineState: engineState,
        description: `异常处理: 检测到错误，已立即停止 - ${errorMsg}`,
      };

    case 'skip_and_continue': {
      const fixedState: EngineState = {
        ...deepCloneState(engineState),
        phase: 'idle',
        error: null,
        columns: engineState.columns.map((col) => ({
          ...col,
          isError: false,
          wheels: col.wheels.map((w) => ({ ...w, isError: false })),
          carryLevers: col.carryLevers.map((l) => ({ ...l, engaged: false })),
        })),
      };
      setEngineState(fixedState);
      useEngineStore.setState({ engineState: fixedState });
      return {
        success: true,
        shouldStop: false,
        shouldContinue: true,
        newEngineState: fixedState,
        description: `异常处理: 跳过错误继续执行 - ${errorMsg}`,
      };
    }

    case 'retry_once': {
      const retryState: EngineState = {
        ...deepCloneState(engineState),
        phase: 'idle',
        error: null,
        columns: engineState.columns.map((col) => ({
          ...col,
          isError: false,
          wheels: col.wheels.map((w) => ({ ...w, isError: false })),
          carryLevers: col.carryLevers.map((l) => ({ ...l, engaged: false })),
        })),
      };
      setEngineState(retryState);
      useEngineStore.setState({ engineState: retryState });
      return {
        success: true,
        shouldStop: false,
        shouldContinue: true,
        newEngineState: retryState,
        description: `异常处理: 将重试一次 - ${errorMsg}`,
      };
    }

    case 'use_fallback': {
      const fallback = handlerConfig.fallbackValue ?? 0;
      const fixedState: EngineState = {
        ...deepCloneState(engineState),
        phase: 'idle',
        error: null,
        columns: engineState.columns.map((col, idx) => {
          if (idx === errorColumn) {
            const newDigits = numberToDigits(fallback, engineState.numDigits);
            return {
              ...col,
              value: fallback,
              isError: false,
              wheels: col.wheels.map((w, wi) => ({
                ...w,
                digit: newDigits[wi],
                isError: false,
              })),
              carryLevers: col.carryLevers.map((l) => ({ ...l, engaged: false })),
            };
          }
          return {
            ...col,
            isError: false,
            wheels: col.wheels.map((w) => ({ ...w, isError: false })),
            carryLevers: col.carryLevers.map((l) => ({ ...l, engaged: false })),
          };
        }),
      };
      setEngineState(fixedState);
      useEngineStore.setState({ engineState: fixedState });
      return {
        success: true,
        shouldStop: false,
        shouldContinue: true,
        newEngineState: fixedState,
        description: `异常处理: 使用回退值 ${fallback} 替代第${errorColumn}列 - ${errorMsg}`,
      };
    }

    default:
      return {
        success: false,
        error: `未知的异常处理策略: ${handlerConfig.strategy}`,
        shouldStop: true,
        shouldContinue: false,
        description: `执行失败: 未知的异常处理策略`,
      };
  }
}
