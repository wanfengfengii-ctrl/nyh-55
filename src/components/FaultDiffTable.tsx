import { Paper, Table, Text, Group, Badge, ScrollArea } from '@mantine/core';
import { useFaultTrainingStore } from '@/store/faultTrainingStore';
import { computeDiffTableIndependent } from '@/utils/math';

export default function FaultDiffTable() {
  const activeSession = useFaultTrainingStore((s) => s.activeSession);
  const showCorrectComparison = useFaultTrainingStore((s) => s.showCorrectComparison);

  if (!activeSession) {
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
          故障差分表格
        </Text>
        <Text size="xs" style={{ color: '#8B8682', textAlign: 'center', padding: 16 }}>
          请先开始故障排查训练
        </Text>
      </Paper>
    );
  }

  const scenario = activeSession.scenario;
  const config = scenario.engineConfig;
  const independentTable = computeDiffTableIndependent(
    config.initialValues,
    config.order,
    config.maxCrankTurns
  );

  const faultyEngineRows: Map<number, number[]> = new Map();
  if (activeSession.faultyEngineState) {
    if (activeSession.faultyOperationLog.length > 0) {
      faultyEngineRows.set(0, activeSession.faultyOperationLog[0].previousValues);
    } else if (activeSession.faultyEngineState) {
      faultyEngineRows.set(0, activeSession.faultyEngineState.columns.map(c => c.value));
    }
    for (const step of activeSession.faultyOperationLog) {
      if (step.phase === 'add' && step.newValues.length > 0) {
        faultyEngineRows.set(step.crankTurn, step.newValues);
      }
    }
  }

  const correctEngineRows: Map<number, number[]> = new Map();
  if (showCorrectComparison && activeSession.correctEngineState) {
    if (activeSession.correctOperationLog.length > 0) {
      correctEngineRows.set(0, activeSession.correctOperationLog[0].previousValues);
    } else {
      correctEngineRows.set(0, activeSession.correctEngineState.columns.map(c => c.value));
    }
    for (const step of activeSession.correctOperationLog) {
      if (step.phase === 'add' && step.newValues.length > 0) {
        correctEngineRows.set(step.crankTurn, step.newValues);
      }
    }
  }

  const headerRow = config.initialValues.slice(0, config.order + 1).map((_, i) => {
    if (i === 0) return 'f(x)';
    return `Δ${toSuperscript(i)}`;
  });

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
          故障差分表格
        </Text>
        <Group gap="xs">
          <Badge size="xs" variant="filled" style={{ background: '#C0392B', color: '#F5F0E1' }}>
            ⚠ 故障注入
          </Badge>
          {showCorrectComparison && (
            <Badge size="xs" variant="filled" style={{ background: '#2E8B57', color: '#F5F0E1' }}>
              对比正确值
            </Badge>
          )}
        </Group>
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
              const faultyValues = faultyEngineRows.get(x);
              const correctValues = correctEngineRows.get(x);
              const isCurrentStep = x === activeSession.currentStep && x > 0;
              const isFaultStep = scenario.faults.some(f => f.triggerStep === x);
              const hasFaultyData = faultyValues !== undefined;
              const isPastStep = x <= activeSession.currentStep;

              return (
                <Table.Tr
                  key={idx}
                  style={{
                    background: isFaultStep && hasFaultyData
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
                          color: isFaultStep ? '#C0392B' : isCurrentStep ? '#C8A951' : isPastStep ? '#F5F0E1' : '#8B8682',
                          fontWeight: isCurrentStep || isFaultStep ? 'bold' : 'normal',
                        }}
                      >
                        {x}
                      </Text>
                      {isFaultStep && <Badge size="xs" color="#C0392B" variant="filled">⚠</Badge>}
                      {isCurrentStep && <Badge size="xs" color="#C8A951" variant="outline">当前</Badge>}
                      {!isPastStep && <Badge size="xs" color="#8B8682" variant="outline">预期</Badge>}
                    </Group>
                  </Table.Td>
                  {row.values.map((expectedVal, i) => {
                    const faultVal = faultyValues?.[i];
                    const correctVal = correctValues?.[i];
                    const hasMismatch = hasFaultyData && faultVal !== expectedVal;
                    const hasCorrectMismatch = showCorrectComparison && correctValues && faultVal !== correctVal;

                    return (
                      <Table.Td key={i} style={{ textAlign: 'center' }}>
                        <Text
                          size="xs"
                          style={{
                            color: hasMismatch
                              ? '#C0392B'
                              : i === 0
                                ? '#2E8B57'
                                : isPastStep
                                  ? '#F5F0E1'
                                  : '#8B8682',
                            fontWeight: isCurrentStep || isFaultStep ? 'bold' : 'normal',
                          }}
                        >
                          {hasFaultyData ? (
                            <>
                              <span style={{ color: hasMismatch ? '#C0392B' : 'inherit' }}>{faultVal}</span>
                              {hasMismatch && (
                                <span style={{ color: '#2E8B57', fontSize: 10, marginLeft: 4 }}>
                                  (应为 {expectedVal})
                                </span>
                              )}
                              {showCorrectComparison && hasCorrectMismatch && !hasMismatch && (
                                <span style={{ color: '#C8A951', fontSize: 9, marginLeft: 2 }}>
                                  [正确:{correctVal}]
                                </span>
                              )}
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
        ⚠ 红色数值为故障注入后的实际结果，绿色括号内为独立验算的正确值
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
