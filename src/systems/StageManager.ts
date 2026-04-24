import Phaser from "phaser";
import { STAGE_ORDER, type StageKey } from "../data/parts";

export class StageManager {
  private scene: Phaser.Scene;
  private layers: Map<StageKey, Phaser.GameObjects.Image> = new Map();
  private currentKey: StageKey;

  constructor(
    scene: Phaser.Scene,
    centerX: number,
    centerY: number,
    scale: number
  ) {
    this.scene = scene;
    this.currentKey = STAGE_ORDER[0];

    STAGE_ORDER.forEach((key) => {
      const img = scene.add
        .image(centerX, centerY, key)
        .setOrigin(0.5, 0.5)
        .setScale(scale)
        .setAlpha(key === this.currentKey ? 1 : 0)
        .setDepth(10);
      this.layers.set(key, img);
    });
  }

  getCurrentKey(): StageKey {
    return this.currentKey;
  }

  transitionTo(next: StageKey, duration = 650) {
    if (next === this.currentKey) return;
    const fromImg = this.layers.get(this.currentKey);
    const toImg = this.layers.get(next);
    if (!fromImg || !toImg) return;

    this.scene.tweens.add({
      targets: fromImg,
      alpha: 0,
      duration,
      ease: "Quad.easeInOut",
    });
    this.scene.tweens.add({
      targets: toImg,
      alpha: 1,
      duration,
      ease: "Quad.easeInOut",
    });

    this.currentKey = next;
  }

  getDisplayBounds(): { left: number; top: number; width: number; height: number } {
    const img = this.layers.get(this.currentKey);
    if (!img) return { left: 0, top: 0, width: 0, height: 0 };
    return {
      left: img.x - img.displayWidth / 2,
      top: img.y - img.displayHeight / 2,
      width: img.displayWidth,
      height: img.displayHeight,
    };
  }
}
