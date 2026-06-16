import { useState, useEffect } from 'react';
import {
  Paper,
  Text,
  Select,
  NumberInput,
  TextInput,
  Group,
  Stack,
  ActionIcon,
  Badge,
  Tooltip,
  Divider,
} from '@mantine/core';
import type { ProgramCard, CardType, StepRuleType, StopConditionType, ErrorStrategyType } from '@/types';
import { validateCard } from '@/engine/cardProgramEngine';

interface CardEditorProps {
  card: ProgramCard;
  index: number;
  isActive: boolean;
  onUpdate: (cardId: string, updates: Partial<ProgramCard>) => void;
  onRemove: (cardId: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  disabled?: boolean;
}

const cardTypeLabels: Record<CardType, { label: string; color: string; icon: string }> = {
  initial: { label: '初始数列', color: '#C8A951', icon: '📋' },
  step: { label: '步进规则', color: '#2E8B57', icon: '⚙️' },
  stop: { label: '停止条件', color: '#C0392B', icon: '🛑' },
  error_handler: { label: '异常处理', color: '#8B3A62', icon: '⚠️' },
};

const stepRuleLabels: Record<StepRuleType, string> = {
  add: '加法',
  multiply: '乘法',
  set: '设置',
  custom: '自定义',
};

const stopConditionLabels: Record<StopConditionType, string> = {
  max_turns: '达到最大转数',
  value_equals: '值等于',
  value_exceeds: '值超过',
  value_below: '值低于',
  error_occurred: '发生错误',
};

const errorStrategyLabels: Record<ErrorStrategyType, string> = {
  stop_immediately: '立即停止',
  skip_and_continue: '跳过继续',
  retry_once: '重试一次',
  use_fallback: '使用回退值',
};

export default function CardEditor({
  card,
  index,
  isActive,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  disabled = false,
}: CardEditorProps) {
  const [localValues, setLocalValues] = useState({
    label: card.label,
    description: card.description,
  });

  const [validation, setValidation] = useState({ isValid: card.isValid, error: card.validationError });

  useEffect(() => {
    const result = validateCard(card);
    setValidation({ isValid: result.isValid, error: result.error });
    if (result.isValid !== card.isValid || result.error !== card.validationError) {
      onUpdate(card.id, { isValid: result.isValid, validationError: result.error });
    }
  }, [card, onUpdate]);

  const typeConfig = cardTypeLabels[card.type];

  const renderCardContent = () => {
    switch (card.type) {
      case 'initial':
        return renderInitialConfig();
      case 'step':
        return renderStepConfig();
      case 'stop':
        return renderStopConfig();
      case 'error_handler':
        return renderErrorHandlerConfig();
      default:
        return null;
    }
  };

  const renderInitialConfig = () => {
    const config = card.config.initial;
    if (!config) return null;

    return (
      <Stack gap="xs">
        <Group gap="xs">
          <NumberInput
            label="阶数"
            value={config.order}
            onChange={(v) => updateInitialConfig({ order: Number(v) || 1 })}
            min={1}
            max={6}
            disabled={disabled}
            size="xs"
            w={80}
            styles={inputStyles}
          />
          <NumberInput
            label="位数"
            value={config.numDigits}
            onChange={(v) => updateInitialConfig({ numDigits: Number(v) || 1 })}
            min={1}
            max={10}
            disabled={disabled}
            size="xs"
            w={80}
            styles={inputStyles}
          />
          <NumberInput
            label="最大转数"
            value={config.maxCrankTurns}
            onChange={(v) => updateInitialConfig({ maxCrankTurns: Number(v) || 1 })}
            min={1}
            max={100}
            disabled={disabled}
            size="xs"
            w={100}
            styles={inputStyles}
          />
        </Group>
        <TextInput
          label="初始值（逗号分隔）"
          value={config.initialValues.join(', ')}
          onChange={(e) => {
            const values = e.currentTarget.value
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s !== '')
              .map(Number)
              .filter((n) => !isNaN(n));
            updateInitialConfig({ initialValues: values });
          }}
          disabled={disabled}
          size="xs"
          placeholder={`至少 ${config.order + 1} 个值`}
          styles={inputStyles}
        />
        <Text size="xs" style={{ color: '#8B8682' }}>
          需要 {config.order + 1} 个初始值，当前 {config.initialValues.length} 个
        </Text>
      </Stack>
    );
  };

