import { useState } from 'react';
import {
  Paper,
  Text,
  Group,
  Stack,
  Button,
  NumberInput,
  TextInput,
  Divider,
  Badge,
  Tooltip,
  ActionIcon,
  Alert,
  Textarea,
  Slider,
  ScrollArea,
} from '@mantine/core';
import { useEngineStore } from '@/store/engineStore';
import { useCollabStore } from '@/store/collabStore';
import { useRecordingStore } from '@/store/recordingStore';
import type { EngineConfig, DemoRecording } from '@/types';

export default function CollabControlPanel() {
  const {
    engineState,
    operationLog,
    config,
    isAnimating,
    isInitialized,
    isRunning,
    displayPhase,
    collabInitialize,
    collabStepForward,
    collabStepBack,
    collabReset,
    collabStartContinuous,
    collabStopContinuous,
  } = useEngineStore();

  const collab = useCollabStore();
  const recording = useRecordingStore();

  const [inputValues, setInputValues] = useState('0, 1, 4');
  const [inputOrder, setInputOrder] = useState(2);
  const [inputDigits, setInputDigits] = useState(6);
  const [inputMaxTurns, setInputMaxTurns] = useState(10);
  const [initError, setInitError] = useState<string | null>(null);
  const [narration, setNarration] = useState('');

  const canControl = collab.canControl();
  const isPresenter = collab.isPresenter();
  const inSession = collab.isInSession;

  const handleInitialize = () => {
    if (!canControl) return;
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
      if (values[i] < 0) { setInitError(`第${i + 1}个初始值不能为负数: ${values[i]}`); return; }
      if (values[i] >= modulus) { setInitError(`第${i + 1}个初始值溢出: ${values[i]} >= ${modulus}`); return; }
    }
    const newConfig: Partial<EngineConfig> = {
      order: inputOrder,
      numDigits: inputDigits,
      modulus,
      initialValues: values.slice(0, requiredCount),
      maxCrankTurns: inputMaxTurns,
    };
    try {
      collabInitialize(newConfig);
      setInitError(null);
    } catch (e) {
      setInitError(e instanceof Error ? e.message : '初始化失败');
    }
  };

  const handleReset = () => {
    if (!canControl) return;
    collabReset();
    setInputValues('0, 1, 4');
    setInputOrder(2);
    setInputDigits(6);
    setInputMaxTurns(10);
    setInitError(null);
  };

  const handleAddNarration = () => {
    if (!narration.trim() || !isPresenter) return;
    recording.addNarration(narration);
    setNarration('');
  };

  const canStepForward = inSession
    ? canControl && isInitialized && !isAnimating && !isRunning && engineState && engineState.phase !== 'error' && engineState.phase !== 'complete'
    : false;
  const canStepBack = inSession
    ? canControl && isInitialized && !isAnimating && !isRunning && useEngineStore.getState().historyStack.length > 0
    : false;

  if (!inSession) {
    return (
      <Paper
        shadow="md"
        radius="md"
        p="md"
        style={{
          background: 'linear-gradient(135deg, #2A2540 0%, #1E1E35 100%)',
          border: '1px solid #4A3728',
          color: '#F5F0E1',
          textAlign: 'center',
        }}
      >
        <Stack gap="sm" align="center">
          <Text size="xl">🌐</Text>
          <Text size="sm" fw={700} style={{ color: '#C8A951' }}>
            尚未加入协同会话
          </Text>
          <Text size="xs" style={{ color: '#8B8682' }}>
            请先在左侧面板创建或加入一个协同演示会话
          </Text>
        </Stack>
      </Paper>
    );
  }

  if (!isPresenter) {
    return (
      <Paper
        shadow="md"
        radius="md"
        p="md"
        style={{
          background: 'linear-gradient(135deg, #2A2540 0%, #1E1E35 100%)',
          border: '1px solid #4A3728',
          color: '#F5F0E1',
        }}
      >
        <Stack gap="sm">
          <Text size="md" fw={700} style={{ color: '#C8A951', fontFamily: 'Playfair Display, serif' }}>
            👁 观众模式
          </Text>
          <Divider color="#4A3728" />
          <Alert
            color="brass"
            variant="light"
            styles={{ root: { background: 'rgba(200,169,81,0.1)' }, title: { color: '#C8A951' }, message: { color: '#C8A951' } }}
            title="实时同步中"
          >
            当前由主讲人 {collab.getCurrentPresenter()?.name || '(无)'} 控制差分机运行，所有状态变化将实时同步到您的屏幕。
          </Alert>

          {engineState && (
            <>
              <Divider color="#4A3728" />
              <Stack gap={4}>
                <Group justify="space-between">
                  <Text size="xs" style={{ color: '#8B8682' }}>同步状态</Text>
                  <Badge size="sm" variant="filled" style={{ background: collab.syncStatus === 'synced' ? '#2E8B57' : collab.syncStatus === 'syncing' ? '#C8A951' : '#C0392B' }}>
                    {collab.syncStatus === 'synced' ? '✓ 已同步' : collab.syncStatus === 'syncing' ? '⏳ 同步中' : '⚠ 不同步'}
                  </Badge>
                </Group>
                <Group justify="space-between">
                  <Text size="xs" style={{ color: '#8B8682' }}>当前阶段</Text>
                  <PhaseBadge phase={displayPhase} />
                </Group>
                <Group justify="space-between">
                  <Text size="xs" style={{ color: '#8B8682' }}>手柄转数</Text>
                  <Text size="xs" style={{ color: '#C8A951' }}>
                    {engineState.crankTurns} / {engineState.maxSteps}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text size="xs" style={{ color: '#8B8682' }}>结果 f(x)</Text>
                  <Text size="xs" fw={700} style={{ color: '#2E8B57' }}>
                    {engineState.columns[0]?.value ?? '-'}
                  </Text>
                </Group>
              </Stack>
            </>
          )}

          {engineState?.error && (
            <Paper p="xs" radius="sm" style={{ background: 'rgba(192,57,43,0.2)', border: '1px solid #C0392B' }}>
              <Text size="xs" style={{ color: '#C0392B' }}>
                ⚠ 同步到错误状态: {engineState.error.message}
              </Text>
            </Paper>
          )}
        </Stack>
      </Paper>
    );
  }

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
        <Group justify="space-between">
          <Text size="lg" fw={700} style={{ color: '#C8A951', fontFamily: 'Playfair Display, serif' }}>
            🎤 主讲人控制台
          </Text>
          {recording.isRecording && (
            <Badge color="red" variant="filled" size="sm">
              ● 录制中
            </Badge>
          )}
        </Group>

        <Divider color="#4A3728" />

        {!isInitialized ? (
          <>
            <NumberInput
              label="差分阶数"
              value={inputOrder}
              onChange={(v) => { setInputOrder(Number(v) || 1); setInitError(null); }}
              min={1} max={6}
              disabled={!canControl}
              styles={inputStyles}
              description="多项式的最高次幂"
            />
            <NumberInput
              label="数字轮位数"
              value={inputDigits}
              onChange={(v) => { setInputDigits(Number(v) || 1); setInitError(null); }}
              min={1} max={10}
              disabled={!canControl}
              styles={inputStyles}
              description="每个数值的十进制位数"
            />
            <NumberInput
              label="手柄最大转动次数"
              value={inputMaxTurns}
              onChange={(v) => { setInputMaxTurns(Number(v) || 1); setInitError(null); }}
              min={1} max={100}
              disabled={!canControl}
              styles={inputStyles}
            />
            <TextInput
              label="初始数列（逗号分隔）"
              value={inputValues}
              onChange={(e) => { setInputValues(e.currentTarget.value); setInitError(null); }}
              placeholder={`至少 ${inputOrder + 1} 个值`}
              disabled={!canControl}
              styles={inputStyles}
              description={`例如 x² 的值为 0, 1, 4`}
            />
            {initError && (
              <Alert color="red" variant="filled" p="xs" styles={{ root: { background: 'rgba(192,57,43,0.2)' }, body: { color: '#C0392B' }, message: { color: '#C0392B', fontSize: 12 } }}>
                {initError}
              </Alert>
            )}
            <Button onClick={handleInitialize} disabled={inputOrder <= 0 || !canControl} styles={brassButtonStyles} fullWidth>
              初始化并广播给所有观众
            </Button>
          </>
        ) : (
          <>
            {recording.isRecording && (
              <Textarea
                size="xs"
                placeholder="添加讲解旁白（将记录在当前步骤）..."
                value={narration}
                onChange={(e) => setNarration(e.currentTarget.value)}
                minRows={2}
                rightSection={
                  <ActionIcon
                    size="sm"
                    onClick={handleAddNarration}
                    disabled={!narration.trim()}
                    style={{ color: '#C8A951' }}
                  >
                    📝
                  </ActionIcon>
                }
                styles={{ input: { background: '#1A1A2E', color: '#F5F0E1', borderColor: '#4A3728' } }}
              />
            )}

            <Group justify="center" gap="xs">
              <Tooltip label="单步前进（广播给所有观众）">
                <ActionIcon size="lg" variant="filled" disabled={!canStepForward} onClick={collabStepForward} styles={greenActionStyles}>
                  ▶
                </ActionIcon>
              </Tooltip>
              <Tooltip label={isRunning ? '暂停连续执行' : '连续执行（广播）'}>
                <ActionIcon size="lg" variant="filled" disabled={!canStepForward && !isRunning} onClick={isRunning ? collabStopContinuous : collabStartContinuous} styles={isRunning ? redActionStyles : copperActionStyles}>
                  {isRunning ? '⏸' : '⏩'}
                </ActionIcon>
              </Tooltip>
              <Tooltip label="回退一步（广播）">
                <ActionIcon size="lg" variant="filled" disabled={!canStepBack} onClick={collabStepBack} styles={brassActionStyles}>
                  ◀
                </ActionIcon>
              </Tooltip>
              <Tooltip label="重置（广播）">
                <ActionIcon size="lg" variant="filled" onClick={handleReset} styles={redActionStyles}>
                  ↺
                </ActionIcon>
              </Tooltip>
            </Group>

            {engineState && (
              <Stack gap={4}>
                <Group justify="space-between">
                  <Text size="xs" style={{ color: '#8B8682' }}>当前阶段</Text>
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
                  <Text size="xs" style={{ color: '#C8A951' }}>{engineState.currentStep}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="xs" style={{ color: '#8B8682' }}>结果 f(x)</Text>
                  <Text size="xs" fw={700} style={{ color: '#2E8B57' }}>{engineState.columns[0]?.value ?? '-'}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="xs" style={{ color: '#8B8682' }}>观众数</Text>
                  <Text size="xs" style={{ color: '#4A9B7F' }}>{collab.participants.length - 1} 人在线</Text>
                </Group>
              </Stack>
            )}

            {engineState?.error && (
              <Paper p="xs" radius="sm" style={{ background: 'rgba(192,57,43,0.2)', border: '1px solid #C0392B' }}>
                <Text size="xs" style={{ color: '#C0392B' }}>
                  ⚠ 错误: {engineState.error.message}（已同步广播给所有观众并停止）
                </Text>
              </Paper>
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

export function ReplayPanel() {
  const {
    savedRecordings,
    activeRecording,
    isRecording,
    isReplaying,
    replayIndex,
    replaySpeed,
    startReplay,
    pauseReplay,
    resumeReplay,
    stopReplay,
    replayNextStep,
    replayPrevStep,
    replayGotoStep,
    setReplaySpeed,
    deleteSavedRecording,
    exportRecordingAsJSON,
  } = useRecordingStore();

  const collab = useCollabStore();
  const engineState = useEngineStore((s) => s.engineState);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const currentRecording = isReplaying
    ? activeRecording || savedRecordings[0]
    : savedRecordings.find((r) => r.id === selectedId) || savedRecordings[0];

  const totalSteps = currentRecording?.steps.length ?? 0;

  if (!collab.isPresenter() && !isReplaying) {
    return null;
  }

  return (
    <Paper
      shadow="sm"
      radius="md"
      p="sm"
      style={{
        background: 'linear-gradient(135deg, #2A2540 0%, #1E1E35 100%)',
        border: '1px solid #4A3728',
      }}
    >
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="sm" fw={700} style={{ color: '#C8A951', fontFamily: 'Playfair Display, serif' }}>
            🎞 演示录制与回放
          </Text>
        </Group>
        <Divider color="#4A3728" />

        {savedRecordings.length === 0 && !isReplaying ? (
          <Text size="xs" style={{ color: '#8B8682', textAlign: 'center', padding: 16 }}>
            暂无演示记录。创建会话后点击"开始录制"可记录整场演示。
          </Text>
        ) : (
          <>
            {!isReplaying && (
              <ScrollArea style={{ maxHeight: 120 }} type="hover">
                <Stack gap="xs">
                  {savedRecordings.map((r) => (
                    <RecordingItem
                      key={r.id}
                      recording={r}
                      selected={r.id === selectedId}
                      onSelect={() => setSelectedId(r.id === selectedId ? null : r.id)}
                      onPlay={() => startReplay(r)}
                      onDelete={() => deleteSavedRecording(r.id)}
                      onExport={() => {
                        const json = exportRecordingAsJSON(r);
                        const blob = new Blob([json], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${r.sessionName}-${new Date(r.startTime).toISOString().slice(0, 10)}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    />
                  ))}
                </Stack>
              </ScrollArea>
            )}

            {isReplaying && currentRecording && (
              <Stack gap="xs">
                <Group justify="space-between">
                  <Badge size="xs" variant="filled" style={{ background: '#C8A951', color: '#1A1A2E' }}>
                    回放中: {currentRecording.sessionName}
                  </Badge>
                  <Text size="xs" style={{ color: '#8B8682' }}>
                    步骤 {replayIndex + 1} / {totalSteps}
                  </Text>
                </Group>
                <Slider
                  size="sm"
                  value={totalSteps > 0 ? (replayIndex + 1) : 0}
                  min={1}
                  max={Math.max(1, totalSteps)}
                  step={1}
                  onChange={(v) => replayGotoStep(Number(v) - 1)}
                  styles={{
                    track: { background: '#4A3728' },
                    bar: { background: '#C8A951' },
                    thumb: { background: '#C8A951', borderColor: '#C8A951' },
                  }}
                />
                <Group justify="center" gap="xs">
                  <ActionIcon size="md" variant="filled" onClick={replayPrevStep} disabled={replayIndex <= 0} styles={brassActionStyles}>
                    ◀
                  </ActionIcon>
                  <ActionIcon size="md" variant="filled" onClick={isReplaying ? pauseReplay : resumeReplay} styles={isReplaying ? redActionStyles : greenActionStyles}>
                    {isReplaying ? '⏸' : '▶'}
                  </ActionIcon>
                  <ActionIcon size="md" variant="filled" onClick={replayNextStep} disabled={replayIndex >= totalSteps - 1} styles={brassActionStyles}>
                    ▶
                  </ActionIcon>
                  <ActionIcon size="md" variant="filled" onClick={stopReplay} styles={redActionStyles}>
                    ⏹
                  </ActionIcon>
                </Group>
                <Group justify="center" gap="xs">
                  {[0.25, 0.5, 1, 2, 4].map((s) => (
                    <ActionIcon
                      key={s}
                      size="sm"
                      variant={replaySpeed === s ? 'filled' : 'subtle'}
                      onClick={() => setReplaySpeed(s)}
                      style={{
                        background: replaySpeed === s ? '#C8A951' : undefined,
                        color: replaySpeed === s ? '#1A1A2E' : '#C8A951',
                      }}
                    >
                      {s}x
                    </ActionIcon>
                  ))}
                </Group>
                {currentRecording.steps[replayIndex]?.narrationText && (
                  <Paper p="xs" radius="sm" style={{ background: 'rgba(200,169,81,0.1)', border: '1px dashed #C8A951' }}>
                    <Text size="xs" style={{ color: '#C8A951' }}>
                      🎙 旁白: {currentRecording.steps[replayIndex].narrationText}
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

function RecordingItem({
  recording,
  selected,
  onSelect,
  onPlay,
  onDelete,
  onExport,
}: {
  recording: DemoRecording;
  selected: boolean;
  onSelect: () => void;
  onPlay: () => void;
  onDelete: () => void;
  onExport: () => void;
}) {
  const duration = recording.endTime ? ((recording.endTime - recording.startTime) / 1000).toFixed(1) : '-';
  return (
    <Paper
      p="xs"
      radius="sm"
      onClick={onSelect}
      style={{
        background: selected ? 'rgba(200,169,81,0.1)' : 'rgba(74,55,40,0.3)',
        border: `1px solid ${selected ? '#C8A951' : '#4A3728'}`,
        cursor: 'pointer',
      }}
    >
      <Stack gap={4}>
        <Group justify="space-between">
          <Text size="xs" fw={600} style={{ color: '#F5F0E1' }}>{recording.sessionName}</Text>
          <Text size="xs" style={{ color: '#8B8682' }}>{duration}s</Text>
        </Group>
        <Group justify="space-between">
          <Badge size="xs" variant="outline" color="#8B8682">
            {recording.steps.length} 步骤
          </Badge>
          <Group gap={0}>
            <ActionIcon size="xs" variant="subtle" onClick={(e) => { e.stopPropagation(); onPlay(); }} style={{ color: '#2E8B57' }}>▶</ActionIcon>
            <ActionIcon size="xs" variant="subtle" onClick={(e) => { e.stopPropagation(); onExport(); }} style={{ color: '#C8A951' }}>⬇</ActionIcon>
            <ActionIcon size="xs" variant="subtle" onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ color: '#C0392B' }}>🗑</ActionIcon>
          </Group>
        </Group>
        <Text size="xs" style={{ color: '#8B8682', fontSize: 10 }}>
          {new Date(recording.startTime).toLocaleString()} · {recording.hostName}
        </Text>
      </Stack>
    </Paper>
  );
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
    background: 'linear-gradient(135deg, #B87333, #8B5A2B)',
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
