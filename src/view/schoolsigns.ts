// The warning signs at each end of a school's 20 mph stretch: the red triangle with two children (the Traffic Signs
// Regulations' "children going to or from school" sign, from memory of the diagram), a "School" plate under it, and
// a pair of amber lamps that flash in turn while the school run is on, as part-time 20 mph signs do.
import * as THREE from 'three';
import type { Game } from '../sim/game.ts';
import { ZONE_M } from '../sim/schoolrun.ts';
import { ROAD_W } from '../sim/town.ts';

const LAMP_OFF = '#4a3b1a', LAMP_ON = '#ffb21f', FLASH_HZ = 1; // the pair alternate about once a second: judged

function face(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(64, 6); g.lineTo(122, 106); g.lineTo(6, 106); g.closePath(); g.fill();
  g.lineWidth = 12; g.strokeStyle = '#d4202a'; g.stroke();
  g.fillStyle = '#111';
  for (const [x, h] of [[52, 34], [76, 28]] as const) { g.fillRect(x - 5, 88 - h, 10, h); g.beginPath(); g.arc(x, 82 - h, 7, 0, 7); g.fill(); } // two children walking
  g.fillStyle = '#ffffff'; g.fillRect(14, 116, 100, 38);
  g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(14, 116, 100, 38);
  g.fillStyle = '#111'; g.font = '700 26px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('School', 64, 136);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SchoolSigns {
  group = new THREE.Group();
  private lamps: THREE.MeshBasicMaterial[] = [];
  private game: Game;

  constructor(game: Game) {
    this.game = game;
    const t = game.town, plate = new THREE.MeshBasicMaterial({ map: face(), transparent: true, side: THREE.DoubleSide }), post = new THREE.MeshLambertMaterial({ color: '#6b6f78' });
    const a = new THREE.MeshBasicMaterial({ color: LAMP_OFF }), b = new THREE.MeshBasicMaterial({ color: LAMP_OFF });
    this.lamps = [a, b];
    for (const s of game.schools) {
      const e = t.edges[t.snap(s.gate).edge], na = t.nodes[e.a], nb = t.nodes[e.b], ux = (nb.x - na.x) / e.len, uz = (nb.z - na.z) / e.len;
      const along = (s.gate.x - na.x) * ux + (s.gate.z - na.z) * uz;
      for (const dir of [-1, 1]) { // one at each end, facing the traffic coming into the zone, on its nearside
        const at = Math.max(4, Math.min(e.len - 4, along + dir * ZONE_M)), side = -dir; // UK traffic keeps left
        const x = na.x + ux * at - uz * side * (ROAD_W / 2 + 0.8), z = na.z + uz * at + ux * side * (ROAD_W / 2 + 0.8);
        const sign = new THREE.Group();
        sign.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.9, 6).translate(0, 1.45, 0), post));
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.94), plate);
        p.position.set(0, 2.05, 0.05);
        sign.add(p);
        for (const [m, dx] of [[a, -0.22], [b, 0.22]] as const) {
          const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10).rotateX(Math.PI / 2), m);
          lamp.position.set(dx, 2.72, 0.06);
          sign.add(lamp);
        }
        sign.position.set(x, 0, z);
        sign.rotation.y = Math.atan2(-ux * dir, -uz * dir); // its face to the oncoming traffic
        this.group.add(sign);
      }
    }
  }

  /** Flash the lamps in turn while the run is on. */
  update() {
    const on = this.game.schoolRun, phase = Math.floor(this.game.time * FLASH_HZ * 2) % 2;
    this.lamps.forEach((m, i) => m.color.set(on && phase === i ? LAMP_ON : LAMP_OFF));
  }
}
