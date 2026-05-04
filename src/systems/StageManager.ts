import Phaser from "phaser";
import { STAGE_LAYERS, type StageKey, type StageLayerDef } from "../data/parts";

export class StageManager {
  private scene: Phaser.Scene;
  private baseLayer!: Phaser.GameObjects.Image;
  private layers: Map<string, Phaser.GameObjects.Image> = new Map();
  private partLayerIds: Map<string, string[]> = new Map();
  private hiddenPartIds: Set<string> = new Set();
  private extraLayers: Map<string, Phaser.GameObjects.Image> = new Map();
  private currentKey: StageKey = "E1";
  private centerX: number;
  private centerY: number;
  private scale: number;

  constructor(
    scene: Phaser.Scene,
    centerX: number,
    centerY: number,
    scale: number,
    _textureForKey?: (key: StageKey) => string,
    layerDefs: StageLayerDef[] = STAGE_LAYERS
  ) {
    this.scene = scene;
    this.centerX = centerX;
    this.centerY = centerY;
    this.scale = scale;

    [...layerDefs]
      .sort((a, b) => a.depth - b.depth)
      .forEach((layer) => {
        const img = scene.add
          .image(centerX, centerY, layer.textureKey)
          .setOrigin(0.5, 0.5)
          .setScale(scale)
          .setDepth(layer.depth)
          .setAlpha(1);
        this.layers.set(layer.id, img);
        if (layer.id === "base") this.baseLayer = img;
        if (layer.partId) {
          const ids = this.partLayerIds.get(layer.partId) ?? [];
          ids.push(layer.id);
          this.partLayerIds.set(layer.partId, ids);
        }
      });

    if (!this.baseLayer) {
      this.baseLayer = scene.add
        .image(centerX, centerY, "E1")
        .setOrigin(0.5, 0.5)
        .setScale(scale)
        .setDepth(10);
    }
  }

  getCurrentKey(): StageKey {
    return this.currentKey;
  }

  transitionTo(_next: StageKey, _duration = 650) {
    this.currentKey = "E1";
  }

  hidePartLayer(partId: string, duration = 420) {
    this.hiddenPartIds.add(partId);
    const layerIds = this.partLayerIds.get(partId) ?? [];
    layerIds.forEach((layerId) => {
      const img = this.layers.get(layerId);
      if (!img) return;
      this.scene.tweens.killTweensOf(img);
      this.scene.tweens.add({
        targets: img,
        alpha: 0,
        duration,
        ease: "Quad.easeOut",
      });
    });
  }

  transitionToTexture(layerId: string, textureKey: string, duration = 650) {
    if (!this.scene.textures.exists(textureKey)) return false;

    let toImg = this.extraLayers.get(layerId);
    if (!toImg) {
      toImg = this.scene.add
        .image(this.centerX, this.centerY, textureKey)
        .setOrigin(0.5, 0.5)
        .setScale(this.scale)
        .setAlpha(0)
        .setDepth(30);
      this.extraLayers.set(layerId, toImg);
    } else {
      toImg.setTexture(textureKey).setAlpha(0).setVisible(true);
    }

    this.layers.forEach((img) => {
      this.scene.tweens.killTweensOf(img);
      this.scene.tweens.add({
        targets: img,
        alpha: 0,
        duration,
        ease: "Quad.easeInOut",
      });
    });
    this.scene.tweens.add({
      targets: toImg,
      alpha: 1,
      duration,
      ease: "Quad.easeInOut",
    });
    return true;
  }

  getDisplayBounds(): { left: number; top: number; width: number; height: number } {
    return {
      left: this.baseLayer.x - this.baseLayer.displayWidth / 2,
      top: this.baseLayer.y - this.baseLayer.displayHeight / 2,
      width: this.baseLayer.displayWidth,
      height: this.baseLayer.displayHeight,
    };
  }

  fadeOutAll(duration = 400) {
    this.layers.forEach((img) => {
      this.scene.tweens.killTweensOf(img);
      this.scene.tweens.add({ targets: img, alpha: 0, duration });
    });
    this.fadeOutExtraLayers(duration);
  }

  showKey(key: StageKey, duration = 400) {
    this.currentKey = key;
    this.fadeOutExtraLayers(duration);
    this.layers.forEach((img, layerId) => {
      const partId = this.getPartIdForLayer(layerId);
      const shouldShow = !partId || !this.hiddenPartIds.has(partId);
      this.scene.tweens.killTweensOf(img);
      this.scene.tweens.add({
        targets: img,
        alpha: shouldShow ? 1 : 0,
        duration,
      });
    });
  }

  private getPartIdForLayer(layerId: string): string | undefined {
    for (const [partId, layerIds] of this.partLayerIds.entries()) {
      if (layerIds.includes(layerId)) return partId;
    }
    return undefined;
  }

  private fadeOutExtraLayers(duration: number) {
    this.extraLayers.forEach((img) => {
      this.scene.tweens.killTweensOf(img);
      this.scene.tweens.add({
        targets: img,
        alpha: 0,
        duration,
        ease: "Quad.easeInOut",
      });
    });
  }
}
