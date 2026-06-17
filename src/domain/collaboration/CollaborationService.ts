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
  SessionInfoPayload,
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
import { StateMachine, COLLABORATION_TRANSITIONS } from '../core/StateMachine';
import type { CollaborationServiceState, ISnapshot } from '../core/types';
import { globalEventBus } from '../core/EventBus';

const ACTIVE_SESSIONS_KEY = 'diff_engine_active_sessions';
const SESSION_TIMEOUT = 60000;
const HEARTBEAT_INTERVAL = 15000;
const PARTICIPANT_TIMEOUT = 45000;

interface ActiveSessionEntry {
  id: string;
  code: string;
  name: string;
  hostId: string;
  hostName: string;
  createdAt: number;
  lastHeartbeat: number;
  participantCount: number;
}

type CollabStatus =
  | 'disconnected'
  | 'waiting'
  | 'running'
  | 'paused'
  | 'error'
  | 'ended';
type CollabEvent =
  | 'create'
  | 'join'
  | 'leave'
  | 'start'
  | 'pause'
  | 'resume'
  | 'mismatch'
  | 'end';

function getActiveSessions(): Map<string, ActiveSessionEntry> {
  try {
    const data = localStorage.getItem(ACTIVE_SESSIONS_KEY);
    if (!data) return new Map();
    const arr = JSON.parse(data) as ActiveSessionEntry[];
    const now = Date.now();
    const filtered = arr.filter((s) => now - s.lastHeartbeat < SESSION_TIMEOUT);
    return new Map(filtered.map((s) => [s.code, s]));
  } catch {
    return new Map();
  }
}

