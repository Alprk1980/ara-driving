// The sky around the camera: a gradient dome with a sun, drifting clouds, a moon and stars. It all travels with the
// camera, so it costs a handful of draw calls however far the car goes.
import * as THREE from 'three';
import type { SkyNow } from './sky.ts';

const R = 1000, STARS = 420, CLOUD_Y = 300, CLOUD_SIZE = 2600, CLOUD_DRIFT = 0.0035;
const WHITE = new THREE.Color('#ffffff');

const domeVert = `varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const domeFrag = `uniform vec3 top, horizon, sunColor, sunDir; uniform float sunGlow;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec3 c = mix(horizon, top, pow(clamp(d.y * 1.6, 0.0, 1.0), 0.6));
  float s = max(dot(d, sunDir), 0.0);
  c += sunColor * sunGlow * (pow(s, 8.0) * 0.16 + pow(s, 300.0) * 0.8 + smoothstep(0.9993, 0.9996, s) * 3.0);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const cloudVert = `varying vec2 vUv; varying vec2 vPos;
void main() { vUv = uv; vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const cloudFrag = `uniform sampler2D map; uniform vec3 tint; uniform float cover, drift;
varying vec2 vUv; varying vec2 vPos;
void main() {
  float a = texture2D(map, vUv * 3.0 + vec2(drift, drift * 0.4)).r;
  a = smoothstep(0.55 - cover * 0.4, 0.85, a) * (1.0 - smoothstep(500.0, 1250.0, length(vPos))); // fades before the edge shows
  gl_FragColor = vec4(tint, a * 0.85);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Soft blobs, drawn wrapped round the edges so the texture tiles with no seam.
function cloudTexture() {
  const size = 256, c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000000';
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 12 + Math.random() * 34;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      const b = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      b.addColorStop(0, 'rgba(255,255,255,0.32)');
      b.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = b;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const rgbColour = (c: THREE.Color, v: readonly [number, number, number]) => c.setRGB(v[0], v[1], v[2], THREE.SRGBColorSpace);

export class Dome {
  private group = new THREE.Group();
  private sky: THREE.ShaderMaterial;
  private clouds: THREE.Mesh;
  private cloudMat: THREE.ShaderMaterial;
  private stars: THREE.PointsMaterial;
  private moon: THREE.Mesh;
  private moonMat: THREE.MeshBasicMaterial;
  private to = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.sky = new THREE.ShaderMaterial({
      vertexShader: domeVert, fragmentShader: domeFrag, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunGlow: { value: 1 } },
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 14), this.sky);
    dome.renderOrder = -10;

    this.cloudMat = new THREE.ShaderMaterial({
      vertexShader: cloudVert, fragmentShader: cloudFrag, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      uniforms: { map: { value: cloudTexture() }, tint: { value: new THREE.Color('#ffffff') }, cover: { value: 0 }, drift: { value: 0 } },
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(CLOUD_SIZE, CLOUD_SIZE), this.cloudMat);
    this.clouds.rotation.x = Math.PI / 2;
    this.clouds.position.y = CLOUD_Y;

    const spots: number[] = [];
    for (let i = 0; i < STARS; i++) {
      const a = Math.random() * Math.PI * 2, y = 0.08 + Math.random() * 0.92, r = Math.sqrt(1 - y * y);
      spots.push(Math.cos(a) * r * R * 0.95, y * R * 0.95, Math.sin(a) * r * R * 0.95);
    }
    const starShape = new THREE.BufferGeometry();
    starShape.setAttribute('position', new THREE.Float32BufferAttribute(spots, 3));
    this.stars = new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false });

    this.moonMat = new THREE.MeshBasicMaterial({ color: '#f2efe0', transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(26, 24), this.moonMat);

    this.group.add(dome, this.clouds, new THREE.Points(starShape, this.stars), this.moon);
    this.group.traverse((o) => { o.frustumCulled = false; });
    scene.add(this.group);
  }

  setClouds(on: boolean) { this.clouds.visible = on; }

  update(camera: THREE.Camera, now: SkyNow, sun: THREE.Vector3, rain: number, dt: number) {
    const u = this.sky.uniforms, night = now.night, clear = 1 - rain;
    this.group.position.copy(camera.position);
    rgbColour(u.top.value, now.sky);
    rgbColour(u.horizon.value, now.fog);
    rgbColour(u.sunColor.value, now.sun);
    u.sunDir.value.copy(sun);
    u.sunGlow.value = THREE.MathUtils.smoothstep(sun.y, -0.04, 0.12) * clear;

    const c = this.cloudMat.uniforms, shade = 0.45 + now.ambient * 0.25 - rain * 0.3;
    rgbColour(c.tint.value, now.sun).lerp(WHITE, 0.6).multiplyScalar(shade);
    c.cover.value = 0.25 + rain * 0.75;
    c.drift.value = (c.drift.value + dt * CLOUD_DRIFT) % 1;

    this.stars.opacity = Math.max(0, night - 0.4) * 1.6 * clear;
    this.moonMat.opacity = Math.min(1, night * 1.4) * clear;
    this.to.copy(sun).negate();
    this.to.y = Math.max(0.3, this.to.y);
    this.moon.position.copy(this.to.normalize().multiplyScalar(R * 0.9));
    this.moon.lookAt(camera.position);
  }
}
