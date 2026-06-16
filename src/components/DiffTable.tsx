import { Paper, Table, Text, Group, Badge, ScrollArea } from '@mantine/core';
import { useEngineStore } from '@/store/engineStore';

interface DiffTableRow {
  x: number;
  values: number[];
  isLatest: boolean;
  hasError: boolean;
  isInitial: boolean;
}

export default function DiffTable() {
  const engineState = useEngineStore((s) => s.engineState);
  const operationLog = useEngineStore((s) => s.operationLog);

  if (!engineState) {
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
          差分表格
        </Text>
        <Text size="xs" style={{ color: '#8B8682', textAlign: 'center', padding: 16 }}>
          请先初始化差分机
        </Text>
      </Paper>
    );
  }

  const columns = engineState.columns;
  const headerRow = columns.map((col) => {
    if (col.order === 0) return 'f(x)';
    return `Δ${toSuperscript(col.order)}`;
  });

  const rows: DiffTableRow[] = [];

  const initialRow = operationLog.length > 0
    ? operationLog[0].previousValues
    : columns.map((c) => c.value);
  rows.push({
    x: 0,
    values: initialRow,
    isLatest: operationLog.length === 0,
    hasError: false,
    isInitial: true,
  });

  for (let i = 0; i < operationLog.length; i++) {
    const step = operationLog[i];
    if (step.phase === 'add' && step.newValues.length > 0) {
      rows.push({
        x: step.crankTurn,
        values: step.newValues,
        isLatest: i === operationLog.length - 1,
        hasError: step.errorOccurred,
        isInitial: false,
      });
    }
  }

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
        差分表格
      </Text>

      <ScrollArea>
        <Table
          striped
          highlightOnHover
          styles={{
            table: { color: '#F5F0E1', minWidth: 400 },
            th: { color: '#C8A951', borderBottomColor: '#4A3728', fontFamily: 'Playfair Display, serif', whiteSpace: 'nowrap' },
            td: { borderBottomColor: '#333350', fontFamily: 'Source Sans 3, sans-serif', fontSize: 13, whiteSpace: 'nowrap' },
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
            {rows.map((row, idx) => (
              <Table.Tr
                key={idx}
                style={{
                  background: row.hasError
                    ? 'rgba(192,57,43,0.15)'
                    : row.isLatest
                      ? 'rgba(200,169,81,0.1)'
                      : 'transparent',
                }}
              >
                <Table.Td>
                  <Group gap={4}>
                    <Text size="xs" style={{ color: row.isLatest ? '#C8A951' : '#8B8682', fontWeight: row.isLatest ? 'bold' : 'normal' }}>
                      {row.x}
                    </Text>
                    {row.isLatest && !row.isInitial && <Badge size="xs" color="#C8A951" variant="outline">当前</Badge>}
                    {row.isInitial && <Badge size="xs" color="#2E8B57" variant="outline">初始</Badge>}
                    {row.hasError && <Badge size="xs" color="#C0392B" variant="filled">错误</Badge>}
                  </Group>
                </Table.Td>
                {row.values.map((v, i) => (
                  <Table.Td key={i} style={{ textAlign: 'center' }}>
                    <Text
                      size="sm"
                      style={{
                        color: row.hasError ? '#C0392B' : i === 0 ? '#2E8B57' : '#F5F0E1',
                        fontWeight: row.isLatest ? 'bold' : 'normal',
                      }}
                    >
                      {v}
                    </Text>
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
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
