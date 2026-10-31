// A temporary performance readout. Frames are timed with the real clock, not the game's capped step, so a slow phone
// shows its true rate; "work" is the time spent in our own frame code, so a low rate with little work points at the GPU.
const WINDOW_S = 0.5; // how often the readout refreshes
const SMOOTH_FPS = 55, CHOPPY_FPS = 30;

export type PerfSummary = { fps: number; averageMs: number; worstMs: number; workMs: number };

/** A window of frames as a summary: gaps between frames and the time each spent working, both in milliseconds. */
export function summarise(gapsMs: readonly number[], workMs: readonly number[]): PerfSummary {
  const total = gapsMs.reduce((a, b) => a + b, 0), n = gapsMs.length;
  if (!n || total <= 0) return { fps: 0, averageMs: 0, worstMs: 0, workMs: 0 };
  return { fps: Math.round((n * 1000) / total), averageMs: total / n, worstMs: Math.max(...gapsMs), workMs: workMs.reduce((a, b) => a + b, 0) / (workMs.length || 1) };
}

export const perfBand = (fps: number) => (fps >= SMOOTH_FPS ? 'good' : fps >= CHOPPY_FPS ? 'warn' : 'bad');

export class PerfMeter {
  private el: HTMLElement;
  private gaps: number[] = [];
  private work: number[] = [];
  private last = 0;
  private clock = 0;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  /** Call once a frame, after rendering: the frame's timestamp, the time it took, and the renderer's counts. */
  tick(now: number, workMs: number, render: { calls: number; triangles: number }) {
    if (this.last) {
      const gap = now - this.last;
      this.gaps.push(gap);
      this.work.push(workMs);
      this.clock += gap / 1000;
    }
    this.last = now;
    if (this.clock < WINDOW_S) return;
    const s = summarise(this.gaps, this.work);
    this.el.dataset.band = perfBand(s.fps);
    this.el.textContent = `${s.fps} fps  ${s.averageMs.toFixed(1)} ms  worst ${s.worstMs.toFixed(0)} ms\nwork ${s.workMs.toFixed(1)} ms  ${render.calls} calls  ${Math.round(render.triangles / 1000)}k tris`;
    this.gaps.length = this.work.length = 0;
    this.clock = 0;
  }
}
