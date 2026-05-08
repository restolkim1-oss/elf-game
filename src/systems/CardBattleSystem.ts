import Phaser from "phaser";
import type { PartDef } from "../data/parts";
import { findFusionRecipe, type CardFusionRecipe, type FusionEffect, type FusionRole } from "../data/cardFusionRecipes";
import { ENEMY_PART_CONFIG, type EnemyPart, type PartAbility, type PartId } from "../data/enemyParts";
import { DiceRoller } from "./Dice";
import { UI_SCALE } from "../main";

const u = (n: number) => n * UI_SCALE;
const px = (n: number) => `${Math.round(n * UI_SCALE * 1.55)}px`;

const PLAYER_HP_MAX = 50;
const ENERGY_MAX = 5;
const START_HAND = 5;
const TARGET_HAND = 5;
const HAND_LIMIT = 7;
const MAX_TURNS = 12;
const ENEMY_REACTION_LINES = [
  "제법인데?",
  "이럴수가! 잘하네?",
  "나도 지지 않아!",
  "흥, 아직이야!",
  "생각보다 강하네?",
];

type BaseCardId = "attack" | "powerAttack" | "defense" | "heal" | "parry";
type TempCardId = `temp_${string}`;
type CardId = BaseCardId | TempCardId;
type CardRole = FusionRole;

type CardEffect =
  | { kind: "attack"; amount: number }
  | { kind: "block"; amount: number }
  | { kind: "heal"; amount: number }
  | { kind: "energy"; amount: number }
  | { kind: "drain"; amount: number }
  | { kind: "partBonusAttack"; amount: number; partIds: string[]; label: string }
  | { kind: "partDamage"; partId: PartId; amount: number }
  | { kind: "reflectNextAttack"; ratio: number }
  | { kind: "weakenNextAttack"; ratio: number; maxTurns: number }
  | { kind: "autoParryNextAttack"; counterDamage: number; maxTurns: number }
  | { kind: "dodgeFirstAttackOfNextEnemyTurn"; maxTurns: number }
  | { kind: "dodgeNextAttack"; maxTurns: number }
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
  isTemporary?: boolean;
  fusionRecipeId?: string;
  cannotFuse?: boolean;
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
  isTemporary?: boolean;
  fusionRecipeId?: string;
  cannotFuse?: boolean;
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