  const renderStepConfig = () => {
    const config = card.config.step;
    if (!config) return null;

    return (
      <Stack gap="xs">
        <Group gap="xs">
          <Select
            label="规则类型"
            value={config.ruleType}
            onChange={(v) => updateStepConfig({ ruleType: v as StepRuleType })}
            data={Object.entries(stepRuleLabels).map(([value, label]) => ({ value, label }))}
            disabled={disabled}
            size="xs"
            w={100}
            styles={inputStyles}
          />
          <NumberInput
            label="步进值"
            value={config.value}
            onChange={(v) => updateStepConfig({ value: Number(v) || 0 })}
            disabled={disabled}
            size="xs"
            w={100}
            styles={inputStyles}
          />
          <NumberInput
            label="重复次数"
            value={config.repeatCount}
            onChange={(v) => updateStepConfig({ repeatCount: Number(v) || 1 })}
            min={1}
            max={100}
            disabled={disabled}
            size="xs"
            w={100}
            styles={inputStyles}
          />
        </Group>
        <NumberInput
          label="目标列（可选）"
          value={config.targetColumn ?? ''}
          onChange={(v) => updateStepConfig({ targetColumn: v === '' ? undefined : Number(v) })}
          placeholder="默认全部列"
          min={0}
          max={6}
          disabled={disabled}
          size="xs"
          styles={inputStyles}
        />
      </Stack>
    );
  };

  const renderStopConfig = () => {
    const config = card.config.stop;
    if (!config) return null;

    return (
      <Stack gap="xs">
        <Select
          label="停止条件"
          value={config.conditionType}
          onChange={(v) => updateStopConfig({ conditionType: v as StopConditionType })}
          data={Object.entries(stopConditionLabels).map(([value, label]) => ({ value, label }))}
          disabled={disabled}
          size="xs"
          styles={inputStyles}
        />
        {config.conditionType === 'max_turns' && (
          <NumberInput
            label="最大转动次数"
            value={config.maxTurns ?? 10}
            onChange={(v) => updateStopConfig({ maxTurns: Number(v) || 1 })}
            min={1}
            max={100}
            disabled={disabled}
            size="xs"
            styles={inputStyles}
          />
        )}
        {['value_equals', 'value_exceeds', 'value_below'].includes(config.conditionType) && (
          <Group gap="xs">
            <NumberInput
              label="目标列"
              value={config.targetColumn ?? 0}
              onChange={(v) => updateStopConfig({ targetColumn: Number(v) || 0 })}
              min={0}
              max={6}
              disabled={disabled}
              size="xs"
              w={80}
              styles={inputStyles}
            />
            <NumberInput
              label="目标值"
              value={config.targetValue ?? 0}
              onChange={(v) => updateStopConfig({ targetValue: Number(v) || 0 })}
              disabled={disabled}
              size="xs"
              w={120}
              styles={inputStyles}
            />
          </Group>
        )}
      </Stack>
    );
  };

  const renderErrorHandlerConfig = () => {
    const config = card.config.errorHandler;
    if (!config) return null;

    return (
      <Stack gap="xs">
        <Select
          label="处理策略"
          value={config.strategy}
          onChange={(v) => updateErrorHandlerConfig({ strategy: v as ErrorStrategyType })}
          data={Object.entries(errorStrategyLabels).map(([value, label]) => ({ value, label }))}
          disabled={disabled}
          size="xs"
          styles={inputStyles}
        />
        {config.strategy === 'use_fallback' && (
          <NumberInput
            label="回退值"
            value={config.fallbackValue ?? 0}
            onChange={(v) => updateErrorHandlerConfig({ fallbackValue: Number(v) || 0 })}
            min={0}
            disabled={disabled}
            size="xs"
            styles={inputStyles}
          />
        )}
        {config.strategy === 'retry_once' && (
          <NumberInput
            label="最大重试次数"
            value={config.maxRetries ?? 1}
            onChange={(v) => updateErrorHandlerConfig({ maxRetries: Number(v) || 0 })}
            min={0}
            max={5}
            disabled={disabled}
            size="xs"
            styles={inputStyles}
          />
        )}
      </Stack>
    );
  };

  const updateInitialConfig = (updates: Partial<NonNullable<ProgramCard['config']['initial']>>) => {
    const current = card.config.initial || { order: 2, numDigits: 6, initialValues: [0, 1, 4], maxCrankTurns: 10 };
    onUpdate(card.id, {
      config: { ...card.config, initial: { ...current, ...updates } },
    });
  };

