const WEIRD_KEYWORDS = ["忍者", "占い", "褒め", "カス", "会見", "サプライズ", "混沌", "escaped", "chaotic"];
const WORK_KEYWORDS = ["task", "todo", "map", "mbti", "team", "log", "catalog", "管理", "可視化", "チーム", "作業", "日報", "ログ"];
const EASY_KEYWORDS = ["見やすい", "やさしい", "一筆", "パズル", "map", "todo", "grid", "tool"];

function textOf(card, selectors) {
  for (const selector of selectors) {
    const node = card.querySelector(selector);
    if (node && node.textContent) {
      return node.textContent.replace(/\s+/g, " ").trim();
    }
  }
  return "";
}

function detectCategory(card) {
  const explicit = (card.dataset.cat || "").toLowerCase();
  if (explicit) return explicit;
  const footer = textOf(card, [".card-date", ".exp-card-foot", ".exp-card-status"]).toLowerCase();
  if (footer.includes("game")) return "game";
  if (footer.includes("fortune")) return "fortune";
  if (footer.includes("tool") || footer.includes("catalog")) return "tool";
  if (footer.includes("gen")) return "gen";
  return "misc";
}

function parseScore(baseText, keywords) {
  return keywords.reduce((score, word) => score + (baseText.includes(word) ? 2 : 0), 0);
}

function cardSummary(card) {
  const title = textOf(card, [".card-title", ".exp-card-name"]);
  const description = textOf(card, [".card-note", ".exp-card-desc"]);
  const hoverNote = textOf(card, [".hover-note", ".annotation", ".annotation-blue", ".exp-card-note"]);
  const url = card.dataset.url || "";
  const category = detectCategory(card);
  const text = `${title} ${description} ${hoverNote} ${category}`.toLowerCase();
  const weirdScore = parseScore(text, WEIRD_KEYWORDS);
  const workScore = parseScore(text, WORK_KEYWORDS) + (category === "tool" ? 2 : 0);
  const easyScore = parseScore(text, EASY_KEYWORDS) + (category === "game" ? 1 : 0) + (category === "tool" ? 1 : 0);
  return {
    element: card,
    title,
    description,
    hoverNote,
    url,
    category,
    weirdScore,
    workScore,
    easyScore
  };
}

export function collectCards(root = document) {
  return Array.from(root.querySelectorAll(".feat-card, .grid-card, .exp-card"))
    .map(cardSummary)
    .filter((card) => card.title);
}

function compareByScore(cards, scoreKey) {
  return [...cards].sort((a, b) => (b[scoreKey] - a[scoreKey]) || a.title.localeCompare(b.title, "ja"));
}

export function getVisibleCards(cards) {
  return cards.filter((card) => card.element && card.element.offsetParent !== null);
}

export function findIntentCards(cards, intent) {
  const visible = getVisibleCards(cards);
  if (!visible.length) return [];
  if (intent === "random") {
    return [visible[Math.floor(Math.random() * visible.length)]];
  }
  if (intent === "work") return compareByScore(visible, "workScore").slice(0, 3);
  if (intent === "weird") return compareByScore(visible, "weirdScore").slice(0, 3);
  if (intent === "starter") return compareByScore(visible, "easyScore").slice(0, 3);
  return visible.slice(0, 3);
}

export function buildBasicReply(trigger, context) {
  const cards = context.cards || [];
  const hovered = context.currentCard;
  const recent = context.recentCards || [];
  const category = context.currentCard ? context.currentCard.category : "";

  if (trigger === "panel-open") {
    return "迷ったら近道ボタンを押してね。仕事寄りも、ちょい変なのも分けて見られるよ。";
  }

  if (trigger === "first-hint") {
    return "迷ったら、おすすめ出せるよ。見やすいほうからでも大丈夫。";
  }

  if (trigger === "idle") {
    return recent.length
      ? "気になる系統は少し見えてきたよ。次の候補も出せるよ。"
      : "まだふわっと見てても大丈夫。最初に触りやすいのもあるよ。";
  }

  if (trigger === "multi-view") {
    const pick = findIntentCards(cards, recent.some((card) => card.workScore > card.weirdScore) ? "work" : "starter")[0];
    return pick
      ? `${pick.title} も相性よさそうだよ。次にのぞくなら、そのへんかも。`
      : "見た感じ、次の候補も絞れそうだよ。近道から寄り道してみる？";
  }

  if (trigger === "shortcut" && context.intent === "work") {
    const pick = findIntentCards(cards, "work")[0];
    return pick
      ? `仕事っぽいのなら ${pick.title} が見やすいよ。導線がちゃんとしてるほう。`
      : "仕事寄りなら、ツールっぽい実験から見ていくと入りやすいよ。";
  }

  if (trigger === "shortcut" && context.intent === "weird") {
    const pick = findIntentCards(cards, "weird")[0];
    return pick
      ? `ちょっと変なのなら ${pick.title} が早いよ。見た目よりちゃんとしてるかも。`
      : "変なほうから行くなら、生成系か占い系が近いよ。";
  }

  if (trigger === "shortcut" && context.intent === "starter") {
    const pick = findIntentCards(cards, "starter")[0];
    return pick
      ? `最初なら ${pick.title} が入りやすいよ。見た目より迷いにくいほう。`
      : "最初はツール系か軽めのゲーム系から触ると見やすいよ。";
  }

  if (trigger === "shortcut" && context.intent === "random") {
    return "ランダムもありだよ。たまに変な当たり方をするからね。";
  }

  if (trigger === "hover" && hovered) {
    if (hovered.workScore >= hovered.weirdScore && hovered.workScore >= hovered.easyScore) {
      return `${hovered.title} は実用寄りだよ。仕事っぽく見たい時に合うかも。`;
    }
    if (hovered.weirdScore >= hovered.workScore) {
      return `${hovered.title} は少しクセあるよ。でも見どころはちゃんとある。`;
    }
    if (category === "game") {
      return `${hovered.title} は触って分かるタイプだよ。気楽に試しやすいほう。`;
    }
    return `${hovered.title} は見た目より中身がちゃんとしてるよ。`;
  }

  return "見たい方向があれば、短く言ってくれたら寄せて案内するよ。";
}
