import { create } from 'zustand';
import type {
  Participant,
  UserRole,
  SessionStatus,
  CollabMessage,
  StateSyncPayload,
  StateHashPayload,
  StateMismatchPayload,
  SessionStatusPayload,
  ControlPayload,
  EngineConfig,
} from '@/types';
import { MessageBus } from '@/collaboration/MessageBus';
import {
  generateId,
  randomColor,
  generateSessionCode,
  getLocalUserId,
  getLocalUserName,
  saveLocalUserName,
} from '@/collaboration/utils';

export interface CollabStoreState {
  isInSession: boolean;
  sessionId: string | null;
  sessionCode: string | null;
  sessionName: string;
  sessionStatus: SessionStatus;
  userId: string;
  userName: string;
  userRole: UserRole;
  participants: Participant[];
  currentPresenterId: string | null;
  messageBus: MessageBus | null;
  sequenceNumber: number;
  lastStateHash: string | null;
  mismatchError: string | null;
  errorAlert: { message: string; timestamp: number } | null;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'out_of_sync';
  isHostControlLocked: boolean;

  createSession: (name: string, presenterName?: string) => { sessionId: string; sessionCode: string };
  joinSession: (code: string, participantName?: string) => boolean;
  leaveSession: () => void;
  updateUserName: (name: string) => void;
  setSessionStatus: (status: SessionStatus, reason?: string) => void;
  transferPresenter: (participantId: string) => void;
  canControl: () => boolean;
  isPresenter: () => boolean;
  getCurrentPresenter: () => Participant | undefined;
  sendControlCommand: (type: 'control_step_forward' | 'control_step_back' | 'control_reset' | 'control_continuous_start' | 'control_continuous_stop', payload?: ControlPayload) => void;
  sendInitialize: (config: Partial<EngineConfig>) => void;
  sendStateSync: (payload: Omit<StateSyncPayload, 'sequence'>) => void;
  sendStateHash: (payload: StateHashPayload) => void;
  sendStateMismatch: (payload: StateMismatchPayload) => void;
  sendErrorAlert: (message: string) => void;
  clearMismatchError: () => void;
  clearErrorAlert: () => void;
  setSyncStatus: (status: CollabStoreState['syncStatus']) => void;
  setLastStateHash: (hash: string | null) => void;
  updateParticipantsFromMessage: (participant: Participant) => void;
  handleIncomingControl: (callback: (type: string, payload?: ControlPayload) => void) => () => void;
  handleIncomingStateSync: (callback: (payload: StateSyncPayload) => void) => () => void;
  handleIncomingStateMismatch: (callback: (payload: StateMismatchPayload) => void) => () => void;
}

const heartbeatInterval = 15000;
const participantTimeout = 45000;

