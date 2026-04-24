export type PuzzleType = "instant" | "pattern" | "tetris" | "memory";

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
  act: "기" | "승" | "전" | "결";
  puzzle: PuzzleType;
  difficulty: 1 | 2 | 3 | 4 | 5;
  hitbox: { x: number; y: number; w: number; h: number };
  tint: number;
  order: number;
  // Stage image to crossfade to when THIS specific part is cleared. Players
  // can pick any part in any order; the visual always matches the part they
  // just removed. `null` keeps the current visual (belt has no dedicated
  // image).
  stageAfter: StageKey | null;
  // Prerequisite part IDs. Currently empty on every part — players may
  // remove parts in any order. Kept as an array so a future locking
  // rule can be turned on per-part without refactoring.
  prerequisites: string[];
}

// All stage assets we preload. ORDER DOES NOT MATTER for picking the
// active image — use STAGE_TIER below for that. This array is just a
// convenient list for BootScene.preload().
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

// Post-clear interaction mode: clicking the character cycles through
// reaction frames (idle → surprise → heart loop → idle). These assets
// share the same character pose/center so we can swap them via alpha.
export const INTERACTION_ORDER = [
  "ani_idle0",
  "ani_idle1",
  "ani_idle2",
  "ani_surprise1",
  "ani_surprise2",
  "ani_heart0",
  "ani_heart1",
  "ani_heart2",
  "ani_heart3",
] as const;
export type InteractionKey = (typeof INTERACTION_ORDER)[number];

export const INTERACTION_ASSET_PATHS: Record<InteractionKey, string> = {
  ani_idle0: "/assets/ani/idle0.png",
  ani_idle1: "/assets/ani/idle1.png",
  ani_idle2: "/assets/ani/idle2.png",
  ani_surprise1: "/assets/ani/Surprise1.png",
  ani_surprise2: "/assets/ani/Surprise2.png",
  ani_heart0: "/assets/ani/Heart0.png",
  ani_heart1: "/assets/ani/Heart1.png",
  ani_heart2: "/assets/ani/Heart2.png",
  ani_heart3: "/assets/ani/Heart3.png",
};

// Tier = how many "stage-advancing" parts have been removed at the time
// this image is the correct one to show. Tier 1 has FOUR branching
// images — one dedicated image per possible first-removal choice:
//  - stage5 when the first removed part is boots
//  - stage6 when the first removed part is cape
//  - stage7 when the first removed part is sweater
//  - stage2 when the first removed part is skirt (bottom-only swimsuit)
// Tiers 2+ always converge regardless of which order the player chose.
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

// Each authored stage image maps to the exact SET of removed parts it
// depicts. To pick the best image for any in-progress state, we match
// the largest subset of the player's removed set against these
// requirements. This lets the player remove parts in any order — when
// the combination matches an authored image, the visual advances;
// otherwise it stays on the last-best image (and the part still counts
// as removed in the progress UI).
// NOTE: E1_stage2 was re-authored to depict "skirt-off, everything else
// on" — the bottom-only swimsuit state. It's now the tier-1 image for
// a skirt-first removal, symmetric with stage5/6/7.
const STAGE_REQUIREMENTS: [StageKey, string[]][] = [
  ["E1_swim",   ["boots", "cape", "sweater", "skirt"]],
  ["E1_stage3", ["boots", "cape", "sweater"]],
  ["E1_stage4", ["boots", "cape"]],
  ["E1_stage5", ["boots"]],
  ["E1_stage6", ["cape"]],
  ["E1_stage7", ["sweater"]],
  ["E1_stage2", ["skirt"]],
  ["E1",        []],
];

// Pick the authored stage image whose requirement set is a subset of
// the player's removed set and has the MOST matching elements. Ties
// break by higher tier (never regress once we're deeper in the scene).
export function stageForRemoved(removedIds: Set<string>): StageKey {
  let best: StageKey = "E1";
  let bestCount = -1;
  let bestTier = -1;

  for (const [key, reqs] of STAGE_REQUIREMENTS) {
    if (!reqs.every((id) => removedIds.has(id))) continue;
    const tier = STAGE_TIER[key];
    if (
      reqs.length > bestCount ||
      (reqs.length === bestCount && tier > bestTier)
    ) {
      best = key;
      bestCount = reqs.length;
      bestTier = tier;
    }
  }
  return best;
}

