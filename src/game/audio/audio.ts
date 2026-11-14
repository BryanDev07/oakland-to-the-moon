/**
 * Procedural retro audio (Web Audio API). All sounds and music are synthesised at runtime:
 * no audio files, no copyrighted material. Fails silently if audio is unavailable or blocked.
 */
import { store } from '../../state/store';

type Tune = 'title' | 'build' | 'space' | 'tension' | 'surface' | 'victory' | 'none';

const NOTE: Record<string, number> = {};
['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].forEach((n, i) => {
  for (let o = 1; o < 8; o++) NOTE[`${n}${o}`] = 440 * Math.pow(2, (i - 9 + (o - 4) * 12) / 12);
});

// Original compositions as simple step patterns (16th-note steps). '.' = rest.
const SONGS: Record<Exclude<Tune, 'none'>, { bpm: number; lead: string[]; bass: string[]; arp?: string[][]; wave: OscillatorType }> = {
  title: {
    bpm: 84, wave: 'triangle',
    lead: ['E5', '.', '.', 'G5', '.', '.', 'A5', '.', 'B5', '.', '.', '.', 'A5', '.', 'G5', '.', 'E5', '.', '.', '.', 'D5', '.', 'E5', '.', 'G5', '.', '.', '.', '.', '.', '.', '.',
      'C5', '.', '.', 'E5', '.', '.', 'G5', '.', 'A5', '.', '.', '.', 'G5', '.', 'E5', '.', 'D5', '.', '.', '.', 'E5', '.', 'D5', '.', 'B4', '.', '.', '.', '.', '.', '.', '.'],
    bass: ['A2', '.', '.', '.', 'A2', '.', '.', '.', 'F2', '.', '.', '.', 'F2', '.', '.', '.', 'C3', '.', '.', '.', 'C3', '.', '.', '.', 'G2', '.', '.', '.', 'G2', '.', '.', '.'],
    arp: [['A3', 'C4', 'E4', 'A4'], ['F3', 'A3', 'C4', 'F4'], ['C4', 'E4', 'G4', 'C5'], ['G3', 'B3', 'D4', 'G4']],
  },
  build: {
    bpm: 118, wave: 'square',
    lead: ['C5', '.', 'E5', '.', 'G5', '.', 'E5', '.', 'F5', '.', 'A5', '.', 'G5', '.', '.', '.', 'E5', '.', 'G5', '.', 'C6', '.', 'B5', '.', 'A5', '.', 'G5', '.', 'E5', '.', '.', '.'],
    bass: ['C3', '.', 'C3', '.', 'G2', '.', 'G2', '.', 'F2', '.', 'F2', '.', 'G2', '.', 'G2', '.'],
    arp: [['C4', 'E4', 'G4'], ['G3', 'B3', 'D4'], ['F3', 'A3', 'C4'], ['G3', 'B3', 'D4']],
  },
  space: {
    bpm: 66, wave: 'sine',
    lead: ['A4', '.', '.', '.', '.', '.', 'E5', '.', '.', '.', '.', '.', 'D5', '.', '.', '.', 'C5', '.', '.', '.', '.', '.', 'B4', '.', '.', '.', '.', '.', '.', '.', '.', '.'],
    bass: ['A2', '.', '.', '.', '.', '.', '.', '.', 'F2', '.', '.', '.', '.', '.', '.', '.', 'D2', '.', '.', '.', '.', '.', '.', '.', 'E2', '.', '.', '.', '.', '.', '.', '.'],
    arp: [['A3', 'E4', 'A4', 'C5'], ['F3', 'C4', 'F4', 'A4'], ['D3', 'A3', 'D4', 'F4'], ['E3', 'B3', 'E4', 'G#4']],
  },
  tension: {
    bpm: 132, wave: 'square',
    lead: ['E5', '.', '.', 'F5', '.', '.', 'E5', '.', 'D5', '.', '.', 'E5', '.', '.', '.', '.'],
    bass: ['E2', 'E2', '.', 'E2', 'F2', '.', 'E2', '.', 'E2', 'E2', '.', 'E2', 'D2', '.', 'E2', '.'],
  },
  surface: {
    bpm: 76, wave: 'triangle',
    lead: ['G4', '.', 'B4', '.', 'D5', '.', '.', '.', 'C5', '.', 'B4', '.', 'A4', '.', '.', '.', 'G4', '.', 'B4', '.', 'E5', '.', '.', '.', 'D5', '.', '.', '.', '.', '.', '.', '.'],
    bass: ['G2', '.', '.', '.', 'G2', '.', '.', '.', 'C3', '.', '.', '.', 'D3', '.', '.', '.'],
    arp: [['G3', 'B3', 'D4'], ['C4', 'E4', 'G4'], ['E3', 'G3', 'B3'], ['D3', 'F#3', 'A3']],
  },
  victory: {
    bpm: 120, wave: 'square',
    lead: ['C5', 'E5', 'G5', 'C6', '.', 'G5', 'C6', '.', 'D6', '.', '.', '.', 'C6', '.', '.', '.', 'A5', 'C6', 'F6', '.', 'E6', '.', 'D6', '.', 'C6', '.', '.', '.', '.', '.', '.', '.'],
    bass: ['C3', '.', 'G2', '.', 'C3', '.', 'G2', '.', 'F2', '.', 'C3', '.', 'G2', '.', 'G2', '.'],
  },
};

