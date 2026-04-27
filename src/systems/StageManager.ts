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
    scale: number,
    textureForKey?: (key: StageKey) => string
  ) {
    this.scene = scene;
    this.currentKey = STAGE_ORDER[0];

    STAGE_ORDER.forEach((key) => {
      const textureKey = textureForKey ? textureForKey(key) : key;
      const img = scene.add
        .image(centerX, centerY, textureKey)
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

  // Fade every stage image to alpha 0. Used when handing the canvas
  // over to another system (e.g., interaction mode) that renders its
  // own character above the stage depth.
  fadeOutAll(duration = 400) {
    this.layers.forEach((img) => {
      this.scene.tweens.killTweensOf(img);
      this.scene.tweens.add({ targets: img, alpha: 0, duration });
    });
  }

  // Force-show a specific stage image, fading out everything else. Used
  // to restore the finale when returning from interaction mode.
  showKey(key: StageKey, duration = 400) {
    this.currentKey = key;
    this.layers.forEach((img, k) => {
      this.scene.tweens.killTweensOf(img);
      this.scene.tweens.add({
        targets: img,
        alpha: k === key ? 1 : 0,
        duration,
      });
    });
  }
}
