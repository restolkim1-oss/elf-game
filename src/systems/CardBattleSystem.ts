import Phaser from "phaser";
import type { PartDef } from "../data/parts";
import { DiceRoller } from "./Dice";
import { UI_SCALE } from "../main";

const u = (n: number) => n * UI_SCALE;
const px = (n: number) => `${Math.round(n * UI_SCALE * 1.55)}px`;

const PLAYER_HP_MAX = 50;
const ENERGY_MAX = 5;
const START_HAND = 5;
const HAND_LIMIT = 7;
const DRAW_PER_TURN = 1;
const MAX_TURNS = 12;

type CardId = "attack" | "powerAttack" | "defense" | "heal" | "parry";
type CardRole = "attack" | "defense" | "heal" | "parry";

type CardEffect =
  | { kind: "attack"; amount: number }
  | { kind: "block"; amount: number }
  | { kind: "heal"; amount: number }
  | { kind: "parry"; amount: number };

interface CardDef {
  id: CardId;
  characterName: string;
  role: CardRole;
  roleLabel: string;
  name: string;
  cost: number;
  description: string;
  effects: CardEffect[];
  color: number;
  isReversed: boolean;
  level: number;
  attack: number;
  defense: number;
  psyche: number;
  damage: number;
  risk: number;
}

interface TarotCardState {
  uid: number;
  cardId: CardId;
  isReversed: boolean;
  level: number;
  attack: number;
  defense: number;
  psyche: number;
  power: number;
  damage: number;
  risk: number;
}

interface TarotBattleCard {
  isReversed: boolean;
  damage: number;
  risk: number;
}

export function calculateDamage(playerCard: TarotBattleCard, enemyCard: TarotBattleCard) {
  const playerPower = playerCard.damage * (playerCard.isReversed ? 1.15 : 1);
  const enemyPower = enemyCard.damage;
  const didWin = playerPower >= enemyPower;
  return {
    didWin,
    damage: didWin
      ? Math.max(1, Math.round(playerCard.damage * (playerCard.isReversed ? 2.5 : 1)))
      : 0,
    backlash: didWin
      ? 0
      : Math.max(1, Math.round(playerCard.risk * (playerCard.isReversed ? 1 : 0.35))),
  };
}

function calculateCardPower(card: Pick<CardDef, "level" | "attack" | "defense" | "psyche">) {
  return card.level * 5 + card.attack * 2 + card.defense + card.psyche;
}

const CARDS: Record<CardId, CardDef> = {
  attack: {
    id: "attack",
    characterName: "엘리",
    role: "attack",
    roleLabel: "공격",
    name: "공격",
    cost: 1,
    description: "기본 공격",
    effects: [{ kind: "attack", amount: 5 }],
    color: 0xc04040,
    isReversed: false,
    level: 1,
    attack: 8,
    defense: 3,
    psyche: 3,
    damage: 4,
    risk: 4,
  },
  powerAttack: {
    id: "powerAttack",
    characterName: "나느사스",
    role: "attack",
    roleLabel: "공격",
    name: "강공격",
    cost: 2,
    description: "강한 공격",
    effects: [{ kind: "attack", amount: 9 }],
    color: 0xa02020,
    isReversed: false,
    level: 2,
    attack: 13,
    defense: 4,
    psyche: 4,
    damage: 9,
    risk: 6,
  },
  defense: {
    id: "defense",
    characterName: "아리아",
    role: "defense",
    roleLabel: "디펜스",
    name: "디펜스",
    cost: 1,
    description: "방어막 생성",
    effects: [{ kind: "block", amount: 6 }],
    color: 0x4060c0,
    isReversed: false,
    level: 1,
    attack: 3,
    defense: 10,
    psyche: 4,
    damage: 2,
    risk: 3,
  },
  heal: {
    id: "heal",
    characterName: "루미아",
    role: "heal",
    roleLabel: "회복",
    name: "회복",
    cost: 2,
    description: "HP +5",
    effects: [{ kind: "heal", amount: 5 }],
    color: 0x40c060,
    isReversed: false,
    level: 1,
    attack: 4,
    defense: 5,
    psyche: 8,
    damage: 1,
    risk: 3,
  },
  parry: {
    id: "parry",
    characterName: "미르",
    role: "parry",
    roleLabel: "패링",
    name: "패링",
    cost: 2,
    description: "방어 후 반격",
    effects: [{ kind: "parry", amount: 4 }],
    color: 0xc0a060,
    isReversed: false,
    level: 2,
    attack: 6,
    defense: 8,
    psyche: 7,
    damage: 4,
    risk: 4,
  },
};

const STARTER_DECK: CardId[] = [
  "attack", "attack", "attack", "attack",
  "powerAttack", "powerAttack",
  "defense", "defense", "defense", "defense",
  "heal", "heal",
  "parry", "parry", "parry",
];

