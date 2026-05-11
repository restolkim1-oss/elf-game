export type PoseId =
  | "s1"
  | "s2"
  | "s3"
  | "s4"
  | "s5"
  | "s6"
  | "s7"
  | "s8"
  | "s9";

export interface PoseData {
  id: PoseId;
  displayName: string;
  imagePath: string;
  price: number;
  textureKey: string;
}

export const POSES: PoseData[] = Array.from({ length: 9 }, (_, index) => {
  const n = index + 1;
  const id = `s${n}` as PoseId;
  return {
    id,
    displayName: `포즈 ${n}`,
    imagePath: `/assets/${id}.png`,
    price: 100,
    textureKey: `pose_${id}`,
  };
});

export function getPose(id: string) {
  return POSES.find((pose) => pose.id === id);
}
