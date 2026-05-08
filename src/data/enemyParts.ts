export type PartId = "circlet" | "cape" | "sweater" | "skirt" | "shoes" | "underwear";

export type PartAbility =
  | { kind: "shieldOnTurnStart"; value: number }
  | { kind: "damageReductionPercent"; value: number }
  | { kind: "healOnTurnStart"; value: number }
  | { kind: "periodicStrongAttack"; value: number; intervalTurns: number }
  | { kind: "autoParryFirstHitPerTurn" }
  | { kind: "berserkBelowHpRatio"; value: number; threshold: number };

export interface EnemyPart {
  id: PartId;
  displayName: string;
  maxHp: number;
  ability: PartAbility;
}

export type EnemyPartConfigKey = "default";

export const ENEMY_PART_CONFIG: Record<EnemyPartConfigKey, EnemyPart[]> = {
  default: [
    {
      id: "circlet",
      displayName: "서클릿",
      maxHp: 30,
      ability: { kind: "shieldOnTurnStart", value: 2 },
    },
    {
      id: "cape",
      displayName: "케이프",
      maxHp: 30,
      ability: { kind: "damageReductionPercent", value: 0.25 },
    },
    {
      id: "sweater",
      displayName: "스웨터",
      maxHp: 30,
      ability: { kind: "healOnTurnStart", value: 2 },
    },
    {
      id: "skirt",
      displayName: "스커트",
      maxHp: 30,
      ability: { kind: "periodicStrongAttack", value: 1.5, intervalTurns: 3 },
    },
    {
      id: "shoes",
      displayName: "신발",
      maxHp: 30,
      ability: { kind: "autoParryFirstHitPerTurn" },
    },
    {
      id: "underwear",
      displayName: "언더웨어",
      maxHp: 30,
      ability: { kind: "berserkBelowHpRatio", value: 1.5, threshold: 0.5 },
    },
  ],
};
