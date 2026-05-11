import type { PartId } from "./enemyParts";

export interface PartStory {
  partId: PartId;
  title: string;
  text: string;
}

export const PART_STORIES: Record<PartId, PartStory> = {
  circlet: {
    partId: "circlet",
    title: "제목 미정",
    text: "서클릿 이야기 - 추후 작성",
  },
  cape: {
    partId: "cape",
    title: "제목 미정",
    text: "케이프 이야기 - 추후 작성",
  },
  sweater: {
    partId: "sweater",
    title: "제목 미정",
    text: "스웨터 이야기 - 추후 작성",
  },
  skirt: {
    partId: "skirt",
    title: "제목 미정",
    text: "스커트 이야기 - 추후 작성",
  },
  shoes: {
    partId: "shoes",
    title: "제목 미정",
    text: "신발 이야기 - 추후 작성",
  },
  underwear: {
    partId: "underwear",
    title: "제목 미정",
    text: "언더웨어 이야기 - 추후 작성",
  },
};
