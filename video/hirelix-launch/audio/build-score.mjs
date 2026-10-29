// Original score and sound design for the Hirelix launch film.
// Everything is synthesized here from oscillators and noise: no samples, no
// third-party music. Deterministic (seeded noise), 48 kHz stereo, 35 s.
//
//   node audio/build-score.mjs   → public/audio/score.wav
//
// Cue times mirror src/timeline.ts (frames at 30fps; 120 BPM = 15 frames/beat).
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SR = 48000;
const DUR = 35;
const N = SR * DUR;
const L = new Float32Array(N);
const R = new Float32Array(N);
const BPM = 120;
const BEAT = 60 / BPM;
const f2s = (f) => f / 30;

// Read cue frames from the film's timeline so picture and sound stay locked.
const tl = readFileSync(join(here, "../src/timeline.ts"), "utf8");
const T = Object.fromEntries([...tl.matchAll(/^\s+(\w+): (\d+),/gm)].map((m) => [m[1], Number(m[2])]));

let seed = 1234567;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296 * 2 - 1;
};
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function add(i, l, r) {
  if (i >= 0 && i < N) {
    L[i] += l;
    R[i] += r;
  }
}

/** Soft mallet/pluck: sine + quiet octave, exponential decay. */
function pluck(t0, freq, { amp = 0.12, decay = 0.6, pan = 0, attack = 0.004, bright = 0.25 } = {}) {
  const s0 = Math.floor(t0 * SR);
  const len = Math.floor((decay * 6) * SR);
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let k = 0; k < len; k++) {
    const t = k / SR;
    const env = Math.min(1, t / attack) * Math.exp(-t / decay);
    const ph = 2 * Math.PI * freq * t;
    const v = (Math.sin(ph) + bright * Math.sin(2 * ph) * Math.exp(-t / (decay * 0.3)) + 0.08 * Math.sin(3 * ph) * Math.exp(-t / (decay * 0.15))) * env * amp;
    add(s0 + k, v * gl, v * gr);
  }
}

/** Warm pad: detuned triangle-ish voices with slow attack/release. */
function pad(t0, t1, notes, { amp = 0.05, attack = 1.2, release = 1.5 } = {}) {
  const s0 = Math.floor(t0 * SR);
  const len = Math.floor((t1 - t0 + release) * SR);
  const dur = t1 - t0;
  for (let k = 0; k < len; k++) {
    const t = k / SR;
    const env = clamp01(t / attack) * (t < dur ? 1 : Math.exp(-(t - dur) / (release / 3)));
    let l = 0;
    let r = 0;
    notes.forEach((n, j) => {
      const f = midi(n);
      const a = Math.sin(2 * Math.PI * f * 1.0015 * t + j);
      const b = Math.sin(2 * Math.PI * f * 0.9985 * t + j * 2);
      const c = 0.18 * Math.sin(2 * Math.PI * f * 2 * t);
      l += a + c;
      r += b + c;
    });
    const wob = 1 + 0.06 * Math.sin(2 * Math.PI * 0.2 * t);
    add(s0 + k, (l * env * amp * wob) / notes.length, (r * env * amp * wob) / notes.length);
  }
}

/** Sub/bass note with soft saturation. */
function bass(t0, dur, n, amp = 0.16) {
  const s0 = Math.floor(t0 * SR);
  const len = Math.floor((dur + 0.15) * SR);
  const f = midi(n);
  for (let k = 0; k < len; k++) {
    const t = k / SR;
    const env = Math.min(1, t / 0.012) * (t < dur ? 1 - 0.25 * (t / dur) : Math.exp(-(t - dur) / 0.04));
    const v = Math.tanh(1.6 * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t))) * env * amp;
    add(s0 + k, v, v);
  }
}

/** Soft kick: pitch-swept sine. */
function kick(t0, amp = 0.32) {
  const s0 = Math.floor(t0 * SR);
  const len = Math.floor(0.42 * SR);
  let ph = 0;
  for (let k = 0; k < len; k++) {
    const t = k / SR;
    const f = 44 + 90 * Math.exp(-t / 0.035);
    ph += (2 * Math.PI * f) / SR;
    const v = Math.sin(ph) * Math.exp(-t / 0.13) * amp;
    add(s0 + k, v, v);
  }
}

/** Filtered noise hit: hats, ticks, whooshes. One-pole filters keep it soft. */
function noise(t0, dur, { amp = 0.05, hp = 0.6, lpStart = 0.5, lpEnd = 0.5, shape = "decay", pan = 0, sweep = 0 } = {}) {
  const s0 = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  let lp = 0;
  let prev = 0;
  let hpOut = 0;
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let k = 0; k < len; k++) {
    const x = k / len;
    const a = lpStart + (lpEnd - lpStart) * x;
    const n = rnd();
    lp += a * (n - lp);
    hpOut = hp * (hpOut + lp - prev);
    prev = lp;
    let env;
    if (shape === "decay") env = Math.exp(-x * 7);
    else if (shape === "swell") env = Math.pow(x, 2.2) * (1 - Math.pow(x, 12));
    else env = Math.sin(Math.PI * x) ** 2;
    const p = sweep ? Math.sin(Math.PI * x) * sweep : 0;
    add(s0 + k, hpOut * env * amp * (gl - p * 0.3), hpOut * env * amp * (gr + p * 0.3));
  }
}