  const updateStepConfig = (updates: Partial<NonNullable<ProgramCard['config']['step']>>) => {
    const current = card.config.step || { ruleType: 'add', value: 1, repeatCount: 1 };
    onUpdate(card.id, {
      config: { ...card.config, step: { ...current, ...updates } },
    });
  };

  const updateStopConfig = (updates: Partial<NonNullable<ProgramCard['config']['stop']>>) => {
    const current = card.config.stop || { conditionType: 'max_turns', maxTurns: 10 };
    onUpdate(card.id, {
      config: { ...card.config, stop: { ...current, ...updates } },
    });
  };

  const updateErrorHandlerConfig = (updates: Partial<NonNullable<ProgramCard['config']['errorHandler']>>) => {
    const current = card.config.errorHandler || { strategy: 'stop_immediately' };
    onUpdate(card.id, {
      config: { ...card.config, errorHandler: { ...current, ...updates } },
    });
  };

  return (
    <Paper
      shadow="sm"
      radius="md"
      p="sm"
      style={{
        background: isActive
          ? 'linear-gradient(135deg, rgba(200,169,81,0.2) 0%, rgba(30,30,53,0.9) 100%)'
          : 'linear-gradient(135deg, #2A2540 0%, #1E1E35 100%)',
        border: isActive
          ? `2px solid ${typeConfig.color}`
          : validation.isValid
            ? '1px solid #4A3728'
            : '2px solid #C0392B',
        transition: 'all 0.3s ease',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Text size="lg">{typeConfig.icon}</Text>
            <Stack gap={0}>
              <Group gap="xs" wrap="nowrap">
                <Badge
                  size="sm"
                  variant="filled"
                  style={{ background: typeConfig.color, color: '#1A1A2E' }}
                >
                  #{index + 1} {typeConfig.label}
                </Badge>
                {isActive && (
                  <Badge size="sm" variant="outline" color="#C8A951">
                    ▶ 当前执行
                  </Badge>
                )}
                {!validation.isValid && (
                  <Badge size="sm" variant="outline" color="#C0392B">
                    ⚠ 配置非法
                  </Badge>
                )}
              </Group>
              <TextInput
                value={localValues.label}
                onChange={(e) => {
                  setLocalValues({ ...localValues, label: e.currentTarget.value });
                  onUpdate(card.id, { label: e.currentTarget.value });
                }}
                disabled={disabled}
                size="xs"
                variant="unstyled"
                styles={{
                  input: {
                    color: '#F5F0E1',
                    fontWeight: 'bold',
                    fontSize: 14,
                    padding: 0,
                  },
                }}
              />
            </Stack>
          </Group>
          <Group gap={4} wrap="nowrap">
            <Tooltip label="上移">
              <ActionIcon
                size="sm"
                onClick={() => onMoveUp(index)}
                disabled={disabled || index === 0}
                style={{ color: '#C8A951' }}
              >
                ↑
              </ActionIcon>
            </Tooltip>
            <Tooltip label="下移">
              <ActionIcon
                size="sm"
                onClick={() => onMoveDown(index)}
                disabled={disabled}
                style={{ color: '#C8A951' }}
              >
                ↓
              </ActionIcon>
            </Tooltip>
            <Tooltip label="删除">
              <ActionIcon
                size="sm"
                onClick={() => onRemove(card.id)}
                disabled={disabled}
                style={{ color: '#C0392B' }}
              >
                ✕
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <TextInput
          value={localValues.description}
          onChange={(e) => {
            setLocalValues({ ...localValues, description: e.currentTarget.value });
            onUpdate(card.id, { description: e.currentTarget.value });
          }}
          disabled={disabled}
          size="xs"
          variant="unstyled"
          placeholder="卡片描述..."
          styles={{
            input: {
              color: '#8B8682',
              fontSize: 12,
              padding: 0,
            },
          }}
        />

        {!validation.isValid && validation.error && (
          <Text size="xs" style={{ color: '#C0392B' }}>
            ⚠ {validation.error}
          </Text>
        )}

        <Divider color="#4A3728" style={{ margin: '4px 0' }} />

        {renderCardContent()}
      </Stack>
    </Paper>
  );
}

const inputStyles = {
  label: { color: '#C8A951', fontFamily: 'Source Sans 3, sans-serif', fontSize: 11 },
  input: {
    background: '#1A1A2E',
    color: '#F5F0E1',
    borderColor: '#4A3728',
    fontFamily: 'Source Sans 3, sans-serif',
    fontSize: 12,
  },
  description: { color: '#8B8682', fontSize: 11 },
};
