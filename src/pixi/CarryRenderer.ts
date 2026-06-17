import { Container, Graphics } from 'pixi.js';

const COPPER_GREEN = 0x2E8B57;
const DARK_BRONZE = 0x4A3728;
const BRASS = 0xC8A951;
const STEEL = 0x8B8682;
const WARNING_RED = 0xC0392B;

const LEVER_WIDTH = 36;
const LEVER_HEIGHT = 5;

export interface LeverTargetInfo {
  type: 'lever';
  columnIndex: number;
  leverIndex: number;
}

interface CarryLeverVisuals {
  container: Container;
  body: Graphics;
  pivot: Graphics;
  tip: Graphics;
  connectionLine: Graphics;
  engaged: boolean;
  progress: number;
  targetProgress: number;
  isError: boolean;
  errorPulse: number;
}

export class CarryRenderer {
  private levers: Map<string, CarryLeverVisuals> = new Map();
  private parent: Container;
  private onLeverClick: ((info: LeverTargetInfo) => void) | null = null;
  private interactive = false;

  constructor(parent: Container) {
    this.parent = parent;
  }

  setInteractive(interactive: boolean) {
    this.interactive = interactive;
    for (const visuals of this.levers.values()) {
      visuals.container.eventMode = interactive ? 'static' : 'auto';
      visuals.container.cursor = interactive ? 'pointer' : 'default';
    }
  }

  setOnLeverClick(callback: (info: LeverTargetInfo) => void) {
    this.onLeverClick = callback;
  }

  setAnnotationHighlight(column: number, leverIndex: number, highlight: boolean, color: number = COPPER_GREEN) {
    const key = this.getLeverKey(column, leverIndex);
    const visuals = this.levers.get(key);
    if (!visuals) return;
    if (highlight) {
      visuals.tip.clear();
      visuals.tip.circle(LEVER_WIDTH / 2, 0, 5);
      visuals.tip.stroke({ color, width: 2 });
    } else {
      visuals.tip.clear();
      visuals.tip.circle(LEVER_WIDTH / 2, 0, 2.5);
      visuals.tip.fill({ color: COPPER_GREEN });
    }
  }

  clearAllHighlights() {
    for (const visuals of this.levers.values()) {
      visuals.tip.clear();
      visuals.tip.circle(LEVER_WIDTH / 2, 0, 2.5);
      visuals.tip.fill({ color: COPPER_GREEN });
    }
  }

  getLeverKey(column: number, wheelIndex: number): string {
    return `${column}-${wheelIndex}`;
  }

  createLever(column: number, wheelIndex: number, x: number, y: number): CarryLeverVisuals {
    const container = new Container();
    container.x = x;
    container.y = y;

    const connectionLine = new Graphics();
    container.addChild(connectionLine);

    const body = new Graphics();
    this.drawBody(body, 0, false);
    container.addChild(body);

    const pivot = new Graphics();
    pivot.circle(-LEVER_WIDTH / 2, 0, 3);
    pivot.fill({ color: STEEL });
    pivot.circle(-LEVER_WIDTH / 2, 0, 1.5);
    pivot.fill({ color: DARK_BRONZE });
    container.addChild(pivot);

    const tip = new Graphics();
    tip.circle(LEVER_WIDTH / 2, 0, 2.5);
    tip.fill({ color: COPPER_GREEN });
    container.addChild(tip);

    const visuals: CarryLeverVisuals = {
      container,
      body,
      pivot,
      tip,
      connectionLine,
      engaged: false,
      progress: 0,
      targetProgress: 0,
      isError: false,
      errorPulse: 0,
    };

    const key = this.getLeverKey(column, wheelIndex);
    this.levers.set(key, visuals);
    this.parent.addChild(container);

    if (this.interactive) {
      container.eventMode = 'static';
      container.cursor = 'pointer';
    }

    container.on('pointerdown', () => {
      if (this.onLeverClick) {
        this.onLeverClick({ type: 'lever', columnIndex: column, leverIndex: wheelIndex });
      }
    });

    return visuals;
  }

  private drawBody(body: Graphics, progress: number, isError: boolean = false) {
    body.clear();
    const color = isError ? WARNING_RED : COPPER_GREEN;

    body.roundRect(-LEVER_WIDTH / 2, -LEVER_HEIGHT / 2, LEVER_WIDTH, LEVER_HEIGHT, 2);
    body.fill({ color: DARK_BRONZE });

    const engagedWidth = LEVER_WIDTH * progress;
    if (engagedWidth > 0) {
      body.roundRect(-LEVER_WIDTH / 2, -LEVER_HEIGHT / 2, engagedWidth, LEVER_HEIGHT, 2);
      body.fill({ color, alpha: 0.85 });
    }

    body.roundRect(-LEVER_WIDTH / 2, -LEVER_HEIGHT / 2, LEVER_WIDTH, LEVER_HEIGHT, 2);
    body.stroke({ color, width: 1 });

    if (progress >= 1) {
      body.circle(LEVER_WIDTH / 2, 0, 3);
      body.fill({ color: BRASS, alpha: 0.9 });
    }
  }

  setEngaged(column: number, wheelIndex: number, engaged: boolean, isError: boolean = false) {
    const key = this.getLeverKey(column, wheelIndex);
    const visuals = this.levers.get(key);
    if (!visuals) return;

    visuals.engaged = engaged;
    visuals.targetProgress = engaged ? 1 : 0;
    visuals.isError = isError;

    if (engaged) {
      visuals.tip.clear();
      visuals.tip.circle(LEVER_WIDTH / 2, 0, 2.5);
      visuals.tip.fill({ color: isError ? WARNING_RED : BRASS });
    }
  }

  update(dt: number) {
    for (const visuals of this.levers.values()) {
      const diff = visuals.targetProgress - visuals.progress;
      if (Math.abs(diff) > 0.001) {
        const speed = Math.max(Math.abs(diff) * 5, 0.015) * dt;
        visuals.progress += Math.sign(diff) * Math.min(speed, Math.abs(diff));
      }

      if (visuals.isError && visuals.engaged) {
        visuals.errorPulse += dt * 4;
        const alpha = 0.5 + Math.sin(visuals.errorPulse) * 0.5;
        this.drawBody(visuals.body, visuals.progress, true);
        visuals.connectionLine.clear();
        visuals.connectionLine.moveTo(LEVER_WIDTH / 2, 0);
        visuals.connectionLine.lineTo(LEVER_WIDTH / 2 + 4, -8);
        visuals.connectionLine.stroke({ color: WARNING_RED, width: 1.5, alpha });
      } else {
        this.drawBody(visuals.body, visuals.progress, false);
        if (visuals.engaged && visuals.progress >= 0.8) {
          visuals.connectionLine.clear();
          visuals.connectionLine.moveTo(LEVER_WIDTH / 2, 0);
          visuals.connectionLine.lineTo(LEVER_WIDTH / 2 + 4, -8);
          visuals.connectionLine.stroke({ color: COPPER_GREEN, width: 1, alpha: 0.6 });
        } else {
          visuals.connectionLine.clear();
        }
      }
    }
  }

  clearAll() {
    for (const [, visuals] of this.levers) {
      this.parent.removeChild(visuals.container);
      visuals.container.destroy({ children: true });
    }
    this.levers.clear();
  }
}
