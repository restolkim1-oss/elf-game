import Phaser from "phaser";
import type { PartDef } from "../data/parts";
import { UI_SCALE } from "../main";

const u = (n: number) => n * UI_SCALE;
const px = (n: number) => `${Math.round(n * UI_SCALE * 1.55)}px`;

type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

interface Card {
  rank: Rank;
  suit: Suit;
}

type HandType =
  | "highCard"
  | "pair"
  | "twoPair"
  | "trips"
  | "straight"
  | "flush"
  | "fullHouse"
  | "quads"
  | "straightFlush";

const HAND_INFO: Record<HandType, { name: string; chips: number; mult: number }> = {
  highCard: { name: "하이카드", chips: 5, mult: 1 },
  pair: { name: "페어", chips: 10, mult: 2 },
  twoPair: { name: "투페어", chips: 20, mult: 2 },
  trips: { name: "트리플", chips: 30, mult: 3 },
  straight: { name: "스트레이트", chips: 30, mult: 4 },
  flush: { name: "플러시", chips: 35, mult: 4 },
  fullHouse: { name: "풀하우스", chips: 40, mult: 4 },
  quads: { name: "포카드", chips: 60, mult: 7 },
  straightFlush: { name: "스트레이트 플러시", chips: 100, mult: 8 },
};

const RANK_LABEL: Record<Rank, string> = {
  1: "A",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
};

const RANK_CHIP: Record<Rank, number> = {
  1: 11,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  11: 10,
  12: 10,
  13: 10,
};

const SUIT_RED: Record<Suit, boolean> = {
  "♠": false,
  "♣": false,
  "♥": true,
  "♦": true,
};

const HAND_SIZE = 5;
const PLAYS_PER_BATTLE = 4;
const DISCARDS_PER_BATTLE = 3;

type CardBattleResult = (success: boolean) => void;

interface CardSlot {
  card: Card;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  rankText: Phaser.GameObjects.Text;
  suitText: Phaser.GameObjects.Text;
  selected: boolean;
  baseY: number;
  index: number;
}

export class CardBattleSystem {
  private scene: Phaser.Scene;
  private overlay: Phaser.GameObjects.Container | null = null;
  private activeDone: CardBattleResult | null = null;
  private cancelled = false;

  private deck: Card[] = [];
  private hand: CardSlot[] = [];
  private hp = 0;
  private hpMax = 0;
  private playsLeft = 0;
  private discardsLeft = 0;
  private busy = false;
  private finished = false;

  private handLabel!: Phaser.GameObjects.Text;
  private scoreLabel!: Phaser.GameObjects.Text;
  private statusLabel!: Phaser.GameObjects.Text;
  private hpFill!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private hpBarWidth = 0;
  private hpBarLeft = 0;

  private playBg!: Phaser.GameObjects.Rectangle;
  private discardBg!: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  start(part: PartDef, done: CardBattleResult) {
    this.cleanup();
    this.cancelled = false;
    this.finished = false;
    this.busy = false;
    this.activeDone = done;
    this.startBattle(part);
  }

  abortCurrent() {
    if (!this.activeDone) return;
    this.cancelled = true;
    this.finish(false);
  }

  consumeLastCancelled() {
    const v = this.cancelled;
    this.cancelled = false;
    return v;
  }

  private finish(success: boolean) {
    if (this.finished) return;
    this.finished = true;
    const done = this.activeDone;
    this.activeDone = null;
    this.cleanup();
    if (done) done(success);
  }

  private cleanup() {
    this.overlay?.destroy();
    this.overlay = null;
    this.hand = [];
    this.deck = [];
  }

