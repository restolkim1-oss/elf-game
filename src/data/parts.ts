export type PuzzleType = "instant" | "pattern" | "tetris" | "memory";
export type StoryAct = "기" | "승" | "전" | "결";
export type StageSet = 1 | 2 | 3;

export type StageKey =
  | "E1"
  | "E1_stage5"
  | "E1_stage6"
  | "E1_stage7"
  | "E1_stage2"
  | "E1_stage4"
  | "E1_stage3"
  | "E1_swim";

export interface PartDef {
  id: string;
  label: string;
  act: StoryAct;
  puzzle: PuzzleType;
  difficulty: 1 | 2 | 3 | 4 | 5;
  hitbox: { x: number; y: number; w: number; h: number };
  tint: number;
  order: number;
  stageAfter: StageKey | null;
  prerequisites: string[];
}

export const STAGE_ORDER: StageKey[] = [
  "E1",
  "E1_stage5",
  "E1_stage6",
  "E1_stage7",
  "E1_stage2",
  "E1_stage4",
  "E1_stage3",
  "E1_swim",
];

export const INTERACTION_ORDER = [
  "ani_idle0",
  "ani_idle1",
  "ani_idle2",
  "ani_surprise1",
  "ani_heart1",
  "ani_heart2",
] as const;
export type InteractionKey = (typeof INTERACTION_ORDER)[number];

export const INTERACTION_ASSET_PATHS: Record<InteractionKey, string> = {
  ani_idle0: "/assets/ani/idle0.png",
  ani_idle1: "/assets/ani/idle1.png",
  ani_idle2: "/assets/ani/idle2.png",
  ani_surprise1: "/assets/ani/Surprise1.png",
  ani_heart1: "/assets/ani/Heart1.png",
  ani_heart2: "/assets/ani/Heart2.png",
};

export const STAGE_TIER: Record<StageKey, number> = {
  E1: 0,
  E1_stage5: 1,
  E1_stage6: 1,
  E1_stage7: 1,
  E1_stage2: 1,
  E1_stage4: 2,
  E1_stage3: 3,
  E1_swim: 4,
};

const PARTS_STAGE1: PartDef[] = [
  {
    id: "boots",
    label: "신발",
    act: "기",
    puzzle: "pattern",
    difficulty: 1,
    hitbox: { x: 0.22, y: 0.66, w: 0.56, h: 0.32 },
    tint: 0x8b2f39,
    order: 1,
    stageAfter: "E1_stage5",
    prerequisites: [],
  },
  {
    id: "cape",
    label: "자켓",
    act: "승",
    puzzle: "memory",
    difficulty: 2,
    hitbox: { x: 0.0, y: 0.1, w: 0.16, h: 0.78 },
    tint: 0xd43a2f,
    order: 2,
    stageAfter: "E1_stage4",
    prerequisites: [],
  },
  {
    id: "sweater",
    label: "상의",
    act: "전",
    puzzle: "pattern",
    difficulty: 3,
    hitbox: { x: 0.17, y: 0.09, w: 0.66, h: 0.33 },
    tint: 0xe5b968,
    order: 3,
    stageAfter: "E1_stage3",
    prerequisites: ["boots", "cape"],
  },
  {
    id: "skirt",
    label: "치마",
    act: "결",
    puzzle: "tetris",
    difficulty: 4,
    hitbox: { x: 0.22, y: 0.43, w: 0.56, h: 0.22 },
    tint: 0x5c3d2e,
    order: 4,
    stageAfter: null,
    prerequisites: ["boots", "cape", "sweater"],
  },
];

