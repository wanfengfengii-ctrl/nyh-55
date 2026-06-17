import { useState, useEffect, useRef } from 'react';
import {
  Paper,
  Text,
  Group,
  Stack,
  Button,
  TextInput,
  Badge,
  Divider,
  Tooltip,
  CopyButton,
  ActionIcon,
  Alert,
  Menu,
  Modal,
  Textarea,
} from '@mantine/core';
import { useCollabStore } from '@/store/collabStore';
import { useRecordingStore } from '@/store/recordingStore';
import { useAnnotationStore } from '@/store/annotationStore';
import { useEngineStore } from '@/store/engineStore';
import type { Participant } from '@/types';

export default function CollabSessionPanel() {
  const {
    isInSession,
    sessionCode,
    sessionName,
    sessionStatus,
    userName,
    userRole,
    participants,
    currentPresenterId,
    syncStatus,
    mismatchError,
    errorAlert,
    createSession,
    joinSession,
    leaveSession,
    updateUserName,
    transferPresenter,
    clearMismatchError,
    clearErrorAlert,
  } = useCollabStore();

  const {
    isRecording,
    activeRecording,
    savedRecordings,
    startRecording,
    stopRecording,
    loadRecordingsFromStorage,
  } = useRecordingStore();

  const [joinCode, setJoinCode] = useState('');
  const [createName, setCreateName] = useState('差分机协同演示');
  const [editName, setEditName] = useState(userName);
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    loadRecordingsFromStorage();
  }, [loadRecordingsFromStorage]);

  useEffect(() => {
    setEditName(userName);
  }, [userName]);

  const handleCreateSession = () => {
    createSession(createName);
  };

  const handleJoinSession = () => {
    if (!joinCode.trim()) {
      setJoinError('请输入会话邀请码');
      return;
    }
    const result = joinSession(joinCode.trim().toUpperCase());
    if (!result.success) {
      setJoinError(result.error || '加入失败，请检查邀请码');
    } else {
      setJoinError(null);
    }
  };

  const handleCopyCode = () => {
    if (sessionCode) {
      navigator.clipboard?.writeText(sessionCode).catch(() => {});
    }
  };

  if (!isInSession) {
    return (
      <Paper
        shadow="sm"
        radius="md"
        p="sm"
        style={{
          background: 'linear-gradient(135deg, #2A2540 0%, #1E1E35 100%)',
          border: '1px solid #4A3728',
        }}
      >
        <Stack gap="md">
          <Group justify="space-between">
            <Text size="lg" fw={700} style={{ color: '#C8A951', fontFamily: 'Playfair Display, serif' }}>
              🌐 多人协同讲解模式
            </Text>
          </Group>

          <Divider color="#4A3728" />

          <Group gap="xs" align="flex-end">
            <TextInput
              label="您的昵称"
              value={editName}
              onChange={(e) => setEditName(e.currentTarget.value)}
              placeholder="输入昵称"
              size="xs"
              style={{ flex: 1 }}
              styles={inputStyles}
            />
            <Button
              size="xs"
              onClick={() => {
                if (editName.trim()) {
                  updateUserName(editName.trim());
                }
              }}
              styles={brassButtonStyles}
            >
              保存
            </Button>
          </Group>

          <Divider color="#4A3728" label={<Text size="xs" style={{ color: '#8B8682' }}>创建演示会话</Text>} />

          <Stack gap="xs">
            <TextInput
              label="会话名称"
              value={createName}
              onChange={(e) => setCreateName(e.currentTarget.value)}
              placeholder="输入会话名称"
              size="xs"
              styles={inputStyles}
            />
            <Button
              fullWidth
              onClick={handleCreateSession}
              styles={greenButtonStyles}
              size="sm"
              leftSection="🎤"
            >
              创建会话（作为主讲人）
            </Button>
          </Stack>

          <Divider color="#4A3728" label={<Text size="xs" style={{ color: '#8B8682' }}>加入已有会话</Text>} />

          <Stack gap="xs">
            <TextInput
              label="邀请码"
              value={joinCode}
              onChange={(e) => { setJoinCode(e.currentTarget.value); setJoinError(null); }}
              placeholder="输入6位邀请码"
              size="xs"
              styles={inputStyles}
              description="请向主讲人获取邀请码"
            />
            {joinError && (
              <Text size="xs" style={{ color: '#C0392B' }}>{joinError}</Text>
            )}
            <Button
              fullWidth
              onClick={handleJoinSession}
              styles={copperButtonStyles}
              size="sm"
              leftSection="👥"
            >
              加入会话（作为观众）
            </Button>
          </Stack>

          {savedRecordings.length > 0 && (
            <>
              <Divider color="#4A3728" label={<Text size="xs" style={{ color: '#8B8682' }}>历史演示 ({savedRecordings.length})</Text>} />
              <Text size="xs" style={{ color: '#8B8682' }}>
                本地保存了 {savedRecordings.length} 场演示记录，可在协同会话中回放
              </Text>
            </>
          )}
        </Stack>
      </Paper>
    );
  }

  const isPresenter = currentPresenterId === useCollabStore.getState().userId;

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
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="md" fw={700} style={{ color: '#C8A951', fontFamily: 'Playfair Display, serif' }}>
              🌐 {sessionName}
            </Text>
            <Group gap="xs">
              <Badge
                size="sm"
                variant="filled"
                style={{ background: isPresenter ? '#2E8B57' : '#B88A50' }}
              >
                {isPresenter ? '🎤 主讲人' : '👁 观众'}
              </Badge>
              <StatusBadge status={sessionStatus} />
              <SyncBadge status={syncStatus} />
            </Group>
          </Group>

          <Group gap="xs">
            <Text size="xs" style={{ color: '#8B8682' }}>邀请码:</Text>
            <Group gap="xs" wrap="nowrap">
              <Badge size="lg" variant="outline" style={{ borderColor: '#C8A951', color: '#C8A951', letterSpacing: 2, fontSize: 14 }}>
                {sessionCode}
              </Badge>
              <CopyButton value={sessionCode || ''}>
                {({ copied }) => (
                  <Tooltip label={copied ? '已复制' : '复制邀请码'}>
                    <ActionIcon size="sm" onClick={handleCopyCode} variant="subtle" style={{ color: '#C8A951' }}>
                      {copied ? '✓' : '📋'}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
          </Group>

          {mismatchError && (
            <Alert
              color="red"
              variant="filled"
              p="xs"
              onClose={clearMismatchError}
              withCloseButton
              styles={{ root: { background: 'rgba(192,57,43,0.2)' }, title: { color: '#C0392B' }, message: { color: '#C0392B', fontSize: 12 } }}
              title="⚠ 状态不一致"
            >
              {mismatchError}。所有参与者已停止演算。
            </Alert>
          )}

          {errorAlert && (
            <Alert
              color="orange"
              variant="filled"
              p="xs"
              onClose={clearErrorAlert}
              withCloseButton
              styles={{ root: { background: 'rgba(230,126,34,0.2)' }, title: { color: '#E67E22' }, message: { color: '#E67E22', fontSize: 12 } }}
              title="⚙ 同步提示"
            >
              {errorAlert.message}
            </Alert>
          )}

          <Group justify="space-between" grow>
            <Menu shadow="md" width={180} position="bottom-start">
              <Menu.Target>
                <Button size="xs" styles={brassButtonStyles} leftSection="⚙">
                  {userName}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => setEditNameOpen(true)}>✏️ 修改昵称</Menu.Item>
                <Menu.Divider />
                {isPresenter && participants.length > 1 && (
                  <>
                    <Menu.Label>转让主讲权</Menu.Label>
                    {participants
                      .filter((p) => p.id !== currentPresenterId)
                      .map((p) => (
                        <Menu.Item key={p.id} onClick={() => transferPresenter(p.id)}>
                          → {p.name}
                        </Menu.Item>
                      ))}
                    <Menu.Divider />
                  </>
                )}
                <Menu.Item
                  onClick={leaveSession}
                  style={{ color: '#C0392B' }}
                >
                  🚪 离开会话
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>

            {isPresenter && (
              <Button
                size="xs"
                onClick={isRecording ? stopRecording : startRecording}
                styles={isRecording ? redButtonStyles : greenButtonStyles}
                leftSection={isRecording ? '⏹' : '⏺'}
              >
                {isRecording ? '停止录制' : activeRecording ? '录制中...' : '开始录制'}
              </Button>
            )}
          </Group>

          {isRecording && activeRecording && (
            <Text size="xs" style={{ color: '#C0392B' }}>
              ● 录制中: 已记录 {activeRecording.steps.length} 个步骤
            </Text>
          )}
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
            <Text size="sm" fw={700} style={{ color: '#C8A951', fontFamily: 'Playfair Display, serif' }}>
              👥 参与者 ({participants.length})
            </Text>
          </Group>
          <Divider color="#4A3728" />
          <Stack gap="xs" style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {participants.map((p) => (
              <ParticipantItem
                key={p.id}
                participant={p}
                isPresenter={p.id === currentPresenterId}
                isSelf={p.id === useCollabStore.getState().userId}
              />
            ))}
          </Stack>
        </Stack>
      </Paper>

      <Modal
        opened={editNameOpen}
        onClose={() => setEditNameOpen(false)}
        title="修改昵称"
        size="sm"
        styles={{ title: { color: '#C8A951', fontFamily: 'Playfair Display, serif' } }}
      >
        <Stack gap="sm">
          <TextInput
            value={editName}
            onChange={(e) => setEditName(e.currentTarget.value)}
            placeholder="输入新昵称"
            styles={inputStyles}
          />
          <Group justify="flex-end">
            <Button size="xs" onClick={() => setEditNameOpen(false)} variant="subtle" style={{ color: '#8B8682' }}>
              取消
            </Button>
            <Button
              size="xs"
              onClick={() => {
                if (editName.trim()) {
                  updateUserName(editName.trim());
                  setEditNameOpen(false);
                }
              }}
              styles={brassButtonStyles}
            >
              确认
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function ParticipantItem({ participant, isPresenter, isSelf }: {
  participant: Participant;
  isPresenter: boolean;
  isSelf: boolean;
}) {
  return (
    <Paper
      p="xs"
      radius="sm"
      style={{
        background: isSelf ? 'rgba(200,169,81,0.1)' : 'rgba(74,55,40,0.3)',
        border: `1px solid ${isSelf ? '#C8A951' : '#4A3728'}`,
      }}
    >
      <Group justify="space-between" gap="xs">
        <Group gap="xs" wrap="nowrap">
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: participant.avatarColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              color: '#1A1A2E',
              flexShrink: 0,
            }}
          >
            {participant.name.substr(0, 1)}
          </div>
          <Stack gap={0}>
            <Text size="xs" fw={isPresenter ? 700 : 500} style={{ color: '#F5F0E1' }}>
              {participant.name}
              {isSelf && <span style={{ color: '#8B8682', marginLeft: 4, fontWeight: 400 }}>(我)</span>}
            </Text>
            {participant.stateHash && (
              <Text fz={10} style={{ color: '#8B8682' }}>状态: {participant.stateHash}</Text>
            )}
          </Stack>
        </Group>
        <Group gap="xs">
          {isPresenter && (
            <Badge size="xs" variant="filled" style={{ background: '#2E8B57' }}>
              🎤
            </Badge>
          )}
        </Group>
      </Group>
    </Paper>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    waiting: { color: '#8B8682', label: '等待中' },
    running: { color: '#2E8B57', label: '运行中' },
    paused: { color: '#C8A951', label: '已暂停' },
    error: { color: '#C0392B', label: '错误' },
    ended: { color: '#8B5A2B', label: '已结束' },
  };
  const c = config[status] || config.waiting;
  return <Badge size="sm" variant="filled" style={{ background: c.color }}>{c.label}</Badge>;
}

function SyncBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    idle: { color: '#8B8682', label: '离线' },
    syncing: { color: '#C8A951', label: '同步中' },
    synced: { color: '#2E8B57', label: '已同步' },
    out_of_sync: { color: '#C0392B', label: '不同步' },
  };
  const c = config[status] || config.idle;
  return <Badge size="sm" variant="outline" style={{ borderColor: c.color, color: c.color }}>{c.label}</Badge>;
}

const inputStyles = {
  label: { color: '#C8A951', fontFamily: 'Source Sans 3, sans-serif' },
  input: {
    background: '#1A1A2E',
    color: '#F5F0E1',
    borderColor: '#4A3728',
    fontFamily: 'Source Sans 3, sans-serif',
  },
  description: { color: '#8B8682', fontSize: 11 },
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

const copperButtonStyles = {
  root: {
    background: 'linear-gradient(135deg, #B87333, #8B5A2B)',
    color: '#F5F0E1',
    fontWeight: 'bold',
    border: 'none',
  },
};

const redButtonStyles = {
  root: {
    background: 'linear-gradient(135deg, #8B3A3A, #6B2020)',
    color: '#F5F0E1',
    fontWeight: 'bold',
    border: 'none',
  },
};
