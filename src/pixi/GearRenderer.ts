import { Container, Graphics } from 'pixi.js';

const DARK_BRONZE = 0x4A3728;
const BRASS = 0xC8A951;
const STEEL = 0x8B8682;

const GEAR_TEETH = 16;
const GEAR_RADIUS = 16;

interface GearVisuals {
  container: Container;
  gear: Graphics;
  targetAngle: number;
  currentAngle: number;
  linkedFrom: number;
  linkedTo: number;
}

export class GearRenderer {
  private gears: Map<string, GearVisuals> = new Map();
  private parent: Container;

  constructor(parent: Container) {
    this.parent = parent;
  }

  getGearKey(fromCol: number, toCol: number): string {
    return `${fromCol}-${toCol}`;
  }

  createGear(fromCol: number, toCol: number, x: number, y: number, initialAngle: number): GearVisuals {
    const container = new Container();
    container.x = x;
    container.y = y;

    const gear = this.drawGear(GEAR_RADIUS, GEAR_TEETH, DARK_BRONZE, BRASS);
    container.addChild(gear);

    const visuals: GearVisuals = {
      container,
      gear,
      targetAngle: initialAngle,
      currentAngle: initialAngle,
      linkedFrom: fromCol,
      linkedTo: toCol,
    };

    const key = this.getGearKey(fromCol, toCol);
    this.gears.set(key, visuals);
    this.parent.addChild(container);

    return visuals;
  }

  private drawGear(radius: number, teeth: number, bodyColor: number, rimColor: number): Graphics {
    const g = new Graphics();
    const toothDepth = 5;
    const innerRadius = radius - toothDepth / 2;
    const outerRadius = radius + toothDepth / 2;

    g.circle(0, 0, innerRadius);
    g.fill({ color: bodyColor });

    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2;
      const nextAngle = ((i + 0.35) / teeth) * Math.PI * 2;

      const ix1 = Math.cos(angle) * innerRadius;
      const iy1 = Math.sin(angle) * innerRadius;
      const ox1 = Math.cos(angle) * outerRadius;
      const oy1 = Math.sin(angle) * outerRadius;
      const ox2 = Math.cos(nextAngle) * outerRadius;
      const oy2 = Math.sin(nextAngle) * outerRadius;
      const ix2 = Math.cos(nextAngle) * innerRadius;
      const iy2 = Math.sin(nextAngle) * innerRadius;

      g.moveTo(ix1, iy1);
      g.lineTo(ox1, oy1);
      g.lineTo(ox2, oy2);
      g.lineTo(ix2, iy2);
      g.closePath();
      g.fill({ color: rimColor });
    }

    g.circle(0, 0, radius * 0.35);
    g.fill({ color: bodyColor });

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const sx = Math.cos(a) * radius * 0.15;
      const sy = Math.sin(a) * radius * 0.15;
      const ex = Math.cos(a) * radius * 0.32;
      const ey = Math.sin(a) * radius * 0.32;
      g.moveTo(sx, sy);
      g.lineTo(ex, ey);
      g.stroke({ color: STEEL, width: 1.5 });
    }

    g.circle(0, 0, radius * 0.1);
    g.fill({ color: STEEL });

    g.circle(0, 0, innerRadius);
    g.stroke({ color: DARK_BRONZE, width: 1.5 });

    return g;
  }

  triggerRotation(fromCol: number, toCol: number, deltaAngle: number) {
    const key = this.getGearKey(fromCol, toCol);
    const visuals = this.gears.get(key);
    if (!visuals) return;

    visuals.targetAngle = visuals.currentAngle + deltaAngle;
  }

  update(dt: number) {
    for (const visuals of this.gears.values()) {
      const diff = visuals.targetAngle - visuals.currentAngle;
      if (Math.abs(diff) > 0.001) {
        const speed = Math.max(Math.abs(diff) * 5, 0.015) * dt;
        visuals.currentAngle += Math.sign(diff) * Math.min(speed, Math.abs(diff));
        visuals.container.rotation = visuals.currentAngle;
      }
    }
  }

  clearAll() {
    for (const [, visuals] of this.gears) {
      this.parent.removeChild(visuals.container);
      visuals.container.destroy({ children: true });
    }
    this.gears.clear();
  }
}

export { GEAR_RADIUS };
