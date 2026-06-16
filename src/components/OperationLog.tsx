import { Paper, ScrollArea, Text, Stack, Group, Badge } from '@mantine/core';
import { useEngineStore } from '@/store/engineStore';

export default function OperationLog() {
  const operationLog = useEngineStore((s) => s.operationLog);
  const engineState = useEngineStore((s) => s.engineState);

  return (
    <Paper
      shadow="sm"
      radius="md"
      p="md"
      style={{
        background: 'linear-gradient(135deg, #2A2540 0%, #1E1E35 100%)',
        border: '1px solid #4A3728',
        height: '100%',
      }}
    >
      <Text size="sm" fw={700} style={{ color: '#C8A951', fontFamily: 'Playfair Display, serif', marginBottom: 8 }}>
        运算记录
      </Text>

      {engineState && (
        <Group gap="xs" mb="xs">
          <Text size="xs" style={{ color: '#8B8682' }}>总步骤:</Text>
          <Text size="xs" style={{ color: '#C8A951' }}>{operationLog.length}</Text>
          <Text size="xs" style={{ color: '#8B8682' }}>|</Text>
          <Text size="xs" style={{ color: '#8B8682' }}>结果:</Text>
          <Text size="xs" fw={700} style={{ color: '#2E8B57' }}>{engineState.columns[0]?.value ?? '-'}</Text>
        </Group>
      )}

      <ScrollArea style={{ height: 280 }} offsetScrollbars>
        <Stack gap={4}>
          {operationLog.length === 0 && (
            <Text size="xs" style={{ color: '#8B8682', textAlign: 'center', padding: 20 }}>
              尚无运算记录，请初始化并执行步骤
            </Text>
          )}
          {operationLog.map((step, idx) => (
            <Paper
              key={idx}
              p="xs"
              radius="sm"
              style={{
                background: step.errorOccurred
                  ? 'rgba(192,57,43,0.1)'
                  : idx === operationLog.length - 1
                    ? 'rgba(200,169,81,0.08)'
                    : 'transparent',
                borderLeft: step.errorOccurred
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
                  color={step.phase === 'add' ? '#C8A951' : '#2E8B57'}
                >
                  #{step.stepNumber}
                </Badge>

                <Stack gap={0} style={{ flex: 1 }}>
                  <Text size="xs" style={{ color: '#F5F0E1' }} lineClamp={1}>
                    {step.description}
                  </Text>
                  <Group gap={4} mt={2}>
                    <Text size="xs" style={{ color: '#8B8682' }}>
                      转次 {step.crankTurn}
                    </Text>
                    {step.carryTriggered && (
                      <Badge size="xs" variant="outline" color="#C8A951">
                        进位
                      </Badge>
                    )}
                    {step.errorOccurred && (
                      <Badge size="xs" variant="filled" color="#C0392B">
                        错误
                      </Badge>
                    )}
                  </Group>
                </Stack>
              </Group>

              {idx === operationLog.length - 1 && step.newValues.length > 0 && !step.errorOccurred && (
                <Group gap={4} mt={4} style={{ flexWrap: 'wrap' }}>
                  {step.newValues.map((v, i) => (
                    <Text key={i} size="xs" style={{ color: i === 0 ? '#2E8B57' : '#8B8682' }}>
                      {i === 0 ? 'f' : `Δ${toSup(i)}`}={v}
                    </Text>
                  ))}
                </Group>
              )}
            </Paper>
          ))}
        </Stack>
      </ScrollArea>
    </Paper>
  );
}

function toSup(n: number): string {
  const superscripts: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  };
  return String(n).split('').map((c) => superscripts[c] ?? c).join('');
}
