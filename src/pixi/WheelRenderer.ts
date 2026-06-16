import { Container, Graphics, Text } from 'pixi.js';

const BRASS = 0xC8A951;
const DARK_BRONZE = 0x4A3728;
const COPPER_GREEN = 0x2E8B57;
const PARCHMENT = 0xF5F0E1;
const WARNING_RED = 0xC0392B;

export const WHEEL_RADIUS = 26;
export const WHEEL_SPACING = 56;

const DIGIT_FONT_SIZE = 14;

interface WheelVisuals {
  container: Container;
  digitTexts: Text[];
  highlightRing: Graphics;
  carryIndicator: Graphics;
  glowRing: Graphics;
  currentValue: number;
  targetRotation: number;
  currentRotation: number;
  isCarrying: boolean;
  isError: boolean;
  errorPulse: number;
}

export class WheelRenderer {
  private wheels: Map<string, WheelVisuals> = new Map();
  private parent: Container;

  constructor(parent: Container) {
    this.parent = parent;
  }

  getWheelKey(column: number, wheelIndex: number): string {
    return `${column}-${wheelIndex}`;
  }

  createWheel(column: number, wheelIndex: number, digit: number, x: number, y: number): WheelVisuals {
    const container = new Container();
    container.x = x;
    container.y = y;

    const outerRing = new Graphics();
    outerRing.circle(0, 0, WHEEL_RADIUS);
    outerRing.fill({ color: BRASS });
    outerRing.circle(0, 0, WHEEL_RADIUS - 3);
    outerRing.fill({ color: DARK_BRONZE });
    outerRing.circle(0, 0, WHEEL_RADIUS - 6);
    outerRing.fill({ color: BRASS, alpha: 0.85 });
    outerRing.stroke({ color: DARK_BRONZE, width: 2 });
    container.addChild(outerRing);

    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const innerRadius = WHEEL_RADIUS - 6;
      const x1 = Math.cos(angle) * (innerRadius - 2);
      const y1 = Math.sin(angle) * (innerRadius - 2);
      const x2 = Math.cos(angle) * (innerRadius - 5);
      const y2 = Math.sin(angle) * (innerRadius - 5);
      const tick = new Graphics();
      tick.moveTo(x1, y1);
      tick.lineTo(x2, y2);
      tick.stroke({ color: DARK_BRONZE, width: 1 });
      container.addChild(tick);
    }

    const glowRing = new Graphics();
    glowRing.circle(0, 0, WHEEL_RADIUS + 4);
    glowRing.stroke({ color: COPPER_GREEN, width: 3, alpha: 0 });
    glowRing.visible = false;
    container.addChild(glowRing);

    const highlightRing = new Graphics();
    highlightRing.circle(0, 0, WHEEL_RADIUS + 2);
    highlightRing.stroke({ color: COPPER_GREEN, width: 2, alpha: 0 });
    highlightRing.visible = false;
    container.addChild(highlightRing);

