/**
 * 音效：Web Audio API 程序化生成（无需音频文件）
 */
let ctx: AudioContext | null = null;

export function ensureAudio() {
  if (!ctx) {
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      ctx = new AC();
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(
  freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15,
  slideTo?: number
) {
  const c = ensureAudio();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), c.currentTime + dur);
  }
  gain.gain.setValueAtTime(vol, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + dur);
}

function noiseBurst(dur: number, vol = 0.2, freq = 800) {
  const c = ensureAudio();
  if (!c) return;
  const bufferSize = c.sampleRate * dur;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  src.connect(filter).connect(gain).connect(c.destination);
  src.start();
}

export type SfxName = 'tower' | 'kill' | 'place' | 'core' | 'drum' | 'hit';

export function playSfx(name: SfxName) {
  try {
    switch (name) {
      case 'tower':
        tone(880, 0.08, 'square', 0.1, 320); break;
      case 'kill':
        noiseBurst(0.12, 0.15, 400); tone(200, 0.1, 'sawtooth', 0.1, 60); break;
      case 'place':
        tone(300, 0.15, 'triangle', 0.18, 600); break;
      case 'core':
        tone(110, 0.6, 'sine', 0.1, 55); break;
      case 'hit':
        noiseBurst(0.2, 0.25, 250); break;
      case 'drum':
        tone(90, 0.18, 'sine', 0.3, 45); break;
    }
  } catch {
    /* ignore */
  }
}

/** 战鼓循环，出现大规模进攻时 */
let drumInterval: ReturnType<typeof setInterval> | null = null;
export function startDrums() {
  if (drumInterval) return;
  drumInterval = setInterval(() => playSfx('drum'), 900);
}
export function stopDrums() {
  if (drumInterval) {
    clearInterval(drumInterval);
    drumInterval = null;
  }
}