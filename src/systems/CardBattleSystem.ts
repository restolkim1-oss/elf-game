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
const POISON_STACK_CAP = 99;
const CHARGE_STACK_CAP = 99;
const ENEMY_REACTION_LINES = [
  "제법인데?",
  "이럴수가! 잘하네?",
  "나도 지지 않아!",
  "흥, 아직이야!",
  "생각보다 강하네?",
];

type BaseCardId = "attack" | "powerAttack" | "defense" | "heal" | "parry" | "poison" | "charge";
type TempCardId = `temp_${string}`;
type CardId = BaseCardId | TempCardId;
type CardRole = FusionRole;
type AttackVisualStyle = "normal" | "smash" | "drain" | "poison" | "counter";

type CardEffect =
  | { kind: "attack"; amount: number }
  | { kind: "block"; amount: number }
  | { kind: "heal"; amount: number }
  | { kind: "energy"; amount: number }
  | { kind: "applyCharge"; amount: number }
  | { kind: "applyPoison"; amount: number }
  | { kind: "drain"; amount: number }
  | { kind: "partBonusAttack"; amount: number; partIds: string[]; label: string }
  | { kind: "partDamage"; partId: PartId; amount: number }
  | { kind: "reflectNextAttack"; ratio: number; poisonOnTrigger?: number; requireBlockHit?: boolean }
  | { kind: "weakenNextAttack"; ratio: number; maxTurns: number }
  | { kind: "autoParryNextAttack"; counterDamage: number; maxTurns: number }
  | { kind: "poisonAutoParryNextAttack"; counterDamage: number; poisonOnTrigger: number; maxTurns: number }
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
  poison: {
    id: "poison",
    characterName: "벨라돈나",
    role: "poison",
    roleLabel: "독",
    name: "독",
    cost: 1,
    description: "적에게 독 스택 +3",
    effects: [{ kind: "applyPoison", amount: 3 }],
    color: 0x5abf4a,
    isReversed: false,
    level: 1,
    attack: 4,
    defense: 3,
    psyche: 10,
    damage: 1,
    risk: 3,
  },
  charge: {
    id: "charge",
    characterName: "세리아",
    role: "charge",
    roleLabel: "충전",
    name: "충전",
    cost: 1,
    description: "자신에게 충전 스택 +3",
    effects: [{ kind: "applyCharge", amount: 3 }],
    color: 0xffc857,
    isReversed: false,
    level: 1,
    attack: 3,
    defense: 4,
    psyche: 10,
    damage: 1,
    risk: 2,
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
  "attack", "attack", "attack", "attack", "attack", "attack",
  "powerAttack", "powerAttack", "powerAttack",
  "defense", "defense", "defense", "defense",
  "heal", "heal",
  "parry", "parry", "parry",
  "poison", "poison",
  "charge", "charge",
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
  routedAttackPartId?: PartId;
}

interface SideState {
  hp: number;
  hpMax: number;
  block: number;
  poisonStacks: number;
  chargeStacks: number;
  burn: { dmg: number; turns: number } | null;
  weaken: { amount: number; turns: number } | null;
  reflectNextAttack: { ratio: number; poisonOnTrigger?: number; requireBlockHit?: boolean } | null;
  weakenNextAttack: { ratio: number; turnsLeft: number } | null;
  autoParryNextAttack: { counterDamage: number; turnsLeft: number; triggerOrder: number } | null;
  poisonAutoParryNextAttack: {
    counterDamage: number;
    poisonOnTrigger: number;
    turnsLeft: number;
    triggerOrder: number;
  } | null;
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
  private playerEnergyOrbs: Phaser.GameObjects.Arc[] = [];
  private playerEnergyOrbStates: boolean[] = [];
  private playerBlockText!: Phaser.GameObjects.Text;
  private playerStatusText!: Phaser.GameObjects.Text;
  private playerChargeText: Phaser.GameObjects.Text | null = null;
  private enemyHpFill!: Phaser.GameObjects.Rectangle;
  private enemyHpText!: Phaser.GameObjects.Text;
  private enemyBlockText!: Phaser.GameObjects.Text;
  private enemyIntentText!: Phaser.GameObjects.Text;
  private enemyStatusText!: Phaser.GameObjects.Text;
  private enemyPoisonText: Phaser.GameObjects.Text | null = null;
  private energyText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private deckCountText!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private handObjs: HandCard[] = [];
  private endTurnBg!: Phaser.GameObjects.Rectangle;
  private useCardsBg!: Phaser.GameObjects.Rectangle;
  private enemyPartPanel: Phaser.GameObjects.Container | null = null;
  private enemyPartTooltip: Phaser.GameObjects.Container | null = null;
  private activeTooltipPartId: PartId | null = null;
  private enemyPartTooltipPinned = false;
  private enemyPartRows: Partial<
    Record<
      PartId,
      {
        container: Phaser.GameObjects.Container;
        bg: Phaser.GameObjects.Rectangle;
        hpFill: Phaser.GameObjects.Rectangle;
        hpText: Phaser.GameObjects.Text;
        dropText: Phaser.GameObjects.Text;
        w: number;
        h: number;
      }
    >
  > = {};

