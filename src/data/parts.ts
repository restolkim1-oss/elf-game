export type PuzzleType = "instant" | "pattern" | "tetris" | "memory";

export type StageKey =
  | "E1"
  | "E1_stage5"
  | "E1_stage6"
  | "E1_stage4"
  | "E1_stage3"
  | "E1_stage2"
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
  // Other part IDs that must be removed before THIS part is clickable.
  // Enforces the only order for which the authored stage images are
  // visually correct: any-of(boots, cape) → the other → sweater → (belt,
  // skirt in either order) → finale. Without this, players removing
  // sweater first would see the stage-5 image (boots-off appearance) and
  // think the wrong garment came off.
  prerequisites: string[];
}

// All stage assets we preload. ORDER DOES NOT MATTER for picking the
// active image — use STAGE_TIER below for that. This array is just a
// convenient list for BootScene.preload().
export const STAGE_ORDER: StageKey[] = [
  "E1",
  "E1_stage5",
  "E1_stage6",
  "E1_stage4",
  "E1_stage3",
  "E1_stage2",
  "E1_swim",
];

// Tier = how many "stage-advancing" parts have been removed at the time
// this image is the correct one to show. Tier 1 has TWO possible images:
//  - stage5 when the first removed part is boots
//  - stage6 when the first removed part is cape (NEW branching state)
// Tiers 2+ always converge regardless of which order the player chose.
export const STAGE_TIER: Record<StageKey, number> = {
  E1: 0,
  E1_stage5: 1,
  E1_stage6: 1,
  E1_stage4: 2,
  E1_stage3: 3,
  E1_stage2: 4,
  E1_swim: 5,
};

// Given the set of removed part IDs, pick the stage image that best
// represents the character's ACTUAL state right now.
// Each stage image was authored for a specific combination of removed
// items — we match by combination, not by count, so free-order removal
// never shows the wrong garment disappearing.
//
//  E1         – nothing removed (base)
//  E1_stage5  – boots removed (coat still on)
//  E1_stage6  – cape removed  (boots still on)
//  E1_stage4  – boots + cape both removed
//  E1_stage3  – boots + cape + sweater removed
//  E1_stage2  – boots + cape + sweater + skirt removed
//  E1_swim    – all removed (bikini finale)
export function stageForRemoved(removedIds: Set<string>): StageKey {
  const has = (id: string) => removedIds.has(id);

  if (has("boots") && has("cape") && has("sweater") && has("belt") && has("skirt"))
    return "E1_swim";
  if (has("boots") && has("cape") && has("sweater") && has("skirt"))
    return "E1_stage2";
  if (has("boots") && has("cape") && has("sweater"))
    return "E1_stage3";
  if (has("boots") && has("cape"))
    return "E1_stage4";
  // Only one outer layer removed — use the dedicated single-removal image.
  if (has("cape") && !has("boots")) return "E1_stage6";
  if (has("boots") && !has("cape")) return "E1_stage5";
  // Sweater / belt / skirt removed without outer layers → no authored image
  // that accurately reflects this state; keep the base image so nothing
  // visually wrong is shown.
  return "E1";
}

export const PARTS: PartDef[] = [
  {
    id: "boots",
    label: "니하이 부츠",
    act: "기",
    puzzle: "pattern",
    difficulty: 1,
    // Knee-high boots span from the knee (~63%) down to the feet (~98%).
    hitbox: { x: 0.22, y: 0.63, w: 0.56, h: 0.35 },
    // Bright burgundy/maroon for high contrast
    tint: 0x8b2f39,
    order: 1,
    stageAfter: "E1_stage5",
    // 자유 선택: prerequisites 제거
    prerequisites: [],
  },
  {
    id: "cape",
    label: "빨간 코트",
    act: "승",
    puzzle: "memory",
    difficulty: 2,
    // Red coat drapes from the left shoulder down to the ankle
    hitbox: { x: 0.0, y: 0.08, w: 0.32, h: 0.80 },
    // Bright scarlet red (이미지와 구분되는 명확한 빨강)
    tint: 0xd43a2f,
    order: 2,
    stageAfter: "E1_stage4",
    prerequisites: [],
  },
  {
    id: "sweater",
    label: "터틀넥",
    act: "승",
    puzzle: "pattern",
    difficulty: 3,
    // Turtleneck covers the full upper body including arms (10%–44%).
    hitbox: { x: 0.15, y: 0.08, w: 0.68, h: 0.42 },
    // Golden ochre (더 밝고 구별되는 노란색)
    tint: 0xe5b968,
    order: 3,
    stageAfter: "E1_stage3",
    prerequisites: [],
  },
  {
    id: "belt",
    label: "벨트",
    act: "전",
    puzzle: "memory",
    difficulty: 3,
    // Belt is the thin waistband sitting just above the skirt (~44–51%).
    hitbox: { x: 0.22, y: 0.44, w: 0.56, h: 0.08 },
    // Deep charcoal (거의 검은색이지만 약간의 갈색 톤)
    tint: 0x2a2420,
    order: 4,
    stageAfter: null,
    prerequisites: [],
  },
  {
    id: "skirt",
    label: "가죽 스커트",
    act: "결",
    puzzle: "tetris",
    difficulty: 4,
    // Mini skirt from just below the belt (~52%) to just above the knee (~63%)
    hitbox: { x: 0.22, y: 0.52, w: 0.56, h: 0.13 },
    // Rich chocolate brown (이미지 갈색보다 더 진한 톤)
    tint: 0x5c3d2e,
    order: 5,
    stageAfter: "E1_stage2",
    prerequisites: [],
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
