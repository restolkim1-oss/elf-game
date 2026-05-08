export type FusionRole = "attack" | "defense" | "heal" | "parry";

export type FusionEffect =
  | { kind: "attack"; amount: number }
  | { kind: "partBonusAttack"; amount: number; partIds: string[]; label: string }
  | { kind: "drain"; amount: number }
  | { kind: "block"; amount: number }
  | { kind: "heal"; amount: number }
  | { kind: "energy"; amount: number };

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
        { kind: "partBonusAttack", amount: 6, partIds: ["circlet"], label: "머리 추가 피해" },
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
];

export function findFusionRecipe(a: FusionRole, b: FusionRole) {
  const key = rolePairKey(a, b);
  return CARD_FUSION_RECIPES.find((recipe) => rolePairKey(recipe.roles[0], recipe.roles[1]) === key) ?? null;
}
