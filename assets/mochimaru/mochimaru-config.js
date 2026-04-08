export const MOCHIMARU_ASSETS = {
  idle: new URL("./mochi_idle.png", import.meta.url).href,
  talk: new URL("./mochi_talk.png", import.meta.url).href,
  blink: new URL("./mochi_blink.png", import.meta.url).href
};

export const MOCHIMARU_COPY = {
  name: "もちまる",
  intro: "気になる実験があったら、ちょっとだけ案内するよ。",
  panelHint: "迷ったら下の近道から見ていけるよ。"
};

export const TRIGGER_CONFIG = {
  firstHintDelayMs: 6000,
  hoverDelayMs: 2000,
  idleDelayMs: 45000,
  recommendAfterInteractions: 3,
  speechCooldownMinMs: 30000,
  speechCooldownMaxMs: 90000,
  cardCooldownMs: 150000,
  blinkMinMs: 4500,
  blinkMaxMs: 9000
};

export const GEMMA_CONFIG = {
  bundleUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/genai_bundle.cjs",
  wasmRoot: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@latest/wasm",
  modelAssetPath: new URL("./model/gemma-web.task", import.meta.url).href,
  maxTokens: 64,
  topK: 24,
  temperature: 0.72,
  randomSeed: 101,
  requestTimeoutMs: 30000
};

export const SHORTCUTS = [
  { id: "work", label: "仕事寄りを見る" },
  { id: "weird", label: "ネタ寄りを見る" },
  { id: "starter", label: "まず見やすいものから" },
  { id: "random", label: "ランダムで見る" }
];