// Stage 2 has more authored image steps, so we expand it to 5 parts.
const PARTS_STAGE2: PartDef[] = [
  {
    id: "heels",
    label: "신발",
    act: "기",
    puzzle: "pattern",
    difficulty: 1,
    hitbox: { x: 0.28, y: 0.79, w: 0.46, h: 0.18 },
    tint: 0x845b3c,
    order: 1,
    stageAfter: "E1_stage5",
    prerequisites: [],
  },
  {
    id: "jacket",
    label: "자켓",
    act: "승",
    puzzle: "memory",
    difficulty: 2,
    hitbox: { x: 0.16, y: 0.13, w: 0.66, h: 0.39 },
    tint: 0x5a606f,
    order: 2,
    stageAfter: "E1_stage2",
    prerequisites: [],
  },
  {
    id: "stockings",
    label: "스타킹",
    act: "전",
    puzzle: "pattern",
    difficulty: 2,
    hitbox: { x: 0.27, y: 0.54, w: 0.48, h: 0.36 },
    tint: 0x4f3f41,
    order: 3,
    stageAfter: "E1_stage4",
    prerequisites: ["heels", "jacket"],
  },
  {
    id: "blouse",
    label: "상의",
    act: "전",
    puzzle: "memory",
    difficulty: 3,
    hitbox: { x: 0.25, y: 0.18, w: 0.48, h: 0.27 },
    tint: 0xc8c9ce,
    order: 4,
    stageAfter: "E1_stage3",
    prerequisites: ["stockings"],
  },
  {
    id: "skirt",
    label: "치마",
    act: "결",
    puzzle: "tetris",
    difficulty: 4,
    hitbox: { x: 0.25, y: 0.43, w: 0.5, h: 0.23 },
    tint: 0x5c3d2e,
    order: 5,
    stageAfter: "E1_swim",
    prerequisites: ["blouse"],
  },
];

// Stage 3 currently has one visual, so we keep stage-1 part layout.
const PARTS_STAGE3: PartDef[] = PARTS_STAGE1;

const PARTS_BY_STAGE: Record<StageSet, PartDef[]> = {
  1: PARTS_STAGE1,
  2: PARTS_STAGE2,
  3: PARTS_STAGE3,
};

function cloneParts(parts: PartDef[]): PartDef[] {
  return parts.map((p) => ({
    ...p,
    hitbox: { ...p.hitbox },
    prerequisites: [...p.prerequisites],
  }));
}

export function getPartsForStage(stageSet: StageSet): PartDef[] {
  return cloneParts(PARTS_BY_STAGE[stageSet]);
}

// Kept for legacy imports; stage-specific flows should use getPartsForStage.
export const PARTS: PartDef[] = getPartsForStage(1);

const STAGE1_REQUIREMENTS: [StageKey, string[]][] = [
  ["E1_swim", ["boots", "cape", "sweater", "skirt"]],
  ["E1_stage3", ["boots", "cape", "sweater"]],
  ["E1_stage4", ["boots", "cape"]],
  ["E1_stage5", ["boots"]],
  ["E1_stage6", ["cape"]],
  ["E1_stage7", ["sweater"]],
  ["E1_stage2", ["skirt"]],
  ["E1", []],
];

const STAGE2_REQUIREMENTS: [StageKey, string[]][] = [
  ["E1_swim", ["heels", "jacket", "stockings", "blouse", "skirt"]],
  ["E1_stage3", ["heels", "jacket", "stockings", "blouse"]],
  ["E1_stage4", ["heels", "jacket", "stockings"]],
  ["E1_stage6", ["heels", "jacket"]],
  ["E1_stage5", ["heels"]],
  ["E1_stage2", ["jacket"]],
  ["E1", []],
];

const STAGE3_REQUIREMENTS: [StageKey, string[]][] = STAGE1_REQUIREMENTS;

const STAGE_REQUIREMENTS_BY_STAGE: Record<StageSet, [StageKey, string[]][]> = {
  1: STAGE1_REQUIREMENTS,
  2: STAGE2_REQUIREMENTS,
  3: STAGE3_REQUIREMENTS,
};

export function stageForRemoved(
  removedIds: Set<string>,
  stageSet: StageSet = 1
): StageKey {
  const table = STAGE_REQUIREMENTS_BY_STAGE[stageSet];
  let best: StageKey = "E1";
  let bestCount = -1;
  let bestTier = -1;

  for (const [key, reqs] of table) {
    if (!reqs.every((id) => removedIds.has(id))) continue;
    const tier = STAGE_TIER[key];
    if (reqs.length > bestCount || (reqs.length === bestCount && tier > bestTier)) {
      best = key;
      bestCount = reqs.length;
      bestTier = tier;
    }
  }
  return best;
}

export const FINALE_STAGE: StageKey = "E1_swim";