  private startBattle(part: PartDef) {
    const { width, height } = this.scene.scale;

    const w = width * 0.94;
    const h = height * 0.78;
    const top = height / 2 - h / 2;
    const bottom = height / 2 + h / 2;

    const shadow = this.scene.add.rectangle(
      width / 2 + u(4),
      height / 2 + u(6),
      w,
      h,
      0x000000,
      0.55
    );
    const bg = this.scene.add
      .rectangle(width / 2, height / 2, w, h, 0x14091a, 0.97)
      .setStrokeStyle(u(2), 0xd4a656, 0.95);
    const inner = this.scene.add
      .rectangle(width / 2, height / 2, w - u(10), h - u(10), 0x000000, 0)
      .setStrokeStyle(u(1), 0xd4a656, 0.45);

    const titleText = this.scene.add
      .text(width / 2, top + u(18), `${part.label} 해제`, {
        fontFamily: "serif",
        fontSize: px(20),
        color: "#f3e6c9",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);

    const subtitle = this.scene.add
      .text(width / 2, top + u(50), "카드를 골라 포커 핸드로 점수를 내세요", {
        fontFamily: "serif",
        fontSize: px(12),
        color: "#d4a656",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);

    this.overlay = this.scene.add
      .container(0, 0, [shadow, bg, inner, titleText, subtitle])
      .setDepth(500);

    // HP bar
    this.hpMax = 60 + part.difficulty * 35;
    this.hp = this.hpMax;
    this.hpBarWidth = w * 0.78;
    this.hpBarLeft = width / 2 - this.hpBarWidth / 2;
    const hpY = top + u(96);
    const hpBg = this.scene.add
      .rectangle(width / 2, hpY, this.hpBarWidth, u(22), 0x2a1a34, 0.96)
      .setStrokeStyle(u(1.2), 0xd4a656, 0.8);
    this.hpFill = this.scene.add
      .rectangle(this.hpBarLeft, hpY, this.hpBarWidth, u(18), 0xff8fab, 0.95)
      .setOrigin(0, 0.5);
    this.hpText = this.scene.add
      .text(width / 2, hpY, `${this.hp} / ${this.hpMax}`, {
        fontFamily: "serif",
        fontSize: px(11),
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.overlay.add([hpBg, this.hpFill, this.hpText]);

    // Hand-type / score readout
    this.handLabel = this.scene.add
      .text(width / 2, top + u(140), "—", {
        fontFamily: "serif",
        fontSize: px(15),
        color: "#ffd572",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.scoreLabel = this.scene.add
      .text(width / 2, top + u(168), "칩 0 · 배수 0 · 점수 0", {
        fontFamily: "serif",
        fontSize: px(12),
        color: "#f3e6c9",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.overlay.add([this.handLabel, this.scoreLabel]);

    // Hand area
    const handY = bottom - u(220);
    this.deck = buildShuffledDeck();
    this.playsLeft = PLAYS_PER_BATTLE;
    this.discardsLeft = DISCARDS_PER_BATTLE;
    this.dealInitialHand(width, handY);

    // Status
    this.statusLabel = this.scene.add
      .text(width / 2, handY + u(100), "", {
        fontFamily: "serif",
        fontSize: px(12),
        color: "#d4a656",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.overlay.add(this.statusLabel);

    // Buttons
    const btnY = bottom - u(54);
    this.playBg = this.makeButton(
      width / 2 - u(132),
      btnY,
      u(116),
      u(46),
      "플레이",
      () => this.tryPlay()
    );
    this.discardBg = this.makeButton(
      width / 2,
      btnY,
      u(116),
      u(46),
      "버리기",
      () => this.tryDiscard()
    );
    this.makeButton(width / 2 + u(132), btnY, u(116), u(46), "포기", () => {
      this.cancelled = true;
      this.finish(false);
    });

    this.refreshHandPreview();
    this.refreshStatus();
  }

  private dealInitialHand(width: number, handY: number) {
    const cardW = u(96);
    const cardH = u(140);
    const gap = u(10);
    const totalW = HAND_SIZE * cardW + (HAND_SIZE - 1) * gap;
    const startX = width / 2 - totalW / 2 + cardW / 2;

    for (let i = 0; i < HAND_SIZE; i++) {
      const card = this.deck.pop();
      if (!card) break;
      const x = startX + i * (cardW + gap);
      const slot = this.makeCardSlot(card, x, handY, cardW, cardH, i);
      this.hand.push(slot);
    }
  }

  private makeCardSlot(
    card: Card,
    x: number,
    y: number,
    cardW: number,
    cardH: number,
    index: number
  ): CardSlot {
    const bg = this.scene.add
      .rectangle(0, 0, cardW, cardH, 0xf3e6c9, 1)
      .setStrokeStyle(u(2), 0x4d3a2f, 0.95)
      .setInteractive({ useHandCursor: true });
    const rankText = this.scene.add
      .text(-cardW / 2 + u(8), -cardH / 2 + u(6), RANK_LABEL[card.rank], {
        fontFamily: "serif",
        fontSize: px(15),
        color: SUIT_RED[card.suit] ? "#b53737" : "#1a1422",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    const suitText = this.scene.add
      .text(0, u(2), card.suit, {
        fontFamily: "serif",
        fontSize: px(28),
        color: SUIT_RED[card.suit] ? "#b53737" : "#1a1422",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const cornerSuit = this.scene.add
      .text(cardW / 2 - u(8), cardH / 2 - u(6), card.suit, {
        fontFamily: "serif",
        fontSize: px(12),
        color: SUIT_RED[card.suit] ? "#b53737" : "#1a1422",
        fontStyle: "bold",
      })
      .setOrigin(1, 1);
    const container = this.scene.add
      .container(x, y, [bg, rankText, suitText, cornerSuit])
      .setSize(cardW, cardH);
    this.overlay?.add(container);

    const slot: CardSlot = {
      card,
      container,
      bg,
      rankText,
      suitText,
      selected: false,
      baseY: y,
      index,
    };

    bg.on("pointerdown", () => {
      if (this.busy || this.finished) return;
      this.toggleSelect(slot);
    });

    return slot;
  }

  private toggleSelect(slot: CardSlot) {
    const selectedCount = this.hand.filter((s) => s.selected).length;
    if (!slot.selected && selectedCount >= HAND_SIZE) return;
    slot.selected = !slot.selected;
    slot.bg.setStrokeStyle(
      u(slot.selected ? 3 : 2),
      slot.selected ? 0xffd572 : 0x4d3a2f,
      slot.selected ? 1 : 0.95
    );
    this.scene.tweens.add({
      targets: slot.container,
      y: slot.selected ? slot.baseY - u(18) : slot.baseY,
      duration: 140,
      ease: "Quad.easeOut",
    });
    this.refreshHandPreview();
  }

  private refreshHandPreview() {
    const selected = this.hand.filter((s) => s.selected).map((s) => s.card);
    if (selected.length === 0) {
      this.handLabel.setText("카드를 선택하세요");
      this.handLabel.setColor("#d4a656");
      this.scoreLabel.setText(`칩 0 · 배수 0 · 점수 0`);
      return;
    }
    const evalResult = evaluateHand(selected);
    const info = HAND_INFO[evalResult.type];
    const cardChips = evalResult.scoringCards.reduce(
      (acc, c) => acc + RANK_CHIP[c.rank],
      0
    );
    const total = (info.chips + cardChips) * info.mult;
    this.handLabel.setText(info.name);
    this.handLabel.setColor("#ffd572");
    this.scoreLabel.setText(
      `(칩 ${info.chips} + 카드 ${cardChips}) × ${info.mult} = ${total}`
    );
  }

  private refreshStatus() {
    this.statusLabel.setText(
      `남은 플레이 ${this.playsLeft}  ·  버리기 ${this.discardsLeft}  ·  덱 ${this.deck.length}`
    );
    const canPlay = !this.busy && !this.finished && this.playsLeft > 0;
    const canDiscard =
      !this.busy &&
      !this.finished &&
      this.discardsLeft > 0 &&
      this.hand.some((s) => s.selected);
    this.playBg.setFillStyle(0x2a1a34, canPlay ? 0.96 : 0.5);
    this.discardBg.setFillStyle(0x2a1a34, canDiscard ? 0.96 : 0.5);
  }

  private tryPlay() {
    if (this.busy || this.finished) return;
    if (this.playsLeft <= 0) return;
    const selected = this.hand.filter((s) => s.selected);
    if (selected.length === 0) return;

    this.busy = true;
    this.playsLeft--;
    const evalResult = evaluateHand(selected.map((s) => s.card));
    const info = HAND_INFO[evalResult.type];
    const cardChips = evalResult.scoringCards.reduce(
      (acc, c) => acc + RANK_CHIP[c.rank],
      0
    );
    const damage = (info.chips + cardChips) * info.mult;

    this.handLabel.setText(`${info.name} · ${damage}`);
    this.scoreLabel.setText(`데미지 ${damage}`);

    this.scene.tweens.add({
      targets: selected.map((s) => s.container),
      y: "-=" + u(40),
      alpha: 0.4,
      duration: 240,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.applyDamage(damage);
        this.replaceCards(selected);
      },
    });
  }

  private tryDiscard() {
    if (this.busy || this.finished) return;
    if (this.discardsLeft <= 0) return;
    const selected = this.hand.filter((s) => s.selected);
    if (selected.length === 0) return;

    this.busy = true;
    this.discardsLeft--;

    this.scene.tweens.add({
      targets: selected.map((s) => s.container),
      y: "+=" + u(80),
      alpha: 0,
      duration: 220,
      ease: "Quad.easeIn",
      onComplete: () => this.replaceCards(selected),
    });
  }

  private applyDamage(amount: number) {
    this.hp = Math.max(0, this.hp - amount);
    const ratio = this.hp / this.hpMax;
    this.scene.tweens.add({
      targets: this.hpFill,
      width: this.hpBarWidth * ratio,
      duration: 320,
      ease: "Quad.easeOut",
    });
    this.hpText.setText(`${this.hp} / ${this.hpMax}`);
  }

  private replaceCards(slots: CardSlot[]) {
    slots.forEach((slot) => {
      const next = this.deck.pop();
      if (next) {
        slot.card = next;
        slot.rankText.setText(RANK_LABEL[next.rank]);
        slot.rankText.setColor(SUIT_RED[next.suit] ? "#b53737" : "#1a1422");
        slot.suitText.setText(next.suit);
        slot.suitText.setColor(SUIT_RED[next.suit] ? "#b53737" : "#1a1422");
        slot.bg.setStrokeStyle(u(2), 0x4d3a2f, 0.95);
        slot.selected = false;
        slot.container.setAlpha(0);
        slot.container.y = slot.baseY + u(40);
        this.scene.tweens.add({
          targets: slot.container,
          y: slot.baseY,
          alpha: 1,
          duration: 220,
          ease: "Quad.easeOut",
        });
      } else {
        // No more cards: hide this slot
        slot.selected = false;
        this.scene.tweens.add({
          targets: slot.container,
          alpha: 0,
          duration: 160,
        });
      }
    });

    this.scene.time.delayedCall(280, () => {
      this.busy = false;
      this.refreshHandPreview();
      this.refreshStatus();
      this.checkEnd();
    });
  }

  private checkEnd() {
    if (this.finished) return;
    if (this.hp <= 0) {
      this.handLabel.setText("성공");
      this.handLabel.setColor("#86e08d");
      this.scene.time.delayedCall(420, () => this.finish(true));
      return;
    }
    if (this.playsLeft <= 0) {
      this.handLabel.setText("실패");
      this.handLabel.setColor("#e0868b");
      this.scene.time.delayedCall(540, () => this.finish(false));
    }
  }

  private makeButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    onClick: () => void
  ): Phaser.GameObjects.Rectangle {
    const bg = this.scene.add
      .rectangle(x, y, w, h, 0x2a1a34, 0.96)
      .setStrokeStyle(u(1.5), 0xd4a656, 0.85)
      .setInteractive({ useHandCursor: true });
    const text = this.scene.add
      .text(x, y, label, {
        fontFamily: "serif",
        fontSize: px(13),
        color: "#f3e6c9",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    bg.on("pointerover", () => bg.setFillStyle(0x3a2444, 0.98));
    bg.on("pointerout", () => bg.setFillStyle(0x2a1a34, 0.96));
    bg.on("pointerdown", () => {
      this.scene.tweens.add({
        targets: [bg, text],
        scaleX: 0.95,
        scaleY: 0.95,
        yoyo: true,
        duration: 90,
        onComplete: onClick,
      });
    });
    this.overlay?.add(bg);
    this.overlay?.add(text);
    return bg;
  }
}

function buildShuffledDeck(): Card[] {
  const suits: Suit[] = ["♠", "♥", "♦", "♣"];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (let r = 1; r <= 13; r++) {
      deck.push({ rank: r as Rank, suit });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function evaluateHand(cards: Card[]): { type: HandType; scoringCards: Card[] } {
  if (cards.length === 0) {
    return { type: "highCard", scoringCards: [] };
  }
  const counts = new Map<Rank, Card[]>();
  for (const c of cards) {
    const arr = counts.get(c.rank) ?? [];
    arr.push(c);
    counts.set(c.rank, arr);
  }
  const groups = Array.from(counts.values()).sort((a, b) => b.length - a.length);

  const isFlush = cards.length === 5 && cards.every((c) => c.suit === cards[0].suit);
  const isStraight = cards.length === 5 && checkStraight(cards);

  if (isFlush && isStraight) {
    return { type: "straightFlush", scoringCards: cards };
  }
  if (groups[0].length === 4) {
    return { type: "quads", scoringCards: groups[0] };
  }
  if (groups[0].length === 3 && groups[1]?.length === 2) {
    return { type: "fullHouse", scoringCards: cards };
  }
  if (isFlush) {
    return { type: "flush", scoringCards: cards };
  }
  if (isStraight) {
    return { type: "straight", scoringCards: cards };
  }
  if (groups[0].length === 3) {
    return { type: "trips", scoringCards: groups[0] };
  }
  if (groups[0].length === 2 && groups[1]?.length === 2) {
    return { type: "twoPair", scoringCards: [...groups[0], ...groups[1]] };
  }
  if (groups[0].length === 2) {
    return { type: "pair", scoringCards: groups[0] };
  }
  // High card: only the highest single card scores
  const highest = cards.reduce((best, c) => {
    const v = c.rank === 1 ? 14 : c.rank;
    const bv = best.rank === 1 ? 14 : best.rank;
    return v > bv ? c : best;
  }, cards[0]);
  return { type: "highCard", scoringCards: [highest] };
}

function checkStraight(cards: Card[]): boolean {
  const ranks = cards.map((c) => c.rank).sort((a, b) => a - b);
  // Standard run
  let consecutive = true;
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] !== ranks[i - 1] + 1) {
      consecutive = false;
      break;
    }
  }
  if (consecutive) return true;
  // Wheel: A-2-3-4-5
  const wheel = [1, 2, 3, 4, 5];
  if (ranks.length === 5 && wheel.every((v, i) => v === ranks[i])) return true;
  // Broadway: 10-J-Q-K-A
  const broadway = [1, 10, 11, 12, 13];
  if (ranks.length === 5 && broadway.every((v, i) => v === ranks[i])) return true;
  return false;
}
