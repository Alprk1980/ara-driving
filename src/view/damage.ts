// The dents a crash leaves on the rig. The sim keeps the dents per side (car.ts `dents`); this only shows them,
// so a car waiting at the pump looks like the one that just hit the bakery, and the HUD outline shows the same.
// A sculpted car really bends (carsurface.ts foldSkin); the block body has nothing to bend, so it swells a bruise.
import { SIDES, type Mark, type Side } from '../sim/car.ts';
import type { CarRig } from './carmesh.ts';

const OFF_AT = 0.35; // a bumper or mirror on a side this bent comes off

export class DamageRig {
  private rig: CarRig;
  private level: Record<Side, number> = { front: 0, back: 0, left: 0, right: 0 };
  private shape = '';
  private marks: readonly Mark[] = [];

  constructor(rig: CarRig) {
    this.rig = rig;
  }

  /** Copy the sim's dents and repaint. Cheap enough to call every frame. */
  set(levels: Record<Side, number>, marks?: readonly Mark[]) {
    for (const s of SIDES) this.level[s] = levels[s];
    this.marks = marks ?? SIDES.filter((s) => levels[s] > 0).map((side) => ({ side, at: 0, depth: levels[side] }));
    this.apply();
  }

  /** The worst side, 0..1 — enough heat and the engine smokes. */
  get heat() { return Math.max(...SIDES.map((s) => this.level[s])); }

  private apply() {
    const shape = this.marks.map((m) => `${m.side}${m.at.toFixed(2)}:${Math.round(m.depth * 60)}`).join(); // re-fold when a dent moves, not every frame
    if (shape !== this.shape) {
      this.shape = shape;
      this.rig.crumple?.(this.level, this.marks);
    }
    if (this.rig.crush) for (const s of SIDES) {
      const level = this.level[s], pad = this.rig.crush[s];
      pad.visible = level > 0.05;
      const deep = 0.6 + level * 2.4; // the bruise swells inward as the side caves in
      if (s === 'front' || s === 'back') pad.scale.set(1, 1, deep);
      else pad.scale.set(deep, 1, 1);
    }
    for (const f of this.rig.fragile) f.mesh.visible = this.level[f.side] < OFF_AT;
  }
}
