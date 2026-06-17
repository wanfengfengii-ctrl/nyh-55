import { useEffect, useRef } from 'react';
import { useCollabStore } from '@/store/collabStore';
import { useEngineStore } from '@/store/engineStore';
import { useAnnotationStore } from '@/store/annotationStore';
import { useRecordingStore } from '@/store/recordingStore';

export default function CollaborationBridge() {
  const isInSession = useCollabStore((s) => s.isInSession);
  const userRole = useCollabStore((s) => s.userRole);
  const sessionId = useCollabStore((s) => s.sessionId);
  const handleIncomingControl = useCollabStore((s) => s.handleIncomingControl);
  const handleIncomingStateSync = useCollabStore((s) => s.handleIncomingStateSync);
  const handleIncomingStateMismatch = useCollabStore((s) => s.handleIncomingStateMismatch);
  const setSyncStatus = useCollabStore((s) => s.setSyncStatus);
  const clearMismatchError = useCollabStore((s) => s.clearMismatchError);
  const sendErrorAlert = useCollabStore((s) => s.sendErrorAlert);

  const handleRemoteControl = useEngineStore((s) => s.handleRemoteControl);
  const applyStateSync = useEngineStore((s) => s.applyStateSync);
  const broadcastState = useEngineStore((s) => s.broadcastState);
  const stopContinuous = useEngineStore((s) => s.stopContinuous);
  const setIsRunning = useEngineStore((s) => s.setIsRunning);
  const enableConsistencyChecks = useEngineStore((s) => s.enableConsistencyChecks);
  const disableConsistencyChecks = useEngineStore((s) => s.disableConsistencyChecks);
  const setSyncMode = useEngineStore((s) => s.setSyncMode);
  const setDisplayPhase = useEngineStore((s) => s.setDisplayPhase);
  const engineState = useEngineStore((s) => s.engineState);

  const handleIncomingAnnotationMessages = useAnnotationStore((s) => s.handleIncomingAnnotationMessages);
  const handleIncomingRecordingMessages = useRecordingStore((s) => s.handleIncomingRecordingMessages);

  const prevSessionId = useRef<string | null>(null);
  const cleanupFns = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (isInSession && sessionId !== prevSessionId.current) {
      prevSessionId.current = sessionId;

      const runCleanup = () => {
        cleanupFns.current.forEach((fn) => {
          try { fn(); } catch { /* ignore */ }
        });
        cleanupFns.current = [];
      };
      runCleanup();

      setSyncMode(userRole === 'host' ? 'host' : 'audience');

      if (userRole === 'audience') {
        setSyncStatus('syncing');
      }

      const unsubControl = handleIncomingControl((type, payload) => {
        handleRemoteControl(type, payload);
      });

      const unsubStateSync = handleIncomingStateSync((payload) => {
        applyStateSync(payload);
      });

      const unsubMismatch = handleIncomingStateMismatch((payload) => {
        stopContinuous();
        setIsRunning(false);
        if (payload.hostStateSnapshot) {
          applyStateSync(payload.hostStateSnapshot);
          setSyncStatus('synced');
        }
        setTimeout(() => clearMismatchError(), 5000);
      });

      const unsubAnnotations = handleIncomingAnnotationMessages();
      const unsubRecordings = handleIncomingRecordingMessages();

      enableConsistencyChecks();

      cleanupFns.current = [
        unsubControl,
        unsubStateSync,
        unsubMismatch,
        unsubAnnotations,
        unsubRecordings,
        () => disableConsistencyChecks(),
      ];

      if (userRole === 'host') {
        const hostBroadcast = setInterval(() => {
          const collab = useCollabStore.getState();
          if (collab.isInSession && collab.isPresenter()) {
            broadcastState();
          }
        }, 3000);
        cleanupFns.current.push(() => clearInterval(hostBroadcast));
      }
    }

    if (!isInSession && prevSessionId.current !== null) {
      prevSessionId.current = null;
      cleanupFns.current.forEach((fn) => {
        try { fn(); } catch { /* ignore */ }
      });
      cleanupFns.current = [];
      setSyncMode('local');
      setSyncStatus('idle');
      disableConsistencyChecks();
    }

    return () => {
      if (!isInSession) {
        cleanupFns.current.forEach((fn) => {
          try { fn(); } catch { /* ignore */ }
        });
        cleanupFns.current = [];
      }
    };
  }, [
    isInSession,
    sessionId,
    userRole,
    handleIncomingControl,
    handleIncomingStateSync,
    handleIncomingStateMismatch,
    handleRemoteControl,
    applyStateSync,
    broadcastState,
    setSyncMode,
    setSyncStatus,
    stopContinuous,
    setIsRunning,
    clearMismatchError,
    enableConsistencyChecks,
    disableConsistencyChecks,
    handleIncomingAnnotationMessages,
    handleIncomingRecordingMessages,
  ]);

  useEffect(() => {
    if (!isInSession) return;
    if (engineState?.phase === 'error') {
      const collab = useCollabStore.getState();
      if (collab.isPresenter() && engineState.error) {
        sendErrorAlert(`机械进入错误状态: ${engineState.error.message}`);
        collab.setSessionStatus('error', engineState.error.message);
      }
    }
  }, [engineState?.phase, engineState?.error?.message, isInSession, sendErrorAlert]);

  return null;
}
