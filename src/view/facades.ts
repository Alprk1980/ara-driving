// Paints each style's facades from the pattern in buildingplan.ts: a tile of 4 bays by 4 storeys, a street-floor strip of
// 4 bays, and a night map with a scatter of lit windows. A wall's paint varies per building, so it comes from the vertex
// colour, but only where a mask says wall: glass and trim keep their own colours, however the walls are painted.
import * as THREE from 'three';
import type { BuildingStyle } from '../../schemas/buildings.ts';
import { groundPart, upperPart, type FacePart } from './buildingplan.ts';

const GLOW = '#ffcf7a', LIT = 0.45;
const CELL = 64; // pixels per bay
export const SHOP_GLASS = '#8fb6c6'; // street-level glazing: bright daylight on a display, where the floors above read dark
export const sellsToStreet = (s: BuildingStyle) => s.ground.kind === 'shopfront' || s.ground.kind === 'arcade';

const texture = (c: HTMLCanvasElement, srgb: boolean) => {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
};

const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/** The grain of a finish on the wall, 1 for none: brick courses, panel joints, stone blocks. */
function grain(style: BuildingStyle, px: number, py: number): number {
  const across = CELL * 4 / 4;
  switch (style.finish) {
    case 'brick': {
      const course = Math.floor(py / 5), off = course % 2 ? 7 : 0;
      return py % 5 < 1 || (px + off) % 14 < 1 ? 0.86 : 0.96 + ((course * 31 + Math.floor((px + off) / 14) * 17) % 7) * 0.012;
    }
    case 'stone': {
      const course = Math.floor(py / 16), off = course % 2 ? 20 : 0;
      return py % 16 < 1 || (px + off) % 40 < 1 ? 0.88 : 1;
    }
    case 'panel': return px % across < 1.5 || py % across < 1.5 ? 0.86 : 1;
    case 'cladding': return px % 6 < 2 ? 0.92 : 1;
    default: return 1;
  }
}

type Maps = { map: THREE.Texture; mask: THREE.Texture; glow: THREE.Texture };

function paint(style: BuildingStyle, w: number, h: number, part: (px: number, py: number) => FacePart, lit: (px: number, py: number) => boolean, glass = style.glass): Maps {
  const canvas = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const col = canvas(), mask = canvas(), glow = canvas();
  const gc = col.getContext('2d')!, gm = mask.getContext('2d')!, gg = glow.getContext('2d')!;
  const ic = gc.createImageData(w, h), im = gm.createImageData(w, h), ig = gg.createImageData(w, h);
  const slot: Record<FacePart, number[]> = { wall: [255, 255, 255], glass: rgb(glass), frame: rgb(style.trim), accent: rgb(style.ground.accent), main: rgb(style.ground.main), dark: [28, 30, 38] };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, p = part(x, h - 1 - y, ), base = slot[p];
    const k = p === 'wall' ? grain(style, x, y) : p === 'glass' && glass === style.glass ? 0.9 + ((Math.floor(x / 9) * 3 + Math.floor(y / 11) * 5) % 4) * 0.08 : p === 'glass' ? 0.94 + ((x + y) % 64 < 22 ? 0.1 : 0) : 1; // a soft diagonal sheen on big panes, blinds on small ones
    ic.data[i] = base[0] * k; ic.data[i + 1] = base[1] * k; ic.data[i + 2] = base[2] * k; ic.data[i + 3] = 255;
    const m = p === 'wall' ? 255 : 0;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = m; im.data[i + 3] = 255;
    const on = p === 'glass' && lit(x, h - 1 - y) ? 255 : 0;
    ig.data[i] = ig.data[i + 1] = ig.data[i + 2] = on; ig.data[i + 3] = 255;
  }
  gc.putImageData(ic, 0, 0); gm.putImageData(im, 0, 0); gg.putImageData(ig, 0, 0);
  return { map: texture(col, true), mask: texture(mask, false), glow: texture(glow, true) };
}

function material(maps: Maps): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ map: maps.map, emissive: GLOW, emissiveMap: maps.glow, emissiveIntensity: 0, vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.wallMask = { value: maps.mask };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D wallMask;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= mix(vec3(1.0), vColor.rgb, texture2D(wallMask, vMapUv).r);');
  };
  m.customProgramCacheKey = () => 'wall-mask';
  return m;
}

export type StyleMaterials = { upper: THREE.MeshLambertMaterial; ground: THREE.MeshLambertMaterial };

/** A style's two materials; the facade tile repeats, the street floor runs on along its wall. */
export function styleMaterials(style: BuildingStyle): StyleMaterials {
  const seed = [...style.id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const litCell = (a: number, b: number) => ((Math.imul(a * 7 + b * 13 + seed, 0x5bd1e995) >>> 0) % 100) / 100 < LIT;
  const size = CELL * 4;
  const upper = paint(style, size, size, (x, y) => upperPart(style, (x % CELL) / CELL, (y % CELL) / CELL), (x, y) => litCell(Math.floor(x / CELL), Math.floor(y / CELL)));
  const ground = paint(style, size, CELL, (x, y) => groundPart(style, Math.floor(x / CELL), (x % CELL) / CELL, y / CELL), () => style.ground.kind !== 'loading', sellsToStreet(style) ? SHOP_GLASS : style.glass);
  return { upper: material(upper), ground: material(ground) };
}
