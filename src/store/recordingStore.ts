import { create } from 'zustand';
import type {
  DemoRecording,
  DemoStepRecord,
  EngineState,
  ComputationStep,
  Annotation,
  CollabMessage,
} from '@/types';
import { generateId } from '@/collaboration/utils';
import { useCollabStore } from './collabStore';
import { useAnnotationStore } from './annotationStore';
import { useEngineStore } from './engineStore';

type DemoControlAction = DemoStepRecord['controlAction'];

interface RecordingStoreState {
  activeRecording: DemoRecording | null;
  savedRecordings: DemoRecording[];
  isRecording: boolean;
  isReplaying: boolean;
  replayIndex: number;
  replaySpeed: number;
  replayTimer: ReturnType<typeof setInterval> | null;
  currentNarration: string;

  startRecording: () => void;
  stopRecording: () => DemoRecording | null;
  recordStep: (action: DemoControlAction, narration?: string) => void;
  addNarration: (text: string) => void;
  saveRecordingToStorage: () => void;
  loadRecordingsFromStorage: () => void;
  deleteSavedRecording: (id: string) => void;
  clearSavedRecordings: () => void;
  startReplay: (recording: DemoRecording) => void;
  pauseReplay: () => void;
  resumeReplay: () => void;
  stopReplay: () => void;
  setReplaySpeed: (speed: number) => void;
  replayNextStep: () => boolean;
  replayPrevStep: () => boolean;
  replayGotoStep: (index: number) => void;
  exportRecordingAsJSON: (recording: DemoRecording) => string;
  importRecordingFromJSON: (json: string) => DemoRecording | null;
  handleIncomingRecordingMessages: () => () => void;
}

const STORAGE_KEY = 'diff_engine_demo_recordings';

function cloneEngineState(state: EngineState | null): EngineState | null {
  return state ? (JSON.parse(JSON.stringify(state)) as EngineState) : null;
}

function cloneLog(log: ComputationStep[]): ComputationStep[] {
  return JSON.parse(JSON.stringify(log)) as ComputationStep[];
}