  private handAreaY = 0;
  private handAreaWidth = 0;
  private playerHpBarMaxWidth = 0;
  private enemyHpBarMaxWidth = 0;
  private playerHpBarLeft = 0;
  private enemyHpBarLeft = 0;
  private dragStart: { x: number; y: number; card: TarotCardState } | null = null;
  private speechBubble: Phaser.GameObjects.Container | null = null;
  private cardPreview: Phaser.GameObjects.Container | null = null;
  private cardPreviewTimer: Phaser.Time.TimerEvent | null = null;
  private cardPreviewPointer: { cardUid: number; x: number; y: number; shown: boolean } | null = null;
  private lastSpeechAt = 0;
  private flowWatchdog: Phaser.Time.TimerEvent | null = null;
  private battleRunId = 0;
  private nextReactionOrder = 1;
  private effectObjects: Phaser.GameObjects.GameObject[] = [];
  private blockedDragCardUid: number | null = null;

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
    this.enemyPartTooltip?.destroy();
    this.enemyPartTooltip = null;
    this.activeTooltipPartId = null;
    this.enemyPartTooltipPinned = false;
    this.enemyPartRows = {};
    this.clearCardPreview();
    this.enemyPoisonText = null;
    this.playerEnergyOrbs = [];
    this.playerEnergyOrbStates = [];
    this.playerChargeText = null;
    this.lastSpeechAt = 0;
    this.overlay?.destroy();
    this.overlay = null;
    this.handObjs = [];
    this.deck = [];
    this.hand = [];
    this.discard = [];
    this.selectedCards = [];
    this.dragStart = null;
    this.blockedDragCardUid = null;
  }

  private startBattle(part: PartDef) {
    const { width, height } = this.scene.scale;

    // Battle UI floats over the existing scene — no opaque backdrop so the
    // character image and stage stay visible behind the strips and cards.
    this.overlay = this.scene.add.container(0, 0).setDepth(500).setAlpha(0);

    // Initialize state
    const enemyHpMax = 22 + part.difficulty * 9;
    this.player = {
      hp: PLAYER_HP_MAX,
      hpMax: PLAYER_HP_MAX,
      block: 0,
      poisonStacks: 0,
      chargeStacks: 0,
      burn: null,
      weaken: null,
      reflectNextAttack: null,
      weakenNextAttack: null,
      autoParryNextAttack: null,
      poisonAutoParryNextAttack: null,
      dodgeFirstAttackOfNextEnemyTurn: null,
      dodgeNextAttack: null,
      parts: [],
      partRuntime: this.createPartRuntimeState(),
    };
    this.enemy = {
      hp: enemyHpMax,
      hpMax: enemyHpMax,
      block: 0,
      poisonStacks: 0,
      chargeStacks: 0,
      burn: null,
      weaken: null,
      reflectNextAttack: null,
      weakenNextAttack: null,
      autoParryNextAttack: null,
      poisonAutoParryNextAttack: null,
      dodgeFirstAttackOfNextEnemyTurn: null,
      dodgeNextAttack: null,
      parts: this.createEnemyParts("default"),
      partRuntime: this.createPartRuntimeState(),
    };
    this.energy = ENERGY_MAX;
    this.turn = 1;
    this.nextReactionOrder = 1;
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
    const legacyEnemyHud = this.scene.add.container(0, 0).setVisible(false).setAlpha(0);
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

    legacyEnemyHud.add([
      enemyStripBg,
      enemyName,
      this.enemyIntentText,
      enemyHpBg,
      this.enemyHpFill,
      this.enemyHpText,
      this.enemyBlockText,
      this.enemyStatusText,
    ]);
    this.overlay.add(legacyEnemyHud);
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
    this.playerHpBarMaxWidth = playerPanelW * 0.62;
    this.playerHpBarLeft = width / 2 - this.playerHpBarMaxWidth / 2;
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
    this.playerEnergyOrbs = [];
    this.playerEnergyOrbStates = [];
    const orbY = playerHpY + u(26);
    const orbGap = u(22);
    const orbStartX = width / 2 - orbGap * (ENERGY_MAX - 1) * 0.5;
    for (let i = 0; i < ENERGY_MAX; i++) {
      const orb = this.scene.add
        .circle(orbStartX + i * orbGap, orbY, u(8), 0x43e5c8, 0.96)
        .setStrokeStyle(u(1.2), 0xf3d48a, 0.8);
      this.playerEnergyOrbs.push(orb);
      this.playerEnergyOrbStates.push(true);
    }
    this.playerChargeText = this.scene.add
      .text(width / 2, playerHpY - u(24), "", {
        fontFamily: "serif",
        fontSize: px(12),
        color: "#ffd572",
        fontStyle: "bold",
        stroke: "#2a1605",
        strokeThickness: u(1.5),
        backgroundColor: "rgba(28, 14, 5, 0.56)",
        padding: { x: 8, y: 3 },
      })
      .setOrigin(0.5);
    this.playerBlockText = this.scene.add
      .text(this.playerHpBarLeft + this.playerHpBarMaxWidth + u(12), playerHpY, "", {
        fontFamily: "serif",
        fontSize: px(10),
        color: "#9ad0ff",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    this.playerStatusText = this.scene.add
      .text(width / 2 - playerPanelW / 2 + u(22), playerStripY + u(28), "", {
        fontFamily: "serif",
        fontSize: px(12),
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
      ...this.playerEnergyOrbs,
      this.playerChargeText,
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
    this.scene.tweens.add({
      targets: this.overlay,
      alpha: 1,
      duration: 240,
      ease: "Quad.easeOut",
    });
    this.playTurnAnnouncement();
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
    this.playTurnAnnouncement();
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
    this.applyEnemyPartEarlyTurnStartPassives();
    if (this.processPoisonTick()) {
      this.refreshAll();
      this.scene.time.delayedCall(420, () => {
        if (this.isCurrentRun(runId)) this.finish(true);
      });
      return;
    }
    this.applyEnemyPartLateTurnStartPassives();
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

    const playerBlockBeforeHit = this.player.block;
    this.applyAttack(this.player, incoming);
    this.playAttackEffect("player", incoming);

    let reflected = 0;
    if (this.player.reflectNextAttack) {
      const reaction = this.player.reflectNextAttack;
      const shieldWasHit = playerBlockBeforeHit > 0 && incoming > 0;
      const shouldTrigger = !reaction.requireBlockHit || shieldWasHit;
      if (shouldTrigger) {
        this.player.reflectNextAttack = null;
        reflected = Math.max(0, Math.round(incoming * reaction.ratio));
        if (reflected > 0) {
          this.applyAttack(this.enemy, reflected);
          this.playReflectEffect(reflected);
        }
        if (reaction.poisonOnTrigger) {
          const poison = this.applyPoisonToEnemy(reaction.poisonOnTrigger);
          if (poison > 0) parts.push(`독 +${poison}`);
        }
        parts.push(`반격 ${reflected}`);
      } else {
        parts.push("독방벽 미발동");
      }
    }

    const suffix = parts.length > 0 ? ` (${parts.join(" · ")})` : "";
    return {
      incoming,
      reflected,
      log: `적 공격 ${rawAmount} → ${incoming}${suffix}`,
    };
  }

  private resolveEnemyAttackPrevention(rawAmount: number) {
    const normalParry = this.player.autoParryNextAttack;
    const poisonParry = this.player.poisonAutoParryNextAttack;
    if (normalParry || poisonParry) {
      const usePoisonParry =
        !!poisonParry &&
        (!normalParry || poisonParry.triggerOrder < normalParry.triggerOrder);

      if (usePoisonParry && poisonParry) {
        this.player.poisonAutoParryNextAttack = null;
        const dealt = this.applyAttack(this.enemy, poisonParry.counterDamage);
        const poison = this.applyPoisonToEnemy(poisonParry.poisonOnTrigger);
        this.playAutoParryEffect(dealt);
        return {
          prevented: true,
          counterDamage: dealt,
          log: `독칼날! 적 공격 ${rawAmount} 무효 · 반격 ${dealt} · 독 +${poison}`,
        };
      }

      if (normalParry) {
        this.player.autoParryNextAttack = null;
        const dealt = this.applyAttack(this.enemy, normalParry.counterDamage);
        this.playAutoParryEffect(dealt);
        return {
          prevented: true,
          counterDamage: dealt,
          log: `자동 패링! 적 공격 ${rawAmount} 무효 · 반격 ${dealt}`,
        };
      }
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
    if (this.selectedCards.length === 0) {
      this.flashLog("사용할 카드를 선택하세요");
      return;
    }
    const comboCards = [...this.selectedCards];
    this.selectedCards = [];
    this.playCardGroup(comboCards);
  }

  private playCardGroup(comboCards: TarotCardState[], routedAttackPartId?: PartId) {
    if (this.busy || this.finished) return false;
    const runId = this.battleRunId;
    const actualCost = comboCards.reduce((sum, c) => sum + CARDS[c.cardId].cost, 0);
    if (actualCost > this.energy) {
      this.flashLog(`기력 부족 (${actualCost} / ${this.energy})`);
      return false;
    }
    this.playCardUseTrail(comboCards, routedAttackPartId);
    this.energy -= actualCost;
    this.hand = this.hand.filter((c) => !comboCards.includes(c));
    this.selectedCards = this.selectedCards.filter((c) => !comboCards.includes(c));
    this.discard.push(...comboCards.filter((card) => !card.isTemporary));
    let result: { didAttack: boolean; damage: number };
    try {
      result = this.applyCardEffects(comboCards, routedAttackPartId);
    } catch (err) {
      console.error("[BATTLE] applyCardEffects threw", err);
      this.busy = false;
      this.refreshAll();
      return false;
    }
    this.refreshAll();
    if (this.enemy.hp <= 0) {
      this.busy = true;
      this.finish(true);
      return true;
    }
    if (result.didAttack) this.maybeShowEnemySpeech();

    const settle = () => this.safeSettleAfterCardUse();
    const visualStyle = this.getAttackVisualStyle(comboCards);
    if (result.didAttack) {
      this.busy = true;
      this.refreshButtons();
      this.armFlowWatchdog("dice-resolution", 3200, () => this.safeSettleAfterCardUse());
      try {
        this.rollDiceAfterHit(result.damage, settle, runId, visualStyle);
      } catch (err) {
        console.error("[BATTLE] rollDiceAfterHit threw", err);
        settle();
      }
    } else {
      settle();
    }
    return true;
  }

  private applyCardEffects(cards: TarotCardState[], routedAttackPartId?: PartId) {
    const card = cards[0];
    const def = CARDS[card.cardId];
    if (card.isTemporary) {
      return this.applyTemporaryCardEffects(card, def, routedAttackPartId);
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
    const damageContext = this.createPlayerDamageContext(routedAttackPartId);

    switch (role) {
      case "attack":
        attemptedAttack = true;
        if (duel.didWin) {
          const attackAmount = this.applyChargeBoostToAttackAmount(duel.damage);
          const result = this.applyPlayerDamageToEnemy(attackAmount, damageContext);
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
      case "poison":
        this.applyPoisonToEnemy(totalEffect);
        break;
      case "charge":
        this.applyChargeToPlayer(totalEffect);
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

  private getAttackVisualStyle(cards: TarotCardState[]): AttackVisualStyle {
    const id = cards[0]?.cardId ?? "attack";
    if (id === "temp_smash") return "smash";
    if (id === "temp_lifesteal" || id === "temp_drain_poison") return "drain";
    if (
      id === "temp_poison_arrow" ||
      id === "temp_strong_poison" ||
      id === "temp_poison_barrier" ||
      id === "temp_poison_blade"
    ) return "poison";
    if (id === "temp_counter" || id === "temp_disarm") return "counter";
    return "normal";
  }

  private applyTemporaryCardEffects(card: TarotCardState, def: CardDef, routedAttackPartId?: PartId) {
    let didAttack = false;
    let didGuard = false;
    let totalDamage = 0;
    const logParts: string[] = [];
    const damageContext = this.createPlayerDamageContext(routedAttackPartId);

    for (const effect of def.effects) {
      switch (effect.kind) {
        case "attack": {
          const amount = this.applyChargeBoostToAttackAmount(effect.amount);
          const result = this.applyPlayerDamageToEnemy(amount, damageContext);
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
          const amount = this.applyChargeBoostToAttackAmount(effect.amount);
          const result = this.applyPlayerDamageToEnemy(amount, damageContext);
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
        case "applyCharge":
          this.applyChargeToPlayer(effect.amount);
          logParts.push(`충전 +${effect.amount}`);
          break;
        case "applyPoison":
          this.applyPoisonToEnemy(effect.amount);
          logParts.push(`독 +${effect.amount}`);
          break;
        case "reflectNextAttack":
          this.player.reflectNextAttack = {
            ratio: effect.ratio,
            poisonOnTrigger: effect.poisonOnTrigger,
            requireBlockHit: effect.requireBlockHit,
          };
          this.playCounterReadyEffect();
          logParts.push(
            effect.poisonOnTrigger
              ? `독방벽 대기 ${Math.round(effect.ratio * 100)}%`
              : `반격 대기 ${Math.round(effect.ratio * 100)}%`
          );
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
            triggerOrder: this.nextReactionOrder++,
          };
          this.playCounterStanceReadyEffect();
          logParts.push(`자동 패링 대기`);
          break;
        case "poisonAutoParryNextAttack":
          this.player.poisonAutoParryNextAttack = {
            counterDamage: effect.counterDamage,
            poisonOnTrigger: effect.poisonOnTrigger,
            turnsLeft: effect.maxTurns,
            triggerOrder: this.nextReactionOrder++,
          };
          this.playCounterStanceReadyEffect();
          logParts.push(`독칼날 대기`);
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

  private highlightPartDropTargets(source: TarotCardState, pointerX?: number, pointerY?: number) {
    if (this.busy || this.finished) return;
    const overCard = pointerX !== undefined && pointerY !== undefined && this.getHandSlotAt(pointerX, pointerY, source) !== null;
    const canRoute = this.cardHasRoutableAttack(source);
    for (const part of this.enemy.parts) {
      const row = this.enemyPartRows[part.id];
      if (!row) continue;
      row.dropText.setText(part.destroyed ? "파괴됨" : "");
      const hovered = !overCard && pointerX !== undefined && pointerY !== undefined && this.isPointInsidePartRow(pointerX, pointerY, part.id);
      const available = canRoute && !part.destroyed;
      if (!available) {
        row.bg.setStrokeStyle(u(0.7), part.destroyed ? 0x666666 : 0x8f6a34, part.destroyed ? 0.35 : 0.45);
        if (hovered) row.dropText.setText(part.destroyed ? "파괴됨" : "드롭 불가");
        continue;
      }
      row.bg.setStrokeStyle(u(hovered ? 1.7 : 1), hovered ? 0x82ffe6 : 0xffd572, hovered ? 1 : 0.72);
      if (hovered) {
        row.dropText.setText(this.getRoutedDamagePreview(source));
      }
    }
  }

  private clearPartDropHighlights() {
    this.refreshEnemyPartPanel();
  }

  private getHandSlotAt(x: number, y: number, source?: TarotCardState) {
    return (
      this.handObjs.find((slot) => slot.card !== source && this.isPointInsideSlot(x, y, slot)) ?? null
    );
  }

  private getEnemyPartAt(x: number, y: number) {
    return (
      this.enemy.parts.find((part) => this.isPointInsidePartRow(x, y, part.id)) ?? null
    );
  }

  private isPointInsidePartRow(x: number, y: number, partId: PartId) {
    const row = this.enemyPartRows[partId];
    if (!row || !this.enemyPartPanel) return false;
    const cx = this.enemyPartPanel.x + row.container.x;
    const cy = this.enemyPartPanel.y + row.container.y;
    return x >= cx - row.w / 2 && x <= cx + row.w / 2 && y >= cy - row.h / 2 && y <= cy + row.h / 2;
  }

  private cardHasRoutableAttack(card: TarotCardState) {
    return CARDS[card.cardId].effects.some((effect) => effect.kind === "attack" || effect.kind === "drain");
  }

  private isCardDraggable(card: TarotCardState) {
    return CARDS[card.cardId].role !== "charge";
  }

  private getRoutableAttackAmount(card: TarotCardState) {
    return CARDS[card.cardId].effects.reduce((sum, effect) => {
      if (effect.kind === "attack" || effect.kind === "drain") return sum + effect.amount;
      return sum;
    }, 0);
  }

  private getRoutedDamagePreview(card: TarotCardState) {
    const shoes = this.getActiveEnemyPartByAbility("autoParryFirstHitPerTurn");
    if (shoes && this.enemy.partRuntime.shoesNegateFirstHit) return "데미지 0 (신발 무효)";
    let amount = this.getRoutableAttackAmount(card);
    const cape = this.getActiveEnemyPartByAbility("damageReductionPercent");
    if (cape && cape.ability.kind === "damageReductionPercent") {
      amount = Math.max(0, Math.round(amount * (1 - cape.ability.value)));
    }
    return `데미지 ${amount}`;
  }

  private handleDraggedCardDrop(card: TarotCardState, pointerX: number, pointerY: number) {
    const cardSlot = this.getHandSlotAt(pointerX, pointerY, card);
    if (cardSlot) {
      return this.tryMergeDraggedCard(card, pointerX, pointerY);
    }

    const targetPart = this.getEnemyPartAt(pointerX, pointerY);
    if (targetPart) {
      if (!this.cardHasRoutableAttack(card) || targetPart.destroyed) {
        const sourceSlot = this.handObjs.find((slot) => slot.card === card);
        if (sourceSlot) this.playBlockedMergeEffect(sourceSlot);
        this.flashLog(targetPart.destroyed ? "파괴된 파츠에는 드롭할 수 없습니다" : "공격 효과가 있는 카드만 타겟팅할 수 있습니다");
        return false;
      }
      return this.playCardOnEnemyPart(card, targetPart.id);
    }

    return false;
  }

  private playCardOnEnemyPart(card: TarotCardState, partId: PartId) {
    if (!this.hand.includes(card) || this.busy || this.finished) return false;
    const played = this.playCardGroup([card], partId);
    if (played) this.playPartTargetingEffect(partId);
    return played;
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
    const color = this.getCardEffectColor(CARDS[slot.card.cardId]);
    const ring = this.trackEffect(
      this.scene.add
        .rectangle(slot.container.x, slot.container.y, slot.cardW + u(22), slot.cardH + u(22), 0xffffff, 0)
        .setStrokeStyle(u(5), color, 0.95)
        .setDepth(820)
    );
    const bloom = this.trackEffect(
      this.scene.add
        .circle(slot.container.x, slot.container.y, u(34), color, 0.3)
        .setDepth(819)
    );
    this.overlay?.add(ring);
    this.overlay?.add(bloom);
    for (let i = 0; i < 16; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.Between(u(34), u(96));
      const spark = this.trackEffect(
        this.scene.add
          .circle(slot.container.x, slot.container.y, Phaser.Math.Between(u(2), u(5)), i % 3 === 0 ? 0xffffff : color, 0.9)
          .setDepth(821)
      );
      this.overlay?.add(spark);
      this.scene.tweens.add({
        targets: spark,
        x: slot.container.x + Math.cos(angle) * dist,
        y: slot.container.y + Math.sin(angle) * dist,
        scale: 0.2,
        alpha: 0,
        duration: Phaser.Math.Between(260, 460),
        ease: "Cubic.easeOut",
        onComplete: () => {
          if (spark.scene) spark.destroy();
        },
      });
    }
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
    this.scene.tweens.add({
      targets: bloom,
      scaleX: 2.2,
      scaleY: 2.2,
      alpha: 0,
      duration: 360,
      ease: "Cubic.easeOut",
      onComplete: () => {
        if (bloom.scene) bloom.destroy();
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
      targets: slot.container,
      x: { from: slot.container.x - u(5), to: slot.container.x + u(5) },
      yoyo: true,
      repeat: 2,
      duration: 45,
      ease: "Sine.easeInOut",
      onComplete: () => {
        if (slot.container.scene) slot.container.x = slot.baseX;
      },
    });
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

  private playInvalidDropReturn(slot: HandCard) {
    const flash = this.trackEffect(
      this.scene.add
        .rectangle(slot.container.x, slot.container.y, slot.cardW + u(14), slot.cardH + u(14), 0xffffff, 0)
        .setStrokeStyle(u(3), 0xff4d5f, 0.9)
        .setDepth(822)
    );
    this.overlay?.add(flash);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 220,
      ease: "Quad.easeOut",
      onComplete: () => {
        if (flash.scene) flash.destroy();
      },
    });
  }

  private playCardUseTrail(cards: TarotCardState[], routedAttackPartId?: PartId) {
    const first = cards[0];
    if (!first || !this.overlay) return;
    const slot = this.handObjs.find((handSlot) => handSlot.card === first);
    if (!slot) return;
    const def = CARDS[first.cardId];
    const color = this.getCardEffectColor(def);
    const target = this.getCardUseTrailTarget(def, routedAttackPartId);
    const ghost = this.trackEffect(
      this.scene.add
        .container(slot.container.x, slot.container.y)
        .setDepth(835)
        .setScale(cards.length > 1 || first.isTemporary ? 1.05 : 0.96)
    );
    const body = this.scene.add
      .rectangle(0, 0, slot.cardW * 0.72, slot.cardH * 0.72, def.color, first.isTemporary ? 0.72 : 0.52)
      .setStrokeStyle(u(first.isTemporary ? 3 : 2), color, first.isTemporary ? 1 : 0.76);
    const label = this.scene.add
      .text(0, 0, def.roleLabel, {
        fontFamily: "serif",
        fontSize: px(first.isTemporary ? 11 : 9),
        color: "#fff7df",
        fontStyle: "bold",
        stroke: "#120912",
        strokeThickness: u(1),
      })
      .setOrigin(0.5);
    ghost.add([body, label]);
    this.overlay.add(ghost);

    const trail = this.trackEffect(this.scene.add.graphics().setDepth(834));
    trail.lineStyle(u(first.isTemporary ? 4 : 2), color, first.isTemporary ? 0.76 : 0.42);
    trail.beginPath();
    trail.moveTo(slot.container.x, slot.container.y);
    trail.lineTo((slot.container.x + target.x) / 2, Math.min(slot.container.y, target.y) - u(54));
    trail.lineTo(target.x, target.y);
    trail.strokePath();
    this.overlay.add(trail);

    this.scene.tweens.add({
      targets: ghost,
      x: target.x,
      y: target.y,
      scaleX: 0.34,
      scaleY: 0.34,
      alpha: 0,
      duration: 200,
      ease: "Cubic.easeIn",
      onComplete: () => {
        if (ghost.scene) ghost.destroy();
        this.playCardUseImpact(target.x, target.y, color, first.isTemporary || cards.length > 1);
      },
    });
    this.scene.tweens.add({
      targets: trail,
      alpha: 0,
      duration: 240,
      ease: "Quad.easeOut",
      onComplete: () => {
        if (trail.scene) trail.destroy();
      },
    });
  }

  private getCardUseTrailTarget(def: CardDef, routedAttackPartId?: PartId) {
    if (routedAttackPartId && this.enemyPartRows[routedAttackPartId] && this.enemyPartPanel) {
      const row = this.enemyPartRows[routedAttackPartId]!;
      return { x: this.enemyPartPanel.x + row.container.x, y: this.enemyPartPanel.y + row.container.y };
    }
    const { width, height } = this.scene.scale;
    const attacks = def.effects.some((effect) => effect.kind === "attack" || effect.kind === "drain" || effect.kind === "partDamage");
    const supports = def.effects.some((effect) => effect.kind === "block" || effect.kind === "heal" || effect.kind === "energy" || effect.kind === "applyCharge");
    if (attacks || def.role === "poison" || def.role === "attack" || def.role === "parry") {
      return { x: width / 2, y: Math.max(u(190), height * 0.38) };
    }
    if (supports || def.role === "defense" || def.role === "heal" || def.role === "charge") {
      return { x: width * 0.38, y: height - u(280) };
    }
    return { x: width / 2, y: height * 0.5 };
  }

  private playCardUseImpact(x: number, y: number, color: number, strong: boolean) {
    const impact = this.trackEffect(
      this.scene.add
        .circle(x, y, u(strong ? 28 : 18), color, strong ? 0.34 : 0.22)
        .setStrokeStyle(u(strong ? 4 : 2), 0xffffff, strong ? 0.72 : 0.42)
        .setDepth(836)
    );
    this.overlay?.add(impact);
    this.scene.tweens.add({
      targets: impact,
      alpha: 0,
      scaleX: strong ? 2.1 : 1.55,
      scaleY: strong ? 2.1 : 1.55,
      duration: strong ? 360 : 260,
      ease: "Cubic.easeOut",
      onComplete: () => {
        if (impact.scene) impact.destroy();
      },
    });
  }

  private getCardEffectColor(def: CardDef) {
    if (def.id.includes("poison") || def.role === "poison") return 0x8cff66;
    if (def.id.includes("drain") || def.id.includes("lifesteal") || def.role === "heal") return 0xff5e7a;
    if (def.id.includes("counter") || def.id.includes("parry") || def.role === "parry") return 0x82ffe6;
    if (def.role === "defense") return 0x7bd8ff;
    if (def.id.includes("smash") || def.role === "attack") return 0xffd572;
    return def.color;
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

  private applyPoisonToEnemy(amount: number) {
    const applied = Math.max(0, Math.round(amount));
    if (applied <= 0) return 0;
    this.enemy.poisonStacks = Math.min(POISON_STACK_CAP, this.enemy.poisonStacks + applied);
    return applied;
  }

  private applyChargeToPlayer(amount: number) {
    const applied = Math.max(0, Math.round(amount));
    if (applied <= 0) return 0;
    this.player.chargeStacks = Math.min(CHARGE_STACK_CAP, this.player.chargeStacks + applied);
    this.playChargeTextPulse();
    return applied;
  }

  private applyChargeBoostToAttackAmount(baseAmount: number) {
    const charge = this.player.chargeStacks;
    if (charge <= 0) return baseAmount;
    const boosted = baseAmount + charge * 3;
    this.player.chargeStacks = 0;
    this.playChargeConsumeEffect(charge);
    return boosted;
  }

  private processPoisonTick() {
    if (this.enemy.poisonStacks <= 0) return false;
    const damage = this.enemy.poisonStacks;
    this.applyDirectDamage(this.enemy, damage);
    this.enemy.poisonStacks = Math.max(0, this.enemy.poisonStacks - 1);
    this.playPoisonEffect(damage);
    this.flashLog(`독 ${damage}`);
    return this.enemy.hp <= 0;
  }

  private createPlayerDamageContext(routedAttackPartId?: PartId): PlayerDamageContext {
    return { shoesChecked: false, prevented: false, routedAttackPartId };
  }

  private applyPlayerDamageToEnemy(raw: number, context?: PlayerDamageContext) {
    if (context?.routedAttackPartId) {
      return this.applyPlayerPartDamage(context.routedAttackPartId, raw, context);
    }
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

  private applyEnemyPartEarlyTurnStartPassives() {
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
        case "damageReductionPercent":
        case "autoParryFirstHitPerTurn":
        case "berserkBelowHpRatio":
          break;
      }
    }
  }

  private applyEnemyPartLateTurnStartPassives() {
    for (const part of this.enemy.parts) {
      if (part.destroyed) continue;
      switch (part.ability.kind) {
        case "periodicStrongAttack":
          this.enemy.partRuntime.skirtTurnCounter += 1;
          if (this.enemy.partRuntime.skirtTurnCounter >= part.ability.intervalTurns) {
            this.enemy.partRuntime.skirtTurnCounter = 0;
            this.enemy.partRuntime.strongAttackNext = true;
            this.highlightEnemyPart(part.id);
          }
          break;
        case "shieldOnTurnStart":
        case "healOnTurnStart":
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
    if (this.player.poisonAutoParryNextAttack) {
      this.player.poisonAutoParryNextAttack.turnsLeft -= 1;
      if (this.player.poisonAutoParryNextAttack.turnsLeft <= 0) {
        this.player.poisonAutoParryNextAttack = null;
        expired.push("독칼날");
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

    const x = width * 0.72;
    const y = height * 0.13;
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
      bubbleH / 2 + u(12)
    );
    bg.lineStyle(u(2), 0xd4a656, 0.9);
    bg.lineBetween(-u(58), bubbleH / 2 - u(8), -u(70), bubbleH / 2 + u(12));
    bg.lineBetween(-u(70), bubbleH / 2 + u(12), -u(24), bubbleH / 2 - u(8));

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

  private rollDiceAfterHit(
    baseDamage: number,
    onComplete?: () => void,
    runId = this.battleRunId,
    visualStyle: AttackVisualStyle = "normal"
  ) {
    const { width, height } = this.scene.scale;
    this.playAttackEffect("enemy", baseDamage, visualStyle);
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
    DiceRoller.roll(this.scene, this.overlay, width / 2, height - u(320), (roll) => {
      if (!this.isCurrentRun(runId) || settled) return;
      fallback.remove(false);
      try {
      if (roll.critical) {
        const criticalDamage = Math.max(4, Math.round(baseDamage * 0.85));
        this.applyDirectDamage(this.enemy, criticalDamage);
        this.playAttackEffect("enemy", criticalDamage, visualStyle);
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
    this.refreshEnergyOrbs();
    this.refreshIntent();
    this.refreshStatus();
    this.refreshEnergyOrbs();
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

  private refreshEnergyOrbs() {
    const selectedCost = this.selectedCards.reduce((sum, c) => sum + CARDS[c.cardId].cost, 0);
    this.energyText.setText(selectedCost > 0 ? `선택 ${selectedCost}` : "");
    this.playerChargeText?.setText(this.player.chargeStacks > 0 ? `충전: ${this.player.chargeStacks}` : "");
    this.playerEnergyOrbs.forEach((orb, idx) => {
      const active = idx < this.energy;
      if (this.playerEnergyOrbStates[idx] === active) {
        orb.setFillStyle(active ? 0x43e5c8 : 0x5a5a64, active ? 0.96 : 0.48);
        orb.setAlpha(active ? 1 : 0.55);
        return;
      }
      this.playerEnergyOrbStates[idx] = active;
      orb.setFillStyle(active ? 0x43e5c8 : 0x5a5a64, active ? 0.96 : 0.48);
      this.scene.tweens.killTweensOf(orb);
      this.scene.tweens.add({
        targets: orb,
        scaleX: active ? { from: 0.55, to: 1 } : { from: 1, to: 0.62 },
        scaleY: active ? { from: 0.55, to: 1 } : { from: 1, to: 0.62 },
        alpha: active ? { from: 0.55, to: 1 } : { from: 1, to: 0.55 },
        duration: 160,
        ease: active ? "Back.Out" : "Quad.easeOut",
      });
    });
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
    if (this.player.autoParryNextAttack || this.player.poisonAutoParryNextAttack) {
      labels.push(this.player.poisonAutoParryNextAttack && !this.player.autoParryNextAttack ? "독칼날" : "자동 패링");
    }
    else if (this.player.dodgeNextAttack || this.player.dodgeFirstAttackOfNextEnemyTurn) labels.push("회피");
    return labels.length > 0 ? ` (${labels.join(" · ")})` : "";
  }

  private hasEnemyAttackPrevention() {
    return (
      this.player.autoParryNextAttack !== null ||
      this.player.poisonAutoParryNextAttack !== null ||
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

    this.enemyPoisonText?.setText(this.enemy.poisonStacks > 0 ? `독 ${this.enemy.poisonStacks}` : "");

    const playerParts: string[] = [];
    if (this.player.burn) playerParts.push(`화상 ${this.player.burn.dmg} × ${this.player.burn.turns}턴`);
    if (this.player.weaken) playerParts.push(`약화 -${this.player.weaken.amount}`);
    if (this.player.reflectNextAttack) {
      playerParts.push(`반격 ${Math.round(this.player.reflectNextAttack.ratio * 100)}%`);
    }
    if (this.player.autoParryNextAttack) playerParts.push("자동 패링");
    if (this.player.poisonAutoParryNextAttack) playerParts.push("독칼날");
    if (this.player.dodgeNextAttack) playerParts.push("완전회피");
    if (this.player.dodgeFirstAttackOfNextEnemyTurn) playerParts.push("신속회피");
    this.playerStatusText.setText(playerParts.join("  ·  "));

    const selectedCost = this.selectedCards.reduce((sum, c) => sum + CARDS[c.cardId].cost, 0);
    this.energyText.setText(selectedCost > 0 ? `선택 ${selectedCost}` : "");
    this.turnText.setText(`턴 ${this.turn} / ${MAX_TURNS}`);
    this.deckCountText.setText(`덱 ${this.deck.length} · 버림 ${this.discard.length}`);
  }

  private drawEnemyPartPanel(width: number, height: number) {
    void width;
    this.enemyPartPanel?.destroy();
    this.enemyPartTooltip?.destroy();
    this.enemyPartTooltip = null;
    this.activeTooltipPartId = null;
    this.enemyPartTooltipPinned = false;
    this.enemyPartRows = {};
    const panelW = u(176);
    const rowH = u(40);
    const x = panelW / 2 + u(12);
    const y = Math.min(height - u(462), u(292));
    const panel = this.scene.add.container(x, y).setDepth(610);
    const bg = this.scene.add
      .rectangle(0, 0, panelW, rowH * this.enemy.parts.length + u(40), 0x07070d, 0.56)
      .setStrokeStyle(u(1), 0xd4a656, 0.55);
    const title = this.scene.add
      .text(0, -rowH * this.enemy.parts.length * 0.5 - u(3), "파츠 능력", {
        fontFamily: "serif",
        fontSize: px(9),
        color: "#f3e6c9",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.enemyPoisonText = this.scene.add
      .text(0, -rowH * this.enemy.parts.length * 0.5 + u(10), "", {
        fontFamily: "serif",
        fontSize: px(9),
        color: "#9df06a",
        fontStyle: "bold",
        stroke: "#102812",
        strokeThickness: u(1),
      })
      .setOrigin(0.5);
    panel.add([bg, title, this.enemyPoisonText]);

    this.enemy.parts.forEach((part, idx) => {
      const rowY = -rowH * (this.enemy.parts.length - 1) * 0.5 + idx * rowH + u(12);
      const row = this.scene.add.container(0, rowY);
      const rowBg = this.scene.add
        .rectangle(0, 0, panelW - u(12), u(34), 0x1b1420, 0.66)
        .setStrokeStyle(u(0.7), 0x8f6a34, 0.45);
      rowBg.setInteractive({ useHandCursor: true });
      rowBg.on("pointerover", () => {
        if (!this.dragStart) this.showEnemyPartTooltip(part.id, false);
      });
      rowBg.on("pointerout", () => {
        if (!this.enemyPartTooltipPinned && this.activeTooltipPartId === part.id) this.hideEnemyPartTooltip();
      });
      rowBg.on("pointerdown", () => {
        if (this.dragStart) return;
        if (this.activeTooltipPartId === part.id) this.hideEnemyPartTooltip();
        else this.showEnemyPartTooltip(part.id, true);
      });
      const marker = this.scene.add.rectangle(-panelW / 2 + u(12), 0, u(4), u(25), this.getPartAccentColor(part), 0.96);
      const name = this.scene.add
        .text(-panelW / 2 + u(22), -u(7), part.displayName, {
          fontFamily: "serif",
          fontSize: px(10),
          color: "#f3e6c9",
          fontStyle: "bold",
        })
        .setOrigin(0, 0.5);
      const hpText = this.scene.add
        .text(panelW / 2 - u(10), -u(8), `${part.hp}/${part.maxHp}`, {
          fontFamily: "serif",
          fontSize: px(7.8),
          color: "#9ad0ff",
          fontStyle: "bold",
        })
        .setOrigin(1, 0.5);
      const hpBg = this.scene.add.rectangle(panelW / 2 - u(47), u(8), u(72), u(7), 0x271620, 0.9);
      const hpFill = this.scene.add
        .rectangle(panelW / 2 - u(83), u(8), u(72), u(6), 0x9ad0ff, 0.95)
        .setOrigin(0, 0.5);
      const dropText = this.scene.add
        .text(-panelW / 2 + u(22), u(10), part.destroyed ? "파괴됨" : "", {
          fontFamily: "serif",
          fontSize: px(7),
          color: "#ffd572",
          fontStyle: "bold",
        })
        .setOrigin(0, 0.5);
      row.add([rowBg, marker, name, hpText, hpBg, hpFill, dropText]);
      panel.add(row);
      this.enemyPartRows[part.id] = { container: row, bg: rowBg, hpFill, hpText, dropText, w: panelW - u(12), h: u(40) };
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
      const hpRatio = Phaser.Math.Clamp(part.hp / Math.max(1, part.maxHp), 0, 1);
      row.hpFill.width = u(72) * hpRatio;
      row.dropText.setText(part.destroyed ? "파괴됨" : "");
      row.bg.setFillStyle(part.destroyed ? 0x2a2222 : 0x1b1420, part.destroyed ? 0.36 : 0.62);
      const hpColor = hpRatio > 0.62 ? 0x58d68d : hpRatio > 0.32 ? 0xffd572 : 0xff5e7a;
      row.hpFill.setFillStyle(part.destroyed ? 0x777777 : hpColor, part.destroyed ? 0.5 : 0.95);
    }
  }

  private showEnemyPartTooltip(partId: PartId, pinned: boolean) {
    if (!this.enemyPartPanel) return;
    const part = this.getEnemyPart(partId);
    const row = this.enemyPartRows[partId];
    if (!part || !row) return;
    this.enemyPartTooltip?.destroy();
    this.activeTooltipPartId = partId;
    this.enemyPartTooltipPinned = pinned;

    const panelW = u(176);
    const tooltipW = u(178);
    const tooltipH = u(62);
    const x = this.enemyPartPanel.x + panelW / 2 + tooltipW / 2 + u(10);
    const y = this.enemyPartPanel.y + row.container.y;
    const tip = this.scene.add.container(x, y).setDepth(835);
    const bg = this.scene.add
      .rectangle(0, 0, tooltipW, tooltipH, 0x120b17, 0.88)
      .setStrokeStyle(u(1), this.getPartAccentColor(part), 0.86);
    const title = this.scene.add
      .text(-tooltipW / 2 + u(10), -u(12), part.displayName, {
        fontFamily: "serif",
        fontSize: px(8.5),
        color: "#f3e6c9",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    const body = this.scene.add
      .text(-tooltipW / 2 + u(10), u(12), part.destroyed ? "파괴됨" : this.getPartTooltipText(part), {
        fontFamily: "serif",
        fontSize: px(7.6),
        color: part.destroyed ? "#999999" : "#ffd572",
        fontStyle: "bold",
        wordWrap: { width: tooltipW - u(20) },
      })
      .setOrigin(0, 0.5);
    tip.add([bg, title, body]);
    tip.setAlpha(0).setScale(0.96);
    this.overlay?.add(tip);
    this.enemyPartTooltip = tip;
    this.scene.tweens.add({
      targets: tip,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 130,
      ease: "Quad.easeOut",
    });
  }

  private hideEnemyPartTooltip() {
    const tip = this.enemyPartTooltip;
    this.enemyPartTooltip = null;
    this.activeTooltipPartId = null;
    this.enemyPartTooltipPinned = false;
    if (!tip) return;
    this.scene.tweens.killTweensOf(tip);
    this.scene.tweens.add({
      targets: tip,
      alpha: 0,
      duration: 110,
      ease: "Quad.easeOut",
      onComplete: () => {
        if (tip.scene) tip.destroy();
      },
    });
  }

  private getPartTooltipText(part: EnemyRuntimePart) {
    const base = this.getPartAbilityText(part);
    const state = this.getPartDynamicStatusText(part);
    return state ? `${base} (${state})` : `${base} (활성)`;
  }

  private getPartDynamicStatusText(part: EnemyRuntimePart) {
    if (part.destroyed) return "파괴됨";
    if (part.ability.kind === "periodicStrongAttack") {
      if (this.enemy.partRuntime.strongAttackNext) return "다음 공격 강공";
      const left = Math.max(1, part.ability.intervalTurns - this.enemy.partRuntime.skirtTurnCounter);
      return `다음 강공까지 ${left}턴`;
    }
    if (part.ability.kind === "autoParryFirstHitPerTurn" && this.enemy.partRuntime.shoesNegateFirstHit) {
      return "이번 턴 활성";
    }
    return "활성";
  }

  private getPartAbilityText(part: EnemyRuntimePart) {
    switch (part.ability.kind) {
      case "shieldOnTurnStart":
        return `보호막 +${part.ability.value}/턴`;
      case "damageReductionPercent":
        return `받는 데미지 -${Math.round(part.ability.value * 100)}%`;
      case "healOnTurnStart":
        return `매 턴 HP +${part.ability.value}`;
      case "periodicStrongAttack":
        return `${part.ability.intervalTurns}턴마다 강공 x${part.ability.value}`;
      case "autoParryFirstHitPerTurn":
        return "첫 공격 무효/턴";
      case "berserkBelowHpRatio":
        return `HP ${Math.round(part.ability.threshold * 100)}% 이하 광폭화`;
    }
  }

  private getPartAccentColor(part: EnemyRuntimePart) {
    switch (part.id) {
      case "circlet":
        return 0xffd572;
      case "cape":
        return 0xe06b4f;
      case "sweater":
        return 0x9ad0ff;
      case "skirt":
        return 0xd78cff;
      case "shoes":
        return 0x82ffe6;
      case "underwear":
        return 0xff8fb3;
    }
  }

  private refreshHandRender() {
    this.clearCardPreview();

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
    if (temporary) {
      container.setAlpha(0).setScale(0.9);
      this.scene.tweens.add({
        targets: container,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: 220,
        ease: "Back.easeOut",
      });
      this.scene.tweens.add({
        targets: tempGlow,
        alpha: { from: 1, to: 0.55 },
        yoyo: true,
        repeat: -1,
        duration: 760,
        ease: "Sine.easeInOut",
      });
    }
    this.overlay?.add(container);

    bg.on("pointerover", () => {
      if (this.busy || this.finished) return;
      this.startCardPreviewTimer(card, x, y);
      this.highlightMergeTarget(card);
      this.scene.tweens.killTweensOf(container);
      this.scene.tweens.add({
        targets: container,
        y: selected ? y - u(24) : y - u(10),
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 100,
        ease: "Quad.easeOut",
      });
      tempGlow.setAlpha(temporary ? 0.95 : 0.38);
    });
    bg.on("pointerout", () => {
      this.clearCardPreview();
      dropGlow.setAlpha(0);
      this.scene.tweens.killTweensOf(container);
      this.scene.tweens.add({
        targets: container,
        y: selected ? y - u(18) : y,
        scaleX: 1,
        scaleY: 1,
        alpha: 1,
        duration: 120,
        ease: "Quad.easeOut",
      });
      tempGlow.setAlpha(temporary ? 0.8 : 0);
    });
    bg.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.clearCardPreview();
      this.blockedDragCardUid = null;
      this.dragStart = { x: pointer.x, y: pointer.y, card };
      this.startCardPreviewTimer(card, pointer.x, pointer.y);
      container.setDepth(800);
      this.scene.tweens.killTweensOf(container);
      this.scene.tweens.add({
        targets: container,
        scaleX: 1.1,
        scaleY: 1.1,
        alpha: 0.9,
        duration: 90,
        ease: "Quad.easeOut",
      });
      tempGlow.setAlpha(temporary ? 1 : 0.55);
    });
    bg.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragStart || this.dragStart.card !== card) return;
      const moved = Math.abs(pointer.x - this.dragStart.x) + Math.abs(pointer.y - this.dragStart.y);
      if (moved > u(5)) this.clearCardPreview();
      if (moved <= u(12)) return;
      if (!this.isCardDraggable(card)) {
        this.blockedDragCardUid = card.uid;
        this.dragStart = null;
        this.playInvalidDropReturn(slot);
        this.flashLog("충전 카드는 클릭으로 사용하세요");
        this.scene.tweens.add({
          targets: container,
          x,
          y: selected ? y - u(18) : y,
          scaleX: 1,
          scaleY: 1,
          alpha: 1,
          duration: 180,
          ease: "Quad.easeOut",
        });
        return;
      }
      container.setPosition(pointer.x, pointer.y);
      this.highlightMergeTarget(card, pointer.x, pointer.y);
      this.highlightPartDropTargets(card, pointer.x, pointer.y);
    });
    bg.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (this.blockedDragCardUid === card.uid) {
        this.blockedDragCardUid = null;
        this.dragStart = null;
        return;
      }
      if (this.cardPreviewPointer?.cardUid === card.uid && this.cardPreviewPointer.shown) {
        this.clearCardPreview();
        this.dragStart = null;
        this.clearMergeHighlights();
        this.clearPartDropHighlights();
        this.scene.tweens.add({
          targets: container,
          x,
          y: selected ? y - u(18) : y,
          scaleX: 1,
          scaleY: 1,
          alpha: 1,
          duration: 140,
          ease: "Quad.easeOut",
        });
        tempGlow.setAlpha(temporary ? 0.8 : 0);
        return;
      }
      this.cancelCardPreviewTimer();
      const moved =
        this.dragStart && this.dragStart.card === card
          ? Math.abs(pointer.x - this.dragStart.x) + Math.abs(pointer.y - this.dragStart.y)
          : 0;
      if (moved > u(24)) {
        const handled = this.handleDraggedCardDrop(card, pointer.x, pointer.y);
        if (!handled) {
          this.playInvalidDropReturn(slot);
          this.scene.tweens.add({
            targets: container,
            x,
            y: selected ? y - u(18) : y,
            scaleX: 1,
            scaleY: 1,
            alpha: 1,
            duration: 250,
            ease: "Quad.easeOut",
          });
          tempGlow.setAlpha(temporary ? 0.8 : 0);
        }
        this.clearMergeHighlights();
        this.clearPartDropHighlights();
        this.dragStart = null;
        return;
      }
      this.dragStart = null;
      this.clearPartDropHighlights();
      const idx = this.handObjs.findIndex((o) => o === slot);
      if (idx >= 0) this.tryPlayCard(idx);
    });
    // If the user releases the pointer outside the card (especially on
    // touch devices), `pointerup` won't fire on this object. Phaser fires
    // `pointerupoutside` instead — without this, dragStart can stay set
    // and the container stays at the elevated depth, leaving the hand
    // visually stuck after the first interaction.
    bg.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => {
      this.clearCardPreview();
      if (this.blockedDragCardUid === card.uid) {
        this.blockedDragCardUid = null;
        this.dragStart = null;
        return;
      }
      if (this.dragStart && this.dragStart.card === card) {
        const handled = this.handleDraggedCardDrop(card, pointer.x, pointer.y);
        this.dragStart = null;
        if (handled) {
          this.clearMergeHighlights();
          this.clearPartDropHighlights();
          return;
        }
      }
      this.clearMergeHighlights();
      this.clearPartDropHighlights();
      this.playInvalidDropReturn(slot);
      this.scene.tweens.add({
        targets: container,
        x,
        y: selected ? y - u(18) : y,
        scaleX: 1,
        scaleY: 1,
        alpha: 1,
        duration: 250,
        ease: "Quad.easeOut",
      });
      tempGlow.setAlpha(temporary ? 0.8 : 0);
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

  private startCardPreviewTimer(card: TarotCardState, x: number, y: number) {
    if (this.busy || this.finished) return;
    this.cancelCardPreviewTimer();
    this.cardPreviewPointer = { cardUid: card.uid, x, y, shown: false };
    this.cardPreviewTimer = this.scene.time.delayedCall(500, () => {
      if (!this.cardPreviewPointer || this.cardPreviewPointer.cardUid !== card.uid) return;
      this.cardPreviewPointer.shown = true;
      this.showCardPreview(card);
    });
  }

  private cancelCardPreviewTimer() {
    this.cardPreviewTimer?.remove(false);
    this.cardPreviewTimer = null;
    if (this.cardPreviewPointer && !this.cardPreviewPointer.shown) {
      this.cardPreviewPointer = null;
    }
  }

  private clearCardPreview() {
    this.cardPreviewTimer?.remove(false);
    this.cardPreviewTimer = null;
    this.cardPreviewPointer = null;
    if (!this.cardPreview) return;
    this.scene.tweens.killTweensOf(this.cardPreview);
    this.cardPreview.destroy();
    this.cardPreview = null;
  }

  private showCardPreview(card: TarotCardState) {
    this.cardPreview?.destroy();
    const def = CARDS[card.cardId];
    const { width, height } = this.scene.scale;
    const previewW = Math.min(u(270), width * 0.74);
    const previewH = Math.min(u(360), height * 0.58);
    const x = width / 2;
    const y = height * 0.43;
    const temporary = card.isTemporary === true;
    const effectSummary = this.getCardEffectSummary(def);
    const preview = this.scene.add.container(x, y).setDepth(950);
    const bg = this.scene.add
      .rectangle(0, 0, previewW, previewH, temporary ? 0x10262b : 0x17101e, 0.94)
      .setStrokeStyle(u(2), temporary ? 0x82ffe6 : 0xffd572, 0.95);
    const glow = this.scene.add
      .rectangle(0, 0, previewW + u(12), previewH + u(12), 0xffffff, 0)
      .setStrokeStyle(u(3), temporary ? 0x82ffe6 : 0xffd572, 0.38);
    const header = this.scene.add.rectangle(0, -previewH / 2 + u(32), previewW - u(18), u(48), temporary ? 0x166d79 : def.color, 0.92);
    const cost = this.scene.add
      .circle(-previewW / 2 + u(28), -previewH / 2 + u(32), u(16), 0x120b17, 0.98)
      .setStrokeStyle(u(1.2), 0xffd572, 0.95);
    const costText = this.scene.add
      .text(cost.x, cost.y, String(def.cost), {
        fontFamily: "serif",
        fontSize: px(13),
        color: "#ffd572",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const title = this.scene.add
      .text(0, -previewH / 2 + u(31), def.roleLabel, {
        fontFamily: "serif",
        fontSize: px(19),
        color: "#fdf3d4",
        fontStyle: "bold",
        stroke: "#1a0f22",
        strokeThickness: u(1.5),
      })
      .setOrigin(0.5);
    const badge = this.scene.add
      .text(previewW / 2 - u(34), -previewH / 2 + u(32), temporary ? "임시" : `C${def.cost}`, {
        fontFamily: "serif",
        fontSize: px(10),
        color: "#fdf3d4",
        fontStyle: "bold",
        stroke: "#1a0f22",
        strokeThickness: u(1),
      })
      .setOrigin(0.5);
    const name = this.scene.add
      .text(0, -previewH / 2 + u(82), def.name, {
        fontFamily: "serif",
        fontSize: px(16),
        color: "#ffe9b0",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const stat = this.scene.add
      .text(0, -previewH / 2 + u(112), `전투력 ${card.power}  |  Lv.${card.level}`, {
        fontFamily: "serif",
        fontSize: px(10.5),
        color: "#d8ecff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const descBox = this.scene.add
      .rectangle(0, u(8), previewW - u(34), previewH - u(168), 0xfff6df, 0.92)
      .setStrokeStyle(u(1), temporary ? 0x82ffe6 : 0xa5793e, 0.75);
    const desc = this.scene.add
      .text(0, -u(22), def.description, {
        fontFamily: "serif",
        fontSize: px(12),
        color: "#2d231f",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: previewW - u(52) },
      })
      .setOrigin(0.5);
    const effects = this.scene.add
      .text(0, u(58), effectSummary, {
        fontFamily: "serif",
        fontSize: px(10.4),
        color: "#4b3325",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: previewW - u(52) },
      })
      .setOrigin(0.5);
    const hint = this.scene.add
      .text(0, previewH / 2 - u(24), "손을 떼면 미리보기 닫기", {
        fontFamily: "serif",
        fontSize: px(8.5),
        color: "#d6c5a1",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    preview.add([glow, bg, header, cost, costText, title, badge, name, stat, descBox, desc, effects, hint]);
    preview.setScale(0.92).setAlpha(0);
    this.overlay?.add(preview);
    this.cardPreview = preview;
    this.scene.tweens.add({
      targets: preview,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 150,
      ease: "Back.easeOut",
    });
  }

  private getCardEffectSummary(def: CardDef) {
    const parts = def.effects.map((effect) => {
      switch (effect.kind) {
        case "attack":
          return `데미지 ${effect.amount}`;
        case "block":
          return `보호막 +${effect.amount}`;
        case "heal":
          return `HP +${effect.amount}`;
        case "energy":
          return `기력 +${effect.amount}`;
        case "applyCharge":
          return `충전 +${effect.amount}`;
        case "applyPoison":
          return `독 +${effect.amount}`;
        case "drain":
          return `흡혈 ${effect.amount}`;
        case "partBonusAttack":
          return `${effect.label} +${effect.amount}`;
        case "partDamage":
          return `${this.getPartDisplayName(effect.partId)} 피해 ${effect.amount}`;
        case "reflectNextAttack":
          return effect.poisonOnTrigger
            ? `보호막 피격 시 반사 ${Math.round(effect.ratio * 100)}% + 독 ${effect.poisonOnTrigger}`
            : `다음 공격 반사 ${Math.round(effect.ratio * 100)}%`;
        case "weakenNextAttack":
          return `적 다음 공격 약화 ${Math.round(effect.ratio * 100)}%`;
        case "autoParryNextAttack":
          return `자동 패링 + 반격 ${effect.counterDamage}`;
        case "poisonAutoParryNextAttack":
          return `독칼날 반격 ${effect.counterDamage} + 독 ${effect.poisonOnTrigger}`;
        case "dodgeFirstAttackOfNextEnemyTurn":
          return "다음 적 턴 첫 공격 회피";
        case "dodgeNextAttack":
          return "다음 공격 완전 회피";
        case "parry":
          return `패링 반격 ${effect.amount}`;
      }
    });
    return parts.length > 0 ? parts.join("  |  ") : "특수 효과 없음";
  }

  private getPartDisplayName(partId: PartId) {
    return this.enemy.parts.find((part) => part.id === partId)?.displayName ?? partId;
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

  private playTurnAnnouncement() {
    if (!this.overlay || this.finished) return;
    const { width, height } = this.scene.scale;
    // Top enemy HP/intent lives around y 95-125, so this sits below it.
    const y = Math.max(u(158), height * 0.17);
    const text = this.trackEffect(
      this.scene.add
        .text(width / 2, y, `${this.turn}턴`, {
          fontFamily: "serif",
          fontSize: `${Math.round(width * 0.12)}px`,
          color: "#fff3b0",
          fontStyle: "bold",
          stroke: "#3b1b08",
          strokeThickness: u(4),
          shadow: {
            offsetX: 0,
            offsetY: u(4),
            color: "#000000",
            blur: u(10),
            fill: true,
          },
        })
        .setOrigin(0.5)
        .setAlpha(0)
        .setScale(0.78)
        .setDepth(900)
    );
    this.overlay.add(text);
    this.scene.tweens.add({
      targets: text,
      alpha: { from: 0, to: 1 },
      scale: { from: 0.78, to: 1.08 },
      y: y - u(8),
      duration: 260,
      ease: "Back.Out",
      yoyo: true,
      hold: 850,
      onComplete: () => {
        if (!text.scene) return;
        this.scene.tweens.add({
          targets: text,
          alpha: 0,
          y: text.y - u(16),
          duration: 360,
          ease: "Cubic.easeIn",
          onComplete: () => {
            if (text.scene) text.destroy();
          },
        });
      },
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
    row.dropText.setText("파괴됨");
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

  private playPartTargetingEffect(partId: PartId) {
    const row = this.enemyPartRows[partId];
    if (!row || !this.enemyPartPanel) return;
    const targetX = this.enemyPartPanel.x + row.container.x;
    const targetY = this.enemyPartPanel.y + row.container.y;
    const { width, height } = this.scene.scale;
    const beam = this.trackEffect(this.scene.add.graphics().setDepth(824));
    beam.lineStyle(u(3), 0x82ffe6, 0.9);
    beam.beginPath();
    beam.moveTo(width / 2, height - u(150));
    beam.lineTo(targetX, targetY);
    beam.strokePath();
    this.overlay?.add(beam);
    this.scene.tweens.add({
      targets: beam,
      alpha: 0,
      duration: 320,
      ease: "Cubic.easeOut",
      onComplete: () => {
        if (beam.scene) beam.destroy();
      },
    });
    this.highlightEnemyPart(partId);
  }

  private playPoisonEffect(amount: number) {
    const { width } = this.scene.scale;
    const x = width / 2 + u(52);
    const y = u(190);
    const cloud = this.trackEffect(this.scene.add.circle(x, y, u(30), 0x8a4cff, 0.26).setDepth(721));
    this.overlay?.add(cloud);
    this.playFloatingNumber(x, y + u(18), `독 -${amount}`, amount, "poison");
    this.scene.tweens.add({
      targets: cloud,
      alpha: 0,
      scaleX: 1.8,
      scaleY: 1.8,
      duration: 540,
      ease: "Cubic.easeOut",
      onComplete: () => {
        if (cloud.scene) cloud.destroy();
      },
    });
  }

  private playChargeTextPulse() {
    if (!this.playerChargeText) return;
    this.scene.tweens.killTweensOf(this.playerChargeText);
    this.playerChargeText.setAlpha(1).setScale(1);
    this.scene.tweens.add({
      targets: this.playerChargeText,
      scaleX: { from: 1.28, to: 1 },
      scaleY: { from: 1.28, to: 1 },
      duration: 220,
      ease: "Back.Out",
    });
  }

  private playChargeConsumeEffect(charge: number) {
    if (!this.playerChargeText) return;
    const { x, y } = this.playerChargeText;
    const flash = this.trackEffect(
      this.scene.add
        .text(x, y - u(18), `충전 +${charge * 3}`, {
          fontFamily: "serif",
          fontSize: px(13),
          color: "#ffd572",
          fontStyle: "bold",
          stroke: "#2a1605",
          strokeThickness: u(2),
        })
        .setOrigin(0, 0.5)
        .setDepth(724)
    );
    this.overlay?.add(flash);
    this.scene.tweens.add({
      targets: flash,
      y: flash.y - u(20),
      alpha: 0,
      duration: 560,
      ease: "Cubic.easeOut",
      onComplete: () => {
        if (flash.scene) flash.destroy();
      },
    });
    this.scene.tweens.killTweensOf(this.playerChargeText);
    this.scene.tweens.add({
      targets: this.playerChargeText,
      alpha: { from: 1, to: 0.25 },
      scaleX: { from: 1.18, to: 0.85 },
      scaleY: { from: 1.18, to: 0.85 },
      duration: 220,
      yoyo: true,
      onComplete: () => {
        this.playerChargeText?.setAlpha(1).setScale(1);
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

  private playImpactShake(amount: number, target: "enemy" | "player") {
    if (amount <= 0) return;
    let duration = 80;
    let intensity = 0.0018;
    if (amount >= 16) {
      duration = target === "player" ? 280 : 240;
      intensity = target === "player" ? 0.007 : 0.006;
    } else if (amount >= 6) {
      duration = target === "player" ? 190 : 170;
      intensity = target === "player" ? 0.0042 : 0.0038;
    }
    this.scene.cameras.main.shake(duration, intensity);
  }

  private playFloatingNumber(
    x: number,
    y: number,
    textValue: string,
    amount: number,
    kind: "damage" | "poison" | "heal" = "damage"
  ) {
    const bigHit = amount >= 16;
    const color = kind === "heal" ? "#7dff9a" : kind === "poison" ? "#b86cff" : bigHit ? "#ff5e5e" : "#ffffff";
    const stroke = kind === "heal" ? "#0b3d1c" : kind === "poison" ? "#2d0f42" : bigHit ? "#6d0c0c" : "#5a1018";
    const damage = this.trackEffect(
      this.scene.add
        .text(x + Phaser.Math.Between(-u(18), u(18)), y - u(54), textValue, {
          fontFamily: "serif",
          fontSize: px(bigHit ? 30 : 21),
          color,
          fontStyle: "bold",
          stroke,
          strokeThickness: u(bigHit ? 3 : 2),
          shadow: {
            offsetX: 0,
            offsetY: u(3),
            color: "#000000",
            blur: u(5),
            fill: true,
          },
        })
        .setOrigin(0.5)
        .setAngle(Phaser.Math.Between(-7, 7))
        .setScale(0.55)
        .setDepth(722)
    );
    this.overlay?.add(damage);
    this.scene.tweens.add({
      targets: damage,
      scaleX: bigHit ? 1.24 : 1.08,
      scaleY: bigHit ? 1.24 : 1.08,
      duration: 200,
      ease: "Back.easeOut",
      onComplete: () => {
        if (!damage.scene) return;
        this.scene.tweens.add({
          targets: damage,
          y: damage.y - u(44),
          scaleX: bigHit ? 1.05 : 0.92,
          scaleY: bigHit ? 1.05 : 0.92,
          alpha: 0,
          duration: 400,
          delay: 300,
          ease: "Cubic.easeOut",
          onComplete: () => {
            if (damage.scene) damage.destroy();
          },
        });
      },
    });
  }

  private playAttackEffect(target: "enemy" | "player", amount = 0, style: AttackVisualStyle = "normal") {
    const { width, height } = this.scene.scale;
    const y = target === "enemy" ? Math.max(u(190), height * 0.38) : height - u(280);
    const x = width / 2;
    const color = target === "enemy" ? this.getAttackEffectColor(style) : 0xffd572;
    const strong = amount >= 16 || style !== "normal";
    const lineWidth = style === "normal" ? u(8) : u(14);
    this.playImpactShake(amount, target);

    const slash = this.trackEffect(this.scene.add.graphics().setDepth(720));
    slash.lineStyle(lineWidth, color, 0.95);
    slash.beginPath();
    slash.moveTo(x - u(strong ? 190 : 150), y - u(strong ? 66 : 52));
    slash.lineTo(x + u(strong ? 190 : 150), y + u(strong ? 66 : 52));
    slash.strokePath();
    slash.lineStyle(style === "normal" ? u(3) : u(5), 0xffffff, 0.9);
    slash.beginPath();
    slash.moveTo(x - u(strong ? 146 : 112), y - u(strong ? 46 : 34));
    slash.lineTo(x + u(strong ? 146 : 112), y + u(strong ? 46 : 34));
    slash.strokePath();
    this.overlay?.add(slash);

    const flash = this.trackEffect(this.scene.add.ellipse(x, y, u(210), u(300), 0xffffff, strong ? 0.24 : 0.14).setDepth(719));
    const burst = this.trackEffect(this.scene.add.circle(x, y, u(strong ? 34 : 18), color, strong ? 0.5 : 0.35).setDepth(721));
    const shock = this.trackEffect(
      this.scene.add
        .circle(x, y, u(strong ? 52 : 28), 0xffffff, 0)
        .setStrokeStyle(u(strong ? 5 : 3), color, strong ? 0.95 : 0.65)
        .setDepth(721)
    );
    this.overlay?.add([flash, shock]);
    this.overlay?.add(burst);
    if (amount > 0) {
      this.playFloatingNumber(x, y, `-${amount}`, amount, style === "poison" ? "poison" : "damage");
    }

    if (style === "drain") this.playReturnLightEffect(0xff5e7a);
    if (style === "poison") this.playPoisonBurstTrail(x, y);

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
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 150,
      ease: "Quad.easeOut",
      onComplete: () => {
        if (flash.scene) flash.destroy();
      },
    });
    this.scene.tweens.add({
      targets: shock,
      alpha: 0,
      scaleX: 1.45,
      scaleY: 1.45,
      duration: 360,
      ease: "Cubic.easeOut",
      onComplete: () => {
        if (shock.scene) shock.destroy();
      },
    });
  }

  private getAttackEffectColor(style: AttackVisualStyle) {
    switch (style) {
      case "smash":
        return 0xffd572;
      case "drain":
        return 0xff5e7a;
      case "poison":
        return 0x8cff66;
      case "counter":
        return 0x82ffe6;
      case "normal":
        return 0xff5e7a;
    }
  }

  private playReturnLightEffect(color: number) {
    const { width, height } = this.scene.scale;
    const beam = this.trackEffect(this.scene.add.graphics().setDepth(723));
    beam.lineStyle(u(4), color, 0.78);
    beam.beginPath();
    beam.moveTo(width / 2, Math.max(u(190), height * 0.38));
    beam.lineTo(width * 0.38, height - u(280));
    beam.strokePath();
    this.overlay?.add(beam);
    this.scene.tweens.add({
      targets: beam,
      alpha: 0,
      duration: 520,
      ease: "Cubic.easeOut",
      onComplete: () => {
        if (beam.scene) beam.destroy();
      },
    });
  }

  private playPoisonBurstTrail(x: number, y: number) {
    const haze = this.trackEffect(this.scene.add.circle(x + u(24), y + u(8), u(40), 0x5abf4a, 0.18).setDepth(720));
    this.overlay?.add(haze);
    this.scene.tweens.add({
      targets: haze,
      alpha: 0,
      scaleX: 1.8,
      scaleY: 1.5,
      duration: 520,
      ease: "Cubic.easeOut",
      onComplete: () => {
        if (haze.scene) haze.destroy();
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