    const digitTexts: Text[] = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const dx = Math.cos(angle) * (WHEEL_RADIUS - 14);
      const dy = Math.sin(angle) * (WHEEL_RADIUS - 14);
      const t = new Text({
        text: String(i),
        style: {
          fontFamily: 'Playfair Display, serif',
          fontSize: DIGIT_FONT_SIZE,
          fill: PARCHMENT,
          fontWeight: 'bold',
        },
      });
      t.x = dx;
      t.y = dy;
      t.anchor.set(0.5);
      digitTexts.push(t);
      container.addChild(t);
    }

    const carryIndicator = new Graphics();
    carryIndicator.circle(WHEEL_RADIUS - 2, -(WHEEL_RADIUS - 2), 3);
    carryIndicator.fill({ color: WARNING_RED, alpha: 0 });
    container.addChild(carryIndicator);

    const rotation = (digit / 10) * Math.PI * 2;
    container.rotation = -rotation;

    const visuals: WheelVisuals = {
      container,
      digitTexts,
      highlightRing,
      carryIndicator,
      glowRing,
      currentValue: digit,
      targetRotation: rotation,
      currentRotation: rotation,
      isCarrying: false,
      isError: false,
      errorPulse: 0,
    };

    const key = this.getWheelKey(column, wheelIndex);
    this.wheels.set(key, visuals);
    this.parent.addChild(container);

    return visuals;
  }

  setTarget(column: number, wheelIndex: number, newDigit: number, isCarrying: boolean, isError: boolean) {
    const key = this.getWheelKey(column, wheelIndex);
    const visuals = this.wheels.get(key);
    if (!visuals) return;

    const currentDigit = visuals.currentValue;
    let delta = newDigit - currentDigit;
    if (delta < 0) delta += 10;

    visuals.targetRotation = visuals.currentRotation + (delta / 10) * Math.PI * 2;
    visuals.currentValue = newDigit;
    visuals.isCarrying = isCarrying;
    visuals.isError = isError;
  }

  update(dt: number) {
    for (const visuals of this.wheels.values()) {
      const diff = visuals.targetRotation - visuals.currentRotation;
      if (Math.abs(diff) > 0.001) {
        const speed = Math.max(Math.abs(diff) * 6, 0.03) * dt;
        visuals.currentRotation += Math.sign(diff) * Math.min(speed, Math.abs(diff));
        visuals.container.rotation = -visuals.currentRotation;
      }

      if (visuals.isCarrying && !visuals.isError) {
        visuals.carryIndicator.clear();
        visuals.carryIndicator.circle(WHEEL_RADIUS - 2, -(WHEEL_RADIUS - 2), 3);
        visuals.carryIndicator.fill({ color: WARNING_RED, alpha: 0.9 });
        visuals.highlightRing.visible = true;
        visuals.highlightRing.clear();
        visuals.highlightRing.circle(0, 0, WHEEL_RADIUS + 2);
        visuals.highlightRing.stroke({ color: COPPER_GREEN, width: 2, alpha: 0.8 });
        visuals.glowRing.visible = true;
        visuals.glowRing.clear();
        visuals.glowRing.circle(0, 0, WHEEL_RADIUS + 4);
        visuals.glowRing.stroke({ color: COPPER_GREEN, width: 3, alpha: 0.3 });
      } else if (visuals.isError) {
        visuals.errorPulse += dt * 4;
        const alpha = 0.4 + Math.sin(visuals.errorPulse) * 0.4;
        visuals.highlightRing.visible = true;
        visuals.highlightRing.clear();
        visuals.highlightRing.circle(0, 0, WHEEL_RADIUS + 3);
        visuals.highlightRing.stroke({ color: WARNING_RED, width: 3, alpha });
        visuals.glowRing.visible = true;
        visuals.glowRing.clear();
        visuals.glowRing.circle(0, 0, WHEEL_RADIUS + 6);
        visuals.glowRing.stroke({ color: WARNING_RED, width: 4, alpha: alpha * 0.5 });
        visuals.carryIndicator.clear();
        visuals.carryIndicator.circle(WHEEL_RADIUS - 2, -(WHEEL_RADIUS - 2), 3);
        visuals.carryIndicator.fill({ color: WARNING_RED, alpha });
      } else {
        visuals.highlightRing.visible = false;
        visuals.glowRing.visible = false;
        visuals.carryIndicator.clear();
        visuals.carryIndicator.circle(WHEEL_RADIUS - 2, -(WHEEL_RADIUS - 2), 3);
        visuals.carryIndicator.fill({ color: WARNING_RED, alpha: 0 });
      }
    }
  }

  clearAll() {
    for (const [, visuals] of this.wheels) {
      this.parent.removeChild(visuals.container);
      visuals.container.destroy({ children: true });
    }
    this.wheels.clear();
  }
}
