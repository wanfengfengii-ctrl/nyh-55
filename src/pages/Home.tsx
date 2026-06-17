import { useState } from 'react';
import { Stack, Grid, Tabs, Text } from '@mantine/core';
import EngineCanvas from '@/components/EngineCanvas';
import ControlPanel from '@/components/ControlPanel';
import DiffTable from '@/components/DiffTable';
import OperationLog from '@/components/OperationLog';
import ErrorOverlay from '@/components/ErrorOverlay';
import CardProgramPanel from '@/components/CardProgramPanel';
import CollaborationBridge from '@/components/CollaborationBridge';
import CollabSessionPanel from '@/components/CollabSessionPanel';
import AnnotationPanel from '@/components/AnnotationPanel';
import CollabControlPanel, { ReplayPanel } from '@/components/CollabControlPanel';

export default function Home() {
  const [activeTab, setActiveTab] = useState<string | null>('manual');

  return (
    <div style={{ height: '100vh', background: '#1A1A2E', overflow: 'hidden', position: 'relative' }}>
      <CollaborationBridge />
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
            <Tabs
              value={activeTab}
              onChange={setActiveTab}
              styles={{
                root: { height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 },
                list: {
                  background: 'linear-gradient(135deg, #2A2540 0%, #1E1E35 100%)',
                  border: '1px solid #4A3728',
                  borderRadius: 8,
                  padding: 4,
                },
                tab: {
                  color: '#8B8682',
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '8px 10px',
                  '&[data-active]': {
                    color: '#1A1A2E',
                    background: 'linear-gradient(135deg, #C8A951, #A08930)',
                    borderRadius: 6,
                  },
                },
                panel: { flex: 1, minHeight: 0, paddingTop: 0 },
              }}
            >
              <Tabs.List grow>
                <Tabs.Tab value="manual" leftSection={<Text size="sm">⚙️</Text>}>
                  手动控制
                </Tabs.Tab>
                <Tabs.Tab value="cards" leftSection={<Text size="sm">🃏</Text>}>
                  卡片编程
                </Tabs.Tab>
                <Tabs.Tab value="collab" leftSection={<Text size="sm">🌐</Text>}>
                  协同讲解
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="manual" style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, paddingTop: 8 }}>
                <Stack gap="sm" style={{ height: '100%', minHeight: 0 }}>
                  <ControlPanel />
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <OperationLog />
                  </div>
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="cards" style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, paddingTop: 8 }}>
                <CardProgramPanel />
              </Tabs.Panel>

              <Tabs.Panel value="collab" style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, paddingTop: 8 }}>
                <Stack gap="sm" style={{ height: '100%', minHeight: 0 }}>
                  <CollabSessionPanel />
                  <CollabControlPanel />
                  <ReplayPanel />
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <AnnotationPanel />
                  </div>
                </Stack>
              </Tabs.Panel>
            </Tabs>
          </Stack>
        </Grid.Col>
      </Grid>
    </div>
  );
}