function saveActiveSessions(sessions: Map<string, ActiveSessionEntry>) {
  try {
    const arr = Array.from(sessions.values());
    localStorage.setItem(ACTIVE_SESSIONS_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

function registerActiveSession(entry: ActiveSessionEntry) {
  const sessions = getActiveSessions();
  sessions.set(entry.code, entry);
  saveActiveSessions(sessions);
}

function unregisterActiveSession(code: string) {
  const sessions = getActiveSessions();
  sessions.delete(code);
  saveActiveSessions(sessions);
}

function updateActiveSessionHeartbeat(code: string, participantCount: number) {
  const sessions = getActiveSessions();
  const entry = sessions.get(code);
  if (entry) {
    entry.lastHeartbeat = Date.now();
    entry.participantCount = participantCount;
    sessions.set(code, entry);
    saveActiveSessions(sessions);
  }
}

export function isSessionCodeValid(code: string): boolean {
  const sessions = getActiveSessions();
  return sessions.has(code);
}

export function getActiveSessionInfo(code: string): ActiveSessionEntry | null {
  const sessions = getActiveSessions();
  return sessions.get(code) || null;
}

type StateListener = (state: CollaborationServiceState) => void;
type ControlCommandCallback = (type: string, payload?: ControlPayload) => void;
type StateSyncCallback = (payload: StateSyncPayload) => void;
type MismatchCallback = (payload: StateMismatchPayload) => void;

export class CollaborationService
  implements ISnapshot<CollaborationServiceState>
{
  private _stateMachine: StateMachine<CollabStatus, CollabEvent>;
  private _isInSession: boolean = false;
  private _sessionId: string | null = null;
  private _sessionCode: string | null = null;
  private _sessionName: string = '';
  private _userId: string;
  private _userName: string;
  private _userRole: UserRole = 'audience';
  private _participants: Participant[] = [];
  private _currentPresenterId: string | null = null;
  private _messageBus: MessageBus | null = null;
  private _sequenceNumber: number = 0;
  private _lastStateHash: string | null = null;
  private _mismatchError: string | null = null;
  private _errorAlert: { message: string; timestamp: number } | null = null;
  private _syncStatus: 'idle' | 'syncing' | 'synced' | 'out_of_sync' = 'idle';
  private _isHostControlLocked: boolean = false;

  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _cleanupHandlers: Array<() => void> = [];
  private _stateListeners: Set<StateListener> = new Set();
  private _controlCallbacks: Set<ControlCommandCallback> = new Set();
  private _stateSyncCallbacks: Set<StateSyncCallback> = new Set();
  private _mismatchCallbacks: Set<MismatchCallback> = new Set();

  constructor() {
    this._userId = getLocalUserId();
    this._userName = getLocalUserName();
    this._stateMachine = new StateMachine<CollabStatus, CollabEvent>(
      'disconnected',
      COLLABORATION_TRANSITIONS
    );
  }

  get state(): CollaborationServiceState {
    return {
      isInSession: this._isInSession,
      sessionId: this._sessionId,
      sessionCode: this._sessionCode,
      sessionName: this._sessionName,
      status: this._stateMachine.currentState,
      userId: this._userId,
      userName: this._userName,
      userRole: this._userRole,
      participants: JSON.parse(JSON.stringify(this._participants)),
      currentPresenterId: this._currentPresenterId,
      syncStatus: this._syncStatus,
      mismatchError: this._mismatchError,
    };
  }

  get isInSession(): boolean {
    return this._isInSession;
  }

  get sessionCode(): string | null {
    return this._sessionCode;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  get userId(): string {
    return this._userId;
  }

  get userName(): string {
    return this._userName;
  }

  get messageBus(): MessageBus | null {
    return this._messageBus;
  }

  get participants(): Participant[] {
    return JSON.parse(JSON.stringify(this._participants));
  }

  get currentPresenterId(): string | null {
    return this._currentPresenterId;
  }

  get syncStatus(): 'idle' | 'syncing' | 'synced' | 'out_of_sync' {
    return this._syncStatus;
  }

  get mismatchError(): string | null {
    return this._mismatchError;
  }

  get errorAlert(): { message: string; timestamp: number } | null {
    return this._errorAlert;
  }

  get sequenceNumber(): number {
    return this._sequenceNumber;
  }

  subscribeState(listener: StateListener): () => void {
    this._stateListeners.add(listener);
    return () => this._stateListeners.delete(listener);
  }

  private _notify(): void {
    const snap = this.state;
    this._stateListeners.forEach((l) => {
      try {
        l(snap);
      } catch (e) {
        console.error('[CollabService] State listener error:', e);
      }
    });
  }

  isPresenter(): boolean {
    return this._currentPresenterId === this._userId;
  }

  canControl(): boolean {
    if (!this.isPresenter()) return false;
    if (this._isHostControlLocked) return false;
    const status = this._stateMachine.currentState;
    if (status === 'error' || status === 'ended') return false;
    return true;
  }

  getCurrentPresenter(): Participant | undefined {
    return this._participants.find((p) => p.id === this._currentPresenterId);
  }

  updateUserName(name: string): void {
    if (!name.trim()) return;
    saveLocalUserName(name);
    this._userName = name;
    this._sendParticipantUpdate();
    this._notify();
  }

  setLastStateHash(hash: string | null): void {
    this._lastStateHash = hash;
  }

  setSyncStatus(status: 'idle' | 'syncing' | 'synced' | 'out_of_sync'): void {
    this._syncStatus = status;
    this._notify();
  }

  clearMismatchError(): void {
    this._mismatchError = null;
    this._syncStatus = 'idle';
    this._notify();
  }

  clearErrorAlert(): void {
    this._errorAlert = null;
  }

  createSession(
    name: string,
    presenterName?: string
  ): { sessionId: string; sessionCode: string } {
    this._cleanupSession();
    const sessionId = generateId('sess');
    const sessionCode = generateSessionCode();
    const finalName = presenterName || this._userName;
    const sessionName = name || '差分机协同演示';
    const avatarColor = randomColor();

    saveLocalUserName(finalName);
    this._userName = finalName;

    const hostParticipant: Participant = {
      id: this._userId,
      name: finalName,
      role: 'host',
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      avatarColor,
      stateHash: null,
    };

    const mb = new MessageBus(sessionId, this._userId);
    mb.connect();

    this._setupMessageBusHandlers(mb);

    this._isInSession = true;
    this._sessionId = sessionId;
    this._sessionCode = sessionCode;
    this._sessionName = sessionName;
    this._userRole = 'host';
    this._participants = [hostParticipant];
    this._currentPresenterId = this._userId;
    this._messageBus = mb;
    this._sequenceNumber = 0;
    this._mismatchError = null;
    this._errorAlert = null;
    this._syncStatus = 'idle';
    this._isHostControlLocked = false;

    this._stateMachine.transition('create');

    registerActiveSession({
      id: sessionId,
      code: sessionCode,
      name: sessionName,
      hostId: this._userId,
      hostName: finalName,
      createdAt: Date.now(),
      lastHeartbeat: Date.now(),
      participantCount: 1,
    });

    mb.send('session_created', { id: sessionId, code: sessionCode, name: sessionName }, finalName);

    this._heartbeatTimer = setInterval(() => {
      this._sendParticipantUpdate();
      this._participants = this._participants.filter(
        (p) => Date.now() - p.lastSeen < PARTICIPANT_TIMEOUT || p.id === this._userId
      );
      if (this._sessionCode) {
        updateActiveSessionHeartbeat(this._sessionCode, this._participants.length);
      }
      this._notify();
    }, HEARTBEAT_INTERVAL);

    globalEventBus.publish({
      type: 'collab.session.created',
      source: 'collaboration',
      payload: { sessionId, sessionCode, sessionName },
    });

    this._notify();
    return { sessionId, sessionCode };
  }

  joinSession(
    code: string,
    participantName?: string
  ): { success: boolean; error?: string; sessionName?: string } {
    if (!code || code.trim().length < 4) {
      return { success: false, error: '邀请码格式不正确（至少4位）' };
    }
    const cleanCode = code.trim().toUpperCase();

    const activeInfo = getActiveSessionInfo(cleanCode);
    if (!activeInfo) {
      return { success: false, error: '未找到该会话，请检查邀请码是否正确' };
    }

    this._cleanupSession();
    const sessionId = cleanCode;
    const finalName = participantName || this._userName;
    const avatarColor = randomColor();

    saveLocalUserName(finalName);
    this._userName = finalName;

    const newParticipant: Participant = {
      id: this._userId,
      name: finalName,
      role: 'audience',
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      avatarColor,
      stateHash: null,
    };

    const mb = new MessageBus(sessionId, this._userId);
    mb.connect();

    this._setupMessageBusHandlersForAudience(mb);

    this._isInSession = true;
    this._sessionId = sessionId;
    this._sessionCode = cleanCode;
    this._sessionName = activeInfo.name;
    this._userRole = 'audience';
    this._participants = [newParticipant];
    this._currentPresenterId = activeInfo.hostId;
    this._messageBus = mb;
    this._sequenceNumber = 0;
    this._mismatchError = null;
    this._errorAlert = null;
    this._syncStatus = 'idle';
    this._isHostControlLocked = false;

    this._stateMachine.transition('join');

    mb.send('participant_joined', newParticipant, finalName);
    mb.send('session_info_request', { sessionId }, finalName);
    updateActiveSessionHeartbeat(cleanCode, activeInfo.participantCount + 1);

    this._heartbeatTimer = setInterval(() => {
      this._sendParticipantUpdate();
    }, HEARTBEAT_INTERVAL);

    globalEventBus.publish({
      type: 'collab.session.joined',
      source: 'collaboration',
      payload: { sessionId, sessionCode: cleanCode },
    });

    this._notify();
    return { success: true, sessionName: activeInfo.name };
  }

  leaveSession(): void {
    const mb = this._messageBus;
    const sessionCode = this._sessionCode;
    if (mb) {
      mb.send('participant_left', { id: this._userId }, this._userName);
    }
    if (this.isPresenter() && sessionCode) {
      unregisterActiveSession(sessionCode);
    }
    this._cleanupSession();

    this._isInSession = false;
    this._sessionId = null;
    this._sessionCode = null;
    this._sessionName = '';
    this._userRole = 'audience';
    this._participants = [];
    this._currentPresenterId = null;
    this._messageBus = null;
    this._sequenceNumber = 0;
    this._mismatchError = null;
    this._errorAlert = null;
    this._syncStatus = 'idle';

    this._stateMachine.transition('leave');

    globalEventBus.publish({
      type: 'collab.session.left',
      source: 'collaboration',
      payload: {},
    });

    this._notify();
  }

  setSessionStatus(status: SessionStatus, reason?: string): void {
    const mb = this._messageBus;
    if (!mb || !this.canControl()) return;
    this._stateMachine.forceSetState(status as CollabStatus);
    mb.send(
      'session_status_changed',
      { status, reason } as SessionStatusPayload,
      this._userName
    );
    this._notify();
  }

  transferPresenter(participantId: string): void {
    const mb = this._messageBus;
    if (!mb || !this.isPresenter()) return;
    mb.send(
      'presenter_changed',
      { presenterId: participantId },
      this._userName
    );
    this._currentPresenterId = participantId;
    this._userRole = participantId === this._userId ? 'host' : 'audience';
    this._participants = this._participants.map((p) => ({
      ...p,
      role: p.id === participantId ? 'host' : 'audience',
    }));
    this._notify();
  }

  sendControlCommand(
    type:
      | 'control_step_forward'
      | 'control_step_back'
      | 'control_reset'
      | 'control_continuous_start'
      | 'control_continuous_stop',
    payload?: ControlPayload
  ): void {
    const mb = this._messageBus;
 if (!mb || !this.canControl()) return;
    const status = this._stateMachine.currentState;
    const newStatus =
      type.includes('stop') || type.includes('reset') ? 'paused' : 'running';
    if (newStatus !== status) {
      this._stateMachine.forceSetState(newStatus as CollabStatus);
    }
    mb.send(type, payload || {}, this._userName);
    this._notify();
  }

  sendInitialize(config: Partial<EngineConfig>): void {
    const mb = this._messageBus;
    if (!mb || !this.canControl()) return;
    this._stateMachine.forceSetState('running');
    this._sequenceNumber = 0;
    mb.send('control_initialize', { config } as ControlPayload, this._userName);
    this._notify();
  }

  sendStateSync(payload: Omit<StateSyncPayload, 'sequence'>): void {
    const mb = this._messageBus;
    if (!mb) return;
    this._sequenceNumber += 1;
    const fullPayload: StateSyncPayload = {
      ...payload,
      sequence: this._sequenceNumber,
    };
    mb.send('state_sync', fullPayload, this._userName);
  }

  sendStateHash(payload: StateHashPayload): void {
    const mb = this._messageBus;
    if (!mb) return;
    mb.send('state_hash_check', payload, this._userName);
  }

  sendStateMismatch(payload: StateMismatchPayload): void {
    const mb = this._messageBus;
    if (!mb) return;
    mb.send('state_mismatch', payload, this._userName);
  }

  sendErrorAlert(message: string): void {
    const mb = this._messageBus;
    if (!mb) return;
    mb.send('error_alert', { message }, this._userName);
  }

  onControlCommand(callback: ControlCommandCallback): () => void {
    this._controlCallbacks.add(callback);
    return () => this._controlCallbacks.delete(callback);
  }

  onStateSync(callback: StateSyncCallback): () => void {
    this._stateSyncCallbacks.add(callback);
    return () => this._stateSyncCallbacks.delete(callback);
  }

  onStateMismatch(callback: MismatchCallback): () => void {
    this._mismatchCallbacks.add(callback);
    return () => this._mismatchCallbacks.delete(callback);
  }

  private _sendParticipantUpdate(): void {
    const mb = this._messageBus;
    if (!mb) return;
    const participant: Participant = {
      id: this._userId,
      name: this._userName,
      role: this._userRole,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      avatarColor: randomColor(),
      stateHash: this._lastStateHash,
    };
    mb.send('participant_updated', participant, this._userName);
  }

  private _sendSessionInfo(): void {
    const mb = this._messageBus;
    if (!mb) return;
    const info: SessionInfoPayload = {
      sessionId: this._sessionId || '',
      sessionCode: this._sessionCode || '',
      sessionName: this._sessionName,
      hostId: this._currentPresenterId || '',
      hostName: this.getCurrentPresenter()?.name || '',
      createdAt: Date.now(),
      participantCount: this._participants.length,
      currentStatus: this._stateMachine.currentState as SessionStatus,
    };
    mb.send('session_info', info, this._userName);
  }

  private _setupMessageBusHandlers(mb: MessageBus): void {
    const unsub1 = mb.on('participant_joined', (msg: CollabMessage<Participant>) => {
      const newP = msg.payload;
      const exists = this._participants.find((p) => p.id === newP.id);
      if (!exists) {
        this._participants = [...this._participants, { ...newP, lastSeen: Date.now() }];
        globalEventBus.publish({
          type: 'collab.participant.joined',
          source: 'collaboration',
          payload: { participant: newP },
        });
      }
      this._sendParticipantUpdate();
      this._sendSessionInfo();
      this._stateMachine.forceSetState('waiting');
      mb.send(
        'session_status_changed',
        { status: 'waiting' } as SessionStatusPayload,
        this._userName
      );
      this._notify();
    });

    const unsub2 = mb.on('participant_updated', (msg: CollabMessage<Participant>) => {
      const updatedP = msg.payload;
      this._participants = this._participants.map((p) =>
        p.id === updatedP.id ? { ...updatedP, lastSeen: Date.now() } : p
      );
      this._notify();
    });

    const unsub3 = mb.on('participant_left', (msg: CollabMessage<{ id: string }>) => {
      this._participants = this._participants.filter((p) => p.id !== msg.payload.id);
      if (this._sessionCode) {
        updateActiveSessionHeartbeat(this._sessionCode, this._participants.length - 1);
      }
      globalEventBus.publish({
        type: 'collab.participant.left',
        source: 'collaboration',
        payload: { participantId: msg.payload.id },
      });
      this._notify();
    });

    const unsub4 = mb.on(
      'presenter_changed',
      (msg: CollabMessage<{ presenterId: string }>) => {
        const newPresenterId = msg.payload.presenterId;
        this._currentPresenterId = newPresenterId;
        this._userRole = newPresenterId === this._userId ? 'host' : 'audience';
        this._participants = this._participants.map((p) => ({
          ...p,
          role: p.id === newPresenterId ? 'host' : 'audience',
        }));
        this._notify();
      }
    );

    const unsub5 = mb.on(
      'session_status_changed',
      (msg: CollabMessage<SessionStatusPayload>) => {
        this._stateMachine.forceSetState(msg.payload.status as CollabStatus);
        this._notify();
      }
    );

    const unsub6 = mb.on('session_info_request', () => {
      this._sendSessionInfo();
    });

    const unsubs = this._setupCommonControlHandlers(mb);

    this._cleanupHandlers = [unsub1, unsub2, unsub3, unsub4, unsub5, unsub6, ...unsubs];
  }

  private _setupMessageBusHandlersForAudience(mb: MessageBus): void {
    const unsub1 = mb.on('participant_updated', (msg: CollabMessage<Participant>) => {
      const updatedP = msg.payload;
      const exists = this._participants.find((p) => p.id === updatedP.id);
      if (!exists) {
        this._participants = [...this._participants, { ...updatedP, lastSeen: Date.now() }];
      } else {
        this._participants = this._participants.map((p) =>
          p.id === updatedP.id ? { ...updatedP, lastSeen: Date.now() } : p
        );
      }
      this._notify();
    });

    const unsub2 = mb.on('participant_left', (msg: CollabMessage<{ id: string }>) => {
      this._participants = this._participants.filter((p) => p.id !== msg.payload.id);
      this._notify();
    });

    const unsub3 = mb.on(
      'presenter_changed',
      (msg: CollabMessage<{ presenterId: string }>) => {
        const newPresenterId = msg.payload.presenterId;
        this._currentPresenterId = newPresenterId;
        this._userRole = newPresenterId === this._userId ? 'host' : 'audience';
        this._notify();
      }
    );

    const unsub4 = mb.on(
      'session_status_changed',
      (msg: CollabMessage<SessionStatusPayload>) => {
        this._stateMachine.forceSetState(msg.payload.status as CollabStatus);
        this._notify();
      }
    );

    const unsub5 = mb.on('state_hash_check', (msg: CollabMessage<StateHashPayload>) => {
      this._participants = this._participants.map((p) =>
        p.id === msg.payload.participantId
          ? { ...p, stateHash: msg.payload.stateHash }
          : p
      );
      this._notify();
    });

    const unsub6 = mb.on(
      'state_mismatch',
      (msg: CollabMessage<StateMismatchPayload>) => {
        this._mismatchError = `步骤 ${msg.payload.stepNumber}: 状态不一致（由 ${msg.payload.detectedBy} 检测）`;
        this._stateMachine.transition('mismatch');
        this._syncStatus = 'out_of_sync';
        this._mismatchCallbacks.forEach((cb) => cb(msg.payload));
        this._notify();
      }
    );

    const unsub7 = mb.on('error_alert', (msg: CollabMessage<{ message: string }>) => {
      this._errorAlert = { message: msg.payload.message, timestamp: Date.now() };
      this._notify();
    });

    const unsub8 = mb.on('session_info', (msg: CollabMessage<SessionInfoPayload>) => {
      const info = msg.payload;
      this._sessionName = info.sessionName;
      this._stateMachine.forceSetState(info.currentStatus as CollabStatus);
      this._notify();
    });

    const unsubs = this._setupCommonControlHandlers(mb);

    this._cleanupHandlers = [
      unsub1,
      unsub2,
      unsub3,
      unsub4,
      unsub5,
      unsub6,
      unsub7,
      unsub8,
      ...unsubs,
    ];
  }

  private _setupCommonControlHandlers(mb: MessageBus): Array<() => void> {
    const types: Array<
      | 'control_step_forward'
      | 'control_step_back'
      | 'control_reset'
      | 'control_continuous_start'
      | 'control_continuous_stop'
      | 'control_initialize'
    > = [
      'control_step_forward',
      'control_step_back',
      'control_reset',
      'control_continuous_start',
      'control_continuous_stop',
      'control_initialize',
    ];

    const unsubs = types.map((t) =>
      mb.on(t, (msg: CollabMessage<ControlPayload>) => {
        this._syncStatus = 'syncing';
        globalEventBus.publish({
          type: 'collab.control.received',
          source: 'collaboration',
          payload: { type: t, payload: msg.payload },
        });
        this._controlCallbacks.forEach((cb) => cb(t, msg.payload));
        this._notify();
      })
    );

    unsubs.push(
      mb.on('state_sync', (msg: CollabMessage<StateSyncPayload>) => {
        globalEventBus.publish({
          type: 'collab.state.sync.received',
          source: 'collaboration',
          payload: msg.payload,
        });
        this._stateSyncCallbacks.forEach((cb) => cb(msg.payload));
        this._syncStatus = 'synced';
        this._notify();
      })
    );

    return unsubs;
  }

  private _cleanupSession(): void {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    const mb = this._messageBus;
    if (mb) {
      mb.disconnect();
    }
    for (const fn of this._cleanupHandlers) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
    this._cleanupHandlers = [];
  }

  updateParticipantsFromMessage(participant: Participant): void {
    const exists = this._participants.find((p) => p.id === participant.id);
    if (!exists) {
      this._participants = [...this._participants, participant];
    } else {
      this._participants = this._participants.map((p) =>
        p.id === participant.id ? participant : p
      );
    }
    this._notify();
  }

  takeSnapshot(): CollaborationServiceState {
    return JSON.parse(JSON.stringify(this.state));
  }

  restoreSnapshot(snapshot: CollaborationServiceState): void {
    if (!this.canRestoreFrom(snapshot)) return;
    this._isInSession = snapshot.isInSession;
    this._sessionId = snapshot.sessionId;
    this._sessionCode = snapshot.sessionCode;
    this._sessionName = snapshot.sessionName;
    this._stateMachine.forceSetState(snapshot.status);
    this._userId = snapshot.userId;
    this._userName = snapshot.userName;
    this._userRole = snapshot.userRole;
    this._participants = JSON.parse(JSON.stringify(snapshot.participants));
    this._currentPresenterId = snapshot.currentPresenterId;
    this._syncStatus = snapshot.syncStatus;
    this._mismatchError = snapshot.mismatchError;
    this._notify();
  }

  canRestoreFrom(snapshot: CollaborationServiceState): boolean {
    return (
      snapshot && typeof snapshot === 'object' && 'isInSession' in snapshot
    );
  }

  destroy(): void {
    this._cleanupSession();
  }
}

export const collaborationService = new CollaborationService();
