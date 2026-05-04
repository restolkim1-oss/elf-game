import Phaser from "phaser";
import type { PartDef } from "../data/parts";
import { UI_SCALE } from "../main";

const u = (n: number) => n * UI_SCALE;
const px = (n: number) => `${Math.round(n * UI_SCALE * 1.55)}px`;

const PLAYER_HP_MAX = 40;
const ENERGY_MAX = 3;
const START_HAND = 5;
const HAND_LIMIT = 7;
const DRAW_PER_TURN = 1;
const MAX_TURNS = 12;

type CardId =
  | "slash"
  | "smash"
  | "guard"
  | "heal"
  | "shock"
  | "burn"
  | "freeze"
  | "focus";

type CardEffect =
  | { kind: "attack"; amount: number }
  | { kind: "block"; amount: number }
  | { kind: "heal"; amount: number }
  | { kind: "draw"; amount: number }
  | { kind: "stun" }
  | { kind: "burn"; amount: number; turns: number }
  | { kind: "weaken"; amount: number; turns: number };

interface CardDef {
  id: CardId;
  name: string;
  cost: number;
  description: string;
  effects: CardEffect[];
  color: number;
}

const CARDS: Record<CardId, CardDef> = {
  slash: {
    id: "slash",
    name: "베기",
    cost: 1,
    description: "공격 4",
    effects: [{ kind: "attack", amount: 4 }],
    color: 0xc04040,
  },
  smash: {
    id: "smash",
    name: "강타",
    cost: 2,
    description: "공격 9",
    effects: [{ kind: "attack", amount: 9 }],
    color: 0xa02020,
  },
  guard: {
    id: "guard",
    name: "방패",
    cost: 1,
    description: "보호막 5",
    effects: [{ kind: "block", amount: 5 }],
    color: 0x4060c0,
  },
  heal: {
    id: "heal",
    name: "회복",
    cost: 2,
    description: "HP +5",
    effects: [{ kind: "heal", amount: 5 }],
    color: 0x40c060,
  },
  shock: {
    id: "shock",
    name: "번개",
    cost: 3,
    description: "공격 6 · 적 행동 무력화",
    effects: [{ kind: "attack", amount: 6 }, { kind: "stun" }],
    color: 0xf0d040,
  },
  burn: {
    id: "burn",
    name: "화염",
    cost: 2,
    description: "2턴 화상 (턴당 3)",
    effects: [{ kind: "burn", amount: 3, turns: 2 }],
    color: 0xe06030,
  },
  freeze: {
    id: "freeze",
    name: "빙결",
    cost: 2,
    description: "공격 3 · 적 공격 -3",
    effects: [
      { kind: "attack", amount: 3 },
      { kind: "weaken", amount: 3, turns: 1 },
    ],
    color: 0x70c0f0,
  },
  focus: {
    id: "focus",
    name: "집중",
    cost: 1,
    description: "카드 2장 드로우",
    effects: [{ kind: "draw", amount: 2 }],
    color: 0xc0a060,
  },
};

const STARTER_DECK: CardId[] = [
  "slash", "slash", "slash", "slash",
  "smash", "smash",
  "guard", "guard", "guard",
  "heal",
  "shock",
  "burn",
  "freeze",
  "focus", "focus",
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
  cardId: CardId;
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
  private deck: CardId[] = [];
  private hand: CardId[] = [];
  private discard: CardId[] = [];
  private intentPattern: Intent[] = [];
  private intentIdx = 0;
  private enemyStunned = false;

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
  }

  private startBattle(part: PartDef) {
    const { width, height } = this.scene.scale;

    // Battle UI floats over the existing scene — no opaque backdrop so the
    // character image and stage stay visible behind the strips and cards.
    this.overlay = this.scene.add.container(0, 0).setDepth(500);

    // Initialize state
    const enemyHpMax = 30 + part.difficulty * 14;
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
    this.deck = shuffle([...STARTER_DECK]);
    this.hand = [];
    this.discard = [];
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
      this.flashLog(`적 공격 ${intent.amount}${this.enemy.weaken ? ` (약화 -${this.enemy.weaken.amount})` : ""}`);
    } else if (intent.kind === "block") {
      this.enemy.block += intent.amount;
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
    const cardId = this.hand[handIdx];
    if (!cardId) return;
    const def = CARDS[cardId];
    if (this.energy < def.cost) {
      this.flashLog(`기력 부족 (${def.cost} 필요)`);
      return;
    }
    this.energy -= def.cost;
    this.hand.splice(handIdx, 1);
    this.discard.push(cardId);
    this.applyCardEffects(def);
    this.refreshAll();

    if (this.enemy.hp <= 0) {
      this.busy = true;
      this.scene.time.delayedCall(420, () => this.finish(true));
      return;
    }
  }

  private applyCardEffects(def: CardDef) {
    for (const e of def.effects) {
      switch (e.kind) {
        case "attack":
          this.applyAttack(this.enemy, e.amount);
          break;
        case "block":
          this.player.block += e.amount;
          break;
        case "heal":
          this.player.hp = Math.min(this.player.hpMax, this.player.hp + e.amount);
          break;
        case "draw":
          this.draw(e.amount);
          break;
        case "stun":
          this.enemyStunned = true;
          break;
        case "burn":
          this.enemy.burn = { dmg: e.amount, turns: e.turns };
          break;
        case "weaken":
          this.enemy.weaken = { amount: e.amount, turns: e.turns };
          break;
      }
    }
    this.flashLog(`${def.name} 사용`);
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

    this.energyText.setText(`기력 ${this.energy} / ${ENERGY_MAX}`);
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
    cardId: CardId,
    x: number,
    y: number,
    cardW: number,
    cardH: number
  ): HandCard {
    const def = CARDS[cardId];
    const playable = this.energy >= def.cost && !this.busy && !this.finished;

    const bg = this.scene.add
      .rectangle(0, 0, cardW, cardH, playable ? 0xf3e6c9 : 0x6a5d4e, playable ? 1 : 0.85)
      .setStrokeStyle(u(2), def.color, playable ? 1 : 0.6)
      .setInteractive({ useHandCursor: true });
    const accent = this.scene.add.rectangle(0, -cardH / 2 + u(10), cardW, u(20), def.color, 0.92);
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
      .text(0, -cardH / 2 + u(10), def.name, {
        fontFamily: "serif",
        fontSize: px(11),
        color: "#1a0f22",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const descText = this.scene.add
      .text(0, u(8), def.description, {
        fontFamily: "serif",
        fontSize: px(9),
        color: playable ? "#2f2520" : "#cfc0b0",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: cardW - u(10) },
      })
      .setOrigin(0.5);

    const container = this.scene.add
      .container(x, y, [bg, accent, costCircle, costText, nameText, descText])
      .setSize(cardW, cardH);
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
    bg.on("pointerdown", () => {
      const idx = this.handObjs.findIndex((o) => o === slot);
      if (idx >= 0) this.tryPlayCard(idx);
    });

    const slot: HandCard = {
      cardId,
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
  const a = Math.max(2, 2 + difficulty);
  const b = Math.max(2, 1 + difficulty);
  const a2 = Math.max(3, 4 + difficulty);
  return [
    { kind: "attack", amount: a },
    { kind: "block", amount: b },
    { kind: "attack", amount: a2 },
  ];
}
