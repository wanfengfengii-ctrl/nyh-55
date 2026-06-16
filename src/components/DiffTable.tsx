import { Paper, Table, Text, Group, Badge, ScrollArea } from '@mantine/core';
import { useEngineStore } from '@/store/engineStore';
import { computeDiffTableIndependent } from '@/utils/math';

export default function DiffTable() {
  const engineState = useEngineStore((s) => s.engineState);
  const config = useEngineStore((s) => s.config);
  const operationLog = useEngineStore((s) => s.operationLog);
  const isInitialized = useEngineStore((s) => s.isInitialized);

  if (!isInitialized || !engineState) {
    return (
      <Paper
        shadow="sm"
        radius="md"
        p="md"
        style={{
          background: 'linear-gradient(135deg, #2A2540 0%, #1E1E35 100%)',
          border: '1px solid #4A3728',
        }}
      >
        <Text size="sm" fw={700} style={{ color: '#C8A951', fontFamily: 'Playfair Display, serif', marginBottom: 8 }}>
          差分表格（独立验算）
        </Text>
        <Text size="xs" style={{ color: '#8B8682', textAlign: 'center', padding: 16 }}>
          请先初始化差分机
        </Text>
      </Paper>
    );
  }

  const independentTable = computeDiffTableIndependent(
    config.initialValues,
    config.order,
    config.maxCrankTurns
  );

  const headerRow = engineState.columns.map((col) => {
    if (col.order === 0) return 'f(x)';
    return `Δ${toSuperscript(col.order)}`;
  });

  const engineRows: Map<number, number[]> = new Map();

  if (operationLog.length > 0) {
    engineRows.set(0, operationLog[0].previousValues);
  } else if (engineState) {
    engineRows.set(0, engineState.columns.map((c) => c.value));
  }

  for (let i = 0; i < operationLog.length; i++) {
    const step = operationLog[i];
    if (step.phase === 'add' && step.newValues.length > 0) {
      engineRows.set(step.crankTurn, step.newValues);
    }
  }

  const allConsistent = (() => {
    for (let x = 0; x <= engineState.currentStep; x++) {
      const engineVal = engineRows.get(x);
      const indepVal = independentTable[x]?.values;
      if (!engineVal || !indepVal) continue;
      if (engineVal[0] !== indepVal[0]) return false;
    }
    return true;
  })();

  return (
    <Paper
      shadow="sm"
      radius="md"
      p="md"
      style={{
        background: 'linear-gradient(135deg, #2A2540 0%, #1E1E35 100%)',
        border: '1px solid #4A3728',
      }}
    >
      <Group justify="space-between" style={{ marginBottom: 8 }}>
        <Text size="sm" fw={700} style={{ color: '#C8A951', fontFamily: 'Playfair Display, serif' }}>
          差分表格（独立验算）
        </Text>
        {engineState.currentStep > 0 && (
          <Badge
            size="xs"
            variant="filled"
            style={{
              background: allConsistent ? '#2E8B57' : '#C0392B',
              color: '#F5F0E1',
            }}
          >
            {allConsistent ? '✓ 结果一致' : '✗ 结果不一致'}
          </Badge>
        )}
      </Group>

      <ScrollArea style={{ maxHeight: 320 }}>
        <Table
          striped
          highlightOnHover
          styles={{
            table: { color: '#F5F0E1', minWidth: 400 },
            th: { color: '#C8A951', borderBottomColor: '#4A3728', fontFamily: 'Playfair Display, serif', whiteSpace: 'nowrap', fontSize: 12 },
            td: { borderBottomColor: '#333350', fontFamily: 'Source Sans 3, sans-serif', fontSize: 12, whiteSpace: 'nowrap', padding: '6px 8px' },
            tr: { background: 'transparent' },
          }}
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: 50 }}>x</Table.Th>
              {headerRow.map((h, i) => (
                <Table.Th key={i} style={{ textAlign: 'center' }}>{h}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {independentTable.map((row, idx) => {
              const x = row.x;
              const engineValues = engineRows.get(x);
              const isCurrentStep = x === engineState.currentStep && x > 0;
              const isInitial = x === 0;
              const hasEngineData = engineValues !== undefined;
              const isPastStep = x <= engineState.currentStep;

              const isErrorStep = (() => {
                if (!hasEngineData) return false;
                for (let i = 0; i < Math.min(engineValues.length, row.values.length); i++) {
                  if (engineValues[i] !== row.values[i]) return true;
                }
                return false;
              })();

              return (
                <Table.Tr
                  key={idx}
                  style={{
                    background: isErrorStep
                      ? 'rgba(192,57,43,0.2)'
                      : isCurrentStep
                        ? 'rgba(200,169,81,0.15)'
                        : isPastStep
                          ? 'rgba(46,139,87,0.05)'
                          : 'transparent',
                  }}
                >
                  <Table.Td>
                    <Group gap={4}>
                      <Text
                        size="xs"
                        style={{
                          color: isCurrentStep ? '#C8A951' : isPastStep ? '#F5F0E1' : '#8B8682',
                          fontWeight: isCurrentStep ? 'bold' : 'normal',
                        }}
                      >
                        {x}
                      </Text>
                      {isCurrentStep && <Badge size="xs" color="#C8A951" variant="outline">当前</Badge>}
                      {isInitial && <Badge size="xs" color="#2E8B57" variant="outline">初始</Badge>}
                      {!isPastStep && <Badge size="xs" color="#8B8682" variant="outline">预期</Badge>}
                    </Group>
                  </Table.Td>
                  {row.values.map((expectedVal, i) => {
                    const engineVal = engineValues?.[i];
                    const hasMismatch = hasEngineData && engineVal !== expectedVal;
                    const isFirstCol = i === 0;

                    return (
                      <Table.Td key={i} style={{ textAlign: 'center' }}>
                        <Text
                          size="xs"
                          style={{
                            color: hasMismatch
                              ? '#C0392B'
                              : isFirstCol
                                ? '#2E8B57'
                                : isPastStep
                                  ? '#F5F0E1'
                                  : '#8B8682',
                            fontWeight: isCurrentStep ? 'bold' : 'normal',
                            textDecoration: hasMismatch ? 'line-through' : 'none',
                          }}
                        >
                          {hasEngineData && hasMismatch ? (
                            <>
                              <span style={{ color: '#C0392B' }}>{engineVal}</span>
                              <span style={{ color: '#2E8B57', fontSize: 10, marginLeft: 4 }}>
                                (应为 {expectedVal})
                              </span>
                            </>
                          ) : (
                            expectedVal
                          )}
                        </Text>
                      </Table.Td>
                    );
                  })}
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      <Text size="xs" style={{ color: '#8B8682', marginTop: 8, fontStyle: 'italic' }}>
        绿色数字为独立验算结果，与引擎结果对比以验证正确性
      </Text>
    </Paper>
  );
}

function toSuperscript(n: number): string {
  const superscripts: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  };
  return String(n).split('').map((c) => superscripts[c] ?? c).join('');
}