/** UI tick: tiny high sine blip. */
function tick(t0, freq = 2400, amp = 0.045, pan = 0) {
  pluck(t0, freq, { amp, decay: 0.025, pan, bright: 0 });
}

/** Typing: very short filtered clicks, deterministic jitter. */
function typing(t0, t1, rate = 22) {
  for (let t = t0; t < t1; t += 1 / rate) {
    const j = (rnd() * 0.5 + 0.5) * 0.012;
    noise(t + j, 0.018, { amp: 0.05, hp: 0.9, lpStart: 0.7, lpEnd: 0.7 });
  }
}

/* ------------------------------ Music ------------------------------ */
// Key: D major-ish, with a lydian lift. Chords per 2 bars (4 s).
const prog = [
  [50, 57, 62, 66, 69], // D  maj9-ish
  [47, 54, 59, 62, 66], // Bm
  [43, 50, 55, 59, 64], // G  add9 (lydian colour)
  [45, 52, 57, 61, 64], // A
];
const bars = (b) => b * 4 * BEAT; // seconds at bar b

// Intro: pad only, motif enters with the "One JD." hit.
pad(0, 4.0, [62, 66, 69, 74], { amp: 0.045, attack: 1.4 });
// Main bed
for (let c = 0; c < 8; c++) {
  const t0 = 4 + c * 4;
  if (t0 >= 30) break;
  const ch = prog[c % 4];
  pad(t0, t0 + 4, ch.slice(1), { amp: 0.04, attack: 0.6, release: 1.2 });
}

// Pulse: eighth-note mallet arpeggio. Builds in Scene 2, thins in Scene 4, stops before the logo.
const arp = [0, 2, 3, 4, 3, 2, 1, 2];
for (let i = 0; i < 26 * 2 * 2; i++) {
  const t = 4 + i * (BEAT / 2);
  if (t >= 28.9) break;
  const ch = prog[Math.floor((t - 4) / 4) % 4];
  const n = ch[arp[i % 8]] + 12;
  const sceneAmp = t < 13 ? 0.03 + 0.03 * ((t - 4) / 9) : t < 20 ? 0.06 : t < 26 ? 0.045 : 0.03;
  pluck(t, midi(n), { amp: sceneAmp, decay: 0.22, pan: i % 2 ? 0.35 : -0.35, bright: 0.35 });
}

// Bass + kick from the search start; kick drops out for the memory scene, returns briefly.
for (let b = 0; b < 52; b++) {
  const t = 4 + b * BEAT * 1;
  if (t >= 29) break;
  const ch = prog[Math.floor((t - 4) / 4) % 4];
  if (b % 2 === 0) bass(t, BEAT * 1.6, ch[0] - 12, t < 6 ? 0.08 : 0.13);
  const inMemory = t >= 20.2 && t < 24;
  if (!inMemory && t >= 5) kick(t, b % 4 === 0 ? 0.28 : 0.2);
  if (t >= 7 && !inMemory) noise(t + BEAT / 2, 0.06, { amp: 0.035, hp: 0.95, lpStart: 0.9, lpEnd: 0.9 }); // offbeat hat
}

// Melodic motif (4 notes) — the "Hirelix" phrase. Heard at the hook, the refinement and the logo.
const motif = (t0, root, amp = 0.09) => {
  [0, 4, 7, 11].forEach((iv, k) => pluck(t0 + k * BEAT * 0.5, midi(root + iv), { amp: amp * (k === 3 ? 1.15 : 1), decay: 0.9, pan: -0.2 + k * 0.13, bright: 0.2 }));
};
motif(f2s(T.oneJD), 74, 0.07);
motif(f2s(T.sendRefine) + 0.05, 74, 0.05);

/* --------------------------- Sound design --------------------------- */
// Scene 1
noise(f2s(T.cardIn) - 0.1, 0.7, { amp: 0.08, hp: 0.5, lpStart: 0.08, lpEnd: 0.35, shape: "hump", sweep: 0.6 }); // card slide
tick(f2s(T.cardIn + 26), 1800, 0.04);
typing(f2s(T.typeStart), f2s(T.typeEnd));
pluck(f2s(T.send), midi(86), { amp: 0.08, decay: 0.18, bright: 0.1 }); // send
pluck(f2s(T.send) + 0.06, midi(93), { amp: 0.05, decay: 0.25 });
noise(f2s(T.morph) - 0.55, 0.9, { amp: 0.11, hp: 0.4, lpStart: 0.04, lpEnd: 0.5, shape: "swell" }); // into the app
kick(f2s(T.morphEnd - 22), 0.34);
bass(f2s(T.morphEnd - 22), 1.2, 38, 0.12);

