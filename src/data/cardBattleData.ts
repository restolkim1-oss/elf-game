export type CardRarity = "common" | "rare" | "epic" | "legendary";
export type CardElement = "fire" | "water" | "wind" | "light" | "dark";
export type TargetSide = "enemy" | "self";
export type SkillTiming = "active" | "passive";

export type SkillEffect =
  | { type: "damage"; power: number; target: TargetSide }
  | { type: "heal"; power: number; target: TargetSide }
  | { type: "shield"; power: number; target: TargetSide }
  | { type: "buff"; stat: "attack" | "defense"; power: number; turns: number; target: TargetSide }
  | { type: "debuff"; stat: "attack" | "defense"; power: number; turns: number; target: TargetSide };

export interface CardSkillDefinition {
  id: string;
  name: string;
  timing: SkillTiming;
  description: string;
  effects: SkillEffect[];
}

export interface BattleCardDefinition {
  id: string;
  name: string;
  rarity: CardRarity;
  element: CardElement;
  tags: string[];
  cost: number;
  level: number;
  attack: number;
  hp: number;
  defense: number;
  criticalChance: number;
  skill: CardSkillDefinition;
}

export interface EnemyPatternStep {
  id: string;
  type: "attack" | "skill" | "guard";
  power: number;
  message: string;
}

export interface EnemyDefinition {
  id: string;
  name: string;
  element: CardElement;
  maxHp: number;
  attack: number;
  defense: number;
  criticalChance: number;
  enrageAtHpRatio: number;
  pattern: EnemyPatternStep[];
  enragePattern: EnemyPatternStep[];
}

export interface CardSynergyDefinition {
  id: string;
  name: string;
  requiredTags?: string[];
  requiredElements?: CardElement[];
  minCards: number;
  effects: SkillEffect[];
}

export const SKILLS: Record<string, CardSkillDefinition> = {
  royalSlash: {
    id: "royalSlash",
    name: "로열 슬래시",
    timing: "active",
    description: "단일 대상에게 기본 피해를 줍니다.",
    effects: [{ type: "damage", power: 1, target: "enemy" }],
  },
  aegisOath: {
    id: "aegisOath",
    name: "이지스 서약",
    timing: "active",
    description: "피해를 주고 자신에게 보호막을 부여합니다.",
    effects: [
      { type: "damage", power: 0.55, target: "enemy" },
      { type: "shield", power: 0.9, target: "self" },
    ],
  },
  healerGrace: {
    id: "healerGrace",
    name: "힐러의 은총",
    timing: "active",
    description: "아군 HP를 회복하고 약한 피해를 줍니다.",
    effects: [
      { type: "heal", power: 1.1, target: "self" },
      { type: "damage", power: 0.35, target: "enemy" },
    ],
  },
  stormBrand: {
    id: "stormBrand",
    name: "폭풍의 각인",
    timing: "active",
    description: "강한 피해를 주고 적 공격력을 낮춥니다.",
    effects: [
      { type: "damage", power: 1.25, target: "enemy" },
      { type: "debuff", stat: "attack", power: 4, turns: 2, target: "enemy" },
    ],
  },
  tacticalFocus: {
    id: "tacticalFocus",
    name: "전술 집중",
    timing: "passive",
    description: "사용 시 다음 공격을 위해 공격력을 올립니다.",
    effects: [{ type: "buff", stat: "attack", power: 5, turns: 2, target: "self" }],
  },
};

export const CARD_LIBRARY: Record<string, BattleCardDefinition> = {
  ellie: {
    id: "ellie",
    name: "엘리",
    rarity: "rare",
    element: "light",
    tags: ["arthur", "balanced", "knight"],
    cost: 2,
    level: 1,
    attack: 18,
    hp: 32,
    defense: 6,
    criticalChance: 0.12,
    skill: SKILLS.royalSlash,
  },
  nanthas: {
    id: "nanthas",
    name: "나느사스",
    rarity: "epic",
    element: "fire",
    tags: ["arthur", "attacker", "knight"],
    cost: 3,
    level: 2,
    attack: 28,
    hp: 36,
    defense: 5,
    criticalChance: 0.16,
    skill: SKILLS.stormBrand,
  },
  aria: {
    id: "aria",
    name: "아리아",
    rarity: "rare",
    element: "water",
    tags: ["guardian", "defender", "knight"],
    cost: 2,
    level: 1,
    attack: 12,
    hp: 44,
    defense: 14,
    criticalChance: 0.08,
    skill: SKILLS.aegisOath,
  },
  lumia: {
    id: "lumia",
    name: "루미아",
    rarity: "common",
    element: "light",
    tags: ["healer", "support", "knight"],
    cost: 1,
    level: 1,
    attack: 9,
    hp: 30,
    defense: 7,
    criticalChance: 0.06,
    skill: SKILLS.healerGrace,
  },
  mir: {
    id: "mir",
    name: "미르",
    rarity: "legendary",
    element: "wind",
    tags: ["tactician", "support", "arthur"],
    cost: 3,
    level: 3,
    attack: 24,
    hp: 38,
    defense: 8,
    criticalChance: 0.2,
    skill: SKILLS.tacticalFocus,
  },
};

export const CARD_SYNERGIES: CardSynergyDefinition[] = [
  {
    id: "arthur_line",
    name: "아서 라인",
    requiredTags: ["arthur"],
    minCards: 2,
    effects: [{ type: "buff", stat: "attack", power: 6, turns: 2, target: "self" }],
  },
  {
    id: "holy_support",
    name: "성광 지원",
    requiredElements: ["light"],
    minCards: 2,
    effects: [
      { type: "heal", power: 0.45, target: "self" },
      { type: "shield", power: 0.55, target: "self" },
    ],
  },
  {
    id: "knight_wall",
    name: "기사단 방진",
    requiredTags: ["knight"],
    minCards: 3,
    effects: [{ type: "buff", stat: "defense", power: 8, turns: 2, target: "self" }],
  },
];

export const DEFAULT_DECK = ["ellie", "nanthas", "aria", "lumia", "mir"];

export const TRAINING_ENEMY: EnemyDefinition = {
  id: "training_wraith",
  name: "훈련용 망령",
  element: "dark",
  maxHp: 120,
  attack: 16,
  defense: 4,
  criticalChance: 0.08,
  enrageAtHpRatio: 0.35,
  pattern: [
    { id: "claw", type: "attack", power: 1, message: "망령이 할퀴기를 준비합니다." },
    { id: "guard", type: "guard", power: 0.7, message: "망령이 자세를 낮춥니다." },
    { id: "drain", type: "skill", power: 1.25, message: "망령이 기력을 흡수합니다." },
  ],
  enragePattern: [
    { id: "rage_claw", type: "attack", power: 1.35, message: "분노한 망령이 돌진합니다." },
    { id: "rage_drain", type: "skill", power: 1.55, message: "망령의 어둠이 폭주합니다." },
  ],
};
