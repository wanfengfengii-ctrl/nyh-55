import { useState, useEffect, useCallback } from 'react';
import {
  Paper,
  Text,
  Group,
  Stack,
  Button,
  Select,
  NumberInput,
  Textarea,
  Divider,
  Badge,
  Tooltip,
  ActionIcon,
  ScrollArea,
  Slider,
  Progress,
  Tabs,
  Table,
} from '@mantine/core';
import { useFaultTrainingStore } from '@/store/faultTrainingStore';
import type { FaultType, FaultDifficulty, UserDiagnosisSubmission, DiagnosisEvaluation, FaultDiagnosis } from '@/types';
import { FAULT_TYPE_LABELS, FAULT_DIFFICULTY_LABELS } from '@/engine/FaultInjectionEngine';

export default function FaultTrainingPanel() {
  const {
    activeSession,
    history,
    isReplaying,
    replayIndex,
    replaySpeed,
    startTraining,
    stepForward,
    stepBack,
    submitDiagnosis,
    requestHint,
    toggleTimer,
    endTraining,
    resetTraining,
    setShowCorrectComparison,
    setShowEvaluationDetail,
    startReplay,
    pauseReplay,
    resumeReplay,
    stopReplay,
    setReplaySpeed,
    replayNextStep,
    replayPrevStep,
    replayGotoStep,
    loadHistory,
    clearHistory,
    replayFrames,
  } = useFaultTrainingStore();

  const [difficulty, setDifficulty] = useState<FaultDifficulty>('beginner');
  const [diagFaultType, setDiagFaultType] = useState<FaultType>('stuck_wheel');
  const [diagColumn, setDiagColumn] = useState(0);
  const [diagWheel, setDiagWheel] = useState(0);
  const [diagLever, setDiagLever] = useState(0);
  const [diagStep, setDiagStep] = useState(1);
  const [diagCause, setDiagCause] = useState('');
  const [activeTab, setActiveTab] = useState<string | null>('control');
  const [lastEvaluation, setLastEvaluation] = useState<DiagnosisEvaluation | null>(null);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleStartTraining = useCallback(() => {
    startTraining(difficulty);
    setDiagCause('');
    setLastEvaluation(null);
  }, [difficulty, startTraining]);

  const handleStepForward = useCallback(() => {
    stepForward();
  }, [stepForward]);

  const handleStepBack = useCallback(() => {
    stepBack();
  }, [stepBack]);

  const handleSubmitDiagnosis = useCallback(() => {
    const submission: UserDiagnosisSubmission = {
      faultType: diagFaultType,
      columnIndex: diagColumn,
      wheelIndex: ['stuck_wheel', 'misaligned_carry'].includes(diagFaultType) ? diagWheel : undefined,
      leverIndex: diagFaultType === 'misaligned_carry' ? diagLever : undefined,
      stepNumber: diagStep,
      causeDescription: diagCause,
    };
    const result = submitDiagnosis(submission);
    setLastEvaluation(result);
  }, [diagFaultType, diagColumn, diagWheel, diagLever, diagStep, diagCause, submitDiagnosis]);

  const handleRequestHint = useCallback(() => {
    const hints = requestHint();
    if (hints.length > 0) {
      const emptyDiagnosis: FaultDiagnosis = {
        faultId: '',
        faultType: 'stuck_wheel',
        columnIndex: 0,
        stepNumber: 0,
        causeDescription: '',
      };
      const emptySubmission: UserDiagnosisSubmission = {
        faultType: 'stuck_wheel',
        columnIndex: 0,
        stepNumber: 0,
        causeDescription: '',
      };
      setLastEvaluation({
        isCorrect: false,
        partialCredit: 0,
        matchedFaultId: null,
        explanation: '提示信息：\n' + hints.join('\n'),
        evidence: hints,
        standardAnswer: emptyDiagnosis,
        userAnswer: emptySubmission,
      });
    }
  }, [requestHint]);

  const handleEndTraining = useCallback(() => {
    endTraining();
  }, [endTraining]);

  const handleResetTraining = useCallback(() => {
    resetTraining();
    setDiagCause('');
    setLastEvaluation(null);
  }, [resetTraining]);

  if (!activeSession) {
    return <TrainingSetup difficulty={difficulty} setDifficulty={setDifficulty} onStart={handleStartTraining} history={history} onClearHistory={clearHistory} />;
  }

  const session = activeSession;
  const scenario = session.scenario;
  const timeRemaining = Math.max(0, scenario.timeLimitSeconds - session.elapsedSeconds);
  const timeProgress = (session.elapsedSeconds / scenario.timeLimitSeconds) * 100;
  const isTimeUp = timeRemaining <= 0;
  const isRunning = session.status === 'running';
  const isDiagnosing = session.status === 'diagnosing' || session.status === 'running';
  const isEvaluated = session.status === 'evaluated';
  const isCompleted = session.status === 'completed';
  const totalReplaySteps = replayFrames.length;

  const faultTypeOptions = Object.entries(FAULT_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const difficultyColorMap: Record<string, string> = {
    beginner: '#2E8B57',
    intermediate: '#C8A951',
    advanced: '#B87333',
    expert: '#C0392B',
  };

  return (
    <Stack gap="sm" style={{ height: '100%', minHeight: 0 }}>
      <Paper
        shadow="md"
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
              🔧 故障排查训练
            </Text>
            <Badge
              size="xs"
              variant="filled"
              style={{ background: difficultyColorMap[scenario.difficulty] || '#8B8682' }}
            >
              {FAULT_DIFFICULTY_LABELS[scenario.difficulty]}
            </Badge>
          </Group>

          <Text size="xs" style={{ color: '#8B8682' }} lineClamp={2}>
            {scenario.description}
          </Text>

          <Divider color="#4A3728" />

          <Group justify="space-between">
            <Group gap="xs">
              <Text size="xs" style={{ color: '#8B8682' }}>⏱</Text>
              <Text size="xs" style={{ color: isTimeUp ? '#C0392B' : '#F5F0E1', fontWeight: 600 }}>
                {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
              </Text>
            </Group>
            <Group gap="xs">
              <Text size="xs" style={{ color: '#8B8682' }}>步数:</Text>
              <Text size="xs" style={{ color: '#C8A951' }}>{session.currentStep}</Text>
              <Text size="xs" style={{ color: '#8B8682' }}>|</Text>
              <Text size="xs" style={{ color: '#8B8682' }}>诊断:</Text>
              <Text size="xs" style={{ color: '#2E8B57' }}>{session.evaluations.filter(e => e.isCorrect).length}/{scenario.faults.length}</Text>
            </Group>
          </Group>

          <Progress
            value={timeProgress}
            size="xs"
            color={timeProgress > 80 ? '#C0392B' : timeProgress > 50 ? '#C8A951' : '#2E8B57'}
            styles={{ root: { background: '#1A1A2E' } }}
          />

          <Group justify="center" gap="xs">
            <Tooltip label="单步前进（含故障注入）">
              <ActionIcon
                size="lg"
                variant="filled"
                disabled={!isRunning || isTimeUp}
                onClick={handleStepForward}
                styles={greenActionStyles}
              >
                ▶
              </ActionIcon>
            </Tooltip>
            <Tooltip label="回退一步">
              <ActionIcon
                size="lg"
                variant="filled"
                disabled={!isRunning || session.currentStep <= 0}
                onClick={handleStepBack}
                styles={brassActionStyles}
              >
                ◀
              </ActionIcon>
            </Tooltip>
            <Tooltip label={session.timerRunning ? '暂停计时' : '继续计时'}>
              <ActionIcon
                size="lg"
                variant="filled"
                onClick={toggleTimer}
                styles={session.timerRunning ? redActionStyles : copperActionStyles}
              >
                {session.timerRunning ? '⏸' : '⏵'}
              </ActionIcon>
            </Tooltip>
            <Tooltip label="请求提示（扣分）">
              <ActionIcon
                size="lg"
                variant="filled"
                disabled={!isDiagnosing}
                onClick={handleRequestHint}
                styles={hintActionStyles}
              >
                💡
              </ActionIcon>
            </Tooltip>
            <Tooltip label="结束训练并评分">
              <ActionIcon
                size="lg"
                variant="filled"
                disabled={session.evaluations.length === 0 && !isEvaluated}
                onClick={handleEndTraining}
                styles={redActionStyles}
              >
                ⏹
              </ActionIcon>
            </Tooltip>
            <Tooltip label="放弃训练">
              <ActionIcon
                size="lg"
                variant="filled"
                onClick={handleResetTraining}
                styles={{ root: { background: '#4A3728', color: '#8B8682', border: 'none' } }}
              >
                ↺
              </ActionIcon>
            </Tooltip>
          </Group>

          {session.revealedHints > 0 && (
            <Text size="xs" style={{ color: '#C8A951', fontStyle: 'italic' }}>
              已使用 {session.revealedHints} 次提示（每次扣10%分数）
            </Text>
          )}
        </Stack>
      </Paper>

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        styles={{
          root: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
          list: {
            background: 'rgba(42, 37, 64, 0.8)',
            border: '1px solid #4A3728',
            borderRadius: 6,
            padding: 2,
          },
          tab: {
            color: '#8B8682',
            fontSize: 11,
            padding: '4px 6px',
            '&[data-active]': {
              color: '#1A1A2E',
              background: 'linear-gradient(135deg, #C8A951, #A08930)',
              borderRadius: 4,
            },
          },
          panel: { flex: 1, minHeight: 0, paddingTop: 4 },
        }}
      >
        <Tabs.List grow>
          <Tabs.Tab value="control">操控</Tabs.Tab>
          <Tabs.Tab value="diagnose">诊断</Tabs.Tab>
          <Tabs.Tab value="result">结果</Tabs.Tab>
          <Tabs.Tab value="replay">回放</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="control" style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Paper
            shadow="sm"
            radius="md"
            p="sm"
            style={{
              flex: 1,
              minHeight: 0,
              background: 'linear-gradient(135deg, #2A2540 0%, #1E1E35 100%)',
              border: '1px solid #4A3728',
            }}
          >
            <Stack gap="xs" style={{ height: '100%' }}>
              <Text size="xs" fw={700} style={{ color: '#C8A951' }}>
                运算记录（含故障）
              </Text>
              <ScrollArea style={{ flex: 1, minHeight: 0 }} type="hover">
                <Stack gap={4}>
                  {session.faultyOperationLog.length === 0 && (
                    <Text size="xs" style={{ color: '#8B8682', textAlign: 'center', padding: 16 }}>
                      尚无运算记录，点击 ▶ 前进
                    </Text>
                  )}
                  {session.faultyOperationLog.map((step, idx) => {
                    const isFaultStep = scenario.faults.some(f => f.triggerStep === step.stepNumber);
                    return (
                      <Paper
                        key={idx}
                        p="xs"
                        radius="sm"
                        style={{
                          background: isFaultStep
                            ? 'rgba(192,57,43,0.15)'
                            : step.errorOccurred
                              ? 'rgba(192,57,43,0.08)'
                              : 'transparent',
                          borderLeft: isFaultStep
                            ? '3px solid #C0392B'
                            : step.carryTriggered
                              ? '3px solid #C8A951'
                              : '3px solid #2E8B57',
                        }}
                      >
                        <Group gap="xs" wrap="nowrap">
                          <Badge
                            size="xs"
                            variant="filled"
                            color={isFaultStep ? '#C0392B' : '#C8A951'}
                          >
                            #{step.stepNumber}
                          </Badge>
                          <Text size="xs" style={{ color: '#F5F0E1' }} lineClamp={1}>
                            {step.description}
                          </Text>
                          {isFaultStep && (
                            <Badge size="xs" variant="filled" color="#C0392B">
                              ⚠ 故障
                            </Badge>
                          )}
                          {step.carryTriggered && !isFaultStep && (
                            <Badge size="xs" variant="outline" color="#C8A951">进位</Badge>
                          )}
                        </Group>
                        <Group gap={4} mt={2} style={{ flexWrap: 'wrap' }}>
                          {step.newValues.map((v, i) => (
                            <Text key={i} size="xs" style={{ color: i === 0 ? '#2E8B57' : '#8B8682' }}>
                              {i === 0 ? 'f' : `Δ${toSup(i)}`}={v}
                            </Text>
                          ))}
                        </Group>
                      </Paper>
                    );
                  })}
                </Stack>
              </ScrollArea>

              <Divider color="#4A3728" />

              <Group gap="xs">
                <Button
                  size="xs"
                  variant={useFaultTrainingStore.getState().showCorrectComparison ? 'filled' : 'subtle'}
                  onClick={() => setShowCorrectComparison(!useFaultTrainingStore.getState().showCorrectComparison)}
                  style={{ color: '#2E8B57' }}
                >
                  对比正确结果
                </Button>
                {session.correctEngineState && (
                  <Text size="xs" style={{ color: '#2E8B57' }}>
                    正确 f(x)={session.correctEngineState.columns[0]?.value ?? '-'}
                  </Text>
                )}
              </Group>

              {session.faultyEngineState?.error && (
                <Paper p="xs" radius="sm" style={{ background: 'rgba(192,57,43,0.2)', border: '1px solid #C0392B' }}>
                  <Text size="xs" style={{ color: '#C0392B' }}>
                    ⚠ {session.faultyEngineState.error.message}
                  </Text>
                </Paper>
              )}
            </Stack>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="diagnose" style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Paper
            shadow="sm"
            radius="md"
            p="sm"
            style={{
              flex: 1,
              minHeight: 0,
              background: 'linear-gradient(135deg, #2A2540 0%, #1E1E35 100%)',
              border: '1px solid #4A3728',
            }}
          >
            <Stack gap="xs" style={{ height: '100%' }}>
              <Text size="xs" fw={700} style={{ color: '#C8A951' }}>
                提交故障诊断
              </Text>

              <Select
                size="xs"
                label="故障类型"
                data={faultTypeOptions}
                value={diagFaultType}
                onChange={(v) => v && setDiagFaultType(v as FaultType)}
                styles={inputStyles}
              />

              <Group gap="xs" grow>
                <NumberInput
                  size="xs"
                  label="故障列"
                  value={diagColumn}
                  onChange={(v) => setDiagColumn(Number(v) || 0)}
                  min={0}
                  max={scenario.engineConfig.order}
                  styles={inputStyles}
                />
                <NumberInput
                  size="xs"
                  label="故障步骤"
                  value={diagStep}
                  onChange={(v) => setDiagStep(Number(v) || 1)}
                  min={1}
                  max={session.currentStep}
                  styles={inputStyles}
                />
              </Group>

              {(diagFaultType === 'stuck_wheel') && (
                <NumberInput
                  size="xs"
                  label="数字轮索引"
                  value={diagWheel}
                  onChange={(v) => setDiagWheel(Number(v) || 0)}
                  min={0}
                  max={scenario.engineConfig.numDigits - 1}
                  styles={inputStyles}
                />
              )}

              {diagFaultType === 'misaligned_carry' && (
                <Group gap="xs" grow>
                  <NumberInput
                    size="xs"
                    label="数字轮索引"
                    value={diagWheel}
                    onChange={(v) => setDiagWheel(Number(v) || 0)}
                    min={0}
                    max={scenario.engineConfig.numDigits - 1}
                    styles={inputStyles}
                  />
                  <NumberInput
                    size="xs"
                    label="进位杆索引"
                    value={diagLever}
                    onChange={(v) => setDiagLever(Number(v) || 0)}
                    min={0}
                    max={scenario.engineConfig.numDigits - 2}
                    styles={inputStyles}
                  />
                </Group>
              )}

              {diagFaultType === 'gear_desync' && (
                <Text size="xs" style={{ color: '#8B8682', fontStyle: 'italic' }}>
                  齿轮不同步故障将影响故障列与前一列之间的传动
                </Text>
              )}

              <Textarea
                size="xs"
                label="原因描述"
                placeholder="描述您判断的故障原因（如：弹簧松弛、齿轮磨损等）"
                value={diagCause}
                onChange={(e) => setDiagCause(e.currentTarget.value)}
                minRows={2}
                autosize
                styles={{ input: { background: '#1A1A2E', color: '#F5F0E1', borderColor: '#4A3728' } }}
              />

              <Button
                size="xs"
                fullWidth
                onClick={handleSubmitDiagnosis}
                disabled={!isDiagnosing || !diagCause.trim()}
                styles={greenButtonStyles}
              >
                提交诊断
              </Button>

              {lastEvaluation && (
                <Paper
                  p="xs"
                  radius="sm"
                  style={{
                    background: lastEvaluation.isCorrect
                      ? 'rgba(46,139,87,0.15)'
                      : lastEvaluation.partialCredit > 0
                        ? 'rgba(200,169,81,0.15)'
                        : 'rgba(192,57,43,0.15)',
                    border: `1px solid ${lastEvaluation.isCorrect ? '#2E8B57' : lastEvaluation.partialCredit > 0 ? '#C8A951' : '#C0392B'}`,
                  }}
                >
                  <Stack gap={4}>
                    <Group gap="xs">
                      <Badge
                        size="xs"
                        variant="filled"
                        style={{
                          background: lastEvaluation.isCorrect ? '#2E8B57' : lastEvaluation.partialCredit > 0 ? '#C8A951' : '#C0392B',
                          color: '#F5F0E1',
                        }}
                      >
                        {lastEvaluation.isCorrect ? '✓ 正确' : lastEvaluation.partialCredit > 0 ? `≈ 部分正确 (${Math.round(lastEvaluation.partialCredit * 100)}%)` : '✗ 不正确'}
                      </Badge>
                      {lastEvaluation.matchedFaultId && (
                        <Badge size="xs" variant="outline" color="#C8A951">
                          匹配故障
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" style={{ color: '#F5F0E1', whiteSpace: 'pre-wrap' }}>
                      {lastEvaluation.explanation}
                    </Text>
                    {lastEvaluation.evidence.length > 0 && (
                      <>
                        <Text size="xs" fw={600} style={{ color: '#C8A951' }}>证据线索：</Text>
                        {lastEvaluation.evidence.map((ev, i) => (
                          <Text key={i} size="xs" style={{ color: '#8B8682', paddingLeft: 8 }}>
                            • {ev}
                          </Text>
                        ))}
                      </>
                    )}
                  </Stack>
                </Paper>
              )}

              <Divider color="#4A3728" />

              <Text size="xs" fw={600} style={{ color: '#C8A951' }}>已提交诊断</Text>
              <ScrollArea style={{ maxHeight: 120 }} type="hover">
                <Stack gap={4}>
                  {session.evaluations.length === 0 && (
                    <Text size="xs" style={{ color: '#8B8682', textAlign: 'center' }}>
                      尚未提交任何诊断
                    </Text>
                  )}
                  {session.evaluations.map((ev, idx) => (
                    <Paper
                      key={idx}
                      p="xs"
                      radius="sm"
                      style={{
                        background: 'rgba(74,55,40,0.3)',
                        borderLeft: `3px solid ${ev.isCorrect ? '#2E8B57' : ev.partialCredit > 0 ? '#C8A951' : '#C0392B'}`,
                        cursor: 'pointer',
                      }}
                      onClick={() => setShowEvaluationDetail(ev)}
                    >
                      <Group gap="xs" wrap="nowrap">
                        <Badge
                          size="xs"
                          variant="filled"
                          style={{ background: ev.isCorrect ? '#2E8B57' : ev.partialCredit > 0 ? '#C8A951' : '#C0392B', color: '#F5F0E1' }}
                        >
                          #{idx + 1}
                        </Badge>
                        <Text size="xs" style={{ color: '#F5F0E1' }}>
                          {FAULT_TYPE_LABELS[ev.userAnswer.faultType]} 列{ev.userAnswer.columnIndex} 步{ev.userAnswer.stepNumber}
                        </Text>
                        <Badge size="xs" variant="outline" color={ev.isCorrect ? '#2E8B57' : '#C0392B'}>
                          {ev.isCorrect ? '✓' : ev.partialCredit > 0 ? `${Math.round(ev.partialCredit * 100)}%` : '✗'}
                        </Badge>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              </ScrollArea>
            </Stack>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="result" style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Paper
            shadow="sm"
            radius="md"
            p="sm"
            style={{
              flex: 1,
              minHeight: 0,
              background: 'linear-gradient(135deg, #2A2540 0%, #1E1E35 100%)',
              border: '1px solid #4A3728',
            }}
          >
            <ScrollArea style={{ height: '100%' }} type="hover">
              <Stack gap="sm">
                {!isEvaluated && !isCompleted ? (
                  <>
                    <Text size="xs" fw={700} style={{ color: '#C8A951' }}>训练进度</Text>
                    <Group justify="space-between">
                      <Text size="xs" style={{ color: '#8B8682' }}>得分</Text>
                      <Text size="xs" fw={700} style={{ color: '#2E8B57' }}>
                        {session.score} / {session.maxScore}
                      </Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="xs" style={{ color: '#8B8682' }}>正确诊断</Text>
                      <Text size="xs" style={{ color: '#2E8B57' }}>
                        {session.evaluations.filter(e => e.isCorrect).length} / {scenario.faults.length}
                      </Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="xs" style={{ color: '#8B8682' }}>部分正确</Text>
                      <Text size="xs" style={{ color: '#C8A951' }}>
                        {session.evaluations.filter(e => !e.isCorrect && e.partialCredit > 0).length}
                      </Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="xs" style={{ color: '#8B8682' }}>用时</Text>
                      <Text size="xs" style={{ color: '#F5F0E1' }}>
                        {Math.floor(session.elapsedSeconds / 60)}:{(session.elapsedSeconds % 60).toString().padStart(2, '0')}
                      </Text>
                    </Group>
                    <Progress
                      value={scenario.faults.length > 0 ? (session.evaluations.filter(e => e.isCorrect).length / scenario.faults.length) * 100 : 0}
                      size="sm"
                      color="#2E8B57"
                      styles={{ root: { background: '#1A1A2E' } }}
                    />
                  </>
                ) : (
                  <>
                    <Text size="sm" fw={700} style={{ color: '#C8A951', fontFamily: 'Playfair Display, serif' }}>
                      训练结果
                    </Text>

                    <Paper
                      p="md"
                      radius="md"
                      style={{
                        background: 'linear-gradient(135deg, rgba(46,139,87,0.1), rgba(200,169,81,0.1))',
                        border: '1px solid #C8A951',
                        textAlign: 'center',
                      }}
                    >
                      <Text size="xl" fw={900} style={{ color: '#2E8B57', fontFamily: 'Playfair Display, serif' }}>
                        {session.score}
                      </Text>
                      <Text size="xs" style={{ color: '#8B8682' }}>
                        / {session.maxScore} 分
                      </Text>
                    </Paper>

                    <Divider color="#4A3728" />

                    <Stack gap={4}>
                      <Group justify="space-between">
                        <Text size="xs" style={{ color: '#8B8682' }}>难度</Text>
                        <Badge size="xs" variant="filled" style={{ background: difficultyColorMap[scenario.difficulty] }}>
                          {FAULT_DIFFICULTY_LABELS[scenario.difficulty]}
                        </Badge>
                      </Group>
                      <Group justify="space-between">
                        <Text size="xs" style={{ color: '#8B8682' }}>正确诊断</Text>
                        <Text size="xs" style={{ color: '#2E8B57' }}>
                          {session.evaluations.filter(e => e.isCorrect).length} / {scenario.faults.length}
                        </Text>
                      </Group>
                      <Group justify="space-between">
                        <Text size="xs" style={{ color: '#8B8682' }}>部分正确</Text>
                        <Text size="xs" style={{ color: '#C8A951' }}>
                          {session.evaluations.filter(e => !e.isCorrect && e.partialCredit > 0).length}
                        </Text>
                      </Group>
                      <Group justify="space-between">
                        <Text size="xs" style={{ color: '#8B8682' }}>总用时</Text>
                        <Text size="xs" style={{ color: '#F5F0E1' }}>
                          {Math.floor(session.elapsedSeconds / 60)}:{(session.elapsedSeconds % 60).toString().padStart(2, '0')}
                        </Text>
                      </Group>
                      <Group justify="space-between">
                        <Text size="xs" style={{ color: '#8B8682' }}>提示使用</Text>
                        <Text size="xs" style={{ color: '#C8A951' }}>
                          {session.revealedHints} 次
                        </Text>
                      </Group>
                      <Group justify="space-between">
                        <Text size="xs" style={{ color: '#8B8682' }}>诊断提交</Text>
                        <Text size="xs" style={{ color: '#F5F0E1' }}>
                          {session.submissions.length} 次
                        </Text>
                      </Group>
                    </Stack>

                    <Divider color="#4A3728" />

                    <Text size="xs" fw={700} style={{ color: '#C8A951' }}>标准答案</Text>
                    {scenario.faults.map((fault, idx) => {
                      const evaluation = session.evaluations.find(e => e.matchedFaultId === fault.id);
                      return (
                        <Paper
                          key={fault.id}
                          p="xs"
                          radius="sm"
                          style={{
                            background: evaluation?.isCorrect ? 'rgba(46,139,87,0.1)' : 'rgba(192,57,43,0.1)',
                            borderLeft: `3px solid ${evaluation?.isCorrect ? '#2E8B57' : '#C0392B'}`,
                          }}
                        >
                          <Stack gap={2}>
                            <Group gap="xs">
                              <Badge size="xs" variant="filled" style={{ background: evaluation?.isCorrect ? '#2E8B57' : '#C0392B', color: '#F5F0E1' }}>
                                {evaluation?.isCorrect ? '✓' : '✗'}
                              </Badge>
                              <Text size="xs" fw={600} style={{ color: '#F5F0E1' }}>
                                故障{idx + 1}: {FAULT_TYPE_LABELS[fault.type]}
                              </Text>
                            </Group>
                            <Text size="xs" style={{ color: '#8B8682' }}>
                              位置: 第{fault.columnIndex}列{fault.wheelIndex !== undefined ? ` 第${fault.wheelIndex}位` : ''} | 步骤: {fault.triggerStep}
                            </Text>
                            <Text size="xs" style={{ color: '#F5F0E1' }}>
                              {fault.causeDescription}
                            </Text>
                            <Text size="xs" style={{ color: '#C8A951', fontStyle: 'italic' }}>
                              表现: {fault.symptomDescription}
                            </Text>
                          </Stack>
                        </Paper>
                      );
                    })}

                    <Divider color="#4A3728" />

                    <Group gap="xs">
                      <Button size="xs" onClick={handleResetTraining} styles={brassButtonStyles} style={{ flex: 1 }}>
                        新训练
                      </Button>
                    </Group>
                  </>
                )}
              </Stack>
            </ScrollArea>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="replay" style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Paper
            shadow="sm"
            radius="md"
            p="sm"
            style={{
              flex: 1,
              minHeight: 0,
              background: 'linear-gradient(135deg, #2A2540 0%, #1E1E35 100%)',
              border: '1px solid #4A3728',
            }}
          >
            <Stack gap="xs" style={{ height: '100%' }}>
              <Text size="xs" fw={700} style={{ color: '#C8A951' }}>
                🎞 训练回放
              </Text>

              {!isEvaluated && !isCompleted ? (
                <Text size="xs" style={{ color: '#8B8682', textAlign: 'center', padding: 16 }}>
                  请先完成训练后查看回放
                </Text>
              ) : (
                <>
                  <Group justify="space-between">
                    <Badge size="xs" variant="filled" style={{ background: isReplaying ? '#C8A951' : '#4A3728', color: '#F5F0E1' }}>
                      {isReplaying ? '回放中' : '已暂停'}
                    </Badge>
                    <Text size="xs" style={{ color: '#8B8682' }}>
                      步骤 {replayIndex + 1} / {totalReplaySteps}
                    </Text>
                  </Group>

                  <Slider
                    size="sm"
                    value={totalReplaySteps > 0 ? replayIndex + 1 : 0}
                    min={1}
                    max={Math.max(1, totalReplaySteps)}
                    step={1}
                    onChange={(v) => replayGotoStep(Number(v) - 1)}
                    styles={{
                      track: { background: '#4A3728' },
                      bar: { background: '#C8A951' },
                      thumb: { background: '#C8A951', borderColor: '#C8A951' },
                    }}
                  />

                  <Group justify="center" gap="xs">
                    <ActionIcon
                      size="md"
                      variant="filled"
                      onClick={replayPrevStep}
                      disabled={replayIndex <= 0}
                      styles={brassActionStyles}
                    >
                      ◀
                    </ActionIcon>
                    <ActionIcon
                      size="md"
                      variant="filled"
                      onClick={isReplaying ? pauseReplay : (replayIndex >= 0 ? resumeReplay : startReplay)}
                      styles={isReplaying ? redActionStyles : greenActionStyles}
                    >
                      {isReplaying ? '⏸' : '▶'}
                    </ActionIcon>
                    <ActionIcon
                      size="md"
                      variant="filled"
                      onClick={replayNextStep}
                      disabled={replayIndex >= totalReplaySteps - 1}
                      styles={brassActionStyles}
                    >
                      ▶
                    </ActionIcon>
                    <ActionIcon
                      size="md"
                      variant="filled"
                      onClick={stopReplay}
                      styles={redActionStyles}
                    >
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

                  <Divider color="#4A3728" />

                  <Text size="xs" fw={600} style={{ color: '#C8A951' }}>用户操作记录</Text>
                  <ScrollArea style={{ flex: 1, minHeight: 0 }} type="hover">
                    <Stack gap={4}>
                      {session.userActions.length === 0 ? (
                        <Text size="xs" style={{ color: '#8B8682', textAlign: 'center' }}>
                          暂无操作记录
                        </Text>
                      ) : (
                        session.userActions.map((action, idx) => (
                          <Paper
                            key={idx}
                            p="xs"
                            radius="sm"
                            style={{
                              background: 'rgba(74,55,40,0.3)',
                              borderLeft: '2px solid #4A3728',
                            }}
                          >
                            <Group gap="xs" wrap="nowrap">
                              <Badge size="xs" variant="outline" color="#8B8682">
                                {action.actionType === 'step_forward' ? '▶' :
                                 action.actionType === 'step_back' ? '◀' :
                                 action.actionType === 'submit_diagnosis' ? '🔍' :
                                 action.actionType === 'request_hint' ? '💡' :
                                 action.actionType === 'pause_timer' ? '⏸' :
                                 action.actionType === 'resume_timer' ? '⏵' : '•'}
                              </Badge>
                              <Text size="xs" style={{ color: '#F5F0E1' }}>
                                {action.actionType === 'step_forward' ? '前进一步' :
                                 action.actionType === 'step_back' ? '回退一步' :
                                 action.actionType === 'submit_diagnosis' ? '提交诊断' :
                                 action.actionType === 'request_hint' ? '请求提示' :
                                 action.actionType === 'pause_timer' ? '暂停计时' :
                                 action.actionType === 'resume_timer' ? '继续计时' : action.actionType}
                                {action.data?.stepNumber !== undefined && ` (步骤 ${action.data.stepNumber})`}
                              </Text>
                              <Text size="xs" style={{ color: '#8B8682', marginLeft: 'auto', fontSize: 9 }}>
                                {new Date(action.timestamp).toLocaleTimeString()}
                              </Text>
                            </Group>
                          </Paper>
                        ))
                      )}
                    </Stack>
                  </ScrollArea>
                </>
              )}
            </Stack>
          </Paper>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function TrainingSetup({
  difficulty,
  setDifficulty,
  onStart,
  history,
  onClearHistory,
}: {
  difficulty: FaultDifficulty;
  setDifficulty: (d: FaultDifficulty) => void;
  onStart: () => void;
  history: import('@/types').FaultTrainingHistory;
  onClearHistory: () => void;
}) {
  const difficultyOptions = [
    { value: 'beginner', label: '初级 - 单一明显故障' },
    { value: 'intermediate', label: '中级 - 可能多个故障' },
    { value: 'advanced', label: '高级 - 隐蔽故障' },
    { value: 'expert', label: '专家 - 复杂故障组合' },
  ];

  const difficultyColorMap: Record<string, string> = {
    beginner: '#2E8B57',
    intermediate: '#C8A951',
    advanced: '#B87333',
    expert: '#C0392B',
  };

  return (
    <Stack gap="sm" style={{ height: '100%' }}>
      <Paper
        shadow="md"
        radius="md"
        p="md"
        style={{
          background: 'linear-gradient(135deg, #2A2540 0%, #1E1E35 100%)',
          border: '1px solid #4A3728',
        }}
      >
        <Stack gap="md">
          <Text size="lg" fw={700} style={{ color: '#C8A951', fontFamily: 'Playfair Display, serif' }}>
            🔧 故障排查训练模式
          </Text>

          <Text size="xs" style={{ color: '#8B8682', lineHeight: 1.6 }}>
            系统将自动生成包含卡轮、错位进位、齿轮不同步、回退失效等机械故障的演示场景。
            您需要结合动画、运算记录、差分表和批注信息，判断故障发生的步骤、部件与原因，并提交诊断结果。
          </Text>

          <Divider color="#4A3728" />

          <Select
            label="训练难度"
            data={difficultyOptions}
            value={difficulty}
            onChange={(v) => v && setDifficulty(v as FaultDifficulty)}
            styles={{
              label: { color: '#C8A951', fontFamily: 'Source Sans 3, sans-serif' },
              input: {
                background: '#1A1A2E',
                color: '#F5F0E1',
                borderColor: '#4A3728',
              },
            }}
          />

          <Paper
            p="sm"
            radius="sm"
            style={{
              background: 'rgba(74,55,40,0.3)',
              border: '1px solid #4A3728',
            }}
          >
            <Stack gap={4}>
              <Group gap="xs">
                <Badge size="xs" variant="filled" style={{ background: difficultyColorMap[difficulty] }}>
                  {FAULT_DIFFICULTY_LABELS[difficulty]}
                </Badge>
                <Text size="xs" fw={600} style={{ color: '#F5F0E1' }}>难度说明</Text>
              </Group>
              {difficulty === 'beginner' && (
                <Text size="xs" style={{ color: '#8B8682' }}>单一明显故障（卡轮或错位进位），5分钟时限，满分100</Text>
              )}
              {difficulty === 'intermediate' && (
                <Text size="xs" style={{ color: '#8B8682' }}>1-2个故障（含齿轮不同步），4分钟时限，满分200</Text>
              )}
              {difficulty === 'advanced' && (
                <Text size="xs" style={{ color: '#8B8682' }}>2-3个隐蔽故障（含回退失效），3分钟时限，满分350</Text>
              )}
              {difficulty === 'expert' && (
                <Text size="xs" style={{ color: '#8B8682' }}>2-4个复杂故障组合，2分钟时限，满分500</Text>
              )}
            </Stack>
          </Paper>

          <Button fullWidth onClick={onStart} styles={brassButtonStyles}>
            开始训练
          </Button>
        </Stack>
      </Paper>

      <Paper
        shadow="sm"
        radius="md"
        p="sm"
        style={{
          flex: 1,
          minHeight: 0,
          background: 'linear-gradient(135deg, #2A2540 0%, #1E1E35 100%)',
          border: '1px solid #4A3728',
        }}
      >
        <Stack gap="xs" style={{ height: '100%' }}>
          <Group justify="space-between">
            <Text size="xs" fw={700} style={{ color: '#C8A951' }}>
              📊 历史成绩
            </Text>
            {history.records.length > 0 && (
              <ActionIcon size="xs" variant="subtle" onClick={onClearHistory} style={{ color: '#8B8682' }}>
                🗑
              </ActionIcon>
            )}
          </Group>

          {history.records.length === 0 ? (
            <Text size="xs" style={{ color: '#8B8682', textAlign: 'center', padding: 16 }}>
              暂无训练记录
            </Text>
          ) : (
            <>
              <Group gap="md" style={{ flexWrap: 'wrap' }}>
                <Stack gap={0} align="center">
                  <Text size="xs" style={{ color: '#8B8682' }}>总场次</Text>
                  <Text size="sm" fw={700} style={{ color: '#C8A951' }}>{history.totalSessions}</Text>
                </Stack>
                <Stack gap={0} align="center">
                  <Text size="xs" style={{ color: '#8B8682' }}>平均正确率</Text>
                  <Text size="sm" fw={700} style={{ color: '#2E8B57' }}>{Math.round(history.averageAccuracy * 100)}%</Text>
                </Stack>
                <Stack gap={0} align="center">
                  <Text size="xs" style={{ color: '#8B8682' }}>最高分</Text>
                  <Text size="sm" fw={700} style={{ color: '#C8A951' }}>{history.bestScore}</Text>
                </Stack>
              </Group>

              <Divider color="#4A3728" />

              <ScrollArea style={{ flex: 1, minHeight: 0 }} type="hover">
                <Table
                  styles={{
                    table: { color: '#F5F0E1', minWidth: 'auto' },
                    th: { color: '#C8A951', borderBottomColor: '#4A3728', fontSize: 10, padding: '4px 6px' },
                    td: { borderBottomColor: '#333350', fontSize: 10, padding: '4px 6px' },
                  }}
                >
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>难度</Table.Th>
                      <Table.Th>得分</Table.Th>
                      <Table.Th>正确率</Table.Th>
                      <Table.Th>用时</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {history.records.slice(0, 20).map((r) => (
                      <Table.Tr key={r.id}>
                        <Table.Td>
                          <Badge size="xs" variant="filled" style={{ background: difficultyColorMap[r.difficulty] }}>
                            {FAULT_DIFFICULTY_LABELS[r.difficulty]}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" fw={600} style={{ color: '#2E8B57' }}>{r.score}/{r.maxScore}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" style={{ color: Math.round(r.accuracy * 100) >= 70 ? '#2E8B57' : '#C0392B' }}>
                            {Math.round(r.accuracy * 100)}%
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" style={{ color: '#8B8682' }}>
                            {Math.floor(r.elapsedSeconds / 60)}:{(r.elapsedSeconds % 60).toString().padStart(2, '0')}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}

function toSup(n: number): string {
  const superscripts: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  };
  return String(n).split('').map((c) => superscripts[c] ?? c).join('');
}

const inputStyles = {
  label: { color: '#8B8682', fontSize: 10 },
  input: { background: '#1A1A2E', color: '#F5F0E1', borderColor: '#4A3728', fontSize: 12 },
};

const brassButtonStyles = {
  root: {
    background: 'linear-gradient(135deg, #C8A951, #A08930)',
    color: '#1A1A2E',
    fontWeight: 'bold',
    border: 'none',
  },
};

const greenButtonStyles = {
  root: {
    background: 'linear-gradient(135deg, #2E8B57, #1E6B3F)',
    color: '#F5F0E1',
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

const copperActionStyles = {
  root: {
    background: 'linear-gradient(135deg, #B87333, #8B5A2B)',
    color: '#F5F0E1',
    border: 'none',
  },
};

const hintActionStyles = {
  root: {
    background: 'linear-gradient(135deg, #C8A951, #8B6914)',
    color: '#1A1A2E',
    border: 'none',
  },
};
