import { useEffect, useRef } from 'react';
import {
  Paper,
  Text,
  Group,
  Stack,
  Button,
  ActionIcon,
  ScrollArea,
  Badge,
  Divider,
  Alert,
  Tooltip,
  Menu,
} from '@mantine/core';
import CardEditor from '@/components/CardEditor';
import { useCardProgramStore } from '@/store/cardProgramStore';
import { useEngineStore } from '@/store/engineStore';
import type {
  ProgramCard,
  CardType,
} from '@/types';
import {
  DEFAULT_INITIAL_CARD,
  DEFAULT_STEP_CARD,
  DEFAULT_STOP_CARD,
  DEFAULT_ERROR_CARD,
} from '@/types';

const cardTypeDefaults: Record<CardType, ProgramCard> = {
  initial: DEFAULT_INITIAL_CARD,
  step: DEFAULT_STEP_CARD,
  stop: DEFAULT_STOP_CARD,
  error_handler: DEFAULT_ERROR_CARD,
};

const generateId = () => `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export default function CardProgramPanel() {
  const {
    cards,
    currentCardIndex,
    executionRecords,
    isProgramRunning,
    isProgramPaused,
    programError,
    executionHistory,
    addCard,
    removeCard,
    updateCard,
    reorderCards,
    validateAllCards,
    pauseProgram,
    resumeProgram,
    stopProgram,
    executeSingleCard,
    executeAllCards,
    stepBackCard,
    resetProgram,
    setProgramError,
    executeCardStep,
    verifyConsistency,
  } = useCardProgramStore();

  const {
    engineState,
    operationLog,
    config,
    initialize,
    stepForward,
    stepBack,
    isAnimating,
    setIsRunning,
    reset,
  } = useEngineStore();

  const executionIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isProgramRunning || isProgramPaused || programError || isAnimating) {
      if (executionIntervalRef.current) {
        clearInterval(executionIntervalRef.current);
        executionIntervalRef.current = null;
      }
      return;
    }

    executionIntervalRef.current = window.setInterval(() => {
      const result = executeCardStep(
        () => useEngineStore.getState().engineState,
        () => useEngineStore.getState().operationLog,
        (cfg) => initialize(cfg),
        () => stepForward(),
        () => stepBack(),
        () => useEngineStore.getState().config,
        (v) => setIsRunning(v)
      );

      if (result.shouldStop || !result.shouldContinue) {
        if (executionIntervalRef.current) {
          clearInterval(executionIntervalRef.current);
          executionIntervalRef.current = null;
        }
      }
    }, 800);

    return () => {
      if (executionIntervalRef.current) {
        clearInterval(executionIntervalRef.current);
        executionIntervalRef.current = null;
      }
    };
  }, [isProgramRunning, isProgramPaused, programError, isAnimating, executeCardStep, initialize, setIsRunning, stepBack, stepForward]);

  const handleAddCard = (type: CardType) => {
    const template = cardTypeDefaults[type];
    addCard({
      ...template,
      id: generateId(),
      config: JSON.parse(JSON.stringify(template.config)),
    });
  };

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      reorderCards(index, index - 1);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index < cards.length - 1) {
      reorderCards(index, index + 1);
    }
  };

  const handleExecuteSingle = () => {
    if (isAnimating) return;
    
    if (currentCardIndex === -1) {
      const allValid = validateAllCards();
      if (!allValid) {
        setProgramError('存在非法配置的卡片，请检查后重试');
        return;
      }
      executeSingleCard();
    }

    setTimeout(() => {
      executeCardStep(
        () => useEngineStore.getState().engineState,
        () => useEngineStore.getState().operationLog,
        (cfg) => initialize(cfg),
        () => stepForward(),
        () => stepBack(),
        () => useEngineStore.getState().config,
        (v) => setIsRunning(v)
      );
    }, 100);
  };

  const handleExecuteAll = () => {
    if (isAnimating) return;
    executeAllCards();
  };

  const handleStepBack = () => {
    if (isAnimating || isProgramRunning) return;
    const history = stepBackCard();
    if (history) {
      useEngineStore.setState({
        engineState: history.engineState,
        operationLog: history.operationLog,
      });
    }
  };

  const handleReset = () => {
    if (executionIntervalRef.current) {
      clearInterval(executionIntervalRef.current);
      executionIntervalRef.current = null;
    }
    resetProgram();
    reset();
  };

  const handleVerifyConsistency = () => {
    if (!engineState) return;
    const result = verifyConsistency(engineState, operationLog, config);
    alert(result.message);
  };

  const isEditingDisabled = isProgramRunning || currentCardIndex !== -1;

  return (
    <Stack gap="sm" style={{ height: '100%' }}>
      <Paper
        shadow="sm"
        radius="md"
        p="sm"
        style={{
          background: 'linear-gradient(135deg, #2A2540 0%, #1E1E35 100%)',
          border: '1px solid #4A3728',
        }}
      >
        <Stack gap="sm">
          <Group justify="space-between">
            <Text size="lg" fw={700} style={{ color: '#C8A951', fontFamily: 'Playfair Display, serif' }}>
              🃏 编程卡片驱动
            </Text>
            <Group gap="xs">
              {isProgramRunning && (
                <Badge color="#2E8B57" variant="filled" size="sm">
                  {isProgramPaused ? '⏸ 已暂停' : '▶ 运行中'}
                </Badge>
              )}
              {currentCardIndex !== -1 && !isProgramRunning && (
                <Badge color="#C8A951" variant="outline" size="sm">
                  第 {currentCardIndex + 1} / {cards.length} 张
                </Badge>
              )}
            </Group>
          </Group>

          {programError && (
            <Alert
              color="red"
              variant="filled"
              p="xs"
              styles={{
                root: { background: 'rgba(192,57,43,0.2)' },
                body: { color: '#C0392B' },
                message: { color: '#C0392B', fontSize: 12 },
              }}
            >
              ⚠ {programError}
            </Alert>
          )}

          <Divider color="#4A3728" />

          <Group gap="xs" wrap="nowrap">
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <Button
                  size="xs"
                  disabled={isEditingDisabled}
                  styles={brassButtonStyles}
                  leftSection="+"
                >
                  添加卡片
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => handleAddCard('initial')}>📋 初始数列卡片</Menu.Item>
                <Menu.Item onClick={() => handleAddCard('step')}>⚙️ 步进规则卡片</Menu.Item>
                <Menu.Item onClick={() => handleAddCard('stop')}>🛑 停止条件卡片</Menu.Item>
                <Menu.Item onClick={() => handleAddCard('error_handler')}>⚠️ 异常处理卡片</Menu.Item>
              </Menu.Dropdown>
            </Menu>

            <Tooltip label="验证所有卡片">
              <Button
                size="xs"
                onClick={validateAllCards}
                disabled={isEditingDisabled}
                styles={copperButtonStyles}
              >
                ✓ 验证
              </Button>
            </Tooltip>

            <Tooltip label="单卡执行">
              <ActionIcon
                size="lg"
                variant="filled"
                onClick={handleExecuteSingle}
                disabled={isAnimating || isProgramRunning || cards.length === 0}
                styles={greenActionStyles}
              >
                ▶
              </ActionIcon>
            </Tooltip>

            <Tooltip label={isProgramRunning ? '暂停' : '整组执行'}>
              <ActionIcon
                size="lg"
                variant="filled"
                onClick={isProgramRunning ? pauseProgram : handleExecuteAll}
                disabled={isAnimating || cards.length === 0 || (currentCardIndex === -1 && isProgramPaused)}
                styles={isProgramRunning ? redActionStyles : copperButtonStyles}
              >
                {isProgramRunning ? '⏸' : '⏩'}
              </ActionIcon>
            </Tooltip>

            {isProgramPaused && (
              <Tooltip label="继续执行">
                <ActionIcon
                  size="lg"
                  variant="filled"
                  onClick={resumeProgram}
                  disabled={isAnimating}
                  styles={greenActionStyles}
                >
                  ▶▶
                </ActionIcon>
              </Tooltip>
            )}

            <Tooltip label="回退卡片">
              <ActionIcon
                size="lg"
                variant="filled"
                onClick={handleStepBack}
                disabled={isAnimating || isProgramRunning || executionHistory.length === 0}
                styles={brassActionStyles}
              >
                ◀
              </ActionIcon>
            </Tooltip>

            <Tooltip label="停止">
              <ActionIcon
                size="lg"
                variant="filled"
                onClick={stopProgram}
                disabled={!isProgramRunning && currentCardIndex === -1}
                styles={redActionStyles}
              >
                ⏹
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

            <Tooltip label="验证一致性">
              <ActionIcon
                size="lg"
                variant="filled"
                onClick={handleVerifyConsistency}
                disabled={!engineState}
                styles={greenActionStyles}
              >
                ✓
              </ActionIcon>
            </Tooltip>
          </Group>
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
        <Stack gap="sm" style={{ height: '100%' }}>
          <Group justify="space-between">
            <Text size="sm" fw={700} style={{ color: '#C8A951', fontFamily: 'Playfair Display, serif' }}>
              卡片列表
            </Text>
            <Badge size="xs" variant="outline" color="#8B8682">
              共 {cards.length} 张
            </Badge>
          </Group>
          <ScrollArea style={{ flex: 1, minHeight: 0 }} type="hover">
            <Stack gap="sm" p="xs">
              {cards.length === 0 ? (
                <Text size="sm" style={{ color: '#8B8682', textAlign: 'center', padding: 20 }}>
                  点击"添加卡片"开始创建程序
                </Text>
              ) : (
                cards.map((card, index) => (
                  <CardEditor
                    key={card.id}
                    card={card}
                    index={index}
                    isActive={index === currentCardIndex}
                    onUpdate={updateCard}
                    onRemove={removeCard}
                    onMoveUp={handleMoveUp}
                    onMoveDown={handleMoveDown}
                    disabled={isEditingDisabled}
                  />
                ))
              )}
            </Stack>
          </ScrollArea>
        </Stack>
      </Paper>

      {executionRecords.length > 0 && (
        <Paper
          shadow="sm"
          radius="md"
          p="sm"
          style={{
            maxHeight: 200,
            background: 'linear-gradient(135deg, #2A2540 0%, #1E1E35 100%)',
            border: '1px solid #4A3728',
          }}
        >
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" fw={700} style={{ color: '#C8A951', fontFamily: 'Playfair Display, serif' }}>
                卡片执行记录
              </Text>
              <Badge size="xs" variant="outline" color="#8B8682">
                {executionRecords.length} 条记录
              </Badge>
            </Group>
            <ScrollArea style={{ maxHeight: 140 }} type="hover">
              <Stack gap="xs">
                {executionRecords.map((record, index) => (
                  <Paper
                    key={index}
                    p="xs"
                    radius="sm"
                    style={{
                      background: record.success
                        ? 'rgba(46,139,87,0.1)'
                        : 'rgba(192,57,43,0.1)',
                      borderLeft: `3px solid ${record.success ? '#2E8B57' : '#C0392B'}`,
                    }}
                  >
                    <Group justify="space-between">
                      <Group gap="xs">
                        <Badge
                          size="xs"
                          variant="filled"
                          style={{
                            background: record.success ? '#2E8B57' : '#C0392B',
                          }}
                        >
                          #{index + 1}
                        </Badge>
                        <Text size="xs" fw={700} style={{ color: '#F5F0E1' }}>
                          {record.cardLabel}
                        </Text>
                      </Group>
                      <Text size="xs" style={{ color: '#8B8682' }}>
                        {((record.endTime - record.startTime) / 1000).toFixed(2)}s
                      </Text>
                    </Group>
                    <Text size="xs" style={{ color: record.success ? '#2E8B57' : '#C0392B', marginTop: 4 }}>
                      {record.description}
                    </Text>
                    {record.error && (
                      <Text size="xs" style={{ color: '#C0392B', marginTop: 2 }}>
                        错误: {record.error}
                      </Text>
                    )}
                  </Paper>
                ))}
              </Stack>
            </ScrollArea>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

const brassButtonStyles = {
  root: {
    background: 'linear-gradient(135deg, #C8A951, #A08930)',
    color: '#1A1A2E',
    fontWeight: 'bold',
    border: 'none',
  },
};

const copperButtonStyles = {
  root: {
    background: 'linear-gradient(135deg, #B87333, #8B5A2B)',
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
