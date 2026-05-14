export interface CardImageAsset {
  cardId: string;
  key: string;
  path: string;
}

const CARD_IMAGE_BASE = "/assets/card_image";

const fileByCardId: Record<string, string> = {
  attack: "공격.png",
  powerAttack: "강공격.png",
  defense: "디펜스.png",
  heal: "회복.png",
  poison: "독.png",
  charge: "충전.png",
  parry: "패링.png",
  temp_smash: "강타.png",
  temp_counter: "반격.png",
  temp_disarm: "무장해제.png",
  temp_lifesteal: "흡혈.png",
  temp_strong_poison: "맹독.png",
  temp_poison_arrow: "독화살.png",
  temp_poison_barrier: "독방벽.png",
  temp_poison_blade: "독칼날.png",
  temp_fortify: "강화방어.png",
  temp_regen_barrier: "재생보호막.png",
  temp_counter_stance: "카운터.png",
  temp_awaken: "각성.png",
  temp_swift_dodge: "신속회피.png",
  temp_perfect_dodge: "완전회피.png",
};

export const CARD_IMAGE_ASSETS: CardImageAsset[] = Object.entries(fileByCardId).map(([cardId, file]) => ({
  cardId,
  key: `card_image_${cardId}`,
  path: `${CARD_IMAGE_BASE}/${file}`,
}));

export function getCardImageKey(cardId: string) {
  return fileByCardId[cardId] ? `card_image_${cardId}` : null;
}