class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicBus: GainNode | null = null;
  sfxBus: GainNode | null = null;
  noiseBuf: AudioBuffer | null = null;
  tune: Tune = 'none';
  step = 0;
  nextTime = 0;
  timer: number | null = null;
  loops: Record<string, { src: AudioBufferSourceNode | OscillatorNode; gain: GainNode; filter?: BiquadFilterNode }> = {};

  /** Must be called from a user gesture (browser autoplay policy). Safe to call repeatedly. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
        this.musicBus = this.ctx.createGain(); this.musicBus.connect(this.master);
        this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuf.getChannelData(0);
        let seed = 12345;
        for (let i = 0; i < len; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; data[i] = (seed / 0x7fffffff) * 2 - 1; }
        this.applyVolumes();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      if (this.tune !== 'none' && this.timer === null) this.startScheduler();
    } catch { this.ctx = null; }
  }
  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  applyVolumes() {
    if (!this.ctx || !this.master) return;
    const s = store.settings;
    this.master.gain.value = s.muted ? 0 : 1;
    this.musicBus!.gain.value = s.musicVolume * 0.35;
    this.sfxBus!.gain.value = s.sfxVolume * 0.6;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, bus: GainNode | null = this.sfxBus, slideTo?: number) {
    if (!this.ctx || !bus) return;
    const t0 = (when || this.ctx.currentTime);
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bus); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  private noise(dur: number, vol: number, freq = 1200, type: BiquadFilterType = 'lowpass') {
    if (!this.ctx || !this.noiseBuf) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus!); src.start(t0); src.stop(t0 + dur);
  }

  sfx(name: 'move' | 'select' | 'back' | 'error' | 'beep' | 'alarm' | 'blip' | 'install' | 'remove' | 'stage' | 'ignite' | 'land' | 'success' | 'fail' | 'warn' | 'camera' | 'dig') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'move': this.tone(880, 0.05, 'square', 0.12); break;
      case 'select': this.tone(660, 0.06, 'square', 0.15); this.tone(990, 0.08, 'square', 0.15, t + 0.06); break;
      case 'back': this.tone(520, 0.06, 'square', 0.12); this.tone(390, 0.08, 'square', 0.12, t + 0.05); break;
      case 'error': this.tone(180, 0.18, 'sawtooth', 0.14); break;
      case 'beep': this.tone(1320, 0.07, 'sine', 0.12); break;
      case 'blip': this.tone(1500 + Math.random() * 200, 0.025, 'square', 0.04); break;
      case 'alarm': for (let i = 0; i < 3; i++) { this.tone(880, 0.16, 'square', 0.16, t + i * 0.36); this.tone(660, 0.16, 'square', 0.16, t + i * 0.36 + 0.18); } break;
      case 'warn': this.tone(740, 0.12, 'triangle', 0.15); this.tone(740, 0.12, 'triangle', 0.15, t + 0.2); break;
      case 'install': this.noise(0.06, 0.25, 3000, 'highpass'); this.tone(300, 0.08, 'square', 0.15, t + 0.03, this.sfxBus, 600); break;
      case 'remove': this.tone(500, 0.1, 'square', 0.12, 0, this.sfxBus, 200); break;
      case 'stage': this.noise(0.5, 0.5, 800); this.tone(120, 0.3, 'sawtooth', 0.2, 0, this.sfxBus, 50); break;
      case 'ignite': this.noise(1.6, 0.6, 500); this.tone(70, 1.4, 'sawtooth', 0.25, 0, this.sfxBus, 40); break;
      case 'land': this.noise(0.4, 0.4, 400); this.tone(90, 0.3, 'triangle', 0.3); break;
      case 'camera': this.noise(0.04, 0.3, 4000, 'highpass'); this.tone(2000, 0.03, 'square', 0.08, t + 0.05); break;
      case 'dig': this.noise(0.15, 0.25, 1500, 'bandpass'); break;
      case 'success': ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => this.tone(NOTE[n], 0.22, 'square', 0.14, t + i * 0.11)); break;
      case 'fail': ['E4', 'D#4', 'D4', 'C#4'].forEach((n, i) => this.tone(NOTE[n], 0.3, 'triangle', 0.16, t + i * 0.22)); break;
    }
  }

  /** Continuous engine rumble / thrust loops with a controllable level 0..1. */
  loop(name: 'rumble' | 'thrust' | 'wind', level: number) {
    if (!this.ctx || !this.noiseBuf) return;
    let l = this.loops[name];
    if (!l && level > 0) {
      const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = name === 'rumble' ? 300 : name === 'wind' ? 900 : 600;
      const g = this.ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.sfxBus!); src.start();
      l = this.loops[name] = { src, gain: g, filter: f };
    }
    if (!l) return;
    l.gain.gain.setTargetAtTime(level * (name === 'rumble' ? 0.9 : 0.5), this.ctx.currentTime, 0.08);
    if (level <= 0) { const ll = l; setTimeout(() => { try { if (ll.gain.gain.value < 0.01) { ll.src.stop(); delete this.loops[name]; } } catch { /* ignore */ } }, 600); }
  }
  stopLoops() { for (const k of Object.keys(this.loops)) this.loop(k as 'rumble', 0); }

  music(t: Tune) {
    if (this.tune === t) return;
    this.tune = t; this.step = 0;
    if (t === 'none') { this.stopScheduler(); return; }
    if (this.ctx) this.startScheduler();
  }
  private startScheduler() {
    if (!this.ctx) return;
    this.stopScheduler();
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 50);
  }
  private stopScheduler() { if (this.timer !== null) { clearInterval(this.timer); this.timer = null; } }
  private schedule() {
    if (!this.ctx || this.tune === 'none') return;
    const song = SONGS[this.tune];
    const stepDur = 60 / song.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      const i = this.step;
      const lead = song.lead[i % song.lead.length];
      if (lead && lead !== '.') this.tone(NOTE[lead], stepDur * 2.6, song.wave, 0.09, this.nextTime, this.musicBus);
      const bass = song.bass[i % song.bass.length];
      if (bass && bass !== '.') this.tone(NOTE[bass], stepDur * 3.5, 'triangle', 0.16, this.nextTime, this.musicBus);
      if (song.arp) {
        const chord = song.arp[Math.floor(i / 16) % song.arp.length];
        if (i % 2 === 0) this.tone(NOTE[chord[(i / 2) % chord.length]], stepDur * 1.2, 'square', 0.025, this.nextTime, this.musicBus);
      }
      this.nextTime += stepDur;
      this.step++;
      if (this.tune === 'victory' && this.step >= song.lead.length) { this.tune = 'none'; this.stopScheduler(); return; }
    }
  }
}

export const audio = new AudioEngine();
