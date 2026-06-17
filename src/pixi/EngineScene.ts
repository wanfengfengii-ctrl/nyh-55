import { Application, Container, Graphics, Text } from 'pixi.js';
import { WheelRenderer, WHEEL_RADIUS, WHEEL_SPACING } from './WheelRenderer';
import { GearRenderer } from './GearRenderer';
import type { GearTargetInfo } from './GearRenderer';
import { CarryRenderer } from './CarryRenderer';
import type { LeverTargetInfo } from './CarryRenderer';
import type { WheelTargetInfo } from './WheelRenderer';
import type { EngineState, AnimationDetail, AnnotationTarget } from '@/types';

const DARK_BG = 0x1A1A2E;
const PARCHMENT = 0xF5F0E1;
const DARK_BRONZE = 0x4A3728;
const BRASS = 0xC8A951;
const STEEL = 0x8B8682;
const WARNING_RED = 0xC0392B;

const COLUMN_SPACING = 140;
const COLUMN_LABEL_OFFSET = -45;
const VALUE_DISPLAY_HEIGHT = 28;

export class EngineScene {
  private app: Application | null = null;
  private wheelRenderer: WheelRenderer | null = null;
  private gearRenderer: GearRenderer | null = null;
  private carryRenderer: CarryRenderer | null = null;
  private rootContainer: Container | null = null;
  private backgroundContainer: Container | null = null;
  private labelContainer: Container | null = null;
  private valueContainer: Container | null = null;
  private crankContainer: Container | null = null;
  private initialized = false;
  private currentEngineState: EngineState | null = null;
  private isBuilt = false;
  private animationProgress = 0;
  private isAnimating = false;
  private onAnimationComplete: (() => void) | null = null;
  private errorPulseTime = 0;
  private idleTime = 0;
  private onCanvasElementClick: ((target: AnnotationTarget) => void) | null = null;
  private isAnnotationMode = false;

  private mechanicsContainer: Container | null = null;
  private decorationContainer: Container | null = null;

