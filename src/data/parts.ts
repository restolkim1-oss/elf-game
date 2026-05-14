export type StoryAct = "intro" | "outer" | "core" | "finale";
export type StageSet = 1 | 2 | 3;
export type StageKey = "E1";

export interface PartDef {
  id: string;
  label: string;
  act: StoryAct;
  difficulty: 1 | 2 | 3 | 4 | 5;
  hitbox: { x: number; y: number; w: number; h: number };
  tint: number;
  order: number;
  stageAfter: StageKey | null;
  prerequisites: string[];
}

export interface StageLayerDef {
  id: string;
  textureKey: string;
  path: string;
  depth: number;
  partId?: string;
}

export interface MenuIconDef {
  key: string;
  path: string;
  label: string;
}

export const MENU_ICONS: MenuIconDef[] = [
  {
    key: "menu_icon_main",
    path: "/icon/icon.png",
    label: "메인",
  },
  {
    key: "menu_icon_shop",
    path: "/icon/상점.png",
    label: "상점",
  },
  {
    key: "menu_icon_coin",
    path: "/icon/코인.png",
    label: "코인",
  },
  {
    key: "menu_icon_gem",
    path: "/icon/보석.png",
    label: "보석",
  },
  {
    key: "menu_icon_settings",
    path: "/icon/환경설정.png",
    label: "설정",
  },
  {
    key: "menu_icon_extra",
    path: "/icon/Gemini_Generated_Image_alnwtralnwtralnw.png",
    label: "보너스",
  },
];

export const STAGE_ORDER: StageKey[] = ["E1"];

export const STAGE_LAYERS: StageLayerDef[] = [
  {
    id: "base",
    textureKey: "E1_base",
    path: "/assets/E1_base.png?v=base-20260514-underwear2",
    depth: 10,
  },
  {
    id: "underwear",
    textureKey: "E1_Underwear",
    path: "/assets/E1_Underwear.png",
    depth: 11,
    partId: "underwear",
  },
  {
    id: "underwear2",
    textureKey: "E1_Underwear2",
    path: "/assets/E1_Underwear2.png",
    depth: 11.5,
    partId: "underwear2",
  },
  {
    id: "boots",
    textureKey: "E1_boots",
    path: "/assets/E1_boots.png",
    depth: 12,
    partId: "boots",
  },
  {
    id: "sweater",
    textureKey: "E1_sweater",
    path: "/assets/E1_sweater.png",
    depth: 13,
    partId: "sweater",
  },
  {
    id: "cape",
    textureKey: "E1_cape",
    path: "/assets/E1_cape.png",
    depth: 18,
    partId: "cape",
  },
  {
    id: "skirt",
    textureKey: "E1_skirt",
    path: "/assets/E1_skirt.png",
    depth: 14,
    partId: "skirt",
  },
  {
    id: "circlet",
    textureKey: "E1_Circlet",
    path: "/assets/E1_Circlet.png",
    depth: 19,
    partId: "circlet",
  },
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

const PARTS_STAGE1: PartDef[] = [
  {
    id: "circlet",
    label: "서클릿",
    act: "intro",
    difficulty: 1,
    hitbox: { x: 0.38, y: 0.02, w: 0.24, h: 0.11 },
    tint: 0xffd572,
    order: 1,
    stageAfter: null,
    prerequisites: [],
  },
  {
    id: "boots",
    label: "신발",
    act: "intro",
    difficulty: 1,
    hitbox: { x: 0.23, y: 0.69, w: 0.54, h: 0.29 },
    tint: 0x8b2f39,
    order: 2,
    stageAfter: null,
    prerequisites: [],
  },
  {
    id: "cape",
    label: "망토",
    act: "outer",
    difficulty: 2,
    hitbox: { x: 0.03, y: 0.13, w: 0.94, h: 0.72 },
    tint: 0xd43a2f,
    order: 3,
    stageAfter: null,
    prerequisites: [],
  },
  {
    id: "sweater",
    label: "상의",
    act: "core",
    difficulty: 3,
    hitbox: { x: 0.2, y: 0.15, w: 0.6, h: 0.27 },
    tint: 0xe5b968,
    order: 4,
    stageAfter: null,
    prerequisites: [],
  },
  {
    id: "skirt",
    label: "스커트",
    act: "core",
    difficulty: 4,
    hitbox: { x: 0.23, y: 0.42, w: 0.54, h: 0.22 },
    tint: 0x5c3d2e,
    order: 5,
    stageAfter: null,
    prerequisites: [],
  },
  {
    id: "underwear",
    label: "언더웨어",
    act: "finale",
    difficulty: 5,
    hitbox: { x: 0.22, y: 0.18, w: 0.56, h: 0.45 },
    tint: 0xf1c6a8,
    order: 6,
    stageAfter: null,
    prerequisites: [],
  },
  {
    id: "underwear2",
    label: "언더웨어2",
    act: "finale",
    difficulty: 5,
    hitbox: { x: 0.22, y: 0.24, w: 0.56, h: 0.42 },
    tint: 0xff8fb3,
    order: 7,
    stageAfter: null,
    prerequisites: [],
  },
];

const PARTS_BY_STAGE: Record<StageSet, PartDef[]> = {
  1: PARTS_STAGE1,
  2: PARTS_STAGE1,
  3: PARTS_STAGE1,
};

function cloneParts(parts: PartDef[]): PartDef[] {
  return parts.map((part) => ({
    ...part,
    hitbox: { ...part.hitbox },
    prerequisites: [...part.prerequisites],
  }));
}

export function getPartsForStage(stageSet: StageSet): PartDef[] {
  return cloneParts(PARTS_BY_STAGE[stageSet]);
}

export const PARTS: PartDef[] = getPartsForStage(1);

export function stageForRemoved(
  _removedIds: Set<string>,
  _stageSet: StageSet = 1
): StageKey {
  return "E1";
}

export const FINALE_STAGE: StageKey = "E1";
