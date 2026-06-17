import { create } from 'zustand';
import type {
  Annotation,
  AnnotationTarget,
  AnnotationTargetType,
  CollabMessage,
} from '@/types';
import { generateId, randomColor } from '@/collaboration/utils';
import { useCollabStore } from './collabStore';

interface AnnotationStoreState {
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  isDrawingMode: boolean;
  drawingTargetType: AnnotationTargetType | null;
  filterStepNumber: number | null;
  showResolved: boolean;
  localDraftContent: string;
  localDraftTarget: AnnotationTarget | null;
  localDraftStep: number;

  addAnnotation: (
    target: AnnotationTarget,
    content: string,
    stepNumber: number
  ) => Annotation | null;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  resolveAnnotation: (id: string, resolved: boolean) => void;
  deleteAnnotation: (id: string) => void;
  getAnnotationsForStep: (stepNumber: number) => Annotation[];
  getAnnotationsForTarget: (target: AnnotationTarget) => Annotation[];
  selectAnnotation: (id: string | null) => void;
  setDrawingMode: (active: boolean, targetType?: AnnotationTargetType) => void;
  setFilterStepNumber: (step: number | null) => void;
  setShowResolved: (show: boolean) => void;
  setLocalDraftContent: (content: string) => void;
  setLocalDraftTarget: (target: AnnotationTarget | null) => void;
  setLocalDraftStep: (step: number) => void;
  clearLocalDraft: () => void;
  submitLocalDraft: () => Annotation | null;
  clearAll: () => void;
  handleIncomingAnnotationMessages: () => () => void;
  exportAnnotations: () => Omit<Annotation, never>[];
  importAnnotations: (list: Annotation[]) => void;
}

export const useAnnotationStore = create<AnnotationStoreState>((set, get) => {
  let messageUnsubs: Array<() => void> = [];

  const broadcastAnnotation = (
    type: 'annotation_added' | 'annotation_updated' | 'annotation_resolved',
    annotation: Annotation
  ) => {
    const collab = useCollabStore.getState();
    if (!collab.isInSession) return;
    const mb = collab.messageBus;
    if (!mb) return;
    mb.send(type, annotation, collab.userName);
  };

  return {
    annotations: [],
    selectedAnnotationId: null,
    isDrawingMode: false,
    drawingTargetType: null,
    filterStepNumber: null,
    showResolved: true,
    localDraftContent: '',
    localDraftTarget: null,
    localDraftStep: 0,

    addAnnotation: (target, content, stepNumber) => {
      if (!content.trim()) return null;
      const collab = useCollabStore.getState();
      const annotation: Annotation = {
        id: generateId('ann'),
        sessionId: collab.sessionId || 'local',
        authorId: collab.userId,
        authorName: collab.userName,
        target,
        content: content.trim(),
        stepNumber,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        resolved: false,
        color: randomColor(),
      };
      set((s) => ({ annotations: [...s.annotations, annotation] }));
      broadcastAnnotation('annotation_added', annotation);
      return annotation;
    },

    updateAnnotation: (id, updates) => {
      const collab = useCollabStore.getState();
      set((s) => ({
        annotations: s.annotations.map((a) => {
          if (a.id !== id) return a;
          if (a.authorId !== collab.userId && collab.userRole !== 'host') return a;
          const updated = { ...a, ...updates, updatedAt: Date.now() };
          broadcastAnnotation('annotation_updated', updated);
          return updated;
        }),
      }));
    },

    resolveAnnotation: (id, resolved) => {
      const collab = useCollabStore.getState();
      set((s) => ({
        annotations: s.annotations.map((a) => {
          if (a.id !== id) return a;
          const updated = { ...a, resolved, updatedAt: Date.now() };
          if (collab.isInSession) {
            broadcastAnnotation('annotation_resolved', updated);
          }
          return updated;
        }),
      }));
    },

    deleteAnnotation: (id) => {
      const collab = useCollabStore.getState();
      set((s) => ({
        annotations: s.annotations.filter((a) => {
          if (a.id !== id) return true;
          return a.authorId !== collab.userId && collab.userRole !== 'host';
        }),
        selectedAnnotationId: s.selectedAnnotationId === id ? null : s.selectedAnnotationId,
      }));
    },

    getAnnotationsForStep: (stepNumber) => {
      const { annotations, showResolved, filterStepNumber } = get();
      const targetStep = filterStepNumber ?? stepNumber;
      return annotations.filter(
        (a) =>
          a.stepNumber === targetStep &&
          (showResolved ? true : !a.resolved)
      );
    },

    getAnnotationsForTarget: (target) => {
      const { annotations, showResolved } = get();
      return annotations.filter((a) => {
        if (!showResolved && a.resolved) return false;
        const t = a.target;
        if (t.type !== target.type) return false;
        if (t.columnIndex !== target.columnIndex) return false;
        if (t.type === 'wheel' && t.wheelIndex !== target.wheelIndex) return false;
        if (t.type === 'lever' && t.leverIndex !== target.leverIndex) return false;
        return true;
      });
    },

    selectAnnotation: (id) => set({ selectedAnnotationId: id }),
    setDrawingMode: (active, targetType) =>
      set({ isDrawingMode: active, drawingTargetType: active ? (targetType || null) : null }),
    setFilterStepNumber: (step) => set({ filterStepNumber: step }),
    setShowResolved: (show) => set({ showResolved: show }),
    setLocalDraftContent: (content) => set({ localDraftContent: content }),
    setLocalDraftTarget: (target) => set({ localDraftTarget: target }),
    setLocalDraftStep: (step) => set({ localDraftStep: step }),
    clearLocalDraft: () =>
      set({
        localDraftContent: '',
        localDraftTarget: null,
        isDrawingMode: false,
        drawingTargetType: null,
      }),

    submitLocalDraft: () => {
      const { localDraftContent, localDraftTarget, localDraftStep } = get();
      if (!localDraftContent.trim() || !localDraftTarget) return null;
      const result = get().addAnnotation(localDraftTarget, localDraftContent, localDraftStep);
      get().clearLocalDraft();
      return result;
    },

    clearAll: () =>
      set({
        annotations: [],
        selectedAnnotationId: null,
        localDraftContent: '',
        localDraftTarget: null,
      }),

    handleIncomingAnnotationMessages: () => {
      const collab = useCollabStore.getState();
      if (!collab.isInSession) return () => {};
      const mb = collab.messageBus;
      if (!mb) return () => {};

      const unsub1 = mb.on('annotation_added', (msg: CollabMessage<Annotation>) => {
        const ann = msg.payload;
        set((s) => {
          if (s.annotations.find((a) => a.id === ann.id)) return s;
          return { annotations: [...s.annotations, ann] };
        });
      });

      const unsub2 = mb.on('annotation_updated', (msg: CollabMessage<Annotation>) => {
        const ann = msg.payload;
        set((s) => ({
          annotations: s.annotations.map((a) => (a.id === ann.id ? ann : a)),
        }));
      });

      const unsub3 = mb.on('annotation_resolved', (msg: CollabMessage<Annotation>) => {
        const ann = msg.payload;
        set((s) => ({
          annotations: s.annotations.map((a) => (a.id === ann.id ? ann : a)),
        }));
      });

      messageUnsubs = [unsub1, unsub2, unsub3];

      return () => {
        messageUnsubs.forEach((u) => u());
        messageUnsubs = [];
      };
    },

    exportAnnotations: () => JSON.parse(JSON.stringify(get().annotations)),
    importAnnotations: (list) =>
      set({
        annotations: list.map((a) => ({ ...a, id: generateId('ann') })),
      }),
  };
});
