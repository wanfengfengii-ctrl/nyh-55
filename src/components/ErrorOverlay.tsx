import { Paper, Text, Stack, Button, Group, Badge } from '@mantine/core';
import { useEngineStore } from '@/store/engineStore';

export default function ErrorOverlay() {
  const engineState = useEngineStore((s) => s.engineState);
  const stepBack = useEngineStore((s) => s.stepBack);
  const reset = useEngineStore((s) => s.reset);
  const isAnimating = useEngineStore((s) => s.isAnimating);

  if (!engineState || engineState.phase !== 'error' || !engineState.error) return null;

  const errorTypeLabel: Record<string, string> = {
    overflow: '数值溢出',
    negative: '负数值',
    invalid_state: '非法状态',
    carry_overflow: '进位溢出',
  };

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="lg"
      style={{
        background: 'linear-gradient(135deg, rgba(192,57,43,0.15), rgba(26,26,46,0.95))',
        border: '2px solid #C0392B',
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 100,
        minWidth: 320,
        animation: 'pulse-border 2s infinite',
      }}
    >
      <Stack gap="sm">
        <Group gap="xs">
          <Text size="lg" fw={700} style={{ color: '#C0392B', fontFamily: 'Playfair Display, serif' }}>
            ⚠ 运算错误
          </Text>
          <Badge size="sm" variant="filled" color="#C0392B">
            {errorTypeLabel[engineState.error.type] || engineState.error.type}
          </Badge>
        </Group>

        <Text size="sm" style={{ color: '#F5F0E1' }}>
          {engineState.error.message}
        </Text>

        <Group gap="xs" style={{ color: '#8B8682' }}>
          <Text size="xs">差分列: {engineState.error.column}</Text>
          <Text size="xs">|</Text>
          <Text size="xs">数字轮: {engineState.error.wheel}</Text>
        </Group>

        <Text size="xs" style={{ color: '#8B8682', marginTop: 4 }}>
          出现非法状态，无法继续演算。请回退或重置。
        </Text>

        <Group gap="xs" mt="sm">
          <Button
            size="xs"
            onClick={stepBack}
            disabled={isAnimating}
            styles={{
              root: {
                background: 'linear-gradient(135deg, #C8A951, #A08930)',
                color: '#1A1A2E',
                fontWeight: 'bold',
              },
            }}
          >
            回退一步
          </Button>
          <Button
            size="xs"
            onClick={reset}
            styles={{
              root: {
                background: 'linear-gradient(135deg, #8B3A3A, #6B2020)',
                color: '#F5F0E1',
              },
            }}
          >
            重置差分机
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
