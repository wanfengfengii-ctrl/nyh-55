import { Stack, Grid } from '@mantine/core';
import EngineCanvas from '@/components/EngineCanvas';
import ControlPanel from '@/components/ControlPanel';
import DiffTable from '@/components/DiffTable';
import OperationLog from '@/components/OperationLog';
import ErrorOverlay from '@/components/ErrorOverlay';

export default function Home() {
  return (
    <div style={{ height: '100vh', background: '#1A1A2E', overflow: 'hidden', position: 'relative' }}>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: 'linear-gradient(90deg, #4A3728, #C8A951, #2E8B57, #C8A951, #4A3728)',
        zIndex: 10,
      }} />
      <Grid gutter="md" style={{ height: '100%', padding: '10px 12px 12px 12px' }} columns={12}>
        <Grid.Col span={8}>
          <Stack gap="sm" style={{ height: '100%' }}>
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
              <EngineCanvas />
              <ErrorOverlay />
            </div>
            <div style={{ maxHeight: 220, overflow: 'auto' }}>
              <DiffTable />
            </div>
          </Stack>
        </Grid.Col>

        <Grid.Col span={4}>
          <Stack gap="sm" style={{ height: '100%' }}>
            <ControlPanel />
            <div style={{ flex: 1, minHeight: 0 }}>
              <OperationLog />
            </div>
          </Stack>
        </Grid.Col>
      </Grid>
    </div>
  );
}