export const useCollabStore = create<CollabStoreState>((set, get) => {
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let cleanupHandlers: Array<() => void> = [];

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const cleanupSession = () => {
    stopHeartbeat();
    const mb = get().messageBus;
    if (mb) {
      mb.disconnect();
    }
    for (const fn of cleanupHandlers) {
      try { fn(); } catch { /* ignore */ }
    }
    cleanupHandlers = [];
  };

  const sendParticipantUpdate = () => {
    const mb = get().messageBus;
    if (!mb) return;
    const { userId, userName, userRole, lastStateHash } = get();
    const participant: Participant = {
      id: userId,
      name: userName,
      role: userRole,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      avatarColor: randomColor(),
      stateHash: lastStateHash,
    };
    mb.send('participant_updated', participant, userName);
  };

  return {
    isInSession: false,
    sessionId: null,
    sessionCode: null,
    sessionName: '',
    sessionStatus: 'waiting',
    userId: getLocalUserId(),
    userName: getLocalUserName(),
    userRole: 'audience',
    participants: [],
    currentPresenterId: null,
    messageBus: null,
    sequenceNumber: 0,
    lastStateHash: null,
    mismatchError: null,
    errorAlert: null,
    syncStatus: 'idle',
    isHostControlLocked: false,

    createSession: (name, presenterName) => {
      cleanupSession();
      const sessionId = generateId('sess');
      const sessionCode = generateSessionCode();
      const userId = get().userId;
      const finalName = presenterName || get().userName;
      const avatarColor = randomColor();

      saveLocalUserName(finalName);

      const hostParticipant: Participant = {
        id: userId,
        name: finalName,
        role: 'host',
        joinedAt: Date.now(),
        lastSeen: Date.now(),
        avatarColor,
        stateHash: null,
      };

      const mb = new MessageBus(sessionId, userId);
      mb.connect();

      const unsub1 = mb.on('participant_joined', (msg: CollabMessage<Participant>) => {
        const newP = msg.payload;
        set((s) => {
          const exists = s.participants.find((p) => p.id === newP.id);
          if (exists) return s;
          const updated = [...s.participants, { ...newP, lastSeen: Date.now() }];
          return { participants: updated };
        });
        sendParticipantUpdate();
        const state = get();
        mb.send('session_status_changed', { status: state.sessionStatus } as SessionStatusPayload, finalName);
      });

      const unsub2 = mb.on('participant_updated', (msg: CollabMessage<Participant>) => {
        const updatedP = msg.payload;
        set((s) => ({
          participants: s.participants.map((p) =>
            p.id === updatedP.id ? { ...updatedP, lastSeen: Date.now() } : p
          ),
        }));
      });

      const unsub3 = mb.on('participant_left', (msg: CollabMessage<{ id: string }>) => {
        set((s) => ({
          participants: s.participants.filter((p) => p.id !== msg.payload.id),
        }));
      });

      const unsub4 = mb.on('presenter_changed', (msg: CollabMessage<{ presenterId: string }>) => {
        const newPresenterId = msg.payload.presenterId;
        set((s) => ({
          currentPresenterId: newPresenterId,
          userRole: newPresenterId === s.userId ? 'host' : 'audience',
          participants: s.participants.map((p) => ({
            ...p,
            role: p.id === newPresenterId ? 'host' : 'audience',
          })),
        }));
      });

      const unsub5 = mb.on('session_status_changed', (msg: CollabMessage<SessionStatusPayload>) => {
        set({ sessionStatus: msg.payload.status });
      });

      cleanupHandlers = [unsub1, unsub2, unsub3, unsub4, unsub5];

      set({
        isInSession: true,
        sessionId,
        sessionCode,
        sessionName: name || '差分机协同演示',
        sessionStatus: 'waiting',
        userId,
        userName: finalName,
        userRole: 'host',
        participants: [hostParticipant],
        currentPresenterId: userId,
        messageBus: mb,
        sequenceNumber: 0,
        mismatchError: null,
        errorAlert: null,
        syncStatus: 'idle',
        isHostControlLocked: false,
      });

      mb.send('session_created', { id: sessionId, code: sessionCode, name }, finalName);

      heartbeatTimer = setInterval(() => {
        sendParticipantUpdate();
        set((s) => ({
          participants: s.participants.filter(
            (p) => Date.now() - p.lastSeen < participantTimeout || p.id === s.userId
          ),
        }));
      }, heartbeatInterval);

      return { sessionId, sessionCode };
    },

    joinSession: (code, participantName) => {
      if (!code || code.length < 4) return false;
      cleanupSession();
      const sessionId = code;
      const userId = get().userId;
      const finalName = participantName || get().userName;
      const avatarColor = randomColor();

      saveLocalUserName(finalName);

      const newParticipant: Participant = {
        id: userId,
        name: finalName,
        role: 'audience',
        joinedAt: Date.now(),
        lastSeen: Date.now(),
        avatarColor,
        stateHash: null,
      };

      const mb = new MessageBus(sessionId, userId);
      mb.connect();

      const unsub1 = mb.on('participant_updated', (msg: CollabMessage<Participant>) => {
        const updatedP = msg.payload;
        set((s) => {
          const exists = s.participants.find((p) => p.id === updatedP.id);
          if (!exists) {
            return { participants: [...s.participants, { ...updatedP, lastSeen: Date.now() }] };
          }
          return {
            participants: s.participants.map((p) =>
              p.id === updatedP.id ? { ...updatedP, lastSeen: Date.now() } : p
            ),
          };
        });
      });

      const unsub2 = mb.on('participant_left', (msg: CollabMessage<{ id: string }>) => {
        set((s) => ({
          participants: s.participants.filter((p) => p.id !== msg.payload.id),
        }));
      });

      const unsub3 = mb.on('presenter_changed', (msg: CollabMessage<{ presenterId: string }>) => {
        const newPresenterId = msg.payload.presenterId;
        set((s) => ({
          currentPresenterId: newPresenterId,
          userRole: newPresenterId === s.userId ? 'host' : 'audience',
        }));
      });

      const unsub4 = mb.on('session_status_changed', (msg: CollabMessage<SessionStatusPayload>) => {
        set({ sessionStatus: msg.payload.status });
      });

      const unsub5 = mb.on('state_hash_check', (msg: CollabMessage<StateHashPayload>) => {
        set((s) => ({
          participants: s.participants.map((p) =>
            p.id === msg.payload.participantId
              ? { ...p, stateHash: msg.payload.stateHash }
              : p
          ),
        }));
      });

      const unsub6 = mb.on('state_mismatch', (msg: CollabMessage<StateMismatchPayload>) => {
        set({
          mismatchError: `步骤 ${msg.payload.stepNumber}: 状态不一致（由 ${msg.payload.detectedBy} 检测）`,
          sessionStatus: 'error',
          syncStatus: 'out_of_sync',
        });
      });

      const unsub7 = mb.on('error_alert', (msg: CollabMessage<{ message: string }>) => {
        set({
          errorAlert: { message: msg.payload.message, timestamp: Date.now() },
        });
      });

      cleanupHandlers = [unsub1, unsub2, unsub3, unsub4, unsub5, unsub6, unsub7];

      set({
        isInSession: true,
        sessionId,
        sessionCode: code,
        sessionName: '差分机协同演示',
        sessionStatus: 'waiting',
        userId,
        userName: finalName,
        userRole: 'audience',
        participants: [newParticipant],
        currentPresenterId: null,
        messageBus: mb,
        sequenceNumber: 0,
        mismatchError: null,
        errorAlert: null,
        syncStatus: 'idle',
        isHostControlLocked: false,
      });

      mb.send('participant_joined', newParticipant, finalName);

      heartbeatTimer = setInterval(() => {
        sendParticipantUpdate();
      }, heartbeatInterval);

      return true;
    },

    leaveSession: () => {
      const mb = get().messageBus;
      const userId = get().userId;
      const userName = get().userName;
      if (mb) {
        mb.send('participant_left', { id: userId }, userName);
      }
      cleanupSession();
      set({
        isInSession: false,
        sessionId: null,
        sessionCode: null,
        sessionName: '',
        sessionStatus: 'waiting',
        userRole: 'audience',
        participants: [],
        currentPresenterId: null,
        messageBus: null,
        sequenceNumber: 0,
        mismatchError: null,
        errorAlert: null,
        syncStatus: 'idle',
      });
    },

    updateUserName: (name) => {
      if (!name.trim()) return;
      saveLocalUserName(name);
      set({ userName: name });
      sendParticipantUpdate();
    },

    setSessionStatus: (status, reason) => {
      const mb = get().messageBus;
      if (!mb || !get().canControl()) return;
      set({ sessionStatus: status });
      mb.send('session_status_changed', { status, reason } as SessionStatusPayload, get().userName);
    },

    transferPresenter: (participantId) => {
      const mb = get().messageBus;
      if (!mb || !get().isPresenter()) return;
      mb.send(
        'presenter_changed',
        { presenterId: participantId },
        get().userName
      );
      set((s) => ({
        currentPresenterId: participantId,
        userRole: participantId === s.userId ? 'host' : 'audience',
        participants: s.participants.map((p) => ({
          ...p,
          role: p.id === participantId ? 'host' : 'audience',
        })),
      }));
    },

    canControl: () => {
      const { isPresenter, isHostControlLocked, sessionStatus } = get();
      if (!isPresenter()) return false;
      if (isHostControlLocked) return false;
      if (sessionStatus === 'error' || sessionStatus === 'ended') return false;
      return true;
    },

    isPresenter: () => {
      const { userId, currentPresenterId } = get();
      return currentPresenterId === userId;
    },

    getCurrentPresenter: () => {
      const { participants, currentPresenterId } = get();
      return participants.find((p) => p.id === currentPresenterId);
    },

    sendControlCommand: (type, payload) => {
      const mb = get().messageBus;
      if (!mb || !get().canControl()) return;
      set({ sessionStatus: type.includes('stop') || type.includes('reset') ? 'paused' : 'running' });
      mb.send(type, payload || {}, get().userName);
    },

    sendInitialize: (config) => {
      const mb = get().messageBus;
      if (!mb || !get().canControl()) return;
      set({ sessionStatus: 'running', sequenceNumber: 0 });
      mb.send('control_initialize', { config } as ControlPayload, get().userName);
    },

    sendStateSync: (payload) => {
      const mb = get().messageBus;
      if (!mb) return;
      set((s) => ({ sequenceNumber: s.sequenceNumber + 1 }));
      const fullPayload: StateSyncPayload = {
        ...payload,
        sequence: get().sequenceNumber,
      };
      mb.send('state_sync', fullPayload, get().userName);
    },

    sendStateHash: (payload) => {
      const mb = get().messageBus;
      if (!mb) return;
      mb.send('state_hash_check', payload, get().userName);
    },

    sendStateMismatch: (payload) => {
      const mb = get().messageBus;
      if (!mb) return;
      mb.send('state_mismatch', payload, get().userName);
    },

    sendErrorAlert: (message) => {
      const mb = get().messageBus;
      if (!mb) return;
      mb.send('error_alert', { message }, get().userName);
    },

    clearMismatchError: () => set({ mismatchError: null, syncStatus: 'idle' }),
    clearErrorAlert: () => set({ errorAlert: null }),
    setSyncStatus: (status) => set({ syncStatus: status }),
    setLastStateHash: (hash) => set({ lastStateHash: hash }),

    updateParticipantsFromMessage: (participant) => {
      set((s) => {
        const exists = s.participants.find((p) => p.id === participant.id);
        if (!exists) {
          return { participants: [...s.participants, participant] };
        }
        return {
          participants: s.participants.map((p) =>
            p.id === participant.id ? participant : p
          ),
        };
      });
    },

    handleIncomingControl: (callback) => {
      const mb = get().messageBus;
      if (!mb) return () => {};
      const types: Array<'control_step_forward' | 'control_step_back' | 'control_reset' | 'control_continuous_start' | 'control_continuous_stop' | 'control_initialize'> = [
        'control_step_forward',
        'control_step_back',
        'control_reset',
        'control_continuous_start',
        'control_continuous_stop',
        'control_initialize',
      ];
      const unsubs = types.map((t) =>
        mb.on(t, (msg: CollabMessage<ControlPayload>) => callback(t, msg.payload))
      );
      return () => unsubs.forEach((u) => u());
    },

    handleIncomingStateSync: (callback) => {
      const mb = get().messageBus;
      if (!mb) return () => {};
      return mb.on('state_sync', (msg: CollabMessage<StateSyncPayload>) =>
        callback(msg.payload)
      );
    },

    handleIncomingStateMismatch: (callback) => {
      const mb = get().messageBus;
      if (!mb) return () => {};
      return mb.on('state_mismatch', (msg: CollabMessage<StateMismatchPayload>) =>
        callback(msg.payload)
      );
    },
  };
});