export const PARTS: PartDef[] = [
  {
    id: "boots",
    label: "니하이 부츠",
    act: "기",
    puzzle: "pattern",
    difficulty: 1,
    // Knee-high boots span from the knee down to the feet — keep fully
    // inside its vertical band so it doesn't steal skirt clicks.
    hitbox: { x: 0.22, y: 0.66, w: 0.56, h: 0.32 },
    // Bright burgundy/maroon for high contrast
    tint: 0x8b2f39,
    order: 1,
    stageAfter: "E1_stage5",
    // 부츠는 코트와 함께 1순위 — 자유 선택
    prerequisites: [],
  },
  {
    id: "cape",
    label: "빨간 코트",
    act: "승",
    puzzle: "memory",
    difficulty: 2,
    // Red coat drapes on the LEFT side — narrow strip so it doesn't
    // overlap the sweater/turtleneck click area in the shoulder region.
    hitbox: { x: 0.0, y: 0.10, w: 0.16, h: 0.78 },
    // Bright scarlet red (이미지와 구분되는 명확한 빨강)
    tint: 0xd43a2f,
    order: 2,
    stageAfter: "E1_stage4",
    // 코트는 부츠와 함께 1순위 — 자유 선택
    prerequisites: [],
  },
  {
    id: "sweater",
    label: "터틀넥",
    act: "승",
    puzzle: "pattern",
    difficulty: 3,
    // Turtleneck covers the upper torso, starting AFTER the cape strip
    // (x=0.16) and ending above the belt band (y=0.42). No overlaps.
    hitbox: { x: 0.17, y: 0.09, w: 0.66, h: 0.33 },
    // Golden ochre (더 밝고 구별되는 노란색)
    tint: 0xe5b968,
    order: 3,
    stageAfter: "E1_stage3",
    // 외투 2개가 먼저 벗겨져야 함 — E1_stage7(터틀넥 단독 이미지)은
    // 현재 사용되지 않지만 나중에 자유 순서로 돌아갈 때를 대비해 유지.
    prerequisites: ["boots", "cape"],
  },
  {
    // Belt was merged into skirt — there's no dedicated belt image and
    // asking the player to solve two separate minigames for the same
    // waist region was redundant. One tetris puzzle now removes both at
    // once; the hitbox spans from the belt band all the way to the skirt
    // hem.
    id: "skirt",
    label: "벨트 & 스커트",
    act: "결",
    puzzle: "tetris",
    difficulty: 4,
    // Belt band (y≈0.43) through skirt hem (y≈0.65).
    hitbox: { x: 0.22, y: 0.43, w: 0.56, h: 0.22 },
    // Rich chocolate brown
    tint: 0x5c3d2e,
    order: 4,
    // skirt는 마지막 단계 — 벗기면 finale(E1_swim)로 넘어감.
    // E1_stage2(하의만 수영복)는 자유 순서일 때 쓰이지만 현재는 미사용.
    stageAfter: null,
    prerequisites: ["boots", "cape", "sweater"],
  },
];

export const FINALE_STAGE: StageKey = "E1_swim";

// A part is clickable iff every prerequisite has been removed AND it
// hasn't been removed itself. GameScene uses this to block the puzzle
// from starting on a locked part; PartSystem uses it to dim the marker.
export function isPartUnlocked(
  partId: string,
  removedIds: Set<string>
): boolean {
  const part = PARTS.find((p) => p.id === partId);
  if (!part) return false;
  if (removedIds.has(partId)) return false;
  return part.prerequisites.every((id) => removedIds.has(id));
}

// Human-readable list of what still needs to come off first. Empty string
// means no prerequisites remaining — the part is ready.
export function lockReason(
  partId: string,
  removedIds: Set<string>
): string {
  const part = PARTS.find((p) => p.id === partId);
  if (!part) return "";
  const missing = part.prerequisites.filter((id) => !removedIds.has(id));
  if (missing.length === 0) return "";
  const labels = missing.map(
    (id) => PARTS.find((p) => p.id === id)?.label ?? id
  );
  return `먼저 ${labels.join(" · ")} 해제 필요`;
}