// Scene 2 · steps complete, pages land, rows assemble
[T.step1Done, T.step2Done, T.step3Done, T.step4Done].forEach((f, k) => pluck(f2s(f), midi(81 + [0, 2, 4, 7][k]), { amp: 0.045, decay: 0.3, pan: 0.2 }));
for (let i = 0; i < 5; i++) noise(f2s(T.pages + i * 9), 0.16, { amp: 0.05, hp: 0.6, lpStart: 0.25, lpEnd: 0.1, pan: -0.4 + i * 0.2 });
for (let i = 0; i < 5; i++) tick(f2s(292 + i * 3 + 18), 2600 + i * 120, 0.03, 0.3);
for (let i = 0; i < 4; i++) tick(f2s(T.rows + i * 6), 1500, 0.03, 0.4);
noise(f2s(T.sourcingTitle) - 0.3, 0.6, { amp: 0.06, hp: 0.5, lpStart: 0.06, lpEnd: 0.3, shape: "swell" });

// Scene 3 · refinement
typing(f2s(T.typeRefine), f2s(T.typeRefineEnd), 24);
pluck(f2s(T.sendRefine), midi(86), { amp: 0.08, decay: 0.18 });
noise(f2s(T.scan), 1.0, { amp: 0.045, hp: 0.7, lpStart: 0.2, lpEnd: 0.6, shape: "hump", sweep: 0.8 }); // scan
noise(f2s(T.reorder) - 0.1, 1.1, { amp: 0.08, hp: 0.5, lpStart: 0.05, lpEnd: 0.25, shape: "hump", sweep: -0.7 }); // reorder
pluck(f2s(T.reorderEnd - 4), midi(78), { amp: 0.06, decay: 0.5 });
pluck(f2s(T.reorderEnd - 2), midi(85), { amp: 0.05, decay: 0.6 });

// Scene 4 · into the client workspace, memory converges
noise(f2s(T.toClient) - 0.3, 1.5, { amp: 0.11, hp: 0.4, lpStart: 0.3, lpEnd: 0.03, shape: "hump" }); // pull back
for (let i = 0; i < 4; i++) pluck(f2s(T.board + i * 8), midi([69, 73, 76, 81][i]), { amp: 0.045, decay: 0.7, pan: -0.45 + i * 0.3 });
noise(f2s(T.converge), 1.0, { amp: 0.07, hp: 0.5, lpStart: 0.05, lpEnd: 0.3, shape: "hump", sweep: 0.5 });
kick(f2s(T.convergeEnd - 6), 0.26);
for (let i = 0; i < 3; i++) pluck(f2s(T.cite + 18 + i * 8), midi([88, 90, 93][i]), { amp: 0.035, decay: 0.35, pan: 0.3 });
noise(f2s(T.evalCard) - 0.1, 0.4, { amp: 0.05, hp: 0.6, lpStart: 0.2, lpEnd: 0.1 });
noise(f2s(T.recDoc) - 0.1, 0.5, { amp: 0.06, hp: 0.6, lpStart: 0.2, lpEnd: 0.1 });

// Scene 5 · collapse into the mark, logo, CTA
noise(f2s(T.collapse) - 0.4, 1.4, { amp: 0.12, hp: 0.4, lpStart: 0.03, lpEnd: 0.45, shape: "swell" });
// Logo hit: low swell + mallet chord + soft kick, then the motif resolves.
const logoT = f2s(T.collapseEnd - 4);
kick(logoT, 0.36);
bass(logoT, 2.2, 38, 0.13);
[62, 69, 74, 78, 81].forEach((n, k) => pluck(logoT + k * 0.012, midi(n), { amp: 0.05, decay: 1.6, pan: -0.3 + k * 0.15, bright: 0.15 }));
pad(logoT, 34, [50, 57, 62, 66, 71, 76], { amp: 0.05, attack: 0.5, release: 2.5 });
motif(f2s(T.lockup) + 0.2, 74, 0.07);
pluck(f2s(T.lockup + 16), midi(90), { amp: 0.04, decay: 1.2 });

/* ------------------------------ Master ------------------------------ */
// Gentle reverb: a few cross-fed comb taps.
const taps = [
  [0.031, 0.28],
  [0.047, 0.22],
  [0.071, 0.17],
  [0.113, 0.12],
  [0.167, 0.08],
];
const wetL = new Float32Array(N);
const wetR = new Float32Array(N);
for (const [d, g] of taps) {
  const ds = Math.floor(d * SR);
  for (let i = ds; i < N; i++) {
    wetL[i] += g * R[i - ds];
    wetR[i] += g * L[i - ds];
  }
}
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fadeIn = clamp01(t / 0.05);
  const fadeOut = clamp01((DUR - t) / 1.8);
  L[i] = Math.tanh((L[i] + 0.6 * wetL[i]) * 1.15) * fadeIn * fadeOut;
  R[i] = Math.tanh((R[i] + 0.6 * wetR[i]) * 1.15) * fadeIn * fadeOut;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / peak; // ≈ -1 dBFS peak

const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write("WAVEfmt ", 8);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(L[i] * norm * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(R[i] * norm * 32767), 46 + i * 4);
}
writeFileSync(join(here, "../public/audio/score.wav"), buf);
console.log(`score.wav written · peak normalised ×${norm.toFixed(2)} · cues: ${Object.keys(T).length}`);
