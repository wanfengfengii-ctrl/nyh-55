import { useRef, useEffect, useCallback } from 'react';
import { EngineScene } from '@/pixi/EngineScene';
import { useEngineStore } from '@/store/engineStore';
import { useAnnotationStore } from '@/store/annotationStore';
import { useFaultTrainingStore } from '@/store/faultTrainingStore';
import type { AnnotationTarget, EngineState } from '@/types';

export default function EngineCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<EngineScene | null>(null);
  const engineState = useEngineStore((s) => s.engineState);
  const animationDetail = useEngineStore((s) => s.animationDetail);
  const setAnimating = useEngineStore((s) => s.setAnimating);
  const setAnimationDetail = useEngineStore((s) => s.setAnimationDetail);
  const isRunning = useEngineStore((s) => s.isRunning);
  const continuousTick = useEngineStore((s) => s.continuousTick);
  const prevCrankTurns = useRef<number>(-1);
  const continuousTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const faultTrainingSession = useFaultTrainingStore((s) => s.activeSession);
  const showCorrectComparison = useFaultTrainingStore((s) => s.showCorrectComparison);

  const isDrawingMode = useAnnotationStore((s) => s.isDrawingMode);
  const localDraftTarget = useAnnotationStore((s) => s.localDraftTarget);
  const clearLocalDraft = useAnnotationStore((s) => s.clearLocalDraft);
  const selectedAnnotationId = useAnnotationStore((s) => s.selectedAnnotationId);
  const annotations = useAnnotationStore((s) => s.annotations);

  const displayState: EngineState | null = (() => {
    if (faultTrainingSession) {
      if (showCorrectComparison && faultTrainingSession.correctEngineState) {
        return faultTrainingSession.correctEngineState;
      }
      return faultTrainingSession.faultyEngineState;
    }
    return engineState;
  })();

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !scene.isReady) return;

    scene.setAnnotationMode(isDrawingMode);

    if (isDrawingMode && localDraftTarget) {
      scene.highlightAnnotationTarget(localDraftTarget, true);
    } else {
      scene.highlightAnnotationTarget({ type: 'step' }, false);
    }

    if (!isDrawingMode && selectedAnnotationId) {
      const ann = annotations.find((a) => a.id === selectedAnnotationId);
      if (ann) {
        scene.highlightAnnotationTarget(ann.target, true);
      }
    }
  }, [isDrawingMode, localDraftTarget, selectedAnnotationId, annotations]);

  const handleCanvasElementClick = useCallback((target: AnnotationTarget) => {
    const annStore = useAnnotationStore.getState();
    const engineStore = useEngineStore.getState();
    if (!annStore.isDrawingMode) return;

    if (annStore.drawingTargetType && target.type !== annStore.drawingTargetType) {
      return;
    }

    const currentStep = engineStore.engineState?.currentStep ?? 0;
    annStore.setLocalDraftTarget(target);
    annStore.setLocalDraftStep(currentStep);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let destroyed = false;
    const scene = new EngineScene();
    sceneRef.current = scene;

    scene.init(canvas).then(() => {
      if (destroyed) {
        scene.destroy();
        return;
      }
      const faultSession = useFaultTrainingStore.getState().activeSession;
      const currentState = faultSession
        ? (faultSession.faultyEngineState || useEngineStore.getState().engineState)
        : useEngineStore.getState().engineState;
      if (currentState) {
        prevCrankTurns.current = currentState.crankTurns;
        scene.buildScene(currentState);
      }
    });

    scene.setOnAnimationComplete(() => {
      setAnimating(false);
      setAnimationDetail(null);
    });

    scene.setOnCanvasElementClick(handleCanvasElementClick);

    return () => {
      destroyed = true;
      scene.destroy();
      sceneRef.current = null;
    };
  }, [setAnimating, setAnimationDetail, handleCanvasElementClick]);

  useEffect(() => {
    if (isRunning) {
      continuousTimerRef.current = setInterval(() => {
        continuousTick();
      }, 1800);
    } else {
      if (continuousTimerRef.current) {
        clearInterval(continuousTimerRef.current);
        continuousTimerRef.current = null;
      }
    }
    return () => {
      if (continuousTimerRef.current) {
        clearInterval(continuousTimerRef.current);
        continuousTimerRef.current = null;
      }
    };
  }, [isRunning, continuousTick]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !scene.isReady || !displayState) return;

    if (!scene.isSceneBuilt) {
      prevCrankTurns.current = displayState.crankTurns;
      scene.buildScene(displayState);
      return;
    }

    if (displayState.crankTurns !== prevCrankTurns.current && !animationDetail) {
      prevCrankTurns.current = displayState.crankTurns;
      scene.buildScene(displayState);
    }
  }, [displayState, animationDetail]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !scene.isReady || !displayState || !animationDetail) return;

    if (animationDetail.type !== 'reset') {
      prevCrankTurns.current = displayState.crankTurns;
      scene.updateAnimation(displayState, animationDetail);
    }
  }, [animationDetail, displayState]);

  const handleResize = useCallback(() => {
    const scene = sceneRef.current;
    if (scene && scene.isReady && displayState) {
      scene.buildScene(displayState);
    }
  }, [displayState]);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawingMode) {
        clearLocalDraft();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawingMode, clearLocalDraft]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#1A1A2E', borderRadius: 8, overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: isDrawingMode ? 'crosshair' : 'default',
        }}
      />
      {isDrawingMode && (
        <div style={{
          position: 'absolute',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(200,169,81,0.9)',
          color: '#1A1A2E',
          padding: '4px 14px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          fontFamily: 'Source Sans 3, sans-serif',
          pointerEvents: 'none',
          zIndex: 10,
          whiteSpace: 'nowrap',
        }}>
          ✏️ 圈选模式：点击画布上的数字轮/进位杆/齿轮来添加批注（按 Esc 退出）
        </div>
      )}
      {faultTrainingSession && !isDrawingMode && (
        <div style={{
          position: 'absolute',
          top: 8,
          right: 8,
          background: showCorrectComparison ? 'rgba(46,139,87,0.9)' : 'rgba(192,57,43,0.9)',
          color: '#F5F0E1',
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'Source Sans 3, sans-serif',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          {showCorrectComparison ? '✓ 显示正确结果' : '⚠ 故障注入中'}
        </div>
      )}
    </div>
  );
}
