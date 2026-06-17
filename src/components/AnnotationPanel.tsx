import { useState } from 'react';
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
  ActionIcon,
  Select,
  Textarea,
  ScrollArea,
  Modal,
  Menu,
} from '@mantine/core';
import { useAnnotationStore } from '@/store/annotationStore';
import { useCollabStore } from '@/store/collabStore';
import { useEngineStore } from '@/store/engineStore';
import type { Annotation, AnnotationTarget, AnnotationTargetType } from '@/types';

export default function AnnotationPanel() {
  const {
    annotations,
    selectedAnnotationId,
    isDrawingMode,
    drawingTargetType,
    filterStepNumber,
    showResolved,
    localDraftContent,
    localDraftTarget,
    localDraftStep,
    addAnnotation,
    updateAnnotation,
    resolveAnnotation,
    deleteAnnotation,
    selectAnnotation,
    setDrawingMode,
    setFilterStepNumber,
    setShowResolved,
    setLocalDraftContent,
    setLocalDraftTarget,
    setLocalDraftStep,
    clearLocalDraft,
    submitLocalDraft,
    getAnnotationsForStep,
  } = useAnnotationStore();

  const collab = useCollabStore();
  const engineState = useEngineStore((s) => s.engineState);
  const currentStep = engineState?.currentStep ?? 0;

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
  const [editContent, setEditContent] = useState('');

  const targetTypeOptions: Array<{ value: AnnotationTargetType; label: string }> = [
    { value: 'wheel', label: '🔘 数字轮' },
    { value: 'lever', label: '⚙️ 进位杆' },
    { value: 'gear', label: '⚙ 齿轮' },
    { value: 'column', label: '📊 差分列' },
    { value: 'step', label: '📝 步骤批注' },
  ];

  const targetNameMap: Record<string, string> = {
    wheel: '数字轮',
    lever: '进位杆',
    gear: '齿轮',
    column: '差分列',
    step: '步骤',
  };

  const stepAnnotations = getAnnotationsForStep(filterStepNumber ?? currentStep);
  const allAnnotations = showResolved
    ? annotations
    : annotations.filter((a) => !a.resolved);

  const startQuickAnnotation = (type: AnnotationTargetType) => {
    setLocalDraftStep(currentStep);
    setLocalDraftTarget({
      type,
      ...(type !== 'step' ? {
        columnIndex: 0,
        ...(type === 'wheel' ? { wheelIndex: 0 } : {}),
        ...(type === 'lever' ? { leverIndex: 0 } : {}),
      } : {}),
    });
    setDrawingMode(true, type);
  };

  const handleSubmitDraft = () => {
    if (!localDraftContent.trim() || !localDraftTarget) return;
    submitLocalDraft();
  };

  const openEdit = (ann: Annotation) => {
    if (ann.authorId !== collab.userId && collab.userRole !== 'host') return;
    setEditingAnnotation(ann);
    setEditContent(ann.content);
    setEditModalOpen(true);
  };

  const saveEdit = () => {
    if (!editingAnnotation || !editContent.trim()) return;
    updateAnnotation(editingAnnotation.id, { content: editContent.trim() });
    setEditModalOpen(false);
    setEditingAnnotation(null);
  };

  const isLocked = collab.isInSession && !collab.isPresenter() && collab.sessionStatus === 'error';

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
            <Text size="sm" fw={700} style={{ color: '#C8A951', fontFamily: 'Playfair Display, serif' }}>
              ✏️ 批注系统
            </Text>
            <Badge size="xs" variant="outline" color="#8B8682">
              {allAnnotations.length} 条
            </Badge>
          </Group>

          <Divider color="#4A3728" />

          <Group gap="xs" wrap="nowrap">
            <Select
              size="xs"
              placeholder="选择批注类型"
              data={targetTypeOptions.map((o) => ({ value: o.value, label: o.label }))}
              value={drawingTargetType}
              onChange={(v) => {
                if (v) startQuickAnnotation(v as AnnotationTargetType);
              }}
              disabled={isLocked}
              style={{ flex: 1 }}
              styles={{
                input: { background: '#1A1A2E', color: '#F5F0E1', borderColor: '#4A3728' },
              }}
            />
            <Tooltip label={isDrawingMode ? '退出圈选模式' : '开始圈选标注'}>
              <ActionIcon
                size="lg"
                variant={isDrawingMode ? 'filled' : 'subtle'}
                onClick={() => {
                  if (isDrawingMode) {
                    clearLocalDraft();
                  } else if (drawingTargetType) {
                    setDrawingMode(true, drawingTargetType);
                  }
                }}
                disabled={!drawingTargetType || isLocked}
                style={{
                  background: isDrawingMode ? '#C8A951' : undefined,
                  color: isDrawingMode ? '#1A1A2E' : '#C8A951',
                }}
              >
                {isDrawingMode ? '🔲' : '🖊'}
              </ActionIcon>
            </Tooltip>
          </Group>

          {isDrawingMode && drawingTargetType && (
            <Stack gap="xs" p="xs" style={{ background: 'rgba(200,169,81,0.1)', borderRadius: 6, border: '1px dashed #C8A951' }}>
              <Text size="xs" fw={600} style={{ color: '#C8A951' }}>
                圈选模式: {targetTypeOptions.find((t) => t.value === drawingTargetType)?.label}
              </Text>

              {drawingTargetType !== 'step' && (
                <>
                  <Paper p="xs" radius="sm" style={{ background: 'rgba(46,139,87,0.1)', border: '1px solid #2E8B57' }}>
                    <Stack gap={4}>
                      <Text size="xs" fw={600} style={{ color: '#2E8B57' }}>
                        👆 点击画布上的{targetNameMap[drawingTargetType] || '目标'}自动定位
                      </Text>
                      {localDraftTarget ? (
                        <Group gap="xs">
                          <Badge size="xs" variant="filled" style={{ background: '#2E8B57' }}>
                            已定位: 列{localDraftTarget.columnIndex ?? '-'}
                            {localDraftTarget.wheelIndex !== undefined && `:W${localDraftTarget.wheelIndex}`}
                            {localDraftTarget.leverIndex !== undefined && `:L${localDraftTarget.leverIndex}`}
                          </Badge>
                        </Group>
                      ) : (
                        <Text size="xs" style={{ color: '#8B8682' }}>
                          请在左侧机械画布上点击要标注的{targetNameMap[drawingTargetType] || '目标'}
                        </Text>
                      )}
                    </Stack>
                  </Paper>
                  <Group gap="xs">
                    <TextInput
                      size="xs"
                      label="列索引"
                      type="number"
                      value={String(localDraftTarget?.columnIndex ?? 0)}
                      onChange={(e) =>
                        setLocalDraftTarget({
                          ...localDraftTarget,
                          type: drawingTargetType,
                          columnIndex: Number(e.currentTarget.value) || 0,
                        })
                      }
                      min={0}
                      styles={miniInputStyles}
                    />
                    {drawingTargetType === 'wheel' && (
                      <TextInput
                        size="xs"
                        label="轮索引"
                        type="number"
                        value={String(localDraftTarget?.wheelIndex ?? 0)}
                        onChange={(e) =>
                          setLocalDraftTarget({
                            ...localDraftTarget,
                            type: drawingTargetType,
                            columnIndex: localDraftTarget?.columnIndex ?? 0,
                            wheelIndex: Number(e.currentTarget.value) || 0,
                          })
                        }
                        min={0}
                        styles={miniInputStyles}
                      />
                    )}
                    {drawingTargetType === 'lever' && (
                      <TextInput
                        size="xs"
                        label="杆索引"
                        type="number"
                        value={String(localDraftTarget?.leverIndex ?? 0)}
                        onChange={(e) =>
                          setLocalDraftTarget({
                            ...localDraftTarget,
                            type: drawingTargetType,
                            columnIndex: localDraftTarget?.columnIndex ?? 0,
                            leverIndex: Number(e.currentTarget.value) || 0,
                          })
                        }
                        min={0}
                        styles={miniInputStyles}
                      />
                    )}
                  </Group>
                </>
              )}

              <Textarea
                size="xs"
                placeholder="输入批注内容..."
                value={localDraftContent}
                onChange={(e) => setLocalDraftContent(e.currentTarget.value)}
                minRows={2}
                autosize
                styles={{ input: { background: '#1A1A2E', color: '#F5F0E1', borderColor: '#4A3728' } }}
              />

              <TextInput
                size="xs"
                label="关联步骤"
                type="number"
                value={String(localDraftStep)}
                onChange={(e) => setLocalDraftStep(Number(e.currentTarget.value) || 0)}
                min={0}
                styles={miniInputStyles}
              />

              <Group gap="xs" justify="flex-end">
                <Button size="xs" variant="subtle" onClick={clearLocalDraft} style={{ color: '#8B8682' }}>
                  取消
                </Button>
                <Button
                  size="xs"
                  onClick={handleSubmitDraft}
                  disabled={!localDraftContent.trim()}
                  styles={greenButtonStyles}
                >
                  添加批注
                </Button>
              </Group>
            </Stack>
          )}

          <Group gap="xs" wrap="nowrap">
            <TextInput
              size="xs"
              placeholder="按步骤过滤"
              type="number"
              value={filterStepNumber === null ? '' : String(filterStepNumber)}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setFilterStepNumber(v === '' ? null : Number(v));
              }}
              styles={miniInputStyles}
              style={{ flex: 1 }}
            />
            <Tooltip label={filterStepNumber === null ? '只看当前步骤' : '清除过滤'}>
              <ActionIcon
                size="md"
                variant="subtle"
                onClick={() => setFilterStepNumber(filterStepNumber === null ? currentStep : null)}
                style={{ color: '#C8A951' }}
              >
                {filterStepNumber === null ? '📍' : '✕'}
              </ActionIcon>
            </Tooltip>
            <Tooltip label={showResolved ? '隐藏已解决' : '显示已解决'}>
              <ActionIcon
                size="md"
                variant={showResolved ? 'filled' : 'subtle'}
                onClick={() => setShowResolved(!showResolved)}
                style={{
                  background: showResolved ? '#4A9B7F' : undefined,
                  color: showResolved ? '#F5F0E1' : '#2E8B57',
                }}
              >
                ✓
              </ActionIcon>
            </Tooltip>
          </Group>

          {filterStepNumber !== null && (
            <Badge size="xs" variant="outline" color="#C8A951">
              过滤: 步骤 {filterStepNumber}, 共 {stepAnnotations.length} 条批注
            </Badge>
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
            <Text size="xs" fw={700} style={{ color: '#C8A951' }}>
              批注列表
            </Text>
            <Badge size="xs" variant="outline" color="#8B8682">
              {showResolved ? '全部' : '未解决'}: {(filterStepNumber !== null ? stepAnnotations : allAnnotations).length}
            </Badge>
          </Group>
          <Divider color="#4A3728" />
          <ScrollArea style={{ flex: 1, minHeight: 0 }} type="hover">
            <Stack gap="xs" p="xs">
              {(filterStepNumber !== null ? stepAnnotations : allAnnotations).length === 0 ? (
                <Text size="xs" style={{ color: '#8B8682', textAlign: 'center', padding: 20 }}>
                  暂无批注，点击上方"🖊"开始圈选标注
                </Text>
              ) : (
                (filterStepNumber !== null ? stepAnnotations : allAnnotations).map((a) => (
                  <AnnotationItem
                    key={a.id}
                    annotation={a}
                    selected={a.id === selectedAnnotationId}
                    canEdit={a.authorId === collab.userId || collab.userRole === 'host'}
                    isLocked={isLocked}
                    onSelect={() => selectAnnotation(a.id === selectedAnnotationId ? null : a.id)}
                    onEdit={() => openEdit(a)}
                    onResolve={() => resolveAnnotation(a.id, !a.resolved)}
                    onDelete={() => deleteAnnotation(a.id)}
                  />
                ))
              )}
            </Stack>
          </ScrollArea>
        </Stack>
      </Paper>

      <Modal
        opened={editModalOpen}
        onClose={() => { setEditModalOpen(false); setEditingAnnotation(null); }}
        title="编辑批注"
        size="sm"
        styles={{ title: { color: '#C8A951', fontFamily: 'Playfair Display, serif' } }}
      >
        <Stack gap="sm">
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.currentTarget.value)}
            minRows={3}
            autosize
            styles={{ input: { background: '#1A1A2E', color: '#F5F0E1', borderColor: '#4A3728' } }}
          />
          <Group justify="flex-end">
            <Button size="xs" onClick={() => { setEditModalOpen(false); setEditingAnnotation(null); }} variant="subtle" style={{ color: '#8B8682' }}>
              取消
            </Button>
            <Button size="xs" onClick={saveEdit} disabled={!editContent.trim()} styles={greenButtonStyles}>
              保存
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function AnnotationItem({
  annotation,
  selected,
  canEdit,
  isLocked,
  onSelect,
  onEdit,
  onResolve,
  onDelete,
}: {
  annotation: Annotation;
  selected: boolean;
  canEdit: boolean;
  isLocked: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onResolve: () => void;
  onDelete: () => void;
}) {
  const targetLabels: Record<AnnotationTargetType, string> = {
    wheel: '数字轮',
    lever: '进位杆',
    gear: '齿轮',
    column: '差分列',
    step: '步骤',
  };

  return (
    <Paper
      p="xs"
      radius="sm"
      onClick={onSelect}
      style={{
        background: selected ? 'rgba(200,169,81,0.15)' : annotation.resolved ? 'rgba(46,139,87,0.08)' : 'rgba(74,55,40,0.3)',
        border: `1px solid ${selected ? '#C8A951' : annotation.resolved ? '#2E8B57' : '#4A3728'}`,
        borderLeft: `3px solid ${annotation.color}`,
        cursor: 'pointer',
        opacity: annotation.resolved ? 0.7 : 1,
      }}
    >
      <Stack gap={4}>
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Badge size="xs" variant="outline" style={{ borderColor: annotation.color, color: annotation.color }}>
              {targetLabels[annotation.target.type]}
              {annotation.target.columnIndex !== undefined && ` #${annotation.target.columnIndex}`}
              {annotation.target.wheelIndex !== undefined && `:W${annotation.target.wheelIndex}`}
              {annotation.target.leverIndex !== undefined && `:L${annotation.target.leverIndex}`}
            </Badge>
            <Badge size="xs" variant="outline" color="#8B8682">
              S{annotation.stepNumber}
            </Badge>
          </Group>
          <Group gap={0} wrap="nowrap">
            {canEdit && !isLocked && (
              <>
                <Tooltip label={annotation.resolved ? '标记未解决' : '标记已解决'}>
                  <ActionIcon size="xs" variant="subtle" onClick={(e) => { e.stopPropagation(); onResolve(); }} style={{ color: '#2E8B57' }}>
                    {annotation.resolved ? '↺' : '✓'}
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="编辑">
                  <ActionIcon size="xs" variant="subtle" onClick={(e) => { e.stopPropagation(); onEdit(); }} style={{ color: '#C8A951' }}>
                    ✏️
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="删除">
                  <ActionIcon size="xs" variant="subtle" onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ color: '#C0392B' }}>
                    🗑
                  </ActionIcon>
                </Tooltip>
              </>
            )}
          </Group>
        </Group>
        <Text size="xs" style={{ color: '#F5F0E1', lineHeight: 1.5 }}>
          {annotation.content}
        </Text>
        <Group justify="space-between">
          <Text size="xs" style={{ color: '#8B8682', fontSize: 10 }}>
            {annotation.authorName}
          </Text>
          <Text size="xs" style={{ color: '#8B8682', fontSize: 10 }}>
            {new Date(annotation.createdAt).toLocaleTimeString()}
          </Text>
        </Group>
      </Stack>
    </Paper>
  );
}

const miniInputStyles = {
  label: { color: '#8B8682', fontSize: 10 },
  input: { background: '#1A1A2E', color: '#F5F0E1', borderColor: '#4A3728', fontSize: 12 },
};

const greenButtonStyles = {
  root: {
    background: 'linear-gradient(135deg, #2E8B57, #1E6B3F)',
    color: '#F5F0E1',
    fontWeight: 'bold',
    border: 'none',
  },
};