  async init(canvas: HTMLCanvasElement) {
    this.app = new Application();
    await this.app.init({
      canvas,
      antialias: true,
      background: DARK_BG,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    this.rootContainer = new Container();
    this.app.stage.addChild(this.rootContainer);

    this.backgroundContainer = new Container();
    this.rootContainer.addChild(this.backgroundContainer);

    this.decorationContainer = new Container();
    this.rootContainer.addChild(this.decorationContainer);

    this.labelContainer = new Container();
    this.rootContainer.addChild(this.labelContainer);

    this.mechanicsContainer = new Container();
    this.rootContainer.addChild(this.mechanicsContainer);

    this.valueContainer = new Container();
    this.rootContainer.addChild(this.valueContainer);

    this.crankContainer = new Container();
    this.rootContainer.addChild(this.crankContainer);

    this.wheelRenderer = new WheelRenderer(this.mechanicsContainer);
    this.gearRenderer = new GearRenderer(this.mechanicsContainer);
    this.carryRenderer = new CarryRenderer(this.mechanicsContainer);

    this.wheelRenderer.setOnWheelClick((info: WheelTargetInfo) => {
      if (this.onCanvasElementClick) {
        this.onCanvasElementClick({
          type: 'wheel',
          columnIndex: info.columnIndex,
          wheelIndex: info.wheelIndex,
        });
      }
    });

    this.carryRenderer.setOnLeverClick((info: LeverTargetInfo) => {
      if (this.onCanvasElementClick) {
        this.onCanvasElementClick({
          type: 'lever',
          columnIndex: info.columnIndex,
          leverIndex: info.leverIndex,
        });
      }
    });

    this.gearRenderer.setOnGearClick((info: GearTargetInfo) => {
      if (this.onCanvasElementClick) {
        this.onCanvasElementClick({
          type: 'gear',
          columnIndex: info.fromColumn,
        });
      }
    });

    this.app.ticker.add(this.update.bind(this));
    this.initialized = true;
    this.resize();
  }

  resize() {
    if (!this.app) return;
    const parent = this.app.canvas.parentElement;
    if (parent) {
      this.app.renderer.resize(parent.clientWidth, parent.clientHeight);
    }
  }

  buildScene(state: EngineState) {
    if (!this.initialized || !this.app || !this.rootContainer) return;
    this.resize();
    this.clearScene();
    this.currentEngineState = state;

    const numCols = state.columns.length;
    const totalWidth = numCols * COLUMN_SPACING;
    const offsetX = (this.app.screen.width - totalWidth) / 2 + COLUMN_SPACING / 2;
    const offsetY = 100;

    this.drawBackground(offsetX, offsetY, numCols, state.numDigits);
    this.drawDecorations(offsetX, offsetY, numCols, state.numDigits);

    for (let c = 0; c < numCols; c++) {
      const col = state.columns[c];
      const cx = offsetX + c * COLUMN_SPACING;

      this.drawColumnLabel(cx, offsetY + COLUMN_LABEL_OFFSET, col.order, col.isError);
      this.drawColumnFrame(cx, offsetY, state.numDigits, col.isError);

      for (let w = 0; w < state.numDigits; w++) {
        const wy = offsetY + (state.numDigits - 1 - w) * WHEEL_SPACING;
        this.wheelRenderer!.createWheel(c, w, col.wheels[w].digit, cx, wy);

        if (w < state.numDigits - 1) {
          this.carryRenderer!.createLever(c, w, cx + WHEEL_RADIUS + 6, wy + WHEEL_SPACING / 2);
        }
      }

      this.drawValueDisplay(cx, offsetY + state.numDigits * WHEEL_SPACING + 8, col.value, col.isError);

      if (c < numCols - 1) {
        const gearX = cx + COLUMN_SPACING / 2;
        const gearY = offsetY + (state.numDigits - 1) * WHEEL_SPACING / 2;
        this.gearRenderer!.createGear(c, c + 1, gearX, gearY, 0);
      }
    }

    this.drawCrank(offsetX - 70, offsetY + state.numDigits * WHEEL_SPACING / 2, state.crankPosition);

    this.isBuilt = true;
  }

  private drawBackground(offsetX: number, offsetY: number, numCols: number, numDigits: number) {
    this.backgroundContainer!.removeChildren();
    const bg = new Graphics();

    const totalWidth = numCols * COLUMN_SPACING + 60;
    const totalHeight = numDigits * WHEEL_SPACING + 140;
    const x = offsetX - 50;
    const y = offsetY - 55;

    bg.roundRect(x, y, totalWidth, totalHeight, 10);
    bg.fill({ color: 0x20203A, alpha: 0.9 });
    bg.stroke({ color: DARK_BRONZE, width: 3 });

    bg.roundRect(x + 5, y + 5, totalWidth - 10, totalHeight - 10, 7);
    bg.stroke({ color: BRASS, width: 1, alpha: 0.25 });

    for (let i = 0; i < 4; i++) {
      const cx = x + 12;
      const cy = y + 12 + i * (totalHeight - 24) / 3;
      bg.circle(cx, cy, 4);
      bg.fill({ color: STEEL, alpha: 0.6 });
      bg.circle(cx, cy, 2);
      bg.fill({ color: DARK_BRONZE });

      const rx = x + totalWidth - 12;
      bg.circle(rx, cy, 4);
      bg.fill({ color: STEEL, alpha: 0.6 });
      bg.circle(rx, cy, 2);
      bg.fill({ color: DARK_BRONZE });
    }

    this.backgroundContainer!.addChild(bg);
  }

  private drawDecorations(offsetX: number, offsetY: number, numCols: number, numDigits: number) {
    this.decorationContainer!.removeChildren();

    const title = new Text({
      text: 'BABBAGE DIFFERENCE ENGINE',
      style: {
        fontFamily: 'Playfair Display, serif',
        fontSize: 13,
        fill: BRASS,
        letterSpacing: 3,
      },
    });
    title.x = offsetX + (numCols - 1) * COLUMN_SPACING / 2;
    title.y = offsetY - 75;
    title.anchor.set(0.5);
    title.alpha = 0.6;
    this.decorationContainer!.addChild(title);

    for (let c = 0; c < numCols - 1; c++) {
      const x1 = offsetX + c * COLUMN_SPACING + WHEEL_RADIUS + 8;
      const x2 = offsetX + (c + 1) * COLUMN_SPACING - WHEEL_RADIUS - 8;
      const midY = offsetY + (numDigits - 1) * WHEEL_SPACING / 2;

      const axle = new Graphics();
      axle.moveTo(x1, midY);
      axle.lineTo(x2, midY);
      axle.stroke({ color: STEEL, width: 2, alpha: 0.3 });
      this.decorationContainer!.addChild(axle);
    }
  }

  private drawColumnLabel(x: number, y: number, order: number, isError: boolean) {
    const label = new Text({
      text: order === 0 ? 'f(x)' : `Δ${superscript(order)}`,
      style: {
        fontFamily: 'Playfair Display, serif',
        fontSize: 15,
        fill: isError ? WARNING_RED : BRASS,
        fontWeight: 'bold',
      },
    });
    label.x = x;
    label.y = y;
    label.anchor.set(0.5);
    this.labelContainer!.addChild(label);
  }

  private drawColumnFrame(x: number, y: number, numDigits: number, isError: boolean) {
    const frame = new Graphics();
    const height = numDigits * WHEEL_SPACING + 8;
    const width = WHEEL_RADIUS * 2 + 18;

    frame.roundRect(x - width / 2, y - WHEEL_RADIUS - 4, width, height, 5);
    frame.fill({ color: 0x1C1C32, alpha: 0.5 });
    frame.stroke({ color: isError ? WARNING_RED : DARK_BRONZE, width: isError ? 2 : 1.5 });

    if (isError) {
      frame.roundRect(x - width / 2, y - WHEEL_RADIUS - 4, width, height, 5);
      frame.stroke({ color: WARNING_RED, width: 1, alpha: 0.3 });
    }

    this.labelContainer!.addChild(frame);
  }

  private drawValueDisplay(x: number, y: number, value: number, isError: boolean) {
    const bg = new Graphics();
    bg.roundRect(x - 38, y, 76, VALUE_DISPLAY_HEIGHT, 4);
    bg.fill({ color: 0x252540, alpha: 0.9 });
    bg.stroke({ color: isError ? WARNING_RED : BRASS, width: 1 });
    this.valueContainer!.addChild(bg);

    const text = new Text({
      text: String(value),
      style: {
        fontFamily: 'Source Sans 3, sans-serif',
        fontSize: 15,
        fill: isError ? WARNING_RED : PARCHMENT,
        fontWeight: 'bold',
      },
    });
    text.x = x;
    text.y = y + VALUE_DISPLAY_HEIGHT / 2;
    text.anchor.set(0.5);
    this.valueContainer!.addChild(text);
  }

  private drawCrank(x: number, y: number, position: number) {
    this.crankContainer!.removeChildren();

    const base = new Graphics();
    base.circle(x, y, 22);
    base.fill({ color: DARK_BRONZE });
    base.circle(x, y, 18);
    base.fill({ color: STEEL });
    base.circle(x, y, 5);
    base.fill({ color: 0x333333 });
    this.crankContainer!.addChild(base);

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const ix = x + Math.cos(a) * 14;
      const iy = y + Math.sin(a) * 14;
      const ox = x + Math.cos(a) * 17;
      const oy = y + Math.sin(a) * 17;
      const line = new Graphics();
      line.moveTo(ix, iy);
      line.lineTo(ox, oy);
      line.stroke({ color: DARK_BRONZE, width: 2 });
      this.crankContainer!.addChild(line);
    }

    const angle = (position / 10) * Math.PI * 2 - Math.PI / 2;
    const handleX = x + Math.cos(angle) * 14;
    const handleY = y + Math.sin(angle) * 14;

    const handle = new Graphics();
    handle.circle(handleX, handleY, 4);
    handle.fill({ color: BRASS });
    handle.stroke({ color: DARK_BRONZE, width: 1.5 });
    this.crankContainer!.addChild(handle);

    const crankLabel = new Text({
      text: '曲柄',
      style: {
        fontFamily: 'Source Sans 3, sans-serif',
        fontSize: 10,
        fill: BRASS,
      },
    });
    crankLabel.x = x;
    crankLabel.y = y + 32;
    crankLabel.anchor.set(0.5);
    crankLabel.alpha = 0.7;
    this.crankContainer!.addChild(crankLabel);
  }

  updateAnimation(state: EngineState, animation: AnimationDetail) {
    if (!this.initialized) return;
    this.currentEngineState = state;
    this.isAnimating = true;
    this.animationProgress = 0;

    for (const change of animation.wheelChanges) {
      const col = state.columns[change.column];
      const wheel = col.wheels[change.wheel];
      this.wheelRenderer!.setTarget(change.column, change.wheel, change.to, wheel.isCarrying, wheel.isError);
    }

    for (const carry of animation.carryTriggers) {
      const col = state.columns[carry.column];
      const leverIdx = carry.wheel;
      const isError = col.wheels[carry.wheel].isError;
      this.carryRenderer!.setEngaged(carry.column, leverIdx, true, isError);
    }

    for (let c = 0; c < state.columns.length - 1; c++) {
      if (state.columns[c].isActive || state.columns[c + 1].isActive) {
        const direction = c % 2 === 0 ? 1 : -1;
        this.gearRenderer!.triggerRotation(c, c + 1, direction * Math.PI / 5);
      }
    }
  }

  setOnAnimationComplete(cb: () => void) {
    this.onAnimationComplete = cb;
  }

  setOnCanvasElementClick(cb: (target: AnnotationTarget) => void) {
    this.onCanvasElementClick = cb;
  }

  setAnnotationMode(active: boolean) {
    this.isAnnotationMode = active;
    if (this.wheelRenderer) this.wheelRenderer.setInteractive(active);
    if (this.carryRenderer) this.carryRenderer.setInteractive(active);
    if (this.gearRenderer) this.gearRenderer.setInteractive(active);
  }

  highlightAnnotationTarget(target: AnnotationTarget, highlight: boolean) {
    if (!highlight) {
      this.wheelRenderer?.clearAllHighlights();
      this.carryRenderer?.clearAllHighlights();
      this.gearRenderer?.clearAllHighlights();
      return;
    }
    this.wheelRenderer?.clearAllHighlights();
    this.carryRenderer?.clearAllHighlights();
    this.gearRenderer?.clearAllHighlights();

    if (target.type === 'wheel' && target.columnIndex !== undefined && target.wheelIndex !== undefined) {
      this.wheelRenderer?.setAnnotationHighlight(target.columnIndex, target.wheelIndex, true);
    } else if (target.type === 'lever' && target.columnIndex !== undefined && target.leverIndex !== undefined) {
      this.carryRenderer?.setAnnotationHighlight(target.columnIndex, target.leverIndex, true);
    } else if (target.type === 'gear' && target.columnIndex !== undefined) {
      this.gearRenderer?.setAnnotationHighlight(target.columnIndex, target.columnIndex + 1, true);
    } else if (target.type === 'column' && target.columnIndex !== undefined) {
      const state = this.currentEngineState;
      if (state) {
        for (let w = 0; w < state.numDigits; w++) {
          this.wheelRenderer?.setAnnotationHighlight(target.columnIndex, w, true);
        }
      }
    }
  }

  private update(ticker: { deltaTime: number }) {
    if (!this.initialized) return;
    const dt = ticker.deltaTime / 60;

    this.wheelRenderer!.update(dt);
    this.gearRenderer!.update(dt);
    this.carryRenderer!.update(dt);

    if (this.isAnimating) {
      this.animationProgress += dt;
      if (this.animationProgress > 1.5) {
        this.isAnimating = false;
        if (this.onAnimationComplete) {
          this.onAnimationComplete();
        }
      }
    }

    if (this.currentEngineState?.phase === 'error') {
      this.errorPulseTime += dt;
    }

    this.idleTime += dt;
  }

  clearScene() {
    if (!this.initialized) return;
    this.wheelRenderer!.clearAll();
    this.gearRenderer!.clearAll();
    this.carryRenderer!.clearAll();
    this.backgroundContainer!.removeChildren();
    this.decorationContainer!.removeChildren();
    this.labelContainer!.removeChildren();
    this.mechanicsContainer!.removeChildren();
    this.valueContainer!.removeChildren();
    this.crankContainer!.removeChildren();
    this.isBuilt = false;
  }

  destroy() {
    if (this.initialized) {
      this.clearScene();
    }
    if (this.app) {
      try {
        this.app.destroy(false);
      } catch {
        // ignore destroy errors
      }
      this.app = null;
    }
    this.initialized = false;
  }

  get isSceneBuilt(): boolean {
    return this.isBuilt;
  }

  get isReady(): boolean {
    return this.initialized;
  }
}

function superscript(n: number): string {
  const superscripts: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  };
  return String(n).split('').map((c) => superscripts[c] ?? c).join('');
}
