function trimCard(card) {
  if (!card) return null;
  return {
    title: card.title,
    category: card.category,
    description: card.description
  };
}

export function buildPrompt({ trigger, userQuery, currentCard, recentCards, longHoverCards, categoriesSeen, pageTitle }) {
  const recent = (recentCards || []).slice(-4).map(trimCard).filter(Boolean);
  const lingered = (longHoverCards || []).slice(-3).map(trimCard).filter(Boolean);
  const categoryList = Array.from(categoriesSeen || []).slice(-5);
  const activeCard = trimCard(currentCard);

  return [
    "あなたは『Soreppoi Laboratory』にいる案内キャラ、もちまるです。",
    "研究所の案内役ですが、機械的な端末ではなく、親しみやすいゆるキャラとして話してください。",
    "口調は短く、やさしく、少しだけのんびりしています。",
    "1〜2文、40字前後を中心にしてください。",
    "押しつけず、必要なら次の行動を軽く勧めてください。",
    "赤ちゃん言葉、長文、過度な語尾キャラ化、ギャグのやりすぎは禁止です。",
    "返答は日本語のみ。",
    "",
    `ページ: ${pageTitle || "homepage"}`,
    `トリガー: ${trigger}`,
    activeCard ? `注目中の作品: ${JSON.stringify(activeCard)}` : "注目中の作品: なし",
    recent.length ? `最近見た作品: ${JSON.stringify(recent)}` : "最近見た作品: なし",
    lingered.length ? `長めに見ていた作品: ${JSON.stringify(lingered)}` : "長めに見ていた作品: なし",
    categoryList.length ? `見ていたカテゴリ: ${categoryList.join(", ")}` : "見ていたカテゴリ: なし",
    userQuery ? `ユーザー要望: ${userQuery}` : "ユーザー要望: なし",
    "",
    "今の状況に合う短い案内だけを返してください。"
  ].join("\n");
}

export function polishResponse(text) {
  const normalized = (text || "")
    .replace(/\s+/g, " ")
    .replace(/^[「『\s]+/, "")
    .replace(/[」』\s]+$/, "")
    .trim();

  if (!normalized) {
    return "迷ったら、おすすめ出せるよ。";
  }

  const clipped = normalized.length > 88 ? normalized.slice(0, 88).replace(/[、。,.!?！？」』]*$/, "") + "。" : normalized;
  const sentences = clipped.split(/(?<=[。！？!?])/).filter(Boolean).slice(0, 2);
  return sentences.join("").trim() || clipped;
}
