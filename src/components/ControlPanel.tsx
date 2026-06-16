import { useState } from 'react';
import {
  Paper,
  NumberInput,
  Button,
  Group,
  Stack,
  TextInput,
  Text,
  Divider,
  Badge,
  Tooltip,
  ActionIcon,
  Alert,
} from '@mantine/core';
import { useEngineStore } from '@/store/engineStore';
import type { EngineConfig } from '@/types';

export default function ControlPanel() {
  const updateConfig = useEngineStore((s) => s.updateConfig);
  const initialize = useEngineStore((s) => s.initialize);
  const stepForward = useEngineStore((s) => s.stepForward);
  const stepBack = useEngineStore((s) => s.stepBack);
  const reset = useEngineStore((s) => s.reset);
  const startContinuous = useEngineStore((s) => s.startContinuous);
  const stopContinuous = useEngineStore((s) => s.stopContinuous);
  const isAnimating = useEngineStore((s) => s.isAnimating);
  const isInitialized = useEngineStore((s) => s.isInitialized);
  const isRunning = useEngineStore((s) => s.isRunning);
  const engineState = useEngineStore((s) => s.engineState);
  const displayPhase = useEngineStore((s) => s.displayPhase);

  const [inputValues, setInputValues] = useState('0, 1, 4');
  const [inputOrder, setInputOrder] = useState(2);
  const [inputDigits, setInputDigits] = useState(6);
  const [inputMaxTurns, setInputMaxTurns] = useState(10);
  const [initError, setInitError] = useState<string | null>(null);

  const handleInitialize = () => {
    if (inputOrder <= 0) {
      setInitError('差分阶数必须大于0');
      return;
    }

    const values = inputValues
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '')
      .map(Number)
      .filter((n) => !isNaN(n));

    const requiredCount = inputOrder + 1;
    if (values.length < requiredCount) {
      setInitError(`需要 ${requiredCount} 个初始值，当前只有 ${values.length} 个`);
      return;
    }

    const modulus = Math.pow(10, inputDigits);
    for (let i = 0; i < requiredCount; i++) {
      if (values[i] < 0) {
        setInitError(`第${i + 1}个初始值不能为负数: ${values[i]}`);
        return;
      }
      if (values[i] >= modulus) {
        setInitError(`第${i + 1}个初始值溢出: ${values[i]} >= ${modulus}`);
        return;
      }
    }

    const newConfig: Partial<EngineConfig> = {
      order: inputOrder,
      numDigits: inputDigits,
      modulus,
      initialValues: values.slice(0, requiredCount),
      maxCrankTurns: inputMaxTurns,
    };

    try {
      updateConfig(newConfig);
      initialize(newConfig);
      setInitError(null);
    } catch (e) {
      setInitError(e instanceof Error ? e.message : '初始化失败');
    }
  };

  const handleReset = () => {
    reset();
    setInputValues('0, 1, 4');
    setInputOrder(2);
    setInputDigits(6);
    setInputMaxTurns(10);
    setInitError(null);
  };

  const canStepForward = isInitialized && !isAnimating && !isRunning && engineState && engineState.phase !== 'error' && engineState.phase !== 'complete';
  const canStepBack = isInitialized && !isAnimating && !isRunning && useEngineStore.getState().historyStack.length > 0;

  return (
    <Paper
      shadow="md"
      radius="md"
      style={{
        background: 'linear-gradient(135deg, #2A2540 0%, #1E1E35 100%)',
        border: '1px solid #4A3728',
        color: '#F5F0E1',
      }}
    >
      <Stack gap="md" p="md">
        <Text size="lg" fw={700} style={{ color: '#C8A951', fontFamily: 'Playfair Display, serif' }}>
          差分机控制台
        </Text>

        <Divider color="#4A3728" />

        <NumberInput
          label="差分阶数"
          value={inputOrder}
          onChange={(v) => { setInputOrder(Number(v) || 1); setInitError(null); }}
          min={1}
          max={6}
          disabled={isInitialized}
          styles={inputStyles}
          description="多项式的最高次幂"
        />

        <NumberInput
          label="数字轮位数"
          value={inputDigits}
          onChange={(v) => { setInputDigits(Number(v) || 1); setInitError(null); }}
          min={1}
          max={10}
          disabled={isInitialized}
          styles={inputStyles}
          description="每个数值的十进制位数"
        />

        <NumberInput
          label="手柄最大转动次数"
          value={inputMaxTurns}
          onChange={(v) => { setInputMaxTurns(Number(v) || 1); setInitError(null); }}
          min={1}
          max={100}
          disabled={isInitialized}
          styles={inputStyles}
        />

        <TextInput
          label="初始数列（逗号分隔）"
          value={inputValues}
          onChange={(e) => { setInputValues(e.currentTarget.value); setInitError(null); }}
          placeholder={`至少 ${inputOrder + 1} 个值`}
          disabled={isInitialized}
          styles={inputStyles}
          description={`例如 x² 的值为 0, 1, 4`}
        />

        <Text size="xs" style={{ color: '#8B8682' }}>
          阶数 {inputOrder} 需要至少 {inputOrder + 1} 个初始值（f(0) 到 f({inputOrder})）
        </Text>

        {initError && (
          <Alert color="red" variant="filled" p="xs" styles={{ root: { background: 'rgba(192,57,43,0.2)' }, body: { color: '#C0392B' }, message: { color: '#C0392B', fontSize: 12 } }}>
            {initError}
          </Alert>
        )}

        {!isInitialized ? (
          <Button
            onClick={handleInitialize}
            disabled={inputOrder <= 0}
            styles={brassButtonStyles}
            fullWidth
          >
            初始化差分机
          </Button>
        ) : (
          <>
            <Divider color="#4A3728" />

            <Group justify="center" gap="xs">
              <Tooltip label="单步前进">
                <ActionIcon
                  size="lg"
                  variant="filled"
                  disabled={!canStepForward}
                  onClick={stepForward}
                  styles={greenActionStyles}
                >
                  ▶
                </ActionIcon>
              </Tooltip>

              <Tooltip label={isRunning ? "暂停连续执行" : "连续执行"}>
                <ActionIcon
                  size="lg"
                  variant="filled"
                  disabled={!canStepForward && !isRunning}
                  onClick={isRunning ? stopContinuous : startContinuous}
                  styles={isRunning ? redActionStyles : copperActionStyles}
                >
                  {isRunning ? '⏸' : '⏩'}
                </ActionIcon>
              </Tooltip>

              <Tooltip label="回退一步">
                <ActionIcon
                  size="lg"
                  variant="filled"
                  disabled={!canStepBack}
                  onClick={stepBack}
                  styles={brassActionStyles}
                >
                  ◀
                </ActionIcon>
              </Tooltip>

              <Tooltip label="重置">
                <ActionIcon
                  size="lg"
                  variant="filled"
                  onClick={handleReset}
                  styles={redActionStyles}
                >
                  ↺
                </ActionIcon>
              </Tooltip>
            </Group>

            {engineState && (
              <Stack gap={4}>
                <Group justify="space-between">
                  <Text size="xs" style={{ color: '#8B8682' }}>当前状态</Text>
                  <PhaseBadge phase={displayPhase} />
                </Group>
                <Group justify="space-between">
                  <Text size="xs" style={{ color: '#8B8682' }}>手柄转数</Text>
                  <Text size="xs" style={{ color: '#C8A951' }}>
                    {engineState.crankTurns} / {engineState.maxSteps}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text size="xs" style={{ color: '#8B8682' }}>当前步数</Text>
                  <Text size="xs" style={{ color: '#C8A951' }}>
                    {engineState.currentStep}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text size="xs" style={{ color: '#8B8682' }}>结果 f(x)</Text>
                  <Text size="xs" fw={700} style={{ color: '#2E8B57' }}>
                    {engineState.columns[0]?.value ?? '-'}
                  </Text>
                </Group>
                {engineState.error && (
                  <Paper
                    p="xs"
                    radius="sm"
                    style={{ background: 'rgba(192,57,43,0.2)', border: '1px solid #C0392B' }}
                  >
                    <Text size="xs" style={{ color: '#C0392B' }}>
                      ⚠ {engineState.error.message}
                    </Text>
                  </Paper>
                )}
              </Stack>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );
}

function PhaseBadge({ phase }: { phase: string }) {
  const config: Record<string, { color: string; label: string }> = {
    idle: { color: '#2E8B57', label: '就绪' },
    adding: { color: '#C8A951', label: '加法中' },
    carrying: { color: '#C8A951', label: '进位中' },
    error: { color: '#C0392B', label: '错误' },
    complete: { color: '#4A9B7F', label: '完成' },
  };
  const c = config[phase] ?? { color: '#8B8682', label: phase };
  return <Badge color={c.color} variant="filled" size="sm">{c.label}</Badge>;
}

const inputStyles = {
  label: { color: '#C8A951', fontFamily: 'Source Sans 3, sans-serif' },
  input: {
    background: '#1A1A2E',
    color: '#F5F0E1',
    borderColor: '#4A3728',
    fontFamily: 'Source Sans 3, sans-serif',
  },
  description: { color: '#8B8682', fontSize: 11 },
};

const brassButtonStyles = {
  root: {
    background: 'linear-gradient(135deg, #C8A951, #A08930)',
    color: '#1A1A2E',
    fontWeight: 'bold',
    border: 'none',
  },
};

const greenActionStyles = {
  root: {
    background: 'linear-gradient(135deg, #2E8B57, #1E6B3F)',
    color: '#F5F0E1',
    border: 'none',
  },
};

const copperActionStyles = {
  root: {
    background: 'linear-gradient(135deg, #2E8B57, #1E6B3F)',
    color: '#F5F0E1',
    border: 'none',
  },
};

const brassActionStyles = {
  root: {
    background: 'linear-gradient(135deg, #C8A951, #A08930)',
    color: '#1A1A2E',
    border: 'none',
  },
};

const redActionStyles = {
  root: {
    background: 'linear-gradient(135deg, #8B3A3A, #6B2020)',
    color: '#F5F0E1',
    border: 'none',
  },
};
