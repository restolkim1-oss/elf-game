import type {
  BattleCardDefinition,
  CardElement,
  CardSynergyDefinition,
  EnemyDefinition,
  EnemyPatternStep,
  SkillEffect,
} from "../data/cardBattleData";
import { CARD_SYNERGIES } from "../data/cardBattleData";

export type BattlePhase = "draw" | "player" | "resolve" | "enemy" | "won" | "lost";
export type TargetId = "enemy" | "player";

export interface BattleConfig {
  maxDeckSize: number;
  startingHandSize: number;
  drawPerTurn: number;
  maxCostPerTurn: number;
  criticalMultiplier: number;
}

export interface RuntimeCard {
  instanceId: string;
  definition: BattleCardDefinition;
  currentHp: number;
  exhausted: boolean;
}

export interface CombatantState {
  id: TargetId;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  shield: number;
  criticalChance: number;
  buffs: TimedModifier[];
  debuffs: TimedModifier[];
}

export interface TimedModifier {
  stat: "attack" | "defense";
  amount: number;
  turns: number;
  stacks: number;
  maxStacks: number;
  sourceId: string;
}

export interface BattleLogEntry {
  turn: number;
  text: string;
}

export type VisualEventType =
  | "turn:start"
  | "card:start"
  | "card:impact"
  | "card:end"
  | "chain:start"
  | "chain:hit"
  | "chain:end"
  | "damage"
  | "heal"
  | "shield"
  | "status"
  | "enemy:decision"
  | "enemy:start"
  | "enemy:impact"
  | "enemy:end"
  | "battle:end";

export interface VisualBattleEvent {
  id: string;
  at: number;
  type: VisualEventType;
  sourceId?: string;
  targetId?: TargetId;
  value?: number;
  text?: string;
  meta?: Record<string, string | number | boolean>;
}

export interface BattleSnapshot {
  phase: BattlePhase;
  turn: number;
  costRemaining: number;
  player: CombatantState;
  enemy: CombatantState;
  deckCount: number;
  discardCount: number;
  hand: RuntimeCard[];
  selected: RuntimeCard[];
  activeCombos: string[];
  activeSynergies: string[];
  visualEvents: VisualBattleEvent[];
  enemyIntent: EnemyPatternStep;
  log: BattleLogEntry[];
}

export const DEFAULT_BATTLE_CONFIG: BattleConfig = {
  maxDeckSize: 10,
  startingHandSize: 5,
  drawPerTurn: 2,
  maxCostPerTurn: 5,
  criticalMultiplier: 1.5,
};

const ELEMENT_ADVANTAGE: Partial<Record<CardElement, CardElement>> = {
  fire: "wind",
  wind: "water",
  water: "fire",
  light: "dark",
  dark: "light",
};

export class Deck {
  private drawPile: RuntimeCard[];
  private discardPile: RuntimeCard[] = [];

  constructor(cards: BattleCardDefinition[], private readonly rng: () => number = Math.random) {
    this.drawPile = this.shuffle(cards.map((definition, index) => ({
      instanceId: `${definition.id}_${index}_${Date.now()}`,
      definition,
      currentHp: definition.hp,
      exhausted: false,
    })));
  }

  get deckCount() {
    return this.drawPile.length;
  }

  get discardCount() {
    return this.discardPile.length;
  }

  draw(count: number): RuntimeCard[] {
    const drawn: RuntimeCard[] = [];
    for (let i = 0; i < count; i++) {
      if (this.drawPile.length === 0) this.reshuffleDiscard();
      const next = this.drawPile.pop();
      if (!next) break;
      next.exhausted = false;
      drawn.push(next);
    }
    return drawn;
  }

  discard(cards: RuntimeCard[]) {
    this.discardPile.push(...cards);
  }

  private reshuffleDiscard() {
    if (this.discardPile.length === 0) return;
    this.drawPile = this.shuffle(this.discardPile);
    this.discardPile = [];
  }