const CARDS: Record<string, CardDef> = {
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

const STARTER_DECK: BaseCardId[] = [
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

interface EnemyRuntimePart {
  id: PartId;
  displayName: string;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  ability: PartAbility;
}

interface EnemyPartRuntimeState {
  skirtTurnCounter: number;
  strongAttackNext: boolean;
  shoesNegateFirstHit: boolean;
}

interface PlayerDamageContext {
  shoesChecked: boolean;
  prevented: boolean;
}

interface SideState {
  hp: number;
  hpMax: number;
  block: number;
  burn: { dmg: number; turns: number } | null;
  weaken: { amount: number; turns: number } | null;
  reflectNextAttack: { ratio: number } | null;
  weakenNextAttack: { ratio: number; turnsLeft: number } | null;
  autoParryNextAttack: { counterDamage: number; turnsLeft: number } | null;
  dodgeFirstAttackOfNextEnemyTurn: { turnsLeft: number } | null;
  dodgeNextAttack: { turnsLeft: number } | null;
  parts: EnemyRuntimePart[];
  partRuntime: EnemyPartRuntimeState;
}

type CardBattleResult = (success: boolean, result?: { destroyedPartIds: PartId[] }) => void;

interface HandCard {
  card: TarotCardState;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  dropGlow: Phaser.GameObjects.Rectangle;
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
  private activePartId = "";
  private lastDestroyedPartIds: PartId[] = [];

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
  private playerEnergyFill!: Phaser.GameObjects.Rectangle;
  private playerEnergyText!: Phaser.GameObjects.Text;
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
  private enemyPartPanel: Phaser.GameObjects.Container | null = null;
  private enemyPartRows: Partial<
    Record<
      PartId,
      {
        container: Phaser.GameObjects.Container;
        bg: Phaser.GameObjects.Rectangle;
        hpFill: Phaser.GameObjects.Rectangle;
        hpText: Phaser.GameObjects.Text;
        counterText: Phaser.GameObjects.Text;
      }
    >
  > = {};

  private handAreaY = 0;
  private handAreaWidth = 0;
  private playerHpBarMaxWidth = 0;
  private playerEnergyBarMaxWidth = 0;
  private enemyHpBarMaxWidth = 0;
  private playerHpBarLeft = 0;
  private playerEnergyBarLeft = 0;
  private enemyHpBarLeft = 0;
  private dragStart: { x: number; y: number; card: TarotCardState } | null = null;
  private speechBubble: Phaser.GameObjects.Container | null = null;
  private lastSpeechAt = 0;
  private flowWatchdog: Phaser.Time.TimerEvent | null = null;
  private battleRunId = 0;
  private effectObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  private createPartRuntimeState(): EnemyPartRuntimeState {
    return {
      skirtTurnCounter: 0,
      strongAttackNext: false,
      shoesNegateFirstHit: false,
    };
  }

  private createEnemyParts(configKey: keyof typeof ENEMY_PART_CONFIG): EnemyRuntimePart[] {
    return ENEMY_PART_CONFIG[configKey].map((part: EnemyPart) => ({
      id: part.id,
      displayName: part.displayName,
      hp: part.maxHp,
      maxHp: part.maxHp,
      destroyed: false,
      ability: { ...part.ability },
    }));
  }

  start(part: PartDef, done: CardBattleResult) {
    this.cleanup();
    this.battleRunId += 1;
    this.cancelled = false;
    this.finished = false;
    this.busy = false;
    this.lastDestroyedPartIds = [];
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
    this.clearFlowWatchdog();
    const done = this.activeDone;
    const destroyedPartIds = [...this.lastDestroyedPartIds];
    this.activeDone = null;
    this.cleanup();
    this.scene.events.emit("enemy-energy-hide");
    if (done) done(success, { destroyedPartIds });
  }

  private cleanup() {
    this.clearFlowWatchdog();
    this.killTrackedEffectTweens();
    this.speechBubble?.destroy();
    this.speechBubble = null;
    this.enemyPartPanel?.destroy();
    this.enemyPartPanel = null;
    this.enemyPartRows = {};
    this.lastSpeechAt = 0;
    this.overlay?.destroy();
    this.overlay = null;
    this.handObjs = [];
    this.deck = [];
    this.hand = [];
    this.discard = [];
    this.selectedCards = [];
    this.dragStart = null;
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
      reflectNextAttack: null,
      weakenNextAttack: null,
      autoParryNextAttack: null,
      dodgeFirstAttackOfNextEnemyTurn: null,
      dodgeNextAttack: null,
      parts: [],
      partRuntime: this.createPartRuntimeState(),
    };
    this.enemy = {
      hp: enemyHpMax,
      hpMax: enemyHpMax,
      block: 0,
      burn: null,
      weaken: null,
      reflectNextAttack: null,
      weakenNextAttack: null,
      autoParryNextAttack: null,
      dodgeFirstAttackOfNextEnemyTurn: null,
      dodgeNextAttack: null,
      parts: this.createEnemyParts("default"),
      partRuntime: this.createPartRuntimeState(),
    };
    this.energy = ENERGY_MAX;
    this.turn = 1;
    this.activePartId = part.id;
    this.deck = shuffle(STARTER_DECK.map((cardId) => this.createTarotCard(cardId)));
    this.hand = [];
    this.discard = [];
    this.selectedCards = [];
    this.dragStart = null;
    this.intentPattern = buildIntentPattern(part.difficulty);
    this.intentIdx = 0;
    this.enemyStunned = false;

    const stripW = width * 0.96;

    // -- Top: enemy strip (sits just below the progression pills) --
    const enemyStripY = u(104);
    const enemyStripBg = this.scene.add
      .rectangle(width / 2, enemyStripY, stripW * 0.86, u(68), 0x000000, 0)
      .setStrokeStyle(u(1.2), 0xd4a656, 0.7);
    const enemyName = this.scene.add
      .text(width / 2 - stripW / 2 + u(14), enemyStripY - u(22), `적 · ${part.label}`, {
        fontFamily: "serif",
        fontSize: px(14),
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    enemyName
      .setPosition(width / 2 - stripW * 0.36, enemyStripY - u(20))
      .setText(`적 파츠 · ${part.label}`);
    this.enemyIntentText = this.scene.add
      .text(width / 2 + stripW / 2 - u(14), enemyStripY - u(22), "", {
        fontFamily: "serif",
        fontSize: px(12),
        color: "#ffd572",
        fontStyle: "bold",
      })
      .setOrigin(1, 0.5);
    this.enemyIntentText.setPosition(width / 2 + stripW * 0.36, enemyStripY - u(20));

    const enemyHpY = enemyStripY + u(10);
    this.enemyHpBarMaxWidth = stripW * 0.72;
    this.enemyHpBarLeft = width / 2 - this.enemyHpBarMaxWidth / 2;
    const enemyHpBg = this.scene.add
      .rectangle(width / 2, enemyHpY, this.enemyHpBarMaxWidth, u(24), 0x2a1a34, 0.92)
      .setStrokeStyle(u(1.5), 0xd4a656, 0.85);
    this.enemyHpFill = this.scene.add
      .rectangle(this.enemyHpBarLeft, enemyHpY, this.enemyHpBarMaxWidth, u(20), 0xff5e7a, 0.95)
      .setOrigin(0, 0.5);
    this.enemyHpText = this.scene.add
      .text(width / 2, enemyHpY, `${this.enemy.hp} / ${this.enemy.hpMax}`, {
        fontFamily: "serif",
        fontSize: px(12),
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
      .text(width / 2, enemyStripY + u(36), "", {
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
    this.scene.events.emit("enemy-energy-show", {
      label: part.label,
      hp: this.enemy.hp,
      hpMax: this.enemy.hpMax,
      intent: this.getEnemyIntentLabel(),
    });
    this.drawEnemyPartPanel(width, height);

    // -- Bottom: player command panel (status, hand and actions) --
    const playerStripY = height - u(278);
    const playerPanelW = stripW * 0.98;
    const playerStripBg = this.scene.add
      .rectangle(width / 2, playerStripY, playerPanelW, u(86), 0x08080d, 0.6)
      .setStrokeStyle(u(1.4), 0xd4a656, 0.86);
    const playerStripInner = this.scene.add
      .rectangle(width / 2, playerStripY, playerPanelW - u(10), u(74), 0x11131a, 0.32)
      .setStrokeStyle(u(0.8), 0xf3d48a, 0.28);
    const playerName = this.scene.add
      .text(width / 2 - playerPanelW / 2 + u(18), playerStripY - u(30), "당신", {
        fontFamily: "serif",
        fontSize: px(13),
        color: "#f3e6c9",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    this.energyText = this.scene.add
      .text(width / 2, playerStripY - u(31), "", {
        fontFamily: "serif",
        fontSize: px(15),
        color: "#ffd572",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.turnText = this.scene.add
      .text(width / 2 + playerPanelW / 2 - u(18), playerStripY - u(30), "", {
        fontFamily: "serif",
        fontSize: px(13),
        color: "#f3d48a",
        fontStyle: "bold",
      })
      .setOrigin(1, 0.5);

    const playerHpY = playerStripY + u(2);
    this.playerHpBarMaxWidth = playerPanelW * 0.55;
    this.playerEnergyBarMaxWidth = playerPanelW * 0.18;
    this.playerHpBarLeft = width / 2 - playerPanelW / 2 + u(22);
    this.playerEnergyBarLeft = this.playerHpBarLeft + this.playerHpBarMaxWidth + u(8);
    const playerHpBg = this.scene.add
      .rectangle(
        this.playerHpBarLeft + this.playerHpBarMaxWidth / 2,
        playerHpY,
        this.playerHpBarMaxWidth,
        u(20),
        0x1b141f,
        0.92
      )
      .setStrokeStyle(u(1), 0xf3d48a, 0.7);
    this.playerHpFill = this.scene.add
      .rectangle(this.playerHpBarLeft, playerHpY, this.playerHpBarMaxWidth, u(14), 0x43e5c8, 0.96)
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
    const playerEnergyBg = this.scene.add
      .rectangle(
        this.playerEnergyBarLeft + this.playerEnergyBarMaxWidth / 2,
        playerHpY,
        this.playerEnergyBarMaxWidth,
        u(20),
        0x171529,
        0.92
      )
      .setStrokeStyle(u(1), 0x9ad0ff, 0.75);
    this.playerEnergyFill = this.scene.add
      .rectangle(this.playerEnergyBarLeft, playerHpY, this.playerEnergyBarMaxWidth, u(14), 0x58a8ff, 0.96)
      .setOrigin(0, 0.5);
    this.playerEnergyText = this.scene.add
      .text(
        this.playerEnergyBarLeft + this.playerEnergyBarMaxWidth / 2,
        playerHpY,
        `${this.energy} / ${ENERGY_MAX}`,
        {
          fontFamily: "serif",
          fontSize: px(10),
          color: "#ffffff",
          fontStyle: "bold",
        }
      )
      .setOrigin(0.5);
    this.playerBlockText = this.scene.add
      .text(this.playerEnergyBarLeft + this.playerEnergyBarMaxWidth + u(8), playerHpY, "", {
        fontFamily: "serif",
        fontSize: px(10),
        color: "#9ad0ff",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    this.playerStatusText = this.scene.add
      .text(width / 2 - playerPanelW / 2 + u(22), playerStripY + u(28), "", {
        fontFamily: "serif",
        fontSize: px(9),
        color: "#ffaa66",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    this.deckCountText = this.scene.add
      .text(width / 2 + playerPanelW / 2 - u(18), playerStripY + u(28), "", {
        fontFamily: "serif",
        fontSize: px(9),
        color: "#d4a656",
        fontStyle: "bold",
      })
      .setOrigin(1, 0.5);

    this.overlay.add([
      playerStripBg,
      playerStripInner,
      playerName,
      this.energyText,
      this.turnText,
      playerHpBg,
      this.playerHpFill,
      this.playerHpText,
      playerEnergyBg,
      this.playerEnergyFill,
      this.playerEnergyText,
      this.playerBlockText,
      this.playerStatusText,
      this.deckCountText,
    ]);

    // Floating log readout above the player strip
    this.logText = this.scene.add
      .text(width / 2, playerStripY - u(64), "", {
        fontFamily: "serif",
        fontSize: px(12),
        color: "#f3e6c9",
        fontStyle: "bold",
        backgroundColor: "rgba(20, 9, 26, 0.5)",
        padding: { x: 10, y: 4 },
      })
      .setOrigin(0.5);
    this.overlay.add(this.logText);

    // Hand area sits in the slot freed by the hidden bottom panel
    this.handAreaY = height - u(148);
    this.handAreaWidth = stripW * 0.96;

    // Action buttons at the very bottom corners
    const btnY = height - u(31);
    this.endTurnBg = this.makeButton(
      width - u(106),
      btnY,
      u(170),
      u(42),
      "턴 종료",
      () => this.endPlayerTurn()
    );
    this.useCardsBg = this.makeButton(
      width / 2,
      btnY,
      u(205),
      u(42),
      "카드 사용",
      () => this.playSelectedCards()
    );
    this.makeButton(u(106), btnY, u(170), u(42), "포기", () => {
      this.cancelled = true;
      this.finish(false);
    });

    // Start of battle
    this.drawToFull(START_HAND);
    this.refreshAll();
  }

  // -- Game flow --

  private startPlayerTurn() {
    if (this.finished) return;
    if (this.player.reflectNextAttack) {
      this.player.reflectNextAttack = null;
      this.flashLog("반격 대기 효과가 사라졌습니다");
    }
    this.tickWeakenNextAttackLifetime();
    this.tickDefensiveReactionLifetimes();
    this.prepareEnemyPartsForPlayerTurn();
    this.player.block = 0;
    this.energy = ENERGY_MAX;
    this.selectedCards = [];
    this.drawToFull(TARGET_HAND);
    this.refreshAll();
  }

  private endPlayerTurn() {
    if (this.busy || this.finished) return;
    this.removeTemporaryCardsFromHand(true);
    this.busy = true;
    this.refreshButtons();
    this.armFlowWatchdog("enemy-turn", 3200, () => {
      this.busy = false;
      this.startPlayerTurn();
    });
    this.runEnemyTurn();
  }

  private runEnemyTurn() {
    if (this.finished) return;
    const runId = this.battleRunId;
    this.applyEnemyPartTurnStartPassives();
    this.refreshAll();
    // Burn ticks on enemy at start of enemy turn
    if (this.enemy.burn) {
      const dmg = this.enemy.burn.dmg;
      this.applyDirectDamage(this.enemy, dmg);
      this.enemy.burn.turns -= 1;
      if (this.enemy.burn.turns <= 0) this.enemy.burn = null;
      this.flashLog(`화상 ${dmg}`);
      this.refreshAll();
      if (this.enemy.hp <= 0) {
        this.scene.time.delayedCall(420, () => {
          if (this.isCurrentRun(runId)) this.finish(true);
        });
        return;
      }
    }

    this.scene.time.delayedCall(280, () => {
      if (this.isCurrentRun(runId)) this.safeExecuteIntent(runId);
    });
  }

  private safeExecuteIntent(runId = this.battleRunId) {
    if (!this.isCurrentRun(runId)) return;
    try {
      this.executeIntent(runId);
    } catch (err) {
      console.error("[BATTLE] executeIntent threw", err);
      if (this.isCurrentRun(runId)) {
        this.clearFlowWatchdog();
        this.busy = false;
        this.startPlayerTurn();
      }
    }
  }

  private executeIntent(runId = this.battleRunId) {
    if (!this.isCurrentRun(runId)) return;

    if (this.enemyStunned) {
      this.enemyStunned = false;
      this.flashLog("적 행동 무력화");
      this.scene.time.delayedCall(360, () => {
        if (this.isCurrentRun(runId)) this.safeAdvanceIntentAndContinue(runId);
      });
      return;
    }

    const intent = this.intentPattern[this.intentIdx % this.intentPattern.length];
    if (intent.kind === "attack") {
      const outcome = this.resolveEnemyAttackIntent(intent.amount);
      this.flashLog(outcome.log);
      if (this.enemy.hp <= 0) {
        this.refreshAll();
        this.scene.time.delayedCall(540, () => {
          if (this.isCurrentRun(runId)) this.finish(true);
        });
        return;
      }
    } else if (intent.kind === "block") {
      this.enemy.block += intent.amount;
      this.playGuardEffect("enemy");
      this.flashLog(`적 보호막 +${intent.amount}`);
    }
    this.refreshAll();

    if (this.player.hp <= 0) {
      this.scene.time.delayedCall(540, () => {
        if (this.isCurrentRun(runId)) this.finish(false);
      });
      return;
    }

    this.scene.time.delayedCall(360, () => {
      if (this.isCurrentRun(runId)) this.safeAdvanceIntentAndContinue(runId);
    });
  }

  private resolveEnemyAttackIntent(rawAmount: number) {
    const { amount: poweredAmount, labels: powerLabels } = this.applyEnemyOutgoingDamagePassives(rawAmount);
    const prevention = this.resolveEnemyAttackPrevention(poweredAmount);
    if (prevention.prevented) {
      return {
        incoming: 0,
        reflected: prevention.counterDamage,
        log: powerLabels.length > 0 ? `${prevention.log} (${powerLabels.join(" · ")})` : prevention.log,
      };
    }

    const parts: string[] = [...powerLabels];
    let incoming = poweredAmount;

    if (this.enemy.weaken) {
      incoming = Math.max(0, incoming - this.enemy.weaken.amount);
      parts.push(`약화 -${this.enemy.weaken.amount}`);
    }
    if (this.enemy.weakenNextAttack) {
      const ratio = this.enemy.weakenNextAttack.ratio;
      incoming = Math.max(0, Math.round(incoming * (1 - ratio)));
      this.enemy.weakenNextAttack = null;
      parts.push(`무장해제 ${Math.round(ratio * 100)}%`);
      this.playWeakenBreakEffect();
    }

    this.applyAttack(this.player, incoming);
    this.playAttackEffect("player", incoming);

    let reflected = 0;
    if (this.player.reflectNextAttack) {
      const ratio = this.player.reflectNextAttack.ratio;
      this.player.reflectNextAttack = null;
      reflected = Math.max(0, Math.round(incoming * ratio));
      if (reflected > 0) {
        this.applyAttack(this.enemy, reflected);
        this.playReflectEffect(reflected);
      }
      parts.push(`반격 ${reflected}`);
    }

    const suffix = parts.length > 0 ? ` (${parts.join(" · ")})` : "";
    return {
      incoming,
      reflected,
      log: `적 공격 ${rawAmount} → ${incoming}${suffix}`,
    };
  }

  private resolveEnemyAttackPrevention(rawAmount: number) {
    if (this.player.autoParryNextAttack) {
      const { counterDamage } = this.player.autoParryNextAttack;
      this.player.autoParryNextAttack = null;
      const dealt = this.applyAttack(this.enemy, counterDamage);
      this.playAutoParryEffect(dealt);
      return {
        prevented: true,
        counterDamage: dealt,
        log: `자동 패링! 적 공격 ${rawAmount} 무효 · 반격 ${dealt}`,
      };
    }

    if (this.player.dodgeNextAttack) {
      this.player.dodgeNextAttack = null;
      this.playDodgeTriggerEffect("완전회피");
      return {
        prevented: true,
        counterDamage: 0,
        log: `완전회피! 적 공격 ${rawAmount} 무효`,
      };
    }

    if (this.player.dodgeFirstAttackOfNextEnemyTurn) {
      this.player.dodgeFirstAttackOfNextEnemyTurn = null;
      this.playDodgeTriggerEffect("회피");
      return {
        prevented: true,
        counterDamage: 0,
        log: `신속회피! 적 공격 ${rawAmount} 무효`,
      };
    }

    return {
      prevented: false,
      counterDamage: 0,
      log: "",
    };
  }

  private safeAdvanceIntentAndContinue(runId = this.battleRunId) {
    if (!this.isCurrentRun(runId)) return;
    try {
      this.advanceIntentAndContinue(runId);
    } catch (err) {
      console.error("[BATTLE] advanceIntentAndContinue threw", err);
      if (this.isCurrentRun(runId)) {
        this.clearFlowWatchdog();
        this.busy = false;
        this.startPlayerTurn();
      }
    }
  }

  private advanceIntentAndContinue(runId = this.battleRunId) {
    if (!this.isCurrentRun(runId)) return;
    this.clearFlowWatchdog();
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
      this.scene.time.delayedCall(620, () => {
        if (this.isCurrentRun(runId)) this.finish(false);
      });
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
    if (card.isTemporary && this.selectedCards.length > 0) {
      this.selectedCards = [card];
      this.flashLog(`${def.roleLabel} 임시 카드 선택`);
      this.refreshAll();
      return;
    }
    if (this.selectedCards.some((c) => c.isTemporary)) {
      this.selectedCards = [card];
      this.flashLog(`${def.roleLabel} 카드 선택`);
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
    const runId = this.battleRunId;
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
    this.discard.push(...comboCards.filter((card) => !card.isTemporary));
    let result: { didAttack: boolean; damage: number };
    try {
      result = this.applyCardEffects(comboCards);
    } catch (err) {
      console.error("[BATTLE] applyCardEffects threw", err);
      this.busy = false;
      this.refreshAll();
      return;
    }
    this.refreshAll();
    if (this.enemy.hp <= 0) {
      this.busy = true;
      this.finish(true);
      return;
    }
    if (result.didAttack) this.maybeShowEnemySpeech();

    const settle = () => this.safeSettleAfterCardUse();
    if (result.didAttack) {
      this.busy = true;
      this.refreshButtons();
      this.armFlowWatchdog("dice-resolution", 3200, () => this.safeSettleAfterCardUse());
      try {
        this.rollDiceAfterHit(result.damage, settle, runId);
      } catch (err) {
        console.error("[BATTLE] rollDiceAfterHit threw", err);
        settle();
      }
    } else {
      settle();
    }
  }

  private applyCardEffects(cards: TarotCardState[]) {
    const card = cards[0];
    const def = CARDS[card.cardId];
    if (card.isTemporary) {
      return this.applyTemporaryCardEffects(card, def);
    }
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
    let resolvedAttackDamage = duel.damage;
    const damageContext = this.createPlayerDamageContext();

    switch (role) {
      case "attack":
        attemptedAttack = true;
        if (duel.didWin) {
          const result = this.applyPlayerDamageToEnemy(duel.damage, damageContext);
          didAttack = !result.prevented;
          resolvedAttackDamage = result.appliedAmount;
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
          const result = this.applyPlayerDamageToEnemy(counter, damageContext);
          didAttack = !result.prevented;
          resolvedAttackDamage = result.appliedAmount;
        }
        break;
      }
    }
    if (didGuard) this.playGuardEffect("player");
    if (duel.didWin || !attemptedAttack) this.flashLog(`${def.roleLabel}${comboBonusText} 사용`);
    return { didAttack, damage: Math.max(1, resolvedAttackDamage) };
  }

  private applyTemporaryCardEffects(card: TarotCardState, def: CardDef) {
    let didAttack = false;
    let didGuard = false;
    let totalDamage = 0;
    const logParts: string[] = [];
    const damageContext = this.createPlayerDamageContext();

    for (const effect of def.effects) {
      switch (effect.kind) {
        case "attack": {
          const result = this.applyPlayerDamageToEnemy(effect.amount, damageContext);
          const dealt = result.dealt;
          didAttack = didAttack || !result.prevented;
          totalDamage += result.appliedAmount;
          logParts.push(`피해 ${dealt}`);
          break;
        }
        case "partBonusAttack": {
          if (effect.partIds.includes(this.activePartId)) {
            const result = this.applyPlayerDamageToEnemy(effect.amount, damageContext);
            const dealt = result.dealt;
            didAttack = didAttack || !result.prevented;
            totalDamage += result.appliedAmount;
            logParts.push(`${effect.label} ${dealt}`);
          }
          break;
        }
        case "partDamage": {
          const result = this.applyPlayerPartDamage(effect.partId, effect.amount, damageContext);
          didAttack = didAttack || !result.prevented;
          logParts.push(`${result.partName} ${result.partDamage}`);
          if (result.destroyed) logParts.push(`${result.partName} 파괴`);
          break;
        }
        case "drain": {
          const result = this.applyPlayerDamageToEnemy(effect.amount, damageContext);
          const dealt = result.dealt;
          const before = this.player.hp;
          this.player.hp = Math.min(this.player.hpMax, this.player.hp + dealt);
          didAttack = didAttack || !result.prevented;
          totalDamage += result.appliedAmount;
          logParts.push(`흡혈 ${dealt}`);
          if (this.player.hp > before) logParts.push(`회복 +${this.player.hp - before}`);
          break;
        }
        case "block":
          this.player.block += effect.amount;
          didGuard = true;
          logParts.push(`보호막 +${effect.amount}`);
          break;
        case "heal": {
          const before = this.player.hp;
          this.player.hp = Math.min(this.player.hpMax, this.player.hp + effect.amount);
          logParts.push(`회복 +${this.player.hp - before}`);
          break;
        }
        case "energy":
          this.energy = Math.min(ENERGY_MAX, this.energy + effect.amount);
          logParts.push(`기력 +${effect.amount}`);
          break;
        case "reflectNextAttack":
          this.player.reflectNextAttack = { ratio: effect.ratio };
          this.playCounterReadyEffect();
          logParts.push(`반격 대기 ${Math.round(effect.ratio * 100)}%`);
          break;
        case "weakenNextAttack":
          this.enemy.weakenNextAttack = {
            ratio: effect.ratio,
            turnsLeft: effect.maxTurns,
          };
          this.playDisarmReadyEffect();
          logParts.push(`다음 공격 약화 ${Math.round(effect.ratio * 100)}%`);
          break;
        case "autoParryNextAttack":
          this.player.autoParryNextAttack = {
            counterDamage: effect.counterDamage,
            turnsLeft: effect.maxTurns,
          };
          this.playCounterStanceReadyEffect();
          logParts.push(`자동 패링 대기`);
          break;
        case "dodgeFirstAttackOfNextEnemyTurn":
          this.player.dodgeFirstAttackOfNextEnemyTurn = {
            turnsLeft: effect.maxTurns,
          };
          this.playDodgeReadyEffect("신속회피");
          logParts.push("신속회피 대기");
          break;
        case "dodgeNextAttack":
          this.player.dodgeNextAttack = {
            turnsLeft: effect.maxTurns,
          };
          this.playDodgeReadyEffect("완전회피");
          logParts.push("완전회피 대기");
          break;
        case "parry":
          break;
      }
    }

    if (didGuard) this.playGuardEffect("player");
    this.flashLog(`${def.roleLabel} 사용 · ${logParts.join(" · ")}`);
    return { didAttack, damage: Math.max(1, totalDamage || card.damage) };
  }

  private settleAfterCardUse() {
    if (this.finished) return;
    this.clearFlowWatchdog();
    this.busy = false;
    if (this.enemy.hp <= 0) {
      this.busy = true;
      this.finish(true);
      return;
    }
    if (this.energy <= 0) {
      this.flashLog("기력을 모두 사용해 턴 종료");
      const runId = this.battleRunId;
      this.scene.time.delayedCall(220, () => {
        if (this.isCurrentRun(runId)) this.endPlayerTurn();
      });
      return;
    }
    this.refreshAll();
  }

  private safeSettleAfterCardUse() {
    try {
      this.settleAfterCardUse();
    } catch (err) {
      console.error("[BATTLE] settleAfterCardUse threw", err);
      if (!this.finished) {
        this.busy = false;
        this.selectedCards = [];
        this.refreshAll();
      }
    }
  }

  private armFlowWatchdog(reason: string, delay: number, recover: () => void) {
    this.clearFlowWatchdog();
    const runId = this.battleRunId;
    this.flowWatchdog = this.scene.time.delayedCall(delay, () => {
      this.flowWatchdog = null;
      if (!this.isCurrentRun(runId)) return;
      console.warn(`[BATTLE] ${reason} watchdog recovered stalled battle`);
      try {
        recover();
      } catch (err) {
        console.error(`[BATTLE] ${reason} watchdog recovery threw`, err);
        if (!this.finished) {
          this.busy = false;
          this.selectedCards = [];
          this.drawToFull(TARGET_HAND);
          this.refreshAll();
        }
      }
    });
  }

  private clearFlowWatchdog() {
    this.flowWatchdog?.remove(false);
    this.flowWatchdog = null;
  }

  private isCurrentRun(runId: number) {
    return runId === this.battleRunId && !this.finished;
  }

  private trackEffect<T extends Phaser.GameObjects.GameObject>(obj: T) {
    this.effectObjects.push(obj);
    return obj;
  }

  private killTweensForObjectTree(obj: Phaser.GameObjects.GameObject | null) {
    if (!obj) return;
    this.scene.tweens.killTweensOf(obj);
    if (obj instanceof Phaser.GameObjects.Container) {
      this.scene.tweens.killTweensOf(obj.list);
      for (const child of obj.list) {
        this.killTweensForObjectTree(child);
      }
    }
  }

  private killTrackedEffectTweens() {
    this.killTweensForObjectTree(this.speechBubble);
    for (const slot of this.handObjs) {
      this.killTweensForObjectTree(slot.container);
    }
    for (const obj of this.effectObjects) {
      this.killTweensForObjectTree(obj);
    }
    this.effectObjects = [];
    this.killTweensForObjectTree(this.overlay);
  }

  private sumComboEffect(cards: TarotCardState[]) {
    return cards.reduce((sum, card) => {
      const effect = CARDS[card.cardId].effects[0];
      return sum + ("amount" in effect ? effect.amount : 0);
    }, 0);
  }

  private highlightMergeTarget(source: TarotCardState, pointerX?: number, pointerY?: number) {
    if (this.busy || this.finished) return;
    this.handObjs.forEach((slot) => {
      if (slot.card === source || !this.canFuseCards(source, slot.card)) {
        slot.dropGlow.setAlpha(0);
        return;
      }
      if (pointerX === undefined || pointerY === undefined) {
        slot.dropGlow.setAlpha(0.75);
        return;
      }
      slot.dropGlow.setAlpha(this.isPointInsideSlot(pointerX, pointerY, slot) ? 0.95 : 0.25);
    });
  }

  private clearMergeHighlights() {
    this.handObjs.forEach((slot) => slot.dropGlow.setAlpha(0));
  }

  private canFuseCards(a: TarotCardState, b: TarotCardState) {
    if (a.cannotFuse || b.cannotFuse || a.isTemporary || b.isTemporary) return false;
    return findFusionRecipe(CARDS[a.cardId].role, CARDS[b.cardId].role) !== null;
  }

  private tryMergeDraggedCard(source: TarotCardState, pointerX: number, pointerY: number) {
    const targetSlot = this.handObjs.find(
      (slot) =>
        slot.card !== source &&
        this.isPointInsideSlot(pointerX, pointerY, slot)
    );
    if (!targetSlot) return false;

    const target = targetSlot.card;
    if (source.cannotFuse || target.cannotFuse || source.isTemporary || target.isTemporary) {
      this.playBlockedMergeEffect(targetSlot);
      this.flashLog("임시 카드는 재합성할 수 없습니다");
      return false;
    }

    const sourceDef = CARDS[source.cardId];
    const targetDef = CARDS[target.cardId];
    const recipe = findFusionRecipe(sourceDef.role, targetDef.role);
    if (!recipe) {
      this.playBlockedMergeEffect(targetSlot);
      this.flashLog("아직 발견되지 않은 조합입니다");
      return false;
    }

    const fusedCard = this.createFusionCard(recipe, source, target);
    const targetIndex = this.hand.indexOf(target);
    this.hand = this.hand.filter((card) => card !== source && card !== target);
    this.hand.splice(Math.max(0, targetIndex), 0, fusedCard);
    this.selectedCards = this.selectedCards.filter((card) => card !== source && card !== target);
    this.playMergeEffect(targetSlot);
    this.flashLog(`${recipe.result.name} 임시 카드 생성!`);
    this.refreshAll();
    return true;
  }

  private isPointInsideSlot(x: number, y: number, slot: HandCard) {
    return (
      x >= slot.container.x - slot.cardW / 2 &&
      x <= slot.container.x + slot.cardW / 2 &&
      y >= slot.container.y - slot.cardH / 2 &&
      y <= slot.container.y + slot.cardH / 2
    );
  }

  private playMergeEffect(slot: HandCard) {
    const ring = this.trackEffect(
      this.scene.add
        .rectangle(slot.container.x, slot.container.y, slot.cardW + u(22), slot.cardH + u(22), 0xffffff, 0)
        .setStrokeStyle(u(5), 0x82ffe6, 0.95)
        .setDepth(820)
    );
    this.overlay?.add(ring);
    this.scene.tweens.add({
      targets: ring,
      scaleX: 1.25,
      scaleY: 1.25,
      alpha: 0,
      duration: 420,
      ease: "Quad.easeOut",
      onComplete: () => {
        if (ring.scene) ring.destroy();
      },
    });
  }

  private playBlockedMergeEffect(slot: HandCard) {
    const ring = this.trackEffect(
      this.scene.add
        .rectangle(slot.container.x, slot.container.y, slot.cardW + u(16), slot.cardH + u(16), 0xffffff, 0)
        .setStrokeStyle(u(4), 0xff4d5f, 0.95)
        .setDepth(821)
    );
    this.overlay?.add(ring);
    this.scene.tweens.add({
      targets: ring,
      scaleX: 1.08,
      scaleY: 1.08,
      alpha: 0,
      duration: 260,
      ease: "Quad.easeOut",
      onComplete: () => {
        if (ring.scene) ring.destroy();
      },
    });
  }

  private applyAttack(target: SideState, raw: number) {
    const beforeHp = target.hp;
    let remaining = raw;
    if (target.block > 0) {
      const absorbed = Math.min(target.block, remaining);
      target.block -= absorbed;
      remaining -= absorbed;
    }
    if (remaining > 0) {
      target.hp = Math.max(0, target.hp - remaining);
    }
    return Math.max(0, beforeHp - target.hp);
  }

  private applyDirectDamage(target: SideState, amount: number) {
    target.hp = Math.max(0, target.hp - amount);
  }

  private createPlayerDamageContext(): PlayerDamageContext {
    return { shoesChecked: false, prevented: false };
  }

  private applyPlayerDamageToEnemy(raw: number, context?: PlayerDamageContext) {
    const modifier = this.applyActivePlayerDamageModifiers(raw, context);
    if (modifier.prevented) return { dealt: 0, appliedAmount: 0, prevented: true };
    const dealt = this.applyAttack(this.enemy, modifier.amount);
    return { dealt, appliedAmount: modifier.amount, prevented: false };
  }

  private applyPlayerPartDamage(partId: PartId, raw: number, context?: PlayerDamageContext) {
    const modifier = this.applyActivePlayerDamageModifiers(raw, context);
    const target = this.getEnemyPart(partId);
    const partName = target?.displayName ?? partId;
    if (modifier.prevented) {
      return {
        partName,
        partDamage: 0,
        overflow: 0,
        dealt: 0,
        appliedAmount: 0,
        destroyed: false,
        prevented: true,
      };
    }

    if (!target || target.destroyed) {
      const dealt = this.applyAttack(this.enemy, modifier.amount);
      return {
        partName,
        partDamage: 0,
        overflow: modifier.amount,
        dealt,
        appliedAmount: modifier.amount,
        destroyed: false,
        prevented: false,
      };
    }

    const before = target.hp;
    const partDamage = Math.min(before, modifier.amount);
    target.hp = Math.max(0, target.hp - modifier.amount);
    const overflow = Math.max(0, modifier.amount - before);
    let destroyed = false;
    if (target.hp <= 0) {
      target.hp = 0;
      destroyed = this.destroyEnemyPart(target);
    } else {
      this.playPartDamageEffect(target.id);
    }
    const overflowDealt = overflow > 0 ? this.applyAttack(this.enemy, overflow) : 0;
    return {
      partName,
      partDamage,
      overflow,
      dealt: partDamage + overflowDealt,
      appliedAmount: modifier.amount,
      destroyed,
      prevented: false,
    };
  }

  private applyActivePlayerDamageModifiers(raw: number, context?: PlayerDamageContext) {
    if (context?.prevented) return { amount: 0, prevented: true };
    const shoes = this.getActiveEnemyPartByAbility("autoParryFirstHitPerTurn");
    const shouldCheckShoes = !context || !context.shoesChecked;
    if (shouldCheckShoes && shoes && this.enemy.partRuntime.shoesNegateFirstHit) {
      this.enemy.partRuntime.shoesNegateFirstHit = false;
      if (context) {
        context.shoesChecked = true;
        context.prevented = true;
      }
      this.highlightEnemyPart(shoes.id);
      this.flashLog(`${shoes.displayName} 효과! 첫 공격 무효`);
      return { amount: 0, prevented: true };
    }
    if (context && shouldCheckShoes) context.shoesChecked = true;

    let amount = Math.max(0, raw);
    const cape = this.getActiveEnemyPartByAbility("damageReductionPercent");
    if (cape && cape.ability.kind === "damageReductionPercent") {
      amount = Math.max(0, Math.round(amount * (1 - cape.ability.value)));
      this.highlightEnemyPart(cape.id);
    }
    return { amount, prevented: false };
  }

  private applyEnemyOutgoingDamagePassives(raw: number) {
    let amount = Math.max(0, raw);
    const labels: string[] = [];
    const underwear = this.getActiveEnemyPartByAbility("berserkBelowHpRatio");
    if (
      underwear &&
      underwear.ability.kind === "berserkBelowHpRatio" &&
      this.enemy.hp / Math.max(1, this.enemy.hpMax) <= underwear.ability.threshold
    ) {
      amount = Math.max(0, Math.round(amount * underwear.ability.value));
      labels.push("광폭화");
      this.highlightEnemyPart(underwear.id);
    }

    const skirt = this.getActiveEnemyPartByAbility("periodicStrongAttack");
    if (skirt && skirt.ability.kind === "periodicStrongAttack" && this.enemy.partRuntime.strongAttackNext) {
      amount = Math.max(0, Math.round(amount * skirt.ability.value));
      this.enemy.partRuntime.strongAttackNext = false;
      labels.push("강공");
      this.highlightEnemyPart(skirt.id);
    }

    return { amount, labels };
  }

  private applyEnemyPartTurnStartPassives() {
    for (const part of this.enemy.parts) {
      if (part.destroyed) continue;
      switch (part.ability.kind) {
        case "shieldOnTurnStart":
          this.enemy.block += part.ability.value;
          this.highlightEnemyPart(part.id);
          break;
        case "healOnTurnStart":
          this.enemy.hp = Math.min(this.enemy.hpMax, this.enemy.hp + part.ability.value);
          this.highlightEnemyPart(part.id);
          break;
        case "periodicStrongAttack":
          this.enemy.partRuntime.skirtTurnCounter += 1;
          if (this.enemy.partRuntime.skirtTurnCounter >= part.ability.intervalTurns) {
            this.enemy.partRuntime.skirtTurnCounter = 0;
            this.enemy.partRuntime.strongAttackNext = true;
            this.highlightEnemyPart(part.id);
          }
          break;
        case "damageReductionPercent":
        case "autoParryFirstHitPerTurn":
        case "berserkBelowHpRatio":
          break;
      }
    }
  }

  private prepareEnemyPartsForPlayerTurn() {
    const shoes = this.getActiveEnemyPartByAbility("autoParryFirstHitPerTurn");
    this.enemy.partRuntime.shoesNegateFirstHit = shoes !== null;
    if (shoes) this.highlightEnemyPart(shoes.id);
  }

  private getActiveEnemyPartByAbility(kind: PartAbility["kind"]) {
    return this.enemy.parts.find((part) => !part.destroyed && part.ability.kind === kind) ?? null;
  }

  private getEnemyPart(partId: PartId) {
    return this.enemy.parts.find((part) => part.id === partId) ?? null;
  }

  private destroyEnemyPart(part: EnemyRuntimePart) {
    if (part.destroyed) return false;
    part.destroyed = true;
    part.hp = 0;
    if (!this.lastDestroyedPartIds.includes(part.id)) this.lastDestroyedPartIds.push(part.id);
    if (part.id === "shoes") this.enemy.partRuntime.shoesNegateFirstHit = false;
    if (part.id === "skirt") this.enemy.partRuntime.strongAttackNext = false;
    this.playPartDestroyEffect(part.id);
    this.refreshEnemyPartPanel();
    this.refreshIntent();
    return true;
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

  private createFusionCard(
    recipe: CardFusionRecipe,
    source: TarotCardState,
    target: TarotCardState
  ): TarotCardState {
    const attack = Math.max(1, Math.round((source.attack + target.attack) * 0.78));
    const defense = Math.max(1, Math.round((source.defense + target.defense) * 0.78));
    const psyche = Math.max(1, Math.round((source.psyche + target.psyche) * 0.78));
    const level = Math.max(source.level, target.level);
    const power = calculateCardPower({ level, attack, defense, psyche });
    const damage = Math.max(1, this.sumFusionDamage(recipe.result.effects));
    const tempDef: CardDef = {
      id: recipe.result.id,
      characterName: "합성",
      role: recipe.result.role,
      roleLabel: recipe.result.name,
      name: recipe.result.name,
      cost: recipe.result.cost,
      description: recipe.result.description,
      effects: recipe.result.effects,
      color: recipe.result.color,
      isReversed: false,
      level,
      attack,
      defense,
      psyche,
      damage,
      risk: 1,
    };
    CARDS[recipe.result.id] = tempDef;
    return {
      uid: this.nextCardUid++,
      cardId: recipe.result.id,
      isReversed: false,
      level,
      attack,
      defense,
      psyche,
      power,
      damage,
      risk: 1,
      isTemporary: true,
      fusionRecipeId: recipe.id,
      cannotFuse: true,
    };
  }

  private sumFusionDamage(effects: FusionEffect[]) {
    return effects.reduce((sum, effect) => {
      if (
        effect.kind === "attack" ||
        effect.kind === "drain" ||
        effect.kind === "partBonusAttack" ||
        effect.kind === "partDamage"
      ) {
        return sum + effect.amount;
      }
      return sum;
    }, 0);
  }

  private removeTemporaryCardsFromHand(showFeedback = false) {
    const before = this.hand.length;
    this.hand = this.hand.filter((card) => !card.isTemporary);
    this.selectedCards = this.selectedCards.filter((card) => !card.isTemporary);
    const removed = before - this.hand.length;
    if (removed > 0 && showFeedback) {
      this.flashLog("사용하지 않은 임시 카드는 사라졌습니다");
      this.refreshAll();
    }
    return removed;
  }

  private tickWeakenNextAttackLifetime() {
    if (!this.enemy?.weakenNextAttack) return;
    this.enemy.weakenNextAttack.turnsLeft -= 1;
    if (this.enemy.weakenNextAttack.turnsLeft <= 0) {
      this.enemy.weakenNextAttack = null;
      this.flashLog("무장해제 약화가 사라졌습니다");
    }
  }

  private tickDefensiveReactionLifetimes() {
    const expired: string[] = [];
    if (this.player.autoParryNextAttack) {
      this.player.autoParryNextAttack.turnsLeft -= 1;
      if (this.player.autoParryNextAttack.turnsLeft <= 0) {
        this.player.autoParryNextAttack = null;
        expired.push("카운터스탠스");
      }
    }
    if (this.player.dodgeFirstAttackOfNextEnemyTurn) {
      this.player.dodgeFirstAttackOfNextEnemyTurn.turnsLeft -= 1;
      if (this.player.dodgeFirstAttackOfNextEnemyTurn.turnsLeft <= 0) {
        this.player.dodgeFirstAttackOfNextEnemyTurn = null;
        expired.push("신속회피");
      }
    }
    if (this.player.dodgeNextAttack) {
      this.player.dodgeNextAttack.turnsLeft -= 1;
      if (this.player.dodgeNextAttack.turnsLeft <= 0) {
        this.player.dodgeNextAttack = null;
        expired.push("완전회피");
      }
    }
    if (expired.length > 0) this.flashLog(`${expired.join(", ")} 효과가 사라졌습니다`);
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

  private maybeShowEnemySpeech(force = false) {
    if (this.finished || !this.enemy || !this.player) return;
    const enemyRatio = this.enemy.hp / Math.max(1, this.enemy.hpMax);
    const playerIsAhead = this.enemy.hp < this.player.hp || enemyRatio <= 0.68;
    if (!force && !playerIsAhead) return;
    const now = this.scene.time.now;
    if (now - this.lastSpeechAt < 1800) return;
    if (!force && Phaser.Math.Between(1, 100) > 52) return;

    this.lastSpeechAt = now;
    const line =
      ENEMY_REACTION_LINES[Phaser.Math.Between(0, ENEMY_REACTION_LINES.length - 1)];
    this.showEnemySpeech(line);
  }

  private showEnemySpeech(line: string) {
    const { width, height } = this.scene.scale;
    this.speechBubble?.destroy();

    const x = width * 0.76;
    const y = height * 0.22;
    const bubbleW = u(200);
    const bubbleH = u(68);
    const c = this.trackEffect(this.scene.add.container(x, y).setDepth(790));
    this.speechBubble = c;

    const bg = this.scene.add.graphics();
    bg.fillStyle(0xffffff, 0.94);
    bg.lineStyle(u(2), 0xd4a656, 0.95);
    bg.fillRoundedRect(-bubbleW / 2, -bubbleH / 2, bubbleW, bubbleH, u(18));
    bg.strokeRoundedRect(-bubbleW / 2, -bubbleH / 2, bubbleW, bubbleH, u(18));
    bg.fillStyle(0xffffff, 0.94);
    bg.fillTriangle(
      -u(58),
      bubbleH / 2 - u(8),
      -u(24),
      bubbleH / 2 - u(8),
      -u(70),
      bubbleH / 2 + u(28)
    );
    bg.lineStyle(u(2), 0xd4a656, 0.9);
    bg.lineBetween(-u(58), bubbleH / 2 - u(8), -u(70), bubbleH / 2 + u(28));
    bg.lineBetween(-u(70), bubbleH / 2 + u(28), -u(24), bubbleH / 2 - u(8));

    const text = this.scene.add
      .text(0, -u(2), line, {
        fontFamily: "serif",
        fontSize: px(15),
        color: "#3b2410",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: bubbleW - u(28) },
      })
      .setOrigin(0.5);
    c.add([bg, text]);
    this.overlay?.add(c);

    c.setAlpha(0).setScale(0.84);
    this.scene.tweens.add({
      targets: c,
      alpha: 1,
      scale: 1,
      y: y - u(8),
      duration: 170,
      ease: "Back.Out",
    });
    const runId = this.battleRunId;
    this.scene.time.delayedCall(1700, () => {
      if (this.speechBubble !== c || !this.isCurrentRun(runId)) return;
      this.scene.tweens.add({
        targets: c,
        alpha: 0,
        y: y - u(22),
        duration: 260,
        onComplete: () => {
          if (this.speechBubble === c) this.speechBubble = null;
          c.destroy();
        },
      });
    });
  }

  private rollDiceAfterHit(baseDamage: number, onComplete?: () => void, runId = this.battleRunId) {
    const { width } = this.scene.scale;
    this.playAttackEffect("enemy", baseDamage);
    let settled = false;
    const settle = (origin: string) => {
      void origin;
      if (settled) return;
      if (!this.isCurrentRun(runId)) {
        settled = true;
        return;
      }
      settled = true;
      onComplete?.();
    };
    const fallback = this.scene.time.delayedCall(2400, () => settle("fallback"));
    DiceRoller.roll(this.scene, this.overlay, width / 2, u(170), (roll) => {
      if (!this.isCurrentRun(runId) || settled) return;
      fallback.remove(false);
      try {
      if (roll.critical) {
        const criticalDamage = Math.max(4, Math.round(baseDamage * 0.85));
        this.applyDirectDamage(this.enemy, criticalDamage);
        this.playAttackEffect("enemy", criticalDamage);
        this.flashLog(`Critical Hit! 추가 내구도 ${criticalDamage} 감소`);
        this.refreshAll();
        if (this.enemy.hp > 0) this.maybeShowEnemySpeech();
      }
      if (roll.value === 6 && this.enemy.hp > 0) {
        this.energy = Math.min(ENERGY_MAX, this.energy + 1);
        this.drawToFull(TARGET_HAND);
        this.flashLog("Lucky Six! 기력 +1 · 카드 보충");
        this.refreshAll();
      }
      } catch (err) {
        console.error("[BATTLE] dice callback threw", err);
      } finally {
        settle("dice-callback");
      }
    });
  }

  // -- Deck --

  private drawToFull(targetCount: number) {
    const target = Math.min(targetCount, HAND_LIMIT);
    while (this.hand.length < target) {
      const before = this.hand.length;
      this.draw(1);
      if (this.hand.length === before) {
        this.deck = shuffle(STARTER_DECK.map((cardId) => this.createTarotCard(cardId)));
        this.draw(1);
        if (this.hand.length === before) break;
      }
    }
  }

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
    this.refreshEnemyPartPanel();
    this.refreshHandRender();
    this.refreshButtons();
    this.emitEnemyEnergyUpdate();
  }

  private refreshHpBars() {
    const pRatio = Phaser.Math.Clamp(this.player.hp / this.player.hpMax, 0, 1);
    this.playerHpFill.width = this.playerHpBarMaxWidth * pRatio;
    this.playerHpText.setText(`${this.player.hp} / ${this.player.hpMax}`);
    this.playerBlockText.setText(this.player.block > 0 ? `🛡 ${this.player.block}` : "");

    const eRatio = Phaser.Math.Clamp(this.enemy.hp / this.enemy.hpMax, 0, 1);
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
      const shown = this.getPredictedEnemyAttackDamage(intent.amount);
      this.enemyIntentText.setText(`다음: 공격 ${shown}${this.getEnemyAttackPreventionLabel()}`);
      this.enemyIntentText.setColor("#ff8090");
    } else {
      this.enemyIntentText.setText(`다음: 보호막 +${intent.amount}`);
      this.enemyIntentText.setColor("#9ad0ff");
    }
  }

  private emitEnemyEnergyUpdate() {
    this.scene.events.emit("enemy-energy-update", {
      hp: this.enemy.hp,
      hpMax: this.enemy.hpMax,
      intent: this.getEnemyIntentLabel(),
    });
  }

  private getEnemyIntentLabel() {
    if (this.enemyStunned) return "다음: 무력화";
    const intent = this.intentPattern[this.intentIdx % this.intentPattern.length];
    if (!intent) return "";
    if (intent.kind === "attack") {
      const shown = this.getPredictedEnemyAttackDamage(intent.amount);
      return `다음: 공격 ${shown}${this.getEnemyAttackPreventionLabel()}`;
    }
    return `다음: 보호막 +${intent.amount}`;
  }

  private getEnemyAttackPreventionLabel() {
    const labels: string[] = [];
    if (this.enemy.partRuntime.strongAttackNext) labels.push("강공");
    if (this.player.autoParryNextAttack) labels.push("자동 패링");
    else if (this.player.dodgeNextAttack || this.player.dodgeFirstAttackOfNextEnemyTurn) labels.push("회피");
    return labels.length > 0 ? ` (${labels.join(" · ")})` : "";
  }

  private hasEnemyAttackPrevention() {
    return (
      this.player.autoParryNextAttack !== null ||
      this.player.dodgeNextAttack !== null ||
      this.player.dodgeFirstAttackOfNextEnemyTurn !== null
    );
  }

  private getPredictedEnemyAttackDamage(rawAmount: number) {
    let shown = this.predictEnemyOutgoingDamagePassives(rawAmount);
    if (this.enemy.weaken) shown = Math.max(0, shown - this.enemy.weaken.amount);
    if (this.enemy.weakenNextAttack && !this.hasEnemyAttackPrevention()) {
      shown = Math.max(0, Math.round(shown * (1 - this.enemy.weakenNextAttack.ratio)));
    }
    return shown;
  }

  private predictEnemyOutgoingDamagePassives(rawAmount: number) {
    let shown = Math.max(0, rawAmount);
    const underwear = this.getActiveEnemyPartByAbility("berserkBelowHpRatio");
    if (
      underwear &&
      underwear.ability.kind === "berserkBelowHpRatio" &&
      this.enemy.hp / Math.max(1, this.enemy.hpMax) <= underwear.ability.threshold
    ) {
      shown = Math.max(0, Math.round(shown * underwear.ability.value));
    }
    const skirt = this.getActiveEnemyPartByAbility("periodicStrongAttack");
    if (skirt && skirt.ability.kind === "periodicStrongAttack" && this.enemy.partRuntime.strongAttackNext) {
      shown = Math.max(0, Math.round(shown * skirt.ability.value));
    }
    return shown;
  }

  private refreshStatus() {
    const enemyParts: string[] = [];
    if (this.enemy.burn) enemyParts.push(`화상 ${this.enemy.burn.dmg} × ${this.enemy.burn.turns}턴`);
    if (this.enemy.weaken) enemyParts.push(`약화 -${this.enemy.weaken.amount}`);
    if (this.enemy.weakenNextAttack) {
      enemyParts.push(`무장해제 ${Math.round(this.enemy.weakenNextAttack.ratio * 100)}%`);
    }
    this.enemyStatusText.setText(enemyParts.join("  ·  "));

    const playerParts: string[] = [];
    if (this.player.burn) playerParts.push(`화상 ${this.player.burn.dmg} × ${this.player.burn.turns}턴`);
    if (this.player.weaken) playerParts.push(`약화 -${this.player.weaken.amount}`);
    if (this.player.reflectNextAttack) {
      playerParts.push(`반격 ${Math.round(this.player.reflectNextAttack.ratio * 100)}%`);
    }
    if (this.player.autoParryNextAttack) playerParts.push("자동 패링");
    if (this.player.dodgeNextAttack) playerParts.push("완전회피");
    if (this.player.dodgeFirstAttackOfNextEnemyTurn) playerParts.push("신속회피");
    this.playerStatusText.setText(playerParts.join("  ·  "));

    const selectedCost = this.selectedCards.reduce((sum, c) => sum + CARDS[c.cardId].cost, 0);
    const energyRatio = Phaser.Math.Clamp(this.energy / ENERGY_MAX, 0, 1);
    this.playerEnergyFill.width = this.playerEnergyBarMaxWidth * energyRatio;
    this.playerEnergyText.setText(`${this.energy} / ${ENERGY_MAX}`);
    this.energyText.setText(`기력 ${this.energy} / ${ENERGY_MAX}${selectedCost > 0 ? ` · 선택 ${selectedCost}` : ""}`);
    this.turnText.setText(`턴 ${this.turn} / ${MAX_TURNS}`);
    this.deckCountText.setText(`덱 ${this.deck.length} · 버림 ${this.discard.length}`);
  }

  private drawEnemyPartPanel(width: number, height: number) {
    this.enemyPartPanel?.destroy();
    this.enemyPartRows = {};
    const panelW = u(132);
    const rowH = u(26);
    const x = width - panelW / 2 - u(12);
    const y = Math.min(height - u(415), u(246));
    const panel = this.scene.add.container(x, y).setDepth(610);
    const bg = this.scene.add
      .rectangle(0, 0, panelW, rowH * this.enemy.parts.length + u(30), 0x07070d, 0.5)
      .setStrokeStyle(u(1), 0xd4a656, 0.55);
    const title = this.scene.add
      .text(0, -rowH * this.enemy.parts.length * 0.5 - u(3), "파츠 능력", {
        fontFamily: "serif",
        fontSize: px(9),
        color: "#f3e6c9",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    panel.add([bg, title]);

    this.enemy.parts.forEach((part, idx) => {
      const rowY = -rowH * (this.enemy.parts.length - 1) * 0.5 + idx * rowH + u(10);
      const row = this.scene.add.container(0, rowY);
      const rowBg = this.scene.add
        .rectangle(0, 0, panelW - u(12), u(22), 0x1b1420, 0.62)
        .setStrokeStyle(u(0.7), 0x8f6a34, 0.45);
      const name = this.scene.add
        .text(-panelW / 2 + u(13), -u(4), part.displayName, {
          fontFamily: "serif",
          fontSize: px(7.5),
          color: "#f3e6c9",
          fontStyle: "bold",
        })
        .setOrigin(0, 0.5);
      const hpText = this.scene.add
        .text(panelW / 2 - u(13), -u(4), `${part.hp}/${part.maxHp}`, {
          fontFamily: "serif",
          fontSize: px(7),
          color: "#9ad0ff",
          fontStyle: "bold",
        })
        .setOrigin(1, 0.5);
      const hpBg = this.scene.add.rectangle(0, u(5), panelW - u(26), u(4), 0x271620, 0.9);
      const hpFill = this.scene.add
        .rectangle(-(panelW - u(26)) / 2, u(5), panelW - u(26), u(3), 0x9ad0ff, 0.95)
        .setOrigin(0, 0.5);
      const counterText = this.scene.add
        .text(0, u(11), this.getPartCounterText(part), {
          fontFamily: "serif",
          fontSize: px(6.5),
          color: "#ffd572",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      row.add([rowBg, name, hpText, hpBg, hpFill, counterText]);
      panel.add(row);
      this.enemyPartRows[part.id] = { container: row, bg: rowBg, hpFill, hpText, counterText };
    });

    this.enemyPartPanel = panel;
    this.overlay?.add(panel);
    this.refreshEnemyPartPanel();
  }

  private refreshEnemyPartPanel() {
    for (const part of this.enemy.parts) {
      const row = this.enemyPartRows[part.id];
      if (!row) continue;
      row.hpText.setText(`${part.hp}/${part.maxHp}`);
      row.hpFill.width = (u(106) * Phaser.Math.Clamp(part.hp / Math.max(1, part.maxHp), 0, 1));
      row.counterText.setText(this.getPartCounterText(part));
      row.bg.setFillStyle(part.destroyed ? 0x2a2222 : 0x1b1420, part.destroyed ? 0.36 : 0.62);
      row.hpFill.setFillStyle(part.destroyed ? 0x777777 : 0x9ad0ff, part.destroyed ? 0.5 : 0.95);
    }
  }

  private getPartCounterText(part: EnemyRuntimePart) {
    if (part.destroyed) return "파괴됨";
    if (part.ability.kind === "periodicStrongAttack") {
      if (this.enemy.partRuntime.strongAttackNext) return "강공 준비";
      return `${this.enemy.partRuntime.skirtTurnCounter}/${part.ability.intervalTurns}`;
    }
    if (part.ability.kind === "autoParryFirstHitPerTurn" && this.enemy.partRuntime.shoesNegateFirstHit) {
      return "첫 타 무효";
    }
    return this.getPartAbilityLabel(part.ability);
  }

  private getPartAbilityLabel(ability: PartAbility) {
    switch (ability.kind) {
      case "shieldOnTurnStart":
        return `보호막 +${ability.value}`;
      case "damageReductionPercent":
        return `피해 -${Math.round(ability.value * 100)}%`;
      case "healOnTurnStart":
        return `회복 +${ability.value}`;
      case "periodicStrongAttack":
        return `강공 x${ability.value}`;
      case "autoParryFirstHitPerTurn":
        return "첫 타 무효";
      case "berserkBelowHpRatio":
        return `광폭 x${ability.value}`;
    }
  }

  private refreshHandRender() {
    // Destroy old hand visuals
    for (const c of this.handObjs) {
      this.killTweensForObjectTree(c.container);
      c.container.destroy();
    }
    this.handObjs = [];

    const count = this.hand.length;
    if (count === 0) return;

    const gap = u(7);
    const maxCardW = u(126);
    const cardW = Math.min(
      maxCardW,
      (this.handAreaWidth - gap * (count - 1)) / count
    );
    const cardH = Math.min(u(174), cardW * 1.48);
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
    const temporary = card.isTemporary === true;
    const selectedCost = this.selectedCards.reduce((sum, c) => sum + CARDS[c.cardId].cost, 0);
    const sameRole =
      this.selectedCards.length === 0 ||
      CARDS[this.selectedCards[0].cardId].role === def.role ||
      selected;
    const playable =
      sameRole &&
      selectedCost + (selected ? 0 : def.cost) <= this.energy &&
      !this.busy &&
      !this.finished &&
      (!temporary || this.selectedCards.length === 0 || selected);

    const cardFill = temporary ? 0x172a32 : selected ? 0xffe8aa : playable ? 0xefe0bd : 0x5f5446;
    const bg = this.scene.add
      .rectangle(0, 0, cardW, cardH, cardFill, playable ? 1 : 0.84)
      .setStrokeStyle(
        u(selected ? 4 : 2),
        temporary ? 0x82ffe6 : selected ? 0xfff0a8 : 0x8f6a34,
        playable ? 1 : 0.62
      )
      .setInteractive({ useHandCursor: true });
    const selectionAura = this.scene.add
      .rectangle(0, 0, cardW + u(10), cardH + u(10), 0xffffff, 0)
      .setStrokeStyle(u(3), 0xfff0a8, selected ? 0.95 : 0);
    const dropGlow = this.scene.add
      .rectangle(0, 0, cardW + u(16), cardH + u(16), 0xffffff, 0)
      .setStrokeStyle(u(4), 0x82ffe6, 0);
    const innerFrame = this.scene.add
      .rectangle(0, u(8), cardW - u(14), cardH - u(20), 0xffffff, 0)
      .setStrokeStyle(u(1), 0x7b5b34, playable ? 0.75 : 0.4);
    const accent = this.scene.add
      .rectangle(0, -cardH / 2 + u(17), cardW - u(8), u(34), temporary ? 0x166d79 : def.color, playable ? 0.95 : 0.62)
      .setStrokeStyle(u(1), 0xffd572, 0.55);
    const headerLine = this.scene.add.rectangle(0, -cardH / 2 + u(36), cardW - u(22), u(2), 0xffd572, 0.7);
    const costCircle = this.scene.add
      .circle(-cardW / 2 + u(17), -cardH / 2 + u(17), u(12), 0x172018, 0.98)
      .setStrokeStyle(u(1.2), 0xffd572, 0.95);
    const costText = this.scene.add
      .text(-cardW / 2 + u(17), -cardH / 2 + u(17), String(def.cost), {
        fontFamily: "serif",
        fontSize: px(12),
        color: "#ffd572",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const nameText = this.scene.add
      .text(0, -cardH / 2 + u(17), def.roleLabel, {
        fontFamily: "serif",
        fontSize: px(15),
        color: "#fdf3d4",
        fontStyle: "bold",
        stroke: "#1a0f22",
        strokeThickness: u(1.2),
      })
      .setOrigin(0.5);
    const reverseBadge = this.scene.add
      .text(cardW / 2 - u(20), -cardH / 2 + u(17), temporary ? "TEMP" : `C${def.cost}`, {
        fontFamily: "serif",
        fontSize: px(temporary ? 7 : 9),
        color: "#fdf3d4",
        fontStyle: "bold",
        stroke: "#1a0f22",
        strokeThickness: u(1),
      })
      .setOrigin(0.5);
    const portrait = this.scene.add
      .rectangle(0, -cardH / 2 + u(67), cardW - u(24), u(58), 0xfff5dc, playable ? 0.68 : 0.28)
      .setStrokeStyle(u(1), 0xa5793e, 0.72);
    const roleText = this.scene.add
      .text(0, -cardH / 2 + u(55), def.name, {
        fontFamily: "serif",
        fontSize: px(11),
        color: playable ? "#3b2a27" : "#d0c1aa",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const powerText = this.scene.add
      .text(0, -cardH / 2 + u(79), `전투력 ${card.power}`, {
        fontFamily: "serif",
        fontSize: px(10),
        color: playable ? "#2f2520" : "#d0c1aa",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const descBg = this.scene.add
      .rectangle(0, u(43), cardW - u(26), u(58), temporary ? 0xd8fff7 : 0xfff7df, playable ? 0.7 : 0.16)
      .setStrokeStyle(u(0.8), temporary ? 0x82ffe6 : 0xa5793e, playable ? 0.55 : 0.22);
    const descText = this.scene.add
      .text(0, u(43), `${def.description}\n같은 역할 선택\n합체`, {
        fontFamily: "serif",
        fontSize: px(7.8),
        color: temporary ? "#08282c" : playable ? "#2f2520" : "#cfc0b0",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: cardW - u(22) },
      })
      .setOrigin(0.5);
    const cornerSize = u(5);
    const cornerLt = this.scene.add
      .rectangle(-cardW / 2 + u(9), -cardH / 2 + u(9), cornerSize, cornerSize, 0xffd572, 0.82)
      .setAngle(45);
    const cornerRt = this.scene.add
      .rectangle(cardW / 2 - u(9), -cardH / 2 + u(9), cornerSize, cornerSize, 0xffd572, 0.82)
      .setAngle(45);
    const cornerLb = this.scene.add
      .rectangle(-cardW / 2 + u(9), cardH / 2 - u(9), cornerSize, cornerSize, 0xffd572, 0.82)
      .setAngle(45);
    const cornerRb = this.scene.add
      .rectangle(cardW / 2 - u(9), cardH / 2 - u(9), cornerSize, cornerSize, 0xffd572, 0.82)
      .setAngle(45);
    const tempGlow = this.scene.add
      .rectangle(0, 0, cardW + u(7), cardH + u(7), 0xffffff, 0)
      .setStrokeStyle(u(2), 0x82ffe6, temporary ? 0.8 : 0);

    const container = this.scene.add
      .container(x, y, [
        dropGlow,
        tempGlow,
        selectionAura,
        bg,
        innerFrame,
        accent,
        headerLine,
        costCircle,
        costText,
        nameText,
        reverseBadge,
        portrait,
        roleText,
        powerText,
        descBg,
        descText,
        cornerLt,
        cornerRt,
        cornerLb,
        cornerRb,
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
      this.highlightMergeTarget(card);
      this.scene.tweens.add({
        targets: container,
        y: y - u(14),
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 140,
      });
    });
    bg.on("pointerout", () => {
      dropGlow.setAlpha(0);
      this.scene.tweens.add({
        targets: container,
        y: selected ? y - u(18) : y,
        scaleX: 1,
        scaleY: 1,
        duration: 140,
      });
    });
    bg.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.dragStart = { x: pointer.x, y: pointer.y, card };
      container.setDepth(800);
    });
    bg.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragStart || this.dragStart.card !== card) return;
      const moved = Math.abs(pointer.x - this.dragStart.x) + Math.abs(pointer.y - this.dragStart.y);
      if (moved <= u(12)) return;
      container.setPosition(pointer.x, pointer.y);
      this.highlightMergeTarget(card, pointer.x, pointer.y);
    });
    bg.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      const moved =
        this.dragStart && this.dragStart.card === card
          ? Math.abs(pointer.x - this.dragStart.x) + Math.abs(pointer.y - this.dragStart.y)
          : 0;
      if (moved > u(24)) {
        if (!this.tryMergeDraggedCard(card, pointer.x, pointer.y)) {
          this.scene.tweens.add({
            targets: container,
            x,
            y: selected ? y - u(18) : y,
            duration: 160,
            ease: "Quad.easeOut",
          });
        }
        this.clearMergeHighlights();
        this.dragStart = null;
        return;
      }
      this.dragStart = null;
      const idx = this.handObjs.findIndex((o) => o === slot);
      if (idx >= 0) this.tryPlayCard(idx);
    });
    // If the user releases the pointer outside the card (especially on
    // touch devices), `pointerup` won't fire on this object. Phaser fires
    // `pointerupoutside` instead — without this, dragStart can stay set
    // and the container stays at the elevated depth, leaving the hand
    // visually stuck after the first interaction.
    bg.on("pointerupoutside", () => {
      if (this.dragStart && this.dragStart.card === card) {
        this.dragStart = null;
      }
      this.clearMergeHighlights();
      this.scene.tweens.add({
        targets: container,
        x,
        y: selected ? y - u(18) : y,
        scaleX: 1,
        scaleY: 1,
        duration: 160,
        ease: "Quad.easeOut",
      });
    });

    const slot: HandCard = {
      card,
      container,
      bg,
      dropGlow,
      baseX: x,
      baseY: y,
      cardW,
      cardH,
    };
    return slot;
  }

  private refreshButtons() {
    const canEnd = !this.busy && !this.finished;
    this.endTurnBg.setFillStyle(0x12101e, canEnd ? 0.96 : 0.45);
    this.useCardsBg.setFillStyle(0x12101e, canEnd && this.selectedCards.length > 0 ? 0.96 : 0.45);
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

  private highlightEnemyPart(partId: PartId) {
    const row = this.enemyPartRows[partId];
    if (!row) return;
    this.scene.tweens.killTweensOf(row.bg);
    row.bg.setFillStyle(0x4a3317, 0.9);
    row.bg.setStrokeStyle(u(1.2), 0xffd572, 0.95);
    this.scene.tweens.add({
      targets: row.bg,
      alpha: { from: 1, to: 0.65 },
      duration: 220,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        if (!row.bg.scene) return;
        row.bg.setAlpha(1);
        row.bg.setFillStyle(0x1b1420, 0.62);
        row.bg.setStrokeStyle(u(0.7), 0x8f6a34, 0.45);
      },
    });
  }

  private playPartDamageEffect(partId: PartId) {
    const row = this.enemyPartRows[partId];
    if (!row) return;
    this.highlightEnemyPart(partId);
    this.scene.tweens.add({
      targets: row.container,
      x: { from: row.container.x - u(4), to: row.container.x + u(4) },
      yoyo: true,
      repeat: 2,
      duration: 45,
      onComplete: () => {
        if (row.container.scene) row.container.x = 0;
      },
    });
  }

  private playPartDestroyEffect(partId: PartId) {
    const row = this.enemyPartRows[partId];
    if (!row) return;
    const burst = this.trackEffect(
      this.scene.add
        .rectangle(this.enemyPartPanel!.x + row.container.x, this.enemyPartPanel!.y + row.container.y, u(94), u(24), 0xff4d5f, 0.18)
        .setStrokeStyle(u(3), 0xffd572, 0.95)
        .setDepth(822)
    );
    this.overlay?.add(burst);
    row.counterText.setText("파괴됨");
    this.scene.tweens.add({
      targets: burst,
      scaleX: 1.35,
      scaleY: 1.55,
      alpha: 0,
      duration: 520,
      ease: "Cubic.easeOut",
      onComplete: () => {
        if (burst.scene) burst.destroy();
      },
    });
  }

  private playCounterReadyEffect() {
    const { width, height } = this.scene.scale;
    const ring = this.trackEffect(
      this.scene.add
        .circle(width * 0.33, height * 0.52, u(34), 0x82ffe6, 0.12)
        .setStrokeStyle(u(3), 0x82ffe6, 0.85)
        .setDepth(724)
    );
    this.overlay?.add(ring);
    this.scene.tweens.add({
      targets: ring,
      scaleX: 1.35,
      scaleY: 1.35,
      alpha: 0,
      duration: 780,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (ring.scene) ring.destroy();
      },
    });
  }

  private playCounterStanceReadyEffect() {
    const { width, height } = this.scene.scale;
    const ring = this.trackEffect(
      this.scene.add
        .circle(width * 0.35, height * 0.5, u(44), 0x2f9cc7, 0.14)
        .setStrokeStyle(u(4), 0x82ffe6, 0.9)
        .setDepth(724)
    );
    this.overlay?.add(ring);
    this.scene.tweens.add({
      targets: ring,
      scaleX: 1.4,
      scaleY: 1.4,
      alpha: 0,
      duration: 880,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (ring.scene) ring.destroy();
      },
    });
  }

  private playDodgeReadyEffect(label: string) {
    const { width, height } = this.scene.scale;
    const text = this.trackEffect(
      this.scene.add
        .text(width * 0.36, height * 0.47, label, {
          fontFamily: "serif",
          fontSize: px(14),
          color: "#d8fff7",
          fontStyle: "bold",
          stroke: "#063238",
          strokeThickness: u(2),
        })
        .setOrigin(0.5)
        .setDepth(724)
    );
    this.overlay?.add(text);
    this.scene.tweens.add({
      targets: text,
      y: text.y - u(20),
      alpha: 0,
      duration: 860,
      ease: "Cubic.easeOut",
      onComplete: () => {
        if (text.scene) text.destroy();
      },
    });
  }

  private playDodgeTriggerEffect(label: string) {
    const { width, height } = this.scene.scale;
    const text = this.trackEffect(
      this.scene.add
        .text(width / 2, height * 0.42, `${label}!`, {
          fontFamily: "serif",
          fontSize: px(22),
          color: "#ffffff",
          fontStyle: "bold",
          stroke: "#0b5862",
          strokeThickness: u(3),
        })
        .setOrigin(0.5)
        .setDepth(725)
    );
    this.overlay?.add(text);
    this.scene.cameras.main.shake(130, 0.003);
    this.scene.tweens.add({
      targets: text,
      y: text.y - u(30),
      alpha: 0,
      duration: 620,
      ease: "Cubic.easeOut",
      onComplete: () => {
        if (text.scene) text.destroy();
      },
    });
  }

  private playAutoParryEffect(amount: number) {
    const { width } = this.scene.scale;
    this.scene.cameras.main.shake(180, 0.006);
    const text = this.trackEffect(
      this.scene.add
        .text(width / 2, u(150), `자동 패링 -${amount}`, {
          fontFamily: "serif",
          fontSize: px(18),
          color: "#7bd8ff",
          fontStyle: "bold",
          stroke: "#082836",
          strokeThickness: u(2),
        })
        .setOrigin(0.5)
        .setDepth(725)
    );
    this.overlay?.add(text);
    this.scene.tweens.add({
      targets: text,
      y: text.y - u(34),
      alpha: 0,
      duration: 700,
      ease: "Cubic.easeOut",
      onComplete: () => {
        if (text.scene) text.destroy();
      },
    });
  }

  private playDisarmReadyEffect() {
    const { width } = this.scene.scale;
    const icon = this.trackEffect(
      this.scene.add
        .text(width / 2 + u(88), u(152), "약화", {
          fontFamily: "serif",
          fontSize: px(14),
          color: "#b8c7ff",
          fontStyle: "bold",
          stroke: "#1a1038",
          strokeThickness: u(2),
        })
        .setOrigin(0.5)
        .setDepth(724)
    );
    this.overlay?.add(icon);
    this.scene.tweens.add({
      targets: icon,
      y: icon.y - u(18),
      alpha: 0,
      duration: 900,
      ease: "Cubic.easeOut",
      onComplete: () => {
        if (icon.scene) icon.destroy();
      },
    });
  }

  private playWeakenBreakEffect() {
    const { width } = this.scene.scale;
    const flash = this.trackEffect(
      this.scene.add
        .circle(width / 2, u(168), u(24), 0x778cff, 0.2)
        .setStrokeStyle(u(3), 0xb8c7ff, 0.9)
        .setDepth(724)
    );
    this.overlay?.add(flash);
    this.scene.tweens.add({
      targets: flash,
      scaleX: 1.45,
      scaleY: 1.45,
      alpha: 0,
      duration: 360,
      ease: "Quad.easeOut",
      onComplete: () => {
        if (flash.scene) flash.destroy();
      },
    });
  }

  private playReflectEffect(amount: number) {
    const { width } = this.scene.scale;
    this.scene.cameras.main.shake(180, 0.005);
    const text = this.trackEffect(
      this.scene.add
        .text(width / 2, u(150), `반사 -${amount}`, {
          fontFamily: "serif",
          fontSize: px(18),
          color: "#82ffe6",
          fontStyle: "bold",
          stroke: "#06282c",
          strokeThickness: u(2),
        })
        .setOrigin(0.5)
        .setDepth(725)
    );
    this.overlay?.add(text);
    this.scene.tweens.add({
      targets: text,
      y: text.y - u(34),
      alpha: 0,
      duration: 680,
      ease: "Cubic.easeOut",
      onComplete: () => {
        if (text.scene) text.destroy();
      },
    });
  }

  private playAttackEffect(target: "enemy" | "player", amount = 0) {
    const { width, height } = this.scene.scale;
    const y = target === "enemy" ? u(180) : height - u(280);
    const x = width / 2;
    const color = target === "enemy" ? 0xff5e7a : 0xffd572;
    this.scene.cameras.main.shake(target === "enemy" ? 150 : 220, target === "enemy" ? 0.006 : 0.009);

    const slash = this.trackEffect(this.scene.add.graphics().setDepth(720));
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

    const burst = this.trackEffect(this.scene.add.circle(x, y, u(18), color, 0.35).setDepth(721));
    this.overlay?.add(burst);
    if (amount > 0) {
      const damage = this.trackEffect(
        this.scene.add
          .text(x, y - u(54), `-${amount}`, {
            fontFamily: "serif",
            fontSize: px(20),
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#5a1018",
            strokeThickness: u(2),
          })
          .setOrigin(0.5)
          .setDepth(722)
      );
      this.overlay?.add(damage);
      this.scene.tweens.add({
        targets: damage,
        y: damage.y - u(36),
        alpha: 0,
        duration: 520,
        ease: "Cubic.easeOut",
        onComplete: () => {
          if (damage.scene) damage.destroy();
        },
      });
    }

    this.scene.tweens.add({
      targets: slash,
      alpha: 0,
      scaleX: 1.18,
      scaleY: 1.18,
      duration: 260,
      ease: "Cubic.easeOut",
      onComplete: () => {
        if (slash.scene) slash.destroy();
      },
    });
    this.scene.tweens.add({
      targets: burst,
      radius: u(90),
      alpha: 0,
      duration: 360,
      ease: "Cubic.easeOut",
      onComplete: () => {
        if (burst.scene) burst.destroy();
      },
    });
  }

  private playGuardEffect(target: "enemy" | "player") {
    const { width, height } = this.scene.scale;
    const y = target === "enemy" ? u(180) : height - u(280);
    const x = width / 2;
    this.scene.cameras.main.shake(90, 0.003);

    const shield = this.trackEffect(this.scene.add.graphics().setDepth(721));
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
      onComplete: () => {
        if (shield.scene) shield.destroy();
      },
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
    const outer = this.scene.add
      .rectangle(x, y, w, h, 0x07070d, 0.98)
      .setStrokeStyle(u(1.6), 0xd4a656, 0.9);
    const bg = this.scene.add
      .rectangle(x, y, w - u(8), h - u(8), 0x12101e, 0.96)
      .setStrokeStyle(u(1), 0xf3e6c9, 0.72)
      .setInteractive({ useHandCursor: true });
    const inner = this.scene.add
      .rectangle(x, y, w - u(22), h - u(20), 0xffffff, 0)
      .setStrokeStyle(u(0.8), 0x7d653d, 0.76);
    const leftGem = this.scene.add
      .rectangle(x - w / 2 + u(18), y, u(7), u(7), 0xd4a656, 0.9)
      .setAngle(45);
    const rightGem = this.scene.add
      .rectangle(x + w / 2 - u(18), y, u(7), u(7), 0xd4a656, 0.9)
      .setAngle(45);
    const text = this.scene.add
      .text(x, y, label, {
        fontFamily: "serif",
        fontSize: px(14),
        color: "#f3e6c9",
        fontStyle: "bold",
        stroke: "#050409",
        strokeThickness: u(1),
      })
      .setOrigin(0.5);
    bg.on("pointerover", () => {
      bg.setFillStyle(0x211836, 0.98);
      outer.setStrokeStyle(u(1.8), 0xffd572, 1);
    });
    bg.on("pointerout", () => {
      bg.setFillStyle(0x12101e, 0.96);
      outer.setStrokeStyle(u(1.6), 0xd4a656, 0.9);
    });
    bg.on("pointerdown", () => {
      this.scene.tweens.add({
        targets: [outer, bg, inner, leftGem, rightGem, text],
        scaleX: 0.95,
        scaleY: 0.95,
        yoyo: true,
        duration: 90,
        onComplete: onClick,
      });
    });
    this.overlay?.add([outer, bg, inner, leftGem, rightGem, text]);
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
