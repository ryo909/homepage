import { GEMMA_CONFIG } from "./mochimaru-config.js";
import { polishResponse } from "./prompt-builder.js";

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-mochimaru-genai="1"][src="${src}"]`);
    if (existing) {
      if (window.FilesetResolver && window.LlmInference) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Gemma bundle failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.crossOrigin = "anonymous";
    script.dataset.mochimaruGenai = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Gemma bundle failed to load."));
    document.head.appendChild(script);
  });
}

async function timeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error("Gemma request timed out.")), ms);
      })
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}

export class GemmaClient {
  constructor() {
    this.instance = null;
    this.status = "idle";
    this.reason = "not-started";
  }

  async preflight() {
    if (!window.isSecureContext) {
      throw new Error("Secure context is required.");
    }
    if (!("gpu" in navigator) || !navigator.gpu) {
      throw new Error("WebGPU is not available.");
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("WebGPU adapter was not available.");
    }
    const modelResponse = await fetch(GEMMA_CONFIG.modelAssetPath, {
      method: "HEAD",
      cache: "no-store"
    });
    if (!modelResponse.ok) {
      throw new Error(`Gemma model was not found at ${GEMMA_CONFIG.modelAssetPath}.`);
    }
  }

  async initialize() {
    if (this.instance) return this.instance;
    if (this.status === "loading") {
      throw new Error("Gemma is already loading.");
    }

    this.status = "loading";
    try {
      await this.preflight();
      await loadScript(GEMMA_CONFIG.bundleUrl);
      const genai = await window.FilesetResolver.forGenAiTasks(GEMMA_CONFIG.wasmRoot);
      this.instance = await window.LlmInference.createFromOptions(genai, {
        baseOptions: {
          modelAssetPath: GEMMA_CONFIG.modelAssetPath
        },
        maxTokens: GEMMA_CONFIG.maxTokens,
        topK: GEMMA_CONFIG.topK,
        temperature: GEMMA_CONFIG.temperature,
        randomSeed: GEMMA_CONFIG.randomSeed
      });
      this.status = "ready";
      this.reason = "ready";
      return this.instance;
    } catch (error) {
      this.status = "failed";
      this.reason = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async generate(prompt) {
    const instance = await this.initialize();
    const response = await timeout(instance.generateResponse(prompt), GEMMA_CONFIG.requestTimeoutMs);
    return polishResponse(response);
  }

  close() {
    if (this.instance && typeof this.instance.close === "function") {
      this.instance.close();
    }
    this.instance = null;
    this.status = "idle";
    this.reason = "closed";
  }
}
