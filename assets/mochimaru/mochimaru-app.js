import { collectCards, findIntentCards, buildBasicReply, getVisibleCards } from "./basic-responses.js";
import { GemmaClient } from "./gemma-client.js";
import { buildPrompt } from "./prompt-builder.js";
import { MOCHIMARU_ASSETS, MOCHIMARU_COPY, SHORTCUTS, TRIGGER_CONFIG } from "./mochimaru-config.js";

function hashText(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function now() {
  return Date.now();
}

function clampSentence(text) {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  return normalized.length > 88 ? `${normalized.slice(0, 88).replace(/[、。,.!?！？」』]*$/, "")}。` : normalized;
}

function createRoot(theme) {
  const root = document.createElement("aside");
  root.className = "mochimaru-root";
  root.dataset.open = "false";
  root.dataset.mode = "checking";
  root.dataset.theme = theme;
  root.dataset.speaking = "false";
  root.innerHTML = `
    <div class="mochimaru-live" aria-live="polite"></div>
    <section class="mochimaru-panel" aria-label="もちまる案内パネル">
      <div class="mochimaru-panel-header">
        <div class="mochimaru-title-wrap">
          <div class="mochimaru-title"><span>もちまる</span><span aria-hidden="true">研究所案内</span></div>
          <div class="mochimaru-mode" data-mode="checking">CHECKING</div>
        </div>
        <button class="mochimaru-close" type="button" aria-label="案内パネルを閉じる">✕</button>
      </div>
      <div class="mochimaru-panel-body">
        <div class="mochimaru-speech">
          <span class="mochimaru-speech-label">Mochimaru Note</span>
          <div class="mochimaru-speech-text"></div>
        </div>
        <div class="mochimaru-controls">
          <label class="mochimaru-toggle">
            <input type="checkbox" data-role="speech-toggle">
            <span>音声案内を読む</span>
          </label>
          <div class="mochimaru-subcopy"></div>
        </div>
        <div class="mochimaru-shortcuts"></div>
        <div class="mochimaru-ai">
          <div class="mochimaru-ai-row">
            <input class="mochimaru-input" type="text" maxlength="80" placeholder="たとえば: 仕事っぽいのだけ">
            <button class="mochimaru-submit" type="button">聞いてみる</button>
          </div>
        </div>
        <div class="mochimaru-footer-note"></div>
      </div>
    </section>
    <button class="mochimaru-dock" type="button" aria-label="もちまる案内を開く">
      <span class="mochimaru-shadow" aria-hidden="true"></span>
      <span class="mochimaru-body"><img alt="もちまる案内キャラ"></span>
      <span class="mochimaru-status-dot" aria-hidden="true"></span>
    </button>
  `;
  document.body.appendChild(root);
  return root;
}

function createShortcutButtons(container) {
  SHORTCUTS.forEach((shortcut) => {
    const button = document.createElement("button");
    button.className = "mochimaru-action";
    button.type = "button";
    button.dataset.intent = shortcut.id;
    button.textContent = shortcut.label;
    container.appendChild(button);
  });
}

function pickTheme() {
  return document.querySelector(".gh-nav") ? "github" : "lab";
}

function setupAnimator(imageEl, root) {
  let talkTimer = null;
  let blinkTimer = null;
  let expression = "idle";

  function applyExpression(next) {
    expression = next;
    imageEl.src = MOCHIMARU_ASSETS[next] || MOCHIMARU_ASSETS.idle;
    imageEl.dataset.expression = next;
  }

  function clearTimers() {
    window.clearInterval(talkTimer);
    window.clearTimeout(blinkTimer);
    talkTimer = null;
    blinkTimer = null;
  }

  function scheduleBlink() {
    window.clearTimeout(blinkTimer);
    const delay = TRIGGER_CONFIG.blinkMinMs + Math.floor(Math.random() * (TRIGGER_CONFIG.blinkMaxMs - TRIGGER_CONFIG.blinkMinMs));
    blinkTimer = window.setTimeout(() => {
      if (root.dataset.speaking === "true") {
        scheduleBlink();
        return;
      }
      applyExpression("blink");
      window.setTimeout(() => {
        if (expression === "blink") applyExpression("idle");
      }, 180);
      scheduleBlink();
    }, delay);
  }

  function startTalking() {
    root.dataset.speaking = "true";
    window.clearInterval(talkTimer);
    let toggle = false;
    talkTimer = window.setInterval(() => {
      toggle = !toggle;
      applyExpression(toggle ? "talk" : "idle");
    }, 220);
  }

  function stopTalking() {
    root.dataset.speaking = "false";
    window.clearInterval(talkTimer);
    talkTimer = null;
    applyExpression("idle");
    scheduleBlink();
  }

  applyExpression("idle");
  scheduleBlink();

  return {
    startTalking,
    stopTalking,
    blinkOnce() {
      if (root.dataset.speaking === "true") return;
      applyExpression("blink");
      window.setTimeout(() => {
        if (expression === "blink") applyExpression("idle");
      }, 180);
    },
    destroy() {
      clearTimers();
    }
  };
}

function getCardKey(card) {
  return card.url || card.title;
}

function applyFilterForCard(card) {
  if (!card || !card.category) return;
  const button = document.querySelector(`.pin-tag[data-filter="${card.category}"]`);
  if (button) button.click();
}

function focusCard(card) {
  if (!card || !card.element) return;
  applyFilterForCard(card);
  card.element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  card.element.classList.add("mochimaru-picked");
  window.setTimeout(() => card.element.classList.remove("mochimaru-picked"), 1400);
}

function canSpeak(lastSpokenAt) {
  if (document.hidden) return false;
  return now() - lastSpokenAt > TRIGGER_CONFIG.speechCooldownMinMs;
}

function computeCooldown(text) {
  const spread = TRIGGER_CONFIG.speechCooldownMaxMs - TRIGGER_CONFIG.speechCooldownMinMs;
  return TRIGGER_CONFIG.speechCooldownMinMs + (hashText(text) % Math.max(1, spread));
}

function stopSpeech() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function speakText(text, enabled, animator) {
  if (!enabled || !("speechSynthesis" in window) || document.hidden) return;
  stopSpeech();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = 1;
  utterance.pitch = 1.05;
  utterance.volume = 0.92;
  utterance.onstart = () => animator.startTalking();
  utterance.onend = () => animator.stopTalking();
  utterance.onerror = () => animator.stopTalking();
  window.speechSynthesis.speak(utterance);
}

function dedupeCards(cards) {
  const map = new Map();
  cards.forEach((card) => {
    if (card && !map.has(getCardKey(card))) {
      map.set(getCardKey(card), card);
    }
  });
  return [...map.values()];
}

function matchCardFromNode(cards, node) {
  const element = node.closest(".feat-card, .grid-card, .exp-card");
  if (!element) return null;
  return cards.find((card) => card.element === element) || null;
}

function sameCardBoundary(event, card) {
  if (!card || !event.relatedTarget || !(event.relatedTarget instanceof Element)) return false;
  return card.element.contains(event.relatedTarget);
}

function attachPickedStyle() {
  if (document.getElementById("mochimaru-picked-style")) return;
  const style = document.createElement("style");
  style.id = "mochimaru-picked-style";
  style.textContent = `
    .mochimaru-picked {
      outline: 3px solid rgba(232, 160, 32, 0.78);
      outline-offset: 4px;
    }
  `;
  document.head.appendChild(style);
}

async function boot() {
  const cards = collectCards();
  if (!cards.length) return;

  attachPickedStyle();

  const root = createRoot(pickTheme());
  const panel = root.querySelector(".mochimaru-panel");
  const dock = root.querySelector(".mochimaru-dock");
  const closeButton = root.querySelector(".mochimaru-close");
  const speechToggle = root.querySelector('[data-role="speech-toggle"]');
  const speechText = root.querySelector(".mochimaru-speech-text");
  const liveRegion = root.querySelector(".mochimaru-live");
  const subcopy = root.querySelector(".mochimaru-subcopy");
  const footerNote = root.querySelector(".mochimaru-footer-note");
  const modeBadge = root.querySelector(".mochimaru-mode");
  const shortcuts = root.querySelector(".mochimaru-shortcuts");
  const input = root.querySelector(".mochimaru-input");
  const submit = root.querySelector(".mochimaru-submit");
  const animator = setupAnimator(root.querySelector("img"), root);
  const gemmaClient = new GemmaClient();

  createShortcutButtons(shortcuts);

  const state = {
    cards,
    isOpen: false,
    mode: "checking",
    lastSpeechAt: 0,
    nextSpeechAllowedAt: 0,
    lastSpeechText: "",
    hasSpoken: false,
    userInteracted: false,
    currentCard: null,
    recentCards: [],
    openedCards: [],
    longHoverCards: [],
    seenCategories: new Set(),
    cardCooldowns: new Map(),
    hoverTimers: new Map(),
    idleTimer: null,
    firstHintTimer: null
  };

  function setMode(mode, detail) {
    state.mode = mode;
    root.dataset.mode = mode;
    modeBadge.dataset.mode = mode;
    modeBadge.textContent = mode === "full" ? "FULL AI" : mode === "basic" ? "BASIC" : "CHECKING";
    subcopy.textContent = mode === "full"
      ? "短い相談なら、その場の流れで返せるよ。"
      : mode === "basic"
        ? "AI が使えない時も、簡易案内でちゃんと寄せるよ。"
        : "Gemma の準備を見ているところ。";
    footerNote.textContent = detail || "";
  }

  async function buildReply(trigger, extra = {}) {
    const context = {
      cards: cards,
      currentCard: extra.card || state.currentCard,
      recentCards: dedupeCards(state.recentCards),
      longHoverCards: dedupeCards(state.longHoverCards),
      categoriesSeen: state.seenCategories,
      intent: extra.intent || "",
      pageTitle: document.title
    };

    if (state.mode === "full" && !extra.forceBasic) {
      try {
        return await gemmaClient.generate(buildPrompt({
          trigger,
          userQuery: extra.query || "",
          currentCard: context.currentCard,
          recentCards: context.recentCards,
          longHoverCards: context.longHoverCards,
          categoriesSeen: context.categoriesSeen,
          pageTitle: context.pageTitle
        }));
      } catch (error) {
        setMode("basic", `Gemma は使えなかったので、簡易案内で続けるよ。`);
      }
    }

    return clampSentence(buildBasicReply(trigger, context));
  }

  async function present(text, options = {}) {
    const finalText = clampSentence(text);
    if (!finalText) return;
    if (document.hidden && !options.silentIfHidden) return;
    if (finalText === state.lastSpeechText && !options.allowRepeat) return;
    if (!options.ignoreCooldown && now() < state.nextSpeechAllowedAt) return;

    state.lastSpeechText = finalText;
    state.lastSpeechAt = now();
    state.nextSpeechAllowedAt = state.lastSpeechAt + computeCooldown(finalText);
    state.hasSpoken = true;

    speechText.textContent = finalText;
    liveRegion.textContent = finalText;
    liveRegion.classList.add("is-visible");
    footerNote.textContent = options.footerNote || footerNote.textContent;
    animator.blinkOnce();

    window.setTimeout(() => {
      liveRegion.classList.remove("is-visible");
    }, 3800);

    if (speechToggle.checked) {
      speakText(finalText, true, animator);
    }
  }

  function noteInteraction(card, type) {
    if (!card) return;
    state.currentCard = card;
    state.recentCards = dedupeCards([...state.recentCards, card]).slice(-6);
    state.seenCategories.add(card.category);
    if (type === "open") {
      state.openedCards = dedupeCards([...state.openedCards, card]).slice(-6);
    }
  }

  async function maybeSpeak(trigger, extra = {}) {
    if (!canSpeak(state.lastSpeechAt) && !extra.ignoreCooldown) return;
    if (trigger === "hover" && extra.card) {
      const cardKey = getCardKey(extra.card);
      const cooledUntil = state.cardCooldowns.get(cardKey) || 0;
      if (now() < cooledUntil) return;
      state.cardCooldowns.set(cardKey, now() + TRIGGER_CONFIG.cardCooldownMs);
    }
    const reply = await buildReply(trigger, extra);
    await present(reply, extra);
  }

  function togglePanel(forceOpen) {
    state.isOpen = typeof forceOpen === "boolean" ? forceOpen : !state.isOpen;
    root.dataset.open = String(state.isOpen);
    dock.setAttribute("aria-expanded", String(state.isOpen));
    panel.setAttribute("aria-hidden", String(!state.isOpen));
    if (state.isOpen) {
      maybeSpeak("panel-open", { ignoreCooldown: true, footerNote: MOCHIMARU_COPY.panelHint });
    } else {
      stopSpeech();
      animator.stopTalking();
    }
  }

  function resetIdleTimer() {
    window.clearTimeout(state.idleTimer);
    state.idleTimer = window.setTimeout(() => {
      maybeSpeak("idle");
    }, TRIGGER_CONFIG.idleDelayMs);
  }

  function scheduleFirstHint() {
    window.clearTimeout(state.firstHintTimer);
    state.firstHintTimer = window.setTimeout(() => {
      if (!state.userInteracted && !state.hasSpoken) {
        maybeSpeak("first-hint", { ignoreCooldown: true });
      }
    }, TRIGGER_CONFIG.firstHintDelayMs);
  }

  function runShortcut(intent) {
    const picks = findIntentCards(cards, intent);
    const target = picks[0];
    if (target) focusCard(target);
    maybeSpeak("shortcut", {
      intent,
      card: target,
      footerNote: target ? `${target.title} の近くまで寄せておいたよ。` : footerNote.textContent
    });
  }

  async function submitQuery() {
    const query = input.value.trim();
    if (!query) return;
    state.userInteracted = true;
    const target = query.includes("仕事") ? findIntentCards(cards, "work")[0]
      : query.includes("ネタ") || query.includes("変") ? findIntentCards(cards, "weird")[0]
      : query.includes("最初") || query.includes("見やす") ? findIntentCards(cards, "starter")[0]
      : null;
    if (target) focusCard(target);
    const reply = await buildReply("user-query", { query, card: target });
    await present(reply, { ignoreCooldown: true });
    input.value = "";
  }

  dock.addEventListener("click", () => {
    state.userInteracted = true;
    togglePanel();
  });
  closeButton.addEventListener("click", () => togglePanel(false));
  shortcuts.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-intent]");
    if (!button) return;
    state.userInteracted = true;
    runShortcut(button.dataset.intent);
  });
  submit.addEventListener("click", submitQuery);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitQuery();
    }
  });
  speechToggle.addEventListener("change", () => {
    if (!speechToggle.checked) {
      stopSpeech();
      animator.stopTalking();
    }
  });

  document.addEventListener("pointerdown", () => {
    state.userInteracted = true;
    resetIdleTimer();
  }, { passive: true });
  document.addEventListener("keydown", () => {
    state.userInteracted = true;
    resetIdleTimer();
  });
  document.addEventListener("scroll", resetIdleTimer, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopSpeech();
      animator.stopTalking();
      liveRegion.classList.remove("is-visible");
    } else {
      resetIdleTimer();
    }
  });

  document.addEventListener("pointerover", (event) => {
    const card = matchCardFromNode(cards, event.target);
    if (!card) return;
    if (sameCardBoundary(event, card)) return;
    noteInteraction(card, "hover");
    const timer = window.setTimeout(() => {
      state.longHoverCards = dedupeCards([...state.longHoverCards, card]).slice(-5);
      maybeSpeak("hover", { card });
    }, TRIGGER_CONFIG.hoverDelayMs);
    state.hoverTimers.set(card.element, timer);
  }, true);

  document.addEventListener("pointerout", (event) => {
    const card = matchCardFromNode(cards, event.target);
    if (!card) return;
    if (sameCardBoundary(event, card)) return;
    window.clearTimeout(state.hoverTimers.get(card.element));
    state.hoverTimers.delete(card.element);
  }, true);

  document.addEventListener("click", (event) => {
    const card = matchCardFromNode(cards, event.target);
    if (!card) return;
    noteInteraction(card, "open");
    if (state.recentCards.length >= TRIGGER_CONFIG.recommendAfterInteractions || state.openedCards.length >= TRIGGER_CONFIG.recommendAfterInteractions) {
      maybeSpeak("multi-view", { card });
    }
  }, true);

  speechText.textContent = `${MOCHIMARU_COPY.intro} ${MOCHIMARU_COPY.panelHint}`;
  subcopy.textContent = "Gemma の確認中。";
  footerNote.textContent = "音声は初期状態ではオフだよ。";
  scheduleFirstHint();
  resetIdleTimer();

  try {
    await gemmaClient.initialize();
    setMode("full", "WebGPU とモデルが通る環境では、短い一言を自然に返すよ。");
  } catch (error) {
    setMode("basic", "Gemma が使えない環境では、簡易案内に自動で切り替えるよ。");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
