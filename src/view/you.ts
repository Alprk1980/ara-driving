// You out of the car: one of the town's figures, drawn and walked the same way as the crowd on the pavements.
import * as THREE from 'three';
import type { Driver } from '../save.ts';
import type { OnFoot } from '../sim/onfoot.ts';
import { dressed } from '../sim/shops.ts';
import type { Lookup } from './cockpit.ts';
import { figureGeometry, figureMaterial, LOOKS, nextPace, walkPose } from './people.ts';

export class YouFigure {
  private mesh: THREE.InstancedMesh | null = null;
  private strides = new THREE.InstancedBufferAttribute(new Float32Array(2), 2);
  private scene: THREE.Scene;
  private pace = 0;
  private phase = 0;
  private clock = 0;

  private find: Lookup;

  constructor(scene: THREE.Scene, look: number, find: Lookup) {
    this.scene = scene;
    this.find = find;
    this.strides.setUsage(THREE.DynamicDrawUsage);
    this.setLook(look);
  }

  /** Which of the town's looks you are, in the clothes you've put on. */
  setLook(look: number, driver: Driver = {}) {
    const was = this.mesh?.visible ?? false;
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
    const g = figureGeometry(dressed(LOOKS[((look % LOOKS.length) + LOOKS.length) % LOOKS.length], driver, this.find));
    g.setAttribute('stride', this.strides);
    this.mesh = new THREE.InstancedMesh(g, figureMaterial(), 1);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.visible = was;
    this.scene.add(this.mesh);
  }

  draw(dt: number, foot: OnFoot | null) {
    const mesh = this.mesh!;
    mesh.visible = !!foot;
    if (!foot) return;
    this.clock += dt;
    if (dt > 0) { this.pace = nextPace(this.pace, foot.phase !== this.phase, dt); this.phase = foot.phase; }
    const pose = walkPose(foot.phase, this.pace, this.clock);
    mesh.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(foot.x, -pose.drop, foot.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), foot.heading), new THREE.Vector3(1, 1, 1)));
    this.strides.setXY(0, pose.hip, pose.arm);
    mesh.instanceMatrix.needsUpdate = this.strides.needsUpdate = true;
  }
}