type IntentKind = "attack" | "block";
interface Intent {
  kind: IntentKind;
  amount: number;
}

interface SideState {
  hp: number;
  hpMax: number;
  block: number;
  burn: { dmg: number; turns: number } | null;
  weaken: { amount: number; turns: number } | null;
}

type CardBattleResult = (success: boolean) => void;

interface HandCard {
  card: TarotCardState;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  baseX: number;
  baseY: number;
  cardW: number;
  cardH: number;
}

export class CardBattleSystem {
  private scene: Phaser.Scene;
  private overlay: Phaser.GameObjects.Container | null = null;
  private activeDone: CardBattleResult | null = null;
  private cancelled = false;
  private finished = false;
  private busy = false;

  private player!: SideState;
  private enemy!: SideState;
  private energy = 0;
  private turn = 0;
  private deck: TarotCardState[] = [];
  private hand: TarotCardState[] = [];
  private discard: TarotCardState[] = [];
  private selectedCards: TarotCardState[] = [];
  private intentPattern: Intent[] = [];
  private intentIdx = 0;
  private enemyStunned = false;
  private nextCardUid = 1;

  private playerHpFill!: Phaser.GameObjects.Rectangle;
  private playerHpText!: Phaser.GameObjects.Text;
  private playerBlockText!: Phaser.GameObjects.Text;
  private playerStatusText!: Phaser.GameObjects.Text;
  private enemyHpFill!: Phaser.GameObjects.Rectangle;
  private enemyHpText!: Phaser.GameObjects.Text;
  private enemyBlockText!: Phaser.GameObjects.Text;
  private enemyIntentText!: Phaser.GameObjects.Text;
  private enemyStatusText!: Phaser.GameObjects.Text;
  private energyText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private deckCountText!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private handObjs: HandCard[] = [];
  private endTurnBg!: Phaser.GameObjects.Rectangle;
  private useCardsBg!: Phaser.GameObjects.Rectangle;

  private handAreaY = 0;
  private handAreaWidth = 0;
  private playerHpBarMaxWidth = 0;
  private enemyHpBarMaxWidth = 0;
  private playerHpBarLeft = 0;
  private enemyHpBarLeft = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  start(part: PartDef, done: CardBattleResult) {
    this.cleanup();
    this.cancelled = false;
    this.finished = false;
    this.busy = false;
    this.nextCardUid = 1;
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
    if (this.finished && !success) {
      // already failing; allow only single resolution
    }
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
    this.handObjs = [];
    this.deck = [];
    this.hand = [];
    this.discard = [];
    this.selectedCards = [];
  }

