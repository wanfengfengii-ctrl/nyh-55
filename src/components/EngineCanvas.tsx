import { useRef, useEffect, useCallback } from 'react';
import { EngineScene } from '@/pixi/EngineScene';
import { useEngineStore } from '@/store/engineStore';
import { useAnnotationStore } from '@/store/annotationStore';
import type { AnnotationTarget } from '@/types';

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

  const isDrawingMode = useAnnotationStore((s) => s.isDrawingMode);
  const drawingTargetType = useAnnotationStore((s) => s.drawingTargetType);
  const localDraftTarget = useAnnotationStore((s) => s.localDraftTarget);
  const setLocalDraftTarget = useAnnotationStore((s) => s.setLocalDraftTarget);
  const setLocalDraftStep = useAnnotationStore((s) => s.setLocalDraftStep);
  const clearLocalDraft = useAnnotationStore((s) => s.clearLocalDraft);
  const selectedAnnotationId = useAnnotationStore((s) => s.selectedAnnotationId);
  const annotations = useAnnotationStore((s) => s.annotations);

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
      const currentState = useEngineStore.getState().engineState;
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
    if (!scene || !scene.isReady || !engineState) return;

    if (!scene.isSceneBuilt) {
      prevCrankTurns.current = engineState.crankTurns;
      scene.buildScene(engineState);
      return;
    }

    if (engineState.crankTurns !== prevCrankTurns.current && !animationDetail) {
      prevCrankTurns.current = engineState.crankTurns;
      scene.buildScene(engineState);
    }
  }, [engineState, animationDetail]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !scene.isReady || !engineState || !animationDetail) return;

    if (animationDetail.type !== 'reset') {
      prevCrankTurns.current = engineState.crankTurns;
      scene.updateAnimation(engineState, animationDetail);
    }
  }, [animationDetail, engineState]);

  const handleResize = useCallback(() => {
    const scene = sceneRef.current;
    if (scene && scene.isReady && engineState) {
      scene.buildScene(engineState);
    }
  }, [engineState]);

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
    </div>
  );
}