export const useRecordingStore = create<RecordingStoreState>((set, get) => {
  let replayUnsub: Array<() => void> = [];

  const applyStepToEngine = (step: DemoStepRecord) => {
    const snap = step.engineSnapshot;
    if (!snap) return;
    useEngineStore.setState({
      engineState: cloneEngineState(snap),
      operationLog: cloneLog(step.operationLogSnapshot),
    });
    if (step.annotations.length > 0) {
      useAnnotationStore.getState().importAnnotations(step.annotations);
    }
  };

  const runReplayStep = () => {
    const { activeRecording, replayIndex, replayNextStep, isReplaying } = get();
    if (!activeRecording || !isReplaying) return;
    if (replayIndex >= activeRecording.steps.length - 1) {
      replayNextStep();
      get().stopReplay();
      return;
    }
    replayNextStep();
  };

  return {
    activeRecording: null,
    savedRecordings: [],
    isRecording: false,
    isReplaying: false,
    replayIndex: -1,
    replaySpeed: 1,
    replayTimer: null,
    currentNarration: '',

    startRecording: () => {
      const collab = useCollabStore.getState();
      const annStore = useAnnotationStore.getState();
      const engine = useEngineStore.getState();

      if (!collab.isInSession || !collab.isPresenter()) return;

      const engineSnapshot = cloneEngineState(engine.engineState);
      if (!engineSnapshot) return;

      const recording: DemoRecording = {
        id: generateId('rec'),
        sessionId: collab.sessionId || 'local',
        sessionName: collab.sessionName,
        startTime: Date.now(),
        endTime: null,
        steps: [
          {
            stepNumber: 0,
            engineSnapshot,
            operationLogSnapshot: cloneLog(engine.operationLog),
            operatorId: collab.userId,
            operatorName: collab.userName,
            timestamp: Date.now(),
            annotations: annStore.exportAnnotations(),
            controlAction: 'initialize',
          },
        ],
        hostId: collab.userId,
        hostName: collab.userName,
        annotations: [],
        isComplete: false,
      };

      if (collab.isInSession) {
        const mb = collab.messageBus;
        if (mb) mb.send('recording_started', { recordingId: recording.id }, collab.userName);
      }

      set({
        activeRecording: recording,
        isRecording: true,
        currentNarration: '',
      });
    },

    stopRecording: () => {
      const recording = get().activeRecording;
      if (!recording) return null;
      const collab = useCollabStore.getState();
      const annStore = useAnnotationStore.getState();

      const finalRecording: DemoRecording = {
        ...recording,
        endTime: Date.now(),
        isComplete: true,
        annotations: annStore.exportAnnotations(),
      };

      if (collab.isInSession) {
        const mb = collab.messageBus;
        if (mb) mb.send('recording_stopped', { recordingId: finalRecording.id }, collab.userName);
      }

      set((s) => ({
        activeRecording: null,
        isRecording: false,
        savedRecordings: [finalRecording, ...s.savedRecordings].slice(0, 50),
      }));

      get().saveRecordingToStorage();
      return finalRecording;
    },

    recordStep: (action, narration) => {
      const recording = get().activeRecording;
      if (!recording || !get().isRecording) return;
      const collab = useCollabStore.getState();
      const engine = useEngineStore.getState();
      const annStore = useAnnotationStore.getState();

      const engineSnapshot = cloneEngineState(engine.engineState);
      if (!engineSnapshot) return;

      const stepRecord: DemoStepRecord = {
        stepNumber: recording.steps.length,
        engineSnapshot,
        operationLogSnapshot: cloneLog(engine.operationLog),
        operatorId: collab.userId,
        operatorName: collab.userName,
        timestamp: Date.now(),
        annotations: annStore.exportAnnotations(),
        controlAction: action,
        narrationText: narration || get().currentNarration || undefined,
      };

      set((s) => {
        if (!s.activeRecording) return s;
        return {
          activeRecording: {
            ...s.activeRecording,
            steps: [...s.activeRecording.steps, stepRecord],
          },
          currentNarration: '',
        };
      });
    },

    addNarration: (text) => set({ currentNarration: text }),

    saveRecordingToStorage: () => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(get().savedRecordings.map((r) => ({
            ...r,
            steps: r.steps.slice(0, 200),
          })))
        );
      } catch (e) {
        console.warn('Failed to save recordings:', e);
      }
    },

    loadRecordingsFromStorage: () => {
      try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
          const parsed = JSON.parse(data) as DemoRecording[];
          set({ savedRecordings: parsed });
        }
      } catch (e) {
        console.warn('Failed to load recordings:', e);
      }
    },

    deleteSavedRecording: (id) => {
      set((s) => ({
        savedRecordings: s.savedRecordings.filter((r) => r.id !== id),
      }));
      get().saveRecordingToStorage();
    },

    clearSavedRecordings: () => {
      set({ savedRecordings: [] });
      localStorage.removeItem(STORAGE_KEY);
    },

    startReplay: (recording) => {
      if (!recording || recording.steps.length === 0) return;
      useAnnotationStore.getState().clearAll();
      set({
        isReplaying: true,
        replayIndex: -1,
        replayTimer: null,
      });
      get().replayNextStep();

      const interval = Math.max(300, 1500 / get().replaySpeed);
      const timer = setInterval(() => {
        if (get().isReplaying) runReplayStep();
      }, interval);
      set({ replayTimer: timer });
    },

    pauseReplay: () => {
      const timer = get().replayTimer;
      if (timer) clearInterval(timer);
      set({ isReplaying: false, replayTimer: null });
    },

    resumeReplay: () => {
      if (get().isReplaying) return;
      set({ isReplaying: true });
      const interval = Math.max(300, 1500 / get().replaySpeed);
      const timer = setInterval(() => {
        if (get().isReplaying) runReplayStep();
      }, interval);
      set({ replayTimer: timer });
    },

    stopReplay: () => {
      const timer = get().replayTimer;
      if (timer) clearInterval(timer);
      replayUnsub.forEach((u) => u());
      replayUnsub = [];
      set({
        isReplaying: false,
        replayIndex: -1,
        replayTimer: null,
      });
    },

    setReplaySpeed: (speed) => {
      set({ replaySpeed: Math.max(0.25, Math.min(4, speed)) });
      if (get().isReplaying && get().replayTimer) {
        get().pauseReplay();
        get().resumeReplay();
      }
    },

    replayNextStep: () => {
      const recording = get().activeRecording || get().savedRecordings[0];
      if (!recording) return false;
      const nextIdx = get().replayIndex + 1;
      if (nextIdx >= recording.steps.length) return false;
      const step = recording.steps[nextIdx];
      applyStepToEngine(step);
      set({ replayIndex: nextIdx });
      return true;
    },

    replayPrevStep: () => {
      const recording = get().activeRecording || get().savedRecordings[0];
      if (!recording) return false;
      const prevIdx = get().replayIndex - 1;
      if (prevIdx < 0) return false;
      const step = recording.steps[prevIdx];
      applyStepToEngine(step);
      set({ replayIndex: prevIdx });
      return true;
    },

    replayGotoStep: (index) => {
      const recording = get().activeRecording || get().savedRecordings[0];
      if (!recording) return;
      const targetIdx = Math.max(0, Math.min(recording.steps.length - 1, index));
      const step = recording.steps[targetIdx];
      applyStepToEngine(step);
      set({ replayIndex: targetIdx });
    },

    exportRecordingAsJSON: (recording) => {
      return JSON.stringify(recording, null, 2);
    },

    importRecordingFromJSON: (json) => {
      try {
        const parsed = JSON.parse(json) as DemoRecording;
        if (!parsed.id || !parsed.steps) return null;
        const imported: DemoRecording = {
          ...parsed,
          id: generateId('rec'),
          steps: parsed.steps.map((s, i) => ({ ...s, stepNumber: i })),
        };
        set((s) => ({
          savedRecordings: [imported, ...s.savedRecordings].slice(0, 50),
        }));
        get().saveRecordingToStorage();
        return imported;
      } catch (e) {
        console.error('Import failed:', e);
        return null;
      }
    },

    handleIncomingRecordingMessages: () => {
      const collab = useCollabStore.getState();
      if (!collab.isInSession) return () => {};
      const mb = collab.messageBus;
      if (!mb) return () => {};

      const unsub1 = mb.on('recording_started', (msg: CollabMessage<{ recordingId: string }>) => {
        console.log('[Recording] Started by host:', msg.payload.recordingId);
      });
      const unsub2 = mb.on('recording_stopped', (msg: CollabMessage<{ recordingId: string }>) => {
        console.log('[Recording] Stopped by host:', msg.payload.recordingId);
      });

      replayUnsub = [unsub1, unsub2];
      return () => {
        replayUnsub.forEach((u) => u());
        replayUnsub = [];
      };
    },
  };
});
