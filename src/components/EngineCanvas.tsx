import { useRef, useEffect, useCallback } from 'react';
import { EngineScene } from '@/pixi/EngineScene';
import { useEngineStore } from '@/store/engineStore';

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

    return () => {
      destroyed = true;
      scene.destroy();
      sceneRef.current = null;
    };
  }, [setAnimating, setAnimationDetail]);

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

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#1A1A2E', borderRadius: 8, overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