  private startBattle(part: PartDef) {
    const { width, height } = this.scene.scale;

    // Battle UI floats over the existing scene — no opaque backdrop so the
    // character image and stage stay visible behind the strips and cards.
    this.overlay = this.scene.add.container(0, 0).setDepth(500);

    // Initialize state
    const enemyHpMax = 22 + part.difficulty * 9;
    this.player = {
      hp: PLAYER_HP_MAX,
      hpMax: PLAYER_HP_MAX,
      block: 0,
      burn: null,
      weaken: null,
    };
    this.enemy = {
      hp: enemyHpMax,
      hpMax: enemyHpMax,
      block: 0,
      burn: null,
      weaken: null,
    };
    this.energy = ENERGY_MAX;
    this.turn = 1;
    this.deck = shuffle(STARTER_DECK.map((cardId) => this.createTarotCard(cardId)));
    this.hand = [];
    this.discard = [];
    this.selectedCards = [];
    this.intentPattern = buildIntentPattern(part.difficulty);
    this.intentIdx = 0;
    this.enemyStunned = false;

    const stripW = width * 0.96;

    // -- Top: enemy strip (sits just below the progression pills) --
    const enemyStripY = u(180);
    const enemyStripBg = this.scene.add
      .rectangle(width / 2, enemyStripY, stripW, u(72), 0x1a0814, 0.78)
      .setStrokeStyle(u(1.2), 0xff8fab, 0.7);
    const enemyName = this.scene.add
      .text(width / 2 - stripW / 2 + u(14), enemyStripY - u(22), `적 · ${part.label}`, {
        fontFamily: "serif",
        fontSize: px(13),
        color: "#ffd6df",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    this.enemyIntentText = this.scene.add
      .text(width / 2 + stripW / 2 - u(14), enemyStripY - u(22), "", {
        fontFamily: "serif",
        fontSize: px(12),
        color: "#ffd572",
        fontStyle: "bold",
      })
      .setOrigin(1, 0.5);

    const enemyHpY = enemyStripY + u(2);
    this.enemyHpBarMaxWidth = stripW * 0.84;
    this.enemyHpBarLeft = width / 2 - this.enemyHpBarMaxWidth / 2;
    const enemyHpBg = this.scene.add
      .rectangle(width / 2, enemyHpY, this.enemyHpBarMaxWidth, u(16), 0x2a1a34, 0.92)
      .setStrokeStyle(u(1), 0xd4a656, 0.6);
    this.enemyHpFill = this.scene.add
      .rectangle(this.enemyHpBarLeft, enemyHpY, this.enemyHpBarMaxWidth, u(13), 0xff5e7a, 0.95)
      .setOrigin(0, 0.5);
    this.enemyHpText = this.scene.add
      .text(width / 2, enemyHpY, `${this.enemy.hp} / ${this.enemy.hpMax}`, {
        fontFamily: "serif",
        fontSize: px(10),
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.enemyBlockText = this.scene.add
      .text(this.enemyHpBarLeft + this.enemyHpBarMaxWidth + u(6), enemyHpY, "", {
        fontFamily: "serif",
        fontSize: px(10),
        color: "#9ad0ff",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    this.enemyStatusText = this.scene.add
      .text(width / 2, enemyStripY + u(22), "", {
        fontFamily: "serif",
        fontSize: px(9),
        color: "#ffaa66",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.overlay.add([
      enemyStripBg,
      enemyName,
      this.enemyIntentText,
      enemyHpBg,
      this.enemyHpFill,
      this.enemyHpText,
      this.enemyBlockText,
      this.enemyStatusText,
    ]);

    // -- Bottom: player strip (above the hand) --
    const playerStripY = height - u(280);
    const playerStripBg = this.scene.add
      .rectangle(width / 2, playerStripY, stripW, u(60), 0x10141a, 0.78)
      .setStrokeStyle(u(1.2), 0x9ad0ff, 0.7);
    const playerName = this.scene.add
      .text(width / 2 - stripW / 2 + u(14), playerStripY - u(20), "당신", {
        fontFamily: "serif",
        fontSize: px(12),
        color: "#cfe6ff",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    this.energyText = this.scene.add
      .text(width / 2, playerStripY - u(20), "", {
        fontFamily: "serif",
        fontSize: px(13),
        color: "#ffd572",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.turnText = this.scene.add
      .text(width / 2 + stripW / 2 - u(14), playerStripY - u(20), "", {
        fontFamily: "serif",
        fontSize: px(11),
        color: "#d4a656",
        fontStyle: "bold",
      })
      .setOrigin(1, 0.5);

    const playerHpY = playerStripY + u(2);
    this.playerHpBarMaxWidth = stripW * 0.66;
    this.playerHpBarLeft = width / 2 - stripW / 2 + u(20);
    const playerHpBg = this.scene.add
      .rectangle(
        this.playerHpBarLeft + this.playerHpBarMaxWidth / 2,
        playerHpY,
        this.playerHpBarMaxWidth,
        u(16),
        0x2a1a34,
        0.92
      )
      .setStrokeStyle(u(1), 0xd4a656, 0.6);
    this.playerHpFill = this.scene.add
      .rectangle(this.playerHpBarLeft, playerHpY, this.playerHpBarMaxWidth, u(13), 0x86e08d, 0.95)
      .setOrigin(0, 0.5);
    this.playerHpText = this.scene.add
      .text(
        this.playerHpBarLeft + this.playerHpBarMaxWidth / 2,
        playerHpY,
        `${this.player.hp} / ${this.player.hpMax}`,
        {
          fontFamily: "serif",
          fontSize: px(10),
          color: "#ffffff",
          fontStyle: "bold",
        }
      )
      .setOrigin(0.5);
    this.playerBlockText = this.scene.add
      .text(this.playerHpBarLeft + this.playerHpBarMaxWidth + u(6), playerHpY, "", {
        fontFamily: "serif",
        fontSize: px(10),
        color: "#9ad0ff",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    this.playerStatusText = this.scene.add
      .text(width / 2 - stripW * 0.18, playerStripY + u(22), "", {
        fontFamily: "serif",
        fontSize: px(9),
        color: "#ffaa66",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    this.deckCountText = this.scene.add
      .text(width / 2 + stripW / 2 - u(14), playerStripY + u(22), "", {
        fontFamily: "serif",
        fontSize: px(9),
        color: "#d4a656",
        fontStyle: "bold",
      })
      .setOrigin(1, 0.5);

    this.overlay.add([
      playerStripBg,
      playerName,
      this.energyText,
      this.turnText,
      playerHpBg,
      this.playerHpFill,
      this.playerHpText,
      this.playerBlockText,
      this.playerStatusText,
      this.deckCountText,
    ]);

    // Floating log readout above the player strip
    this.logText = this.scene.add
      .text(width / 2, playerStripY - u(56), "", {
        fontFamily: "serif",
        fontSize: px(12),
        color: "#f3e6c9",
        fontStyle: "bold",
        backgroundColor: "rgba(20, 9, 26, 0.7)",
        padding: { x: 10, y: 4 },
      })
      .setOrigin(0.5);
    this.overlay.add(this.logText);

    // Hand area sits in the slot freed by the hidden bottom panel
    this.handAreaY = height - u(150);
    this.handAreaWidth = stripW * 0.98;

    // Action buttons at the very bottom corners
    const btnY = height - u(40);
    this.endTurnBg = this.makeButton(
      width - u(110),
      btnY,
      u(160),
      u(46),
      "턴 종료",
      () => this.endPlayerTurn()
    );
    this.useCardsBg = this.makeButton(
      width / 2,
      btnY,
      u(180),
      u(46),
      "카드 사용",
      () => this.playSelectedCards()
    );
    this.makeButton(u(110), btnY, u(160), u(46), "포기", () => {
      this.cancelled = true;
      this.finish(false);
    });

    // Start of battle
    this.draw(START_HAND);
    this.refreshAll();
  }

  // -- Game flow --

  private startPlayerTurn() {
    if (this.finished) return;
    this.player.block = 0;
    this.energy = ENERGY_MAX;
    this.selectedCards = [];
    this.draw(DRAW_PER_TURN);
    this.refreshAll();
  }

  private endPlayerTurn() {
    if (this.busy || this.finished) return;
    this.busy = true;
    this.refreshButtons();
    this.runEnemyTurn();
  }

  private runEnemyTurn() {
    if (this.finished) return;
    // Burn ticks on enemy at start of enemy turn
    if (this.enemy.burn) {
      const dmg = this.enemy.burn.dmg;
      this.applyDirectDamage(this.enemy, dmg);
      this.enemy.burn.turns -= 1;
      if (this.enemy.burn.turns <= 0) this.enemy.burn = null;
      this.flashLog(`화상 ${dmg}`);
      this.refreshAll();
      if (this.enemy.hp <= 0) {
        this.scene.time.delayedCall(420, () => this.finish(true));
        return;
      }
    }

    this.scene.time.delayedCall(280, () => this.executeIntent());
  }

  private executeIntent() {
    if (this.finished) return;

    if (this.enemyStunned) {
      this.enemyStunned = false;
      this.flashLog("적 행동 무력화");
      this.scene.time.delayedCall(360, () => this.advanceIntentAndContinue());
      return;
    }

    const intent = this.intentPattern[this.intentIdx % this.intentPattern.length];
    if (intent.kind === "attack") {
      let dmg = intent.amount;
      if (this.enemy.weaken) {
        dmg = Math.max(0, dmg - this.enemy.weaken.amount);
      }
      this.applyAttack(this.player, dmg);
      this.playAttackEffect("player", dmg);
      this.flashLog(`적 공격 ${intent.amount}${this.enemy.weaken ? ` (약화 -${this.enemy.weaken.amount})` : ""}`);
    } else if (intent.kind === "block") {
      this.enemy.block += intent.amount;
      this.playGuardEffect("enemy");
      this.flashLog(`적 보호막 +${intent.amount}`);
    }
    this.refreshAll();

    if (this.player.hp <= 0) {
      this.scene.time.delayedCall(540, () => this.finish(false));
      return;
    }

    this.scene.time.delayedCall(360, () => this.advanceIntentAndContinue());
  }

  private advanceIntentAndContinue() {
    this.intentIdx++;
    // Decrement weaken on enemy at end of enemy turn
    if (this.enemy.weaken) {
      this.enemy.weaken.turns -= 1;
      if (this.enemy.weaken.turns <= 0) this.enemy.weaken = null;
    }
    this.turn++;
    if (this.turn > MAX_TURNS) {
      this.flashLog("시간 초과 - 실패");
      this.refreshAll();
      this.scene.time.delayedCall(620, () => this.finish(false));
      return;
    }
    this.busy = false;
    this.startPlayerTurn();
  }

  // -- Card actions --

  private tryPlayCard(handIdx: number) {
    if (this.busy || this.finished) return;
    const card = this.hand[handIdx];
    if (!card) return;
    const def = CARDS[card.cardId];
    const selected = this.selectedCards.includes(card);
    if (selected) {
      this.selectedCards = this.selectedCards.filter((c) => c !== card);
      this.refreshAll();
      return;
    }
    if (this.selectedCards.length > 0) {
      const role = CARDS[this.selectedCards[0].cardId].role;
      if (def.role !== role) {
        this.selectedCards = [card];
        this.flashLog(`${def.roleLabel} 카드 선택`);
        this.refreshAll();
        return;
      }
    }
    const nextCost = this.selectedCards.reduce((sum, c) => sum + CARDS[c.cardId].cost, 0) + def.cost;
    if (nextCost > this.energy) {
      this.flashLog(`기력 부족 (${nextCost} / ${this.energy})`);
      return;
    }
    this.selectedCards.push(card);
    this.flashLog(`${def.roleLabel} ${this.selectedCards.length}장 선택`);
    this.refreshAll();
  }

  private playSelectedCards() {
    if (this.busy || this.finished) return;
    if (this.selectedCards.length === 0) {
      this.flashLog("사용할 카드를 선택하세요");
      return;
    }
    const comboCost = this.selectedCards.reduce((sum, c) => sum + CARDS[c.cardId].cost, 0);
    if (comboCost > this.energy) {
      this.flashLog(`기력 부족 (${comboCost} / ${this.energy})`);
      return;
    }
    const comboCards = [...this.selectedCards];
    this.selectedCards = [];
    this.energy -= comboCost;
    this.hand = this.hand.filter((c) => !comboCards.includes(c));
    this.discard.push(...comboCards);
    this.applyCardEffects(comboCards);
    this.refreshAll();

    if (this.enemy.hp <= 0) {
      this.busy = true;
      this.scene.time.delayedCall(420, () => this.finish(true));
      return;
    }
    if (this.energy <= 0) {
      this.flashLog("기력을 모두 사용해 턴 종료");
      this.scene.time.delayedCall(360, () => this.endPlayerTurn());
    }
  }

  private applyCardEffects(cards: TarotCardState[]) {
    const card = cards[0];
    const def = CARDS[card.cardId];
    const role = def.role;
    const comboMultiplier = 1 + Math.max(0, cards.length - 1) * (role === "defense" ? 0.25 : 0.35);
    const totalEffect = this.sumComboEffect(cards);
    const comboBonusText = cards.length > 1 ? ` x${cards.length} 합체` : "";
    const enemyCard = this.currentEnemyCard();
    const comboBattleCard: TarotBattleCard = {
      isReversed: cards.some((c) => c.isReversed),
      damage: Math.max(1, Math.round(cards.reduce((sum, c) => sum + c.damage, 0) * comboMultiplier)),
      risk: Math.max(1, Math.round(cards.reduce((sum, c) => sum + c.risk, 0) / cards.length)),
    };
    const duel = calculateDamage(comboBattleCard, enemyCard);
    let attemptedAttack = false;
    let didAttack = false;
    let didGuard = false;

    switch (role) {
      case "attack":
        attemptedAttack = true;
        if (duel.didWin) {
          this.applyAttack(this.enemy, duel.damage);
          didAttack = true;
        } else {
          this.applyDirectDamage(this.player, duel.backlash);
          this.playAttackEffect("player", duel.backlash);
          this.flashLog(card.isReversed ? `역방향 실패 - 내구도 ${duel.backlash} 감소` : `심리전 실패 - 내구도 ${duel.backlash} 감소`);
        }
        break;
      case "defense":
        this.player.block += Math.max(1, Math.round(totalEffect * comboMultiplier));
        didGuard = true;
        break;
      case "heal":
        this.player.hp = Math.min(this.player.hpMax, this.player.hp + totalEffect);
        break;
      case "parry": {
        const guard = Math.max(1, Math.round(totalEffect * comboMultiplier));
        this.player.block += guard;
        didGuard = true;
        if (duel.didWin) {
          const counter = Math.max(1, Math.round(duel.damage * 0.7));
          this.applyAttack(this.enemy, counter);
          didAttack = true;
        }
        break;
      }
    }
    if (didAttack) this.rollDiceAfterHit(duel.damage);
    if (didGuard) this.playGuardEffect("player");
    if (duel.didWin || !attemptedAttack) this.flashLog(`${def.roleLabel}${comboBonusText} 사용`);
  }

  private sumComboEffect(cards: TarotCardState[]) {
    return cards.reduce((sum, card) => {
      const effect = CARDS[card.cardId].effects[0];
      return sum + ("amount" in effect ? effect.amount : 0);
    }, 0);
  }

  private applyAttack(target: SideState, raw: number) {
    let remaining = raw;
    if (target.block > 0) {
      const absorbed = Math.min(target.block, remaining);
      target.block -= absorbed;
      remaining -= absorbed;
    }
    if (remaining > 0) {
      target.hp = Math.max(0, target.hp - remaining);
    }
  }

  private applyDirectDamage(target: SideState, amount: number) {
    target.hp = Math.max(0, target.hp - amount);
  }

  private createTarotCard(cardId: CardId): TarotCardState {
    const def = CARDS[cardId];
    const power = calculateCardPower(def);
    return {
      uid: this.nextCardUid++,
      cardId,
      isReversed: def.isReversed,
      level: def.level,
      attack: def.attack,
      defense: def.defense,
      psyche: def.psyche,
      power,
      damage: Math.max(1, Math.round(power / 5)),
      risk: Math.max(def.risk, Math.round((power - def.defense) / 7)),
    };
  }

  private currentEnemyCard(): TarotBattleCard {
    const intent = this.intentPattern[this.intentIdx % this.intentPattern.length];
    const damage = intent.kind === "attack" ? intent.amount * 3 : Math.max(1, Math.ceil(intent.amount * 1.8));
    return {
      isReversed: false,
      damage,
      risk: Math.max(1, Math.ceil(damage * 0.5)),
    };
  }

  private rollDiceAfterHit(baseDamage: number) {
    const { width } = this.scene.scale;
    this.playAttackEffect("enemy", baseDamage);
    DiceRoller.roll(this.scene, this.overlay, width / 2, u(285), (roll) => {
      if (this.finished) return;
      if (roll.critical) {
        const criticalDamage = Math.max(4, Math.round(baseDamage * 0.85));
        this.applyDirectDamage(this.enemy, criticalDamage);
        this.playAttackEffect("enemy", criticalDamage);
        this.flashLog(`Critical Hit! 추가 내구도 ${criticalDamage} 감소`);
        this.refreshAll();
        if (this.enemy.hp <= 0) {
          this.busy = true;
          this.scene.time.delayedCall(360, () => this.finish(true));
        }
      }
    });
  }

  // -- Deck --

  private draw(n: number) {
    for (let i = 0; i < n; i++) {
      if (this.hand.length >= HAND_LIMIT) break;
      if (this.deck.length === 0) {
        if (this.discard.length === 0) break;
        this.deck = shuffle(this.discard);
        this.discard = [];
      }
      const card = this.deck.pop();
      if (card) this.hand.push(card);
    }
  }

  // -- Rendering --

  private refreshAll() {
    this.refreshHpBars();
    this.refreshIntent();
    this.refreshStatus();
    this.refreshHandRender();
    this.refreshButtons();
  }

  private refreshHpBars() {
    const pRatio = this.player.hp / this.player.hpMax;
    this.playerHpFill.width = this.playerHpBarMaxWidth * pRatio;
    this.playerHpText.setText(`${this.player.hp} / ${this.player.hpMax}`);
    this.playerBlockText.setText(this.player.block > 0 ? `🛡 ${this.player.block}` : "");

    const eRatio = this.enemy.hp / this.enemy.hpMax;
    this.enemyHpFill.width = this.enemyHpBarMaxWidth * eRatio;
    this.enemyHpText.setText(`${this.enemy.hp} / ${this.enemy.hpMax}`);
    this.enemyBlockText.setText(this.enemy.block > 0 ? `🛡 ${this.enemy.block}` : "");
  }

  private refreshIntent() {
    const intent = this.intentPattern[this.intentIdx % this.intentPattern.length];
    if (this.enemyStunned) {
      this.enemyIntentText.setText("다음: 무력화됨");
      this.enemyIntentText.setColor("#9ad0ff");
      return;
    }
    if (intent.kind === "attack") {
      let shown = intent.amount;
      if (this.enemy.weaken) shown = Math.max(0, shown - this.enemy.weaken.amount);
      this.enemyIntentText.setText(`다음: 공격 ${shown}`);
      this.enemyIntentText.setColor("#ff8090");
    } else {
      this.enemyIntentText.setText(`다음: 보호막 +${intent.amount}`);
      this.enemyIntentText.setColor("#9ad0ff");
    }
  }

  private refreshStatus() {
    const enemyParts: string[] = [];
    if (this.enemy.burn) enemyParts.push(`화상 ${this.enemy.burn.dmg} × ${this.enemy.burn.turns}턴`);
    if (this.enemy.weaken) enemyParts.push(`약화 -${this.enemy.weaken.amount}`);
    this.enemyStatusText.setText(enemyParts.join("  ·  "));

    const playerParts: string[] = [];
    if (this.player.burn) playerParts.push(`화상 ${this.player.burn.dmg} × ${this.player.burn.turns}턴`);
    if (this.player.weaken) playerParts.push(`약화 -${this.player.weaken.amount}`);
    this.playerStatusText.setText(playerParts.join("  ·  "));

    const selectedCost = this.selectedCards.reduce((sum, c) => sum + CARDS[c.cardId].cost, 0);
    this.energyText.setText(`기력 ${this.energy} / ${ENERGY_MAX}${selectedCost > 0 ? ` · 선택 ${selectedCost}` : ""}`);
    this.turnText.setText(`턴 ${this.turn} / ${MAX_TURNS}`);
    this.deckCountText.setText(`덱 ${this.deck.length} · 버림 ${this.discard.length}`);
  }

  private refreshHandRender() {
    // Destroy old hand visuals
    for (const c of this.handObjs) c.container.destroy();
    this.handObjs = [];

    const count = this.hand.length;
    if (count === 0) return;

    const gap = u(6);
    const maxCardW = u(120);
    const cardW = Math.min(
      maxCardW,
      (this.handAreaWidth - gap * (count - 1)) / count
    );
    const cardH = Math.min(u(150), cardW * 1.4);
    const totalW = count * cardW + (count - 1) * gap;
    const startX = this.scene.scale.width / 2 - totalW / 2 + cardW / 2;

    for (let i = 0; i < count; i++) {
      const x = startX + i * (cardW + gap);
      const obj = this.makeCardVisual(this.hand[i], x, this.handAreaY, cardW, cardH);
      this.handObjs.push(obj);
    }
  }

  private makeCardVisual(
    card: TarotCardState,
    x: number,
    y: number,
    cardW: number,
    cardH: number
  ): HandCard {
    const def = CARDS[card.cardId];
    const selected = this.selectedCards.includes(card);
    const selectedCost = this.selectedCards.reduce((sum, c) => sum + CARDS[c.cardId].cost, 0);
    const sameRole =
      this.selectedCards.length === 0 ||
      CARDS[this.selectedCards[0].cardId].role === def.role ||
      selected;
    const playable = sameRole && selectedCost + (selected ? 0 : def.cost) <= this.energy && !this.busy && !this.finished;

    const bg = this.scene.add
      .rectangle(0, 0, cardW, cardH, selected ? 0xffedb2 : playable ? 0xf3e6c9 : 0x6a5d4e, playable ? 1 : 0.85)
      .setStrokeStyle(u(selected ? 4 : 2), selected ? 0xffd572 : def.color, playable ? 1 : 0.6)
      .setInteractive({ useHandCursor: true });
    const selectionAura = this.scene.add
      .rectangle(0, 0, cardW + u(10), cardH + u(10), 0xffffff, 0)
      .setStrokeStyle(u(3), 0xfff0a8, selected ? 0.95 : 0);
    const accent = this.scene.add.rectangle(0, -cardH / 2 + u(14), cardW, u(28), def.color, 0.92);
    const costCircle = this.scene.add
      .circle(-cardW / 2 + u(14), -cardH / 2 + u(14), u(11), 0x14091a, 0.95)
      .setStrokeStyle(u(1.2), 0xffd572, 0.95);
    const costText = this.scene.add
      .text(-cardW / 2 + u(14), -cardH / 2 + u(14), String(def.cost), {
        fontFamily: "serif",
        fontSize: px(12),
        color: "#ffd572",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const nameText = this.scene.add
      .text(0, -cardH / 2 + u(14), def.roleLabel, {
        fontFamily: "serif",
        fontSize: px(14),
        color: "#1a0f22",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const reverseBadge = this.scene.add
      .text(cardW / 2 - u(20), -cardH / 2 + u(14), `C${def.cost}`, {
        fontFamily: "serif",
        fontSize: px(8),
        color: "#2f2520",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const portrait = this.scene.add
      .rectangle(0, -cardH / 2 + u(58), cardW - u(18), u(54), 0x24182f, 0.18)
      .setStrokeStyle(u(1), def.color, 0.65);
    const roleText = this.scene.add
      .text(0, -cardH / 2 + u(48), def.name, {
        fontFamily: "serif",
        fontSize: px(11),
        color: "#4b3545",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const powerText = this.scene.add
      .text(0, -cardH / 2 + u(68), `전투력 ${card.power}`, {
        fontFamily: "serif",
        fontSize: px(10),
        color: "#2f2520",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const descText = this.scene.add
      .text(0, u(42), `${def.description}\n같은 역할 선택 합체`, {
        fontFamily: "serif",
        fontSize: px(8.2),
        color: playable ? "#2f2520" : "#cfc0b0",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: cardW - u(16) },
      })
      .setOrigin(0.5);

    const container = this.scene.add
      .container(x, y, [
        selectionAura,
        bg,
        accent,
        costCircle,
        costText,
        nameText,
        reverseBadge,
        portrait,
        roleText,
        powerText,
        descText,
      ])
      .setSize(cardW, cardH);
    if (selected) {
      container.setY(y - u(18));
      this.scene.tweens.add({
        targets: selectionAura,
        alpha: { from: 0.6, to: 1 },
        scaleX: { from: 1, to: 1.06 },
        scaleY: { from: 1, to: 1.06 },
        yoyo: true,
        repeat: -1,
        duration: 780,
        ease: "Sine.easeInOut",
      });
    }
    this.overlay?.add(container);

    bg.on("pointerover", () => {
      if (this.busy || this.finished) return;
      this.scene.tweens.add({
        targets: container,
        y: y - u(14),
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 140,
      });
    });
    bg.on("pointerout", () => {
      this.scene.tweens.add({
        targets: container,
        y,
        scaleX: 1,
        scaleY: 1,
        duration: 140,
      });
    });
    bg.on("pointerup", () => {
      const idx = this.handObjs.findIndex((o) => o === slot);
      if (idx >= 0) this.tryPlayCard(idx);
    });

    const slot: HandCard = {
      card,
      container,
      bg,
      baseX: x,
      baseY: y,
      cardW,
      cardH,
    };
    return slot;
  }

  private refreshButtons() {
    const canEnd = !this.busy && !this.finished;
    this.endTurnBg.setFillStyle(0x2a1a34, canEnd ? 0.96 : 0.5);
    this.useCardsBg.setFillStyle(0x2a1a34, canEnd && this.selectedCards.length > 0 ? 0.96 : 0.5);
  }

  private flashLog(text: string) {
    this.logText.setText(text);
    this.scene.tweens.killTweensOf(this.logText);
    this.logText.setAlpha(1);
    this.scene.tweens.add({
      targets: this.logText,
      alpha: 0.3,
      duration: 1200,
      delay: 800,
    });
  }

  private playAttackEffect(target: "enemy" | "player", amount = 0) {
    const { width, height } = this.scene.scale;
    const y = target === "enemy" ? u(180) : height - u(280);
    const x = width / 2;
    const color = target === "enemy" ? 0xff5e7a : 0xffd572;
    this.scene.cameras.main.shake(target === "enemy" ? 150 : 220, target === "enemy" ? 0.006 : 0.009);

    const slash = this.scene.add.graphics().setDepth(720);
    slash.lineStyle(u(8), color, 0.95);
    slash.beginPath();
    slash.moveTo(x - u(150), y - u(52));
    slash.lineTo(x + u(150), y + u(52));
    slash.strokePath();
    slash.lineStyle(u(3), 0xffffff, 0.9);
    slash.beginPath();
    slash.moveTo(x - u(112), y - u(34));
    slash.lineTo(x + u(112), y + u(34));
    slash.strokePath();
    this.overlay?.add(slash);

    const burst = this.scene.add.circle(x, y, u(18), color, 0.35).setDepth(721);
    this.overlay?.add(burst);
    if (amount > 0) {
      const damage = this.scene.add
        .text(x, y - u(54), `-${amount}`, {
          fontFamily: "serif",
          fontSize: px(20),
          color: "#ffffff",
          fontStyle: "bold",
          stroke: "#5a1018",
          strokeThickness: u(2),
        })
        .setOrigin(0.5)
        .setDepth(722);
      this.overlay?.add(damage);
      this.scene.tweens.add({
        targets: damage,
        y: damage.y - u(36),
        alpha: 0,
        duration: 520,
        ease: "Cubic.easeOut",
        onComplete: () => damage.destroy(),
      });
    }

    this.scene.tweens.add({
      targets: slash,
      alpha: 0,
      scaleX: 1.18,
      scaleY: 1.18,
      duration: 260,
      ease: "Cubic.easeOut",
      onComplete: () => slash.destroy(),
    });
    this.scene.tweens.add({
      targets: burst,
      radius: u(90),
      alpha: 0,
      duration: 360,
      ease: "Cubic.easeOut",
      onComplete: () => burst.destroy(),
    });
  }

  private playGuardEffect(target: "enemy" | "player") {
    const { width, height } = this.scene.scale;
    const y = target === "enemy" ? u(180) : height - u(280);
    const x = width / 2;
    this.scene.cameras.main.shake(90, 0.003);

    const shield = this.scene.add.graphics().setDepth(721);
    shield.lineStyle(u(5), 0x9ad0ff, 0.95);
    shield.fillStyle(0x4060c0, 0.18);
    shield.fillCircle(x, y, u(54));
    shield.strokeCircle(x, y, u(54));
    shield.lineStyle(u(2), 0xffffff, 0.8);
    shield.strokeCircle(x, y, u(36));
    this.overlay?.add(shield);

    this.scene.tweens.add({
      targets: shield,
      alpha: 0,
      scaleX: 1.45,
      scaleY: 1.45,
      duration: 420,
      ease: "Cubic.easeOut",
      onComplete: () => shield.destroy(),
    });
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

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildIntentPattern(difficulty: number): Intent[] {
  const a = Math.max(1, 1 + difficulty);
  const b = Math.max(1, difficulty);
  const a2 = Math.max(2, 2 + difficulty);
  return [
    { kind: "block", amount: b },
    { kind: "attack", amount: a },
    { kind: "attack", amount: a2 },
  ];
}