  private shuffle(cards: RuntimeCard[]) {
    const copy = [...cards];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

export class CardBattleEngine {
  private readonly config: BattleConfig;
  private readonly deck: Deck;
  private hand: RuntimeCard[] = [];
  private selected: RuntimeCard[] = [];
  private phase: BattlePhase = "draw";
  private turn = 0;
  private costRemaining = 0;
  private enemyPatternIndex = 0;
  private log: BattleLogEntry[] = [];
  private visualEvents: VisualBattleEvent[] = [];
  private timelineMs = 0;
  private eventSeq = 0;
  private activeCombos: string[] = [];
  private activeSynergies: string[] = [];
  private lastPlayerThreat = 0;
  private player: CombatantState;
  private enemy: CombatantState;

  constructor(
    cards: BattleCardDefinition[],
    enemy: EnemyDefinition,
    config: Partial<BattleConfig> = {},
    private readonly rng: () => number = Math.random,
    private readonly synergies: CardSynergyDefinition[] = CARD_SYNERGIES
  ) {
    this.config = { ...DEFAULT_BATTLE_CONFIG, ...config };
    const deckCards = cards.slice(0, this.config.maxDeckSize);
    this.deck = new Deck(deckCards, rng);
    this.player = this.createPlayerState(deckCards);
    this.enemy = {
      id: "enemy",
      name: enemy.name,
      hp: enemy.maxHp,
      maxHp: enemy.maxHp,
      attack: enemy.attack,
      defense: enemy.defense,
      shield: 0,
      criticalChance: enemy.criticalChance,
      buffs: [],
      debuffs: [],
    };
    this.enemyDefinition = enemy;
  }

  private readonly enemyDefinition: EnemyDefinition;

  startBattle() {
    this.turn = 0;
    this.log = [];
    this.visualEvents = [];
    this.timelineMs = 0;
    this.eventSeq = 0;
    this.startPlayerTurn(this.config.startingHandSize);
    return this.snapshot();
  }

  selectCard(instanceId: string) {
    if (this.phase !== "player") return false;
    const card = this.hand.find((c) => c.instanceId === instanceId);
    if (!card || card.exhausted) return false;
    if (card.definition.cost > this.costRemaining) return false;
    card.exhausted = true;
    this.costRemaining -= card.definition.cost;
    this.selected.push(card);
    this.pushLog(`${card.definition.name} 선택, 코스트 ${card.definition.cost} 사용`);
    return true;
  }

  unselectCard(instanceId: string) {
    if (this.phase !== "player") return false;
    const index = this.selected.findIndex((c) => c.instanceId === instanceId);
    if (index < 0) return false;
    const [card] = this.selected.splice(index, 1);
    card.exhausted = false;
    this.costRemaining += card.definition.cost;
    this.pushLog(`${card.definition.name} 선택 취소`);
    return true;
  }

  resolvePlayerTurn() {
    if (this.phase !== "player") return this.snapshot();
    this.phase = "resolve";
    this.activeCombos = this.detectCombos(this.selected);
    this.activeSynergies = this.applySynergies(this.selected);
    this.lastPlayerThreat = this.estimateCardThreat(this.selected);
    const chainGroups = this.detectChainGroups(this.selected);
    const chainCardIds = new Set(chainGroups.flatMap((group) => group.cards.map((card) => card.instanceId)));
    for (const group of chainGroups) {
      this.queueEvent("chain:start", 120, {
        sourceId: group.key,
        text: `${group.label} Chain`,
        value: group.cards.length,
      });
    }
    for (const card of this.selected) {
      this.resolveCard(card, chainCardIds.has(card.instanceId) ? 1.2 : 1);
      if (chainCardIds.has(card.instanceId)) {
        this.queueEvent("chain:hit", 120, {
          sourceId: card.instanceId,
          targetId: "enemy",
          value: 20,
          text: "Chain Attack",
        });
      }
      if (this.enemy.hp <= 0) {
        this.phase = "won";
        this.pushLog("전투 승리");
        this.queueEvent("battle:end", 300, { targetId: "enemy", text: "Victory" });
        return this.snapshot();
      }
    }
    for (const group of chainGroups) {
      this.queueEvent("chain:end", 120, {
        sourceId: group.key,
        text: `${group.label} Chain End`,
      });
    }
    this.deck.discard(this.selected);
    this.hand = this.hand.filter((card) => !this.selected.includes(card));
    this.selected = [];
    return this.resolveEnemyTurn();
  }

  private resolveEnemyTurn() {
    this.phase = "enemy";
    const intent = this.chooseEnemyAction();
    this.queueEvent("enemy:start", 220, {
      sourceId: intent.id,
      text: intent.message,
      meta: { type: intent.type },
    });
    const attack = this.modifiedStat(this.enemy, "attack");
    if (intent.type === "guard") {
      const shield = Math.max(1, Math.round(attack * intent.power));
      this.enemy.shield += shield;
      this.queueEvent("shield", 160, { sourceId: intent.id, targetId: "enemy", value: shield });
      this.pushLog(`${this.enemy.name}: 보호막 ${shield}`);
    } else if (intent.type === "skill") {
      const raw = Math.max(1, Math.round(attack * intent.power));
      const critical = this.rollCritical(this.enemy.criticalChance + 0.04);
      const damage = this.calculateDamage(raw, this.player, critical);
      this.applyDamage(this.player, damage);
      this.queueEvent("enemy:impact", 220, { sourceId: intent.id, targetId: "player", value: damage });
      this.addStackingModifier(this.player.debuffs, {
        stat: "attack",
        amount: Math.max(2, Math.round(this.enemy.attack * 0.2)),
        turns: 2,
        stacks: 1,
        maxStacks: 3,
        sourceId: `${this.enemyDefinition.id}_skill_pressure`,
      });
      this.pushLog(`${this.enemy.name}: ${critical ? "移섎챸? " : ""}${damage} ?쇳빐 + 怨듦꺽 ?뺥솕`);
    } else {
      const raw = Math.max(1, Math.round(attack * intent.power));
      const critical = this.rollCritical(this.enemy.criticalChance);
      const damage = this.calculateDamage(raw, this.player, critical);
      this.applyDamage(this.player, damage);
      this.queueEvent("enemy:impact", 220, { sourceId: intent.id, targetId: "player", value: damage });
      this.pushLog(`${this.enemy.name}: ${critical ? "치명타 " : ""}${damage} 피해`);
    }
    this.queueEvent("enemy:end", 180, { sourceId: intent.id });
    this.enemyPatternIndex++;
    this.tickModifiers(this.player);
    this.tickModifiers(this.enemy);
    if (this.player.hp <= 0) {
      this.phase = "lost";
      this.pushLog("전투 패배");
      this.queueEvent("battle:end", 300, { targetId: "player", text: "Defeat" });
      return this.snapshot();
    }
    this.startPlayerTurn(this.config.drawPerTurn);
    return this.snapshot();
  }

  private resolveCard(card: RuntimeCard, chainMultiplier = 1) {
    const skill = card.definition.skill;
    const critical = this.rollCritical(card.definition.criticalChance);
    this.queueEvent("card:start", 180, {
      sourceId: card.instanceId,
      text: card.definition.name,
      meta: { skill: skill.id, element: card.definition.element },
    });
    for (const effect of skill.effects) {
      this.queueEvent("card:impact", 220, {
        sourceId: card.instanceId,
        targetId: effect.target === "enemy" ? "enemy" : "player",
        text: skill.name,
      });
      this.applySkillEffect(card, effect, critical, chainMultiplier);
    }
    this.queueEvent("card:end", 160, { sourceId: card.instanceId });
  }

  private applySkillEffect(card: RuntimeCard, effect: SkillEffect, critical: boolean, chainMultiplier = 1) {
    const sourceAttack = card.definition.attack + this.modifiedStat(this.player, "attack") * 0.25;
    if (effect.type === "damage") {
      const raw = Math.max(1, Math.round(
        sourceAttack *
          effect.power *
          chainMultiplier *
          this.comboDamageMultiplier(this.activeCombos) *
          this.elementMultiplier(card.definition.element, this.enemyDefinition.element)
      ));
      const damage = this.calculateDamage(raw, this.enemy, critical);
      this.applyDamage(this.enemy, damage);
      this.queueEvent("damage", 120, {
        sourceId: card.instanceId,
        targetId: "enemy",
        value: damage,
        meta: { critical, chainMultiplier },
      });
      this.pushLog(`${card.definition.name}: ${critical ? "치명타 " : ""}${damage} 피해`);
      return;
    }
    if (effect.type === "heal") {
      const heal = Math.max(1, Math.round(card.definition.hp * effect.power * 0.25));
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
      this.queueEvent("heal", 120, { sourceId: card.instanceId, targetId: "player", value: heal });
      this.pushLog(`${card.definition.name}: HP ${heal} 회복`);
      return;
    }
    if (effect.type === "shield") {
      const shield = Math.max(1, Math.round(card.definition.defense * effect.power));
      this.player.shield += shield;
      this.queueEvent("shield", 120, { sourceId: card.instanceId, targetId: "player", value: shield });
      this.pushLog(`${card.definition.name}: 보호막 ${shield}`);
      return;
    }
    const target = effect.target === "enemy" ? this.enemy : this.player;
    const modifier = {
      stat: effect.stat,
      amount: effect.power,
      turns: effect.turns,
      stacks: 1,
      maxStacks: 5,
      sourceId: `${card.definition.id}_${effect.type}_${effect.stat}`,
    };
    if (effect.type === "buff") this.addStackingModifier(target.buffs, modifier);
    if (effect.type === "debuff") this.addStackingModifier(target.debuffs, modifier);
    this.queueEvent("status", 120, {
      sourceId: card.instanceId,
      targetId: target.id,
      value: effect.power,
      meta: { stat: effect.stat, statusType: effect.type },
    });
    this.pushLog(`${card.definition.name}: ${effect.stat} ${effect.type === "buff" ? "+" : "-"}${effect.power}`);
  }

  private startPlayerTurn(drawCount: number) {
    this.phase = "player";
    this.turn++;
    this.timelineMs = 0;
    this.costRemaining = this.config.maxCostPerTurn;
    this.player.shield = 0;
    this.hand.push(...this.deck.draw(drawCount));
    this.queueEvent("turn:start", 0, { text: `Turn ${this.turn}`, meta: { drawCount } });
    this.pushLog(`${this.turn}턴 시작`);
  }

  private createPlayerState(cards: BattleCardDefinition[]): CombatantState {
    const maxHp = cards.reduce((sum, card) => sum + card.hp, 0);
    const avgAttack = Math.round(cards.reduce((sum, card) => sum + card.attack, 0) / Math.max(1, cards.length));
    const avgDefense = Math.round(cards.reduce((sum, card) => sum + card.defense, 0) / Math.max(1, cards.length));
    return {
      id: "player",
      name: "플레이어",
      hp: maxHp,
      maxHp,
      attack: avgAttack,
      defense: avgDefense,
      shield: 0,
      criticalChance: 0.08,
      buffs: [],
      debuffs: [],
    };
  }

  private getEnemyIntent() {
    const hpRatio = this.enemy.hp / this.enemy.maxHp;
    const pattern = hpRatio <= this.enemyDefinition.enrageAtHpRatio
      ? this.enemyDefinition.enragePattern
      : this.enemyDefinition.pattern;
    return pattern[this.enemyPatternIndex % pattern.length];
  }

  private chooseEnemyAction() {
    const candidates = this.currentEnemyActions();
    let best = candidates[0] ?? this.getEnemyIntent();
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const action of candidates) {
      const score = this.evaluateEnemyAction(action);
      if (score > bestScore) {
        best = action;
        bestScore = score;
      }
    }
    this.pushLog(`AI Decision: ${best.id} (${Math.round(bestScore)})`);
    return best;
  }

  private currentEnemyActions() {
    const hpRatio = this.enemy.hp / this.enemy.maxHp;
    const base = this.enemyDefinition.pattern;
    const enrage = hpRatio <= this.enemyDefinition.enrageAtHpRatio
      ? this.enemyDefinition.enragePattern
      : [];
    return [...base, ...enrage];
  }

  private evaluateEnemyAction(action: EnemyPatternStep) {
    const enemyAttack = this.modifiedStat(this.enemy, "attack");
    const estimatedDamage = action.type === "guard"
      ? 0
      : this.calculateDamage(Math.max(1, Math.round(enemyAttack * action.power)), this.player, false);
    const playerHpRatio = this.player.hp / this.player.maxHp;
    const enemyHpRatio = this.enemy.hp / this.enemy.maxHp;
    const playerBuffThreat = this.modifierThreat(this.player.buffs);
    const playerDebuffWeakness = this.modifierThreat(this.player.debuffs);
    const shieldPressure = Math.max(0, this.player.shield - estimatedDamage) * 0.2;
    const lethalBonus = estimatedDamage >= this.player.hp ? 1000 : 0;
    const lastThreat = this.lastPlayerThreat;

    if (action.type === "attack") {
      return (
        estimatedDamage * 4 +
        lethalBonus +
        (1 - playerHpRatio) * 80 -
        shieldPressure +
        playerDebuffWeakness * 2
      );
    }

    if (action.type === "skill") {
      return (
        estimatedDamage * 3.4 +
        lethalBonus +
        playerBuffThreat * 3.2 +
        lastThreat * 0.9 +
        (1 - playerHpRatio) * 45
      );
    }

    const shieldGain = Math.max(1, Math.round(enemyAttack * action.power));
    return (
      shieldGain * 3 +
      (1 - enemyHpRatio) * 95 +
      lastThreat * 1.2 +
      playerBuffThreat * 1.8 -
      (1 - playerHpRatio) * 30
    );
  }

  private estimateCardThreat(cards: RuntimeCard[]) {
    return cards.reduce((sum, card) => {
      const rarity = this.rarityRank(card.definition.rarity);
      const element = this.elementMultiplier(card.definition.element, this.enemyDefinition.element);
      return sum + card.definition.attack * element + rarity * 4 + card.definition.criticalChance * 20;
    }, 0);
  }

  private modifierThreat(modifiers: TimedModifier[]) {
    return modifiers.reduce((sum, modifier) => sum + modifier.amount * modifier.stacks * modifier.turns, 0);
  }

  private detectCombos(cards: RuntimeCard[]) {
    const combos: string[] = [];
    const sameElementCount = this.largestGroupCount(cards.map((card) => card.definition.element));
    const rarityScore = cards.reduce((score, card) => score + this.rarityRank(card.definition.rarity), 0);
    if (cards.length >= 2 && sameElementCount >= 2) combos.push("element_chain");
    if (cards.length >= 3) combos.push("triple_drive");
    if (rarityScore >= 7) combos.push("high_rarity_burst");
    combos.forEach((combo) => this.pushLog(`Combo: ${combo}`));
    return combos;
  }

  private detectChainGroups(cards: RuntimeCard[]) {
    const groups = new Map<string, RuntimeCard[]>();
    for (const card of cards) {
      const key = card.definition.tags[0] ?? card.definition.element;
      const group = groups.get(key) ?? [];
      group.push(card);
      groups.set(key, group);
    }
    return [...groups.entries()]
      .filter(([, group]) => group.length >= 2)
      .map(([key, group]) => ({
        key,
        label: key,
        cards: group,
      }));
  }

  private applySynergies(cards: RuntimeCard[]) {
    const active: string[] = [];
    for (const synergy of this.synergies) {
      const tagMatches = synergy.requiredTags?.every(
        (tag) => cards.filter((card) => card.definition.tags.includes(tag)).length >= synergy.minCards
      ) ?? true;
      const elementMatches = synergy.requiredElements?.every(
        (element) => cards.filter((card) => card.definition.element === element).length >= synergy.minCards
      ) ?? true;
      if (!tagMatches || !elementMatches) continue;
      active.push(synergy.id);
      this.pushLog(`Synergy: ${synergy.name}`);
      for (const effect of synergy.effects) {
        this.applySyntheticEffect(effect, `synergy_${synergy.id}`);
      }
    }
    return active;
  }

  private applySyntheticEffect(effect: SkillEffect, sourceId: string) {
    const target = effect.target === "enemy" ? this.enemy : this.player;
    if (effect.type === "heal") {
      const heal = Math.max(1, Math.round(this.player.maxHp * effect.power * 0.12));
      target.hp = Math.min(target.maxHp, target.hp + heal);
      return;
    }
    if (effect.type === "shield") {
      target.shield += Math.max(1, Math.round(this.modifiedStat(target, "defense") * effect.power));
      return;
    }
    if (effect.type === "buff" || effect.type === "debuff") {
      const modifier = {
        stat: effect.stat,
        amount: effect.power,
        turns: effect.turns,
        stacks: 1,
        maxStacks: 5,
        sourceId,
      };
      if (effect.type === "buff") this.addStackingModifier(target.buffs, modifier);
      if (effect.type === "debuff") this.addStackingModifier(target.debuffs, modifier);
    }
  }

  private comboDamageMultiplier(combos: string[]) {
    return combos.reduce((multiplier, combo) => {
      if (combo === "element_chain") return multiplier + 0.15;
      if (combo === "triple_drive") return multiplier + 0.2;
      if (combo === "high_rarity_burst") return multiplier + 0.25;
      return multiplier;
    }, 1);
  }

  private elementMultiplier(source: CardElement, target: CardElement) {
    if (ELEMENT_ADVANTAGE[source] === target) return 1.25;
    if (ELEMENT_ADVANTAGE[target] === source) return 0.85;
    return 1;
  }

  private largestGroupCount(values: string[]) {
    const counts = new Map<string, number>();
    values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
    return Math.max(0, ...counts.values());
  }

  private rarityRank(rarity: BattleCardDefinition["rarity"]) {
    if (rarity === "legendary") return 4;
    if (rarity === "epic") return 3;
    if (rarity === "rare") return 2;
    return 1;
  }

  private calculateDamage(raw: number, target: CombatantState, critical: boolean) {
    const critRaw = critical ? Math.round(raw * this.config.criticalMultiplier) : raw;
    const defense = this.modifiedStat(target, "defense");
    return Math.max(1, critRaw - Math.round(defense * 0.4));
  }

  private applyDamage(target: CombatantState, amount: number) {
    const absorbed = Math.min(target.shield, amount);
    target.shield -= absorbed;
    target.hp = Math.max(0, target.hp - (amount - absorbed));
  }

  private modifiedStat(target: CombatantState, stat: "attack" | "defense") {
    const buff = target.buffs.filter((m) => m.stat === stat).reduce((sum, m) => sum + m.amount * m.stacks, 0);
    const debuff = target.debuffs.filter((m) => m.stat === stat).reduce((sum, m) => sum + m.amount * m.stacks, 0);
    return Math.max(0, target[stat] + buff - debuff);
  }

  private addStackingModifier(list: TimedModifier[], modifier: TimedModifier) {
    const existing = list.find(
      (item) => item.sourceId === modifier.sourceId && item.stat === modifier.stat
    );
    if (!existing) {
      list.push({ ...modifier });
      return;
    }
    existing.stacks = Math.min(existing.maxStacks, existing.stacks + modifier.stacks);
    existing.turns = Math.max(existing.turns, modifier.turns);
    existing.amount = Math.max(existing.amount, modifier.amount);
  }

  private tickModifiers(target: CombatantState) {
    target.buffs = target.buffs.map((m) => ({ ...m, turns: m.turns - 1 })).filter((m) => m.turns > 0);
    target.debuffs = target.debuffs.map((m) => ({ ...m, turns: m.turns - 1 })).filter((m) => m.turns > 0);
  }

  private rollCritical(chance: number) {
    return this.rng() < chance;
  }

  private pushLog(text: string) {
    this.log.push({ turn: this.turn, text });
    if (this.log.length > 30) this.log.shift();
  }

  private queueEvent(
    type: VisualEventType,
    delay: number,
    payload: Omit<VisualBattleEvent, "id" | "at" | "type"> = {}
  ) {
    this.timelineMs += delay;
    this.visualEvents.push({
      id: `${this.turn}_${this.eventSeq++}_${type}`,
      at: this.timelineMs,
      type,
      ...payload,
    });
    if (this.visualEvents.length > 120) this.visualEvents.shift();
  }

  snapshot(): BattleSnapshot {
    return {
      phase: this.phase,
      turn: this.turn,
      costRemaining: this.costRemaining,
      player: structuredClone(this.player),
      enemy: structuredClone(this.enemy),
      deckCount: this.deck.deckCount,
      discardCount: this.deck.discardCount,
      hand: [...this.hand],
      selected: [...this.selected],
      activeCombos: [...this.activeCombos],
      activeSynergies: [...this.activeSynergies],
      visualEvents: [...this.visualEvents],
      enemyIntent: this.getEnemyIntent(),
      log: [...this.log],
    };
  }
}
