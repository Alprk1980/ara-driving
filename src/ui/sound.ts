// A small synth so the game needs no audio files: an engine that follows speed, tyres, wind and rain made from
// filtered noise, crash thumps, chimes, and the radio's looping stations.
import { SCALES, type Station } from '../../schemas/content.ts';

const LOOK_AHEAD_S = 0.2, MUSIC_LEVEL = 0.05, STEPS_PER_BEAT = 4, HEARD_M = 70, TWO_TONE_S = 1.3;

/** The pitch of a scale degree, wrapping up an octave past the top of the scale. */
export function noteHz(s: Pick<Station, 'root' | 'scale'>, degree: number): number {
  const scale = SCALES[s.scale], n = scale.length;
  return 440 * 2 ** ((s.root + scale[degree % n] + 12 * Math.floor(degree / n) - 69) / 12);
}

export class Sound {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private sub: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private tyres: GainNode | null = null;
  private wind: GainNode | null = null;
  private rainfall: GainNode | null = null;
  private music: GainNode | null = null;
  private siren: { o: OscillatorNode; g: GainNode } | null = null;
  private horn: { o: OscillatorNode; g: GainNode } | null = null;
  private noise: AudioBuffer | null = null;
  private station: Station | null = null;
  private nextStep = 0;
  private stepAt = 0;
  muted = false;

  // A looping noise through one filter, silent until its gain is raised.
  private noiseBed(type: BiquadFilterType, freq: number): GainNode {
    const c = this.ctx!, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise;
    src.loop = true;
    f.type = type;
    f.frequency.value = freq;
    g.gain.value = 0;
    src.connect(f).connect(g).connect(c.destination);
    src.start();
    return g;
  }

  unlock() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      const c = this.ctx;
      this.osc = c.createOscillator();
      this.sub = c.createOscillator();
      this.gain = c.createGain();
      this.osc.type = 'sawtooth';
      this.sub.type = 'square';
      this.gain.gain.value = 0;
      const low = c.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 420;
      this.osc.connect(low);
      this.sub.connect(low);
      low.connect(this.gain).connect(c.destination);
      this.osc.start();
      this.sub.start();
      this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.tyres = this.noiseBed('bandpass', 1500);
      this.wind = this.noiseBed('lowpass', 500);
      this.rainfall = this.noiseBed('highpass', 3000);
      this.siren = this.tone('sawtooth');
      this.horn = this.tone('square');
      this.music = c.createGain();
      this.music.gain.value = MUSIC_LEVEL;
      this.music.connect(c.destination);
    } catch { this.ctx = null; }
  }

  private tone(wave: OscillatorType) {
    const c = this.ctx!, o = c.createOscillator(), g = c.createGain();
    o.type = wave;
    g.gain.value = 0;
    o.connect(g).connect(c.destination);
    o.start();
    return { o, g };
  }

  /** A blue-light crew's two-tone and a car alarm's whoop, each fading with distance; null when there's none. The pitches
   * and rates are examples chosen by ear, as the search found no published UK figures. */
  street(sirenM: number | null, alarmM: number | null) {
    if (!this.ctx || !this.siren || !this.horn) return;
    const t = this.ctx.currentTime, level = (m: number | null, top: number) => (m === null || this.muted ? 0 : top / (1 + (m / HEARD_M) ** 2));
    this.siren.o.frequency.setTargetAtTime(t % TWO_TONE_S < TWO_TONE_S / 2 ? 660 : 880, t, 0.01);
    this.siren.g.gain.setTargetAtTime(level(sirenM, 0.05), t, 0.1);
    this.horn.o.frequency.setTargetAtTime(t % 1 < 0.5 ? 1050 : 750, t, 0.02);
    this.horn.g.gain.setTargetAtTime(level(alarmM, 0.03) * (t * 6 % 1 < 0.6 ? 1 : 0), t, 0.005);
  }

  engine(ratio: number, running: boolean, throttle: number) {
    if (!this.ctx || !this.osc || !this.sub || !this.gain) return;
    const t = this.ctx.currentTime, hz = 48 + ratio * 150 + throttle * 16;
    this.osc.frequency.setTargetAtTime(hz, t, 0.08);
    this.sub.frequency.setTargetAtTime(hz / 2, t, 0.08);
    this.gain.gain.setTargetAtTime(running && !this.muted ? 0.035 + throttle * 0.03 : 0, t, 0.1);
  }

  /** The sound of the road: tyre squeal, wind that builds with speed, and rain. */
  road(slide: number, speed: number, rain: number) {
    if (!this.ctx || !this.tyres || !this.wind || !this.rainfall) return;
    const t = this.ctx.currentTime, on = this.muted ? 0 : 1;
    this.tyres.gain.setTargetAtTime(on * slide * 0.05, t, 0.05);
    this.wind.gain.setTargetAtTime(on * speed * speed * 0.05, t, 0.2);
    this.rainfall.gain.setTargetAtTime(on * rain * 0.022, t, 0.5);
  }

  chime(freq = 880) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.ctx.destination);
    o.start();
    o.stop(t + 0.32);
  }

  /** A thump and a crunch, scaled by how hard the car hit. */
  crash(speed: number) {
    if (!this.ctx || !this.noise || this.muted) return;
    const c = this.ctx, t = c.currentTime, level = Math.min(0.28, 0.06 + speed * 0.012);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise;
    f.type = 'lowpass';
    f.frequency.value = 1100;
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t, Math.random() * 0.5, 0.3);
    const o = c.createOscillator(), og = c.createGain();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    og.gain.setValueAtTime(level, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(og).connect(c.destination);
    o.start(t);
    o.stop(t + 0.22);
  }

  setStation(s: Station | null) {
    this.station = s;
    this.stepAt = 0;
  }

  private note(hz: number, at: number, len: number, wave: OscillatorType, level: number) {
    const c = this.ctx!, o = c.createOscillator(), g = c.createGain();
    o.type = wave;
    o.frequency.value = hz;
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + len);
    o.connect(g).connect(this.music!);
    o.start(at);
    o.stop(at + len + 0.02);
  }

  /** Called every frame: schedules the next few steps of the station ahead of the clock, so a slow frame cannot stutter. */
  tick() {
    if (!this.ctx || !this.music || !this.station) return;
    const s = this.station, now = this.ctx.currentTime, step = 60 / s.bpm / STEPS_PER_BEAT;
    this.music.gain.setTargetAtTime(this.muted ? 0 : MUSIC_LEVEL, now, 0.1);
    if (this.stepAt < now) this.stepAt = now + 0.05;
    while (this.stepAt < now + LOOK_AHEAD_S) {
      const lead = s.lead[this.nextStep % s.lead.length], bass = s.bass[this.nextStep % s.bass.length];
      if (lead >= 0) this.note(noteHz(s, lead) * 2, this.stepAt, step * 1.8, s.wave, 0.5);
      if (bass >= 0) this.note(noteHz(s, bass) / 2, this.stepAt, step * 1.5, 'triangle', 0.9);
      this.stepAt += step;
      this.nextStep++;
    }
  }
}
