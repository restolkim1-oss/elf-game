import type { PartId } from "./enemyParts";

export type FusionRole = "attack" | "defense" | "heal" | "parry" | "poison" | "charge";

export type FusionEffect =
  | { kind: "attack"; amount: number }
  | { kind: "partBonusAttack"; amount: number; partIds: string[]; label: string }
  | { kind: "partDamage"; partId: PartId; amount: number }
  | { kind: "drain"; amount: number }
  | { kind: "block"; amount: number }
  | { kind: "heal"; amount: number }
  | { kind: "energy"; amount: number }
  | { kind: "applyPoison"; amount: number }
  | { kind: "reflectNextAttack"; ratio: number }
  | { kind: "weakenNextAttack"; ratio: number; maxTurns: number }
  | { kind: "autoParryNextAttack"; counterDamage: number; maxTurns: number }
  | { kind: "dodgeFirstAttackOfNextEnemyTurn"; maxTurns: number }
  | { kind: "dodgeNextAttack"; maxTurns: number };

export interface FusionResultCard {
  id: `temp_${string}`;
  name: string;
  role: FusionRole;
  cost: number;
  color: number;
  description: string;
  effects: FusionEffect[];
}

export interface CardFusionRecipe {
  id: string;
  roles: readonly [FusionRole, FusionRole];
  result: FusionResultCard;
}

const rolePairKey = (a: FusionRole, b: FusionRole) =>
  [a, b].sort().join("+") as `${FusionRole}+${FusionRole}`;

export const CARD_FUSION_RECIPES: CardFusionRecipe[] = [
  {
    id: "attack_attack_smash",
    roles: ["attack", "attack"],
    result: {
      id: "temp_smash",
      name: "강타",
      role: "attack",
      cost: 2,
      color: 0xd04a38,
      description: "큰 데미지\n서클릿 추가 피해",
      effects: [
        { kind: "attack", amount: 14 },
        { kind: "partDamage", partId: "circlet", amount: 14 },
      ],
    },
  },
  {
    id: "attack_defense_counter",
    roles: ["attack", "defense"],
    result: {
      id: "temp_counter",
      name: "반격",
      role: "attack",
      cost: 2,
      color: 0xd49a38,
      description: "피해 + 다음 공격\n50% 반사",
      effects: [
        { kind: "attack", amount: 8 },
        { kind: "reflectNextAttack", ratio: 0.5 },
      ],
    },
  },
  {
    id: "attack_parry_disarm",
    roles: ["attack", "parry"],
    result: {
      id: "temp_disarm",
      name: "무장해제",
      role: "attack",
      cost: 2,
      color: 0x7560d8,
      description: "피해 + 다음 공격\n50% 약화",
      effects: [
        { kind: "attack", amount: 14 },
        { kind: "partDamage", partId: "shoes", amount: 13 },
        { kind: "weakenNextAttack", ratio: 0.5, maxTurns: 2 },
      ],
    },
  },
  {
    id: "attack_heal_lifesteal",
    roles: ["attack", "heal"],
    result: {
      id: "temp_lifesteal",
      name: "흡혈",
      role: "attack",
      cost: 2,
      color: 0xb83268,
      description: "피해를 주고\n그만큼 회복",
      effects: [{ kind: "drain", amount: 9 }],
    },
  },
  {
    id: "poison_poison_strong_poison",
    roles: ["poison", "poison"],
    result: {
      id: "temp_strong_poison",
      name: "맹독",
      role: "poison",
      cost: 2,
      color: 0x54b848,
      description: "적에게 독 스택 +7",
      effects: [{ kind: "applyPoison", amount: 7 }],
    },
  },
  {
    id: "attack_poison_poison_arrow",
    roles: ["attack", "poison"],
    result: {
      id: "temp_poison_arrow",
      name: "독화살",
      role: "attack",
      cost: 2,
      color: 0x78c83b,
      description: "데미지 5 + 독 스택 +3",
      effects: [
        { kind: "attack", amount: 5 },
        { kind: "applyPoison", amount: 3 },
      ],
    },
  },
  {
    id: "heal_poison_drain_poison",
    roles: ["heal", "poison"],
    result: {
      id: "temp_drain_poison",
      name: "흡독",
      role: "poison",
      cost: 2,
      color: 0x6fc06a,
      description: "독 스택 +4\nHP +5",
      effects: [
        { kind: "applyPoison", amount: 4 },
        { kind: "heal", amount: 5 },
      ],
    },
  },
  {
    id: "defense_defense_fortify",
    roles: ["defense", "defense"],
    result: {
      id: "temp_fortify",
      name: "강화방어",
      role: "defense",
      cost: 2,
      color: 0x3b67d7,
      description: "큰 보호막 생성",
      effects: [{ kind: "block", amount: 18 }],
    },
  },
  {
    id: "defense_heal_regen_barrier",
    roles: ["defense", "heal"],
    result: {
      id: "temp_regen_barrier",
      name: "재생보호막",
      role: "defense",
      cost: 2,
      color: 0x3aa88f,
      description: "보호막 + 즉시 회복",
      effects: [
        { kind: "block", amount: 11 },
        { kind: "heal", amount: 4 },
      ],
    },
  },
  {
    id: "defense_parry_counter_stance",
    roles: ["defense", "parry"],
    result: {
      id: "temp_counter_stance",
      name: "카운터스탠스",
      role: "defense",
      cost: 2,
      color: 0x2f9cc7,
      description: "보호막 + 다음 공격\n자동 패링",
      effects: [
        { kind: "block", amount: 10 },
        { kind: "autoParryNextAttack", counterDamage: 8, maxTurns: 2 },
      ],
    },
  },
  {
    id: "heal_heal_awaken",
    roles: ["heal", "heal"],
    result: {
      id: "temp_awaken",
      name: "각성",
      role: "heal",
      cost: 2,
      color: 0x62c85c,
      description: "큰 회복\n기력 +2",
      effects: [
        { kind: "heal", amount: 14 },
        { kind: "energy", amount: 2 },
      ],
    },
  },
  {
    id: "heal_parry_swift_dodge",
    roles: ["heal", "parry"],
    result: {
      id: "temp_swift_dodge",
      name: "신속회피",
      role: "heal",
      cost: 2,
      color: 0x63d8c8,
      description: "회복 + 다음 첫 공격\n1회 회피",
      effects: [
        { kind: "heal", amount: 6 },
        { kind: "dodgeFirstAttackOfNextEnemyTurn", maxTurns: 2 },
      ],
    },
  },
  {
    id: "parry_parry_perfect_dodge",
    roles: ["parry", "parry"],
    result: {
      id: "temp_perfect_dodge",
      name: "완전회피",
      role: "parry",
      cost: 2,
      color: 0x7bd8ff,
      description: "다음 공격 1회\n완전 무효",
      effects: [{ kind: "dodgeNextAttack", maxTurns: 2 }],
    },
  },
];

export function findFusionRecipe(a: FusionRole, b: FusionRole) {
  const key = rolePairKey(a, b);
  return CARD_FUSION_RECIPES.find((recipe) => rolePairKey(recipe.roles[0], recipe.roles[1]) === key) ?? null;
}
