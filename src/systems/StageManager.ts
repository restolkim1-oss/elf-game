import Phaser from "phaser";
import { STAGE_LAYERS, type StageKey, type StageLayerDef } from "../data/parts";
import type { PartId } from "../data/enemyParts";

const PART_ZOOM_FRAMES: Record<PartId, { focusY: number; zoom: number }> = {
  circlet: { focusY: 0.13, zoom: 1.6 },
  cape: { focusY: 0.27, zoom: 1.4 },
  sweater: { focusY: 0.34, zoom: 1.42 },
  skirt: { focusY: 0.55, zoom: 1.4 },
  shoes: { focusY: 0.79, zoom: 1.5 },
  underwear: { focusY: 0.47, zoom: 1.42 },
};

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
  private zoomTweens: Phaser.Tweens.Tween[] = [];
  private zoomResetTimer: Phaser.Time.TimerEvent | null = null;
  private activeZoomKey: string | null = null;
  private focusedPartId: PartId | null = null;
  private battleIntroActive = false;
  private battleIntroComplete: (() => void) | null = null;
  private introProxy: { t: number } | null = null;

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
        .image(centerX, centerY, "E1_base")
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

  playBattleIntro(onComplete: () => void) {
    this.battleIntroActive = true;
    this.battleIntroComplete = onComplete;
    this.activeZoomKey = "intro";
    this.focusedPartId = null;
    this.clearZoomResetTimer();
    this.stopZoomTweens();
    this.introProxy = { t: 0 };
    this.applyIntroFocus(0);
    this.tweenIntroProxy(() => this.completeBattleIntro(false));
  }

  skipBattleIntro() {
    if (!this.battleIntroActive) return false;
    this.completeBattleIntro(true);
    return true;
  }

  zoomToPart(partId: PartId, duration = 300, holdMs = 0) {
    const frame = PART_ZOOM_FRAMES[partId];
    if (!frame) return;
    const key = `part:${partId}`;
    if (this.activeZoomKey === key && holdMs <= 0) return;
    this.activeZoomKey = key;
    this.clearZoomResetTimer();
    this.tweenCharacterFocus(frame.focusY, frame.zoom, duration, "Cubic.easeOut");
    if (holdMs > 0) this.scheduleZoomReset(holdMs);
  }

  playPartRemovalCloseup(stagePartId: string, zoomPartId: PartId | null, onComplete: () => void) {
    const finish = () => {
      this.resetCharacterZoom(300);
      this.scene.time.delayedCall(320, onComplete);
    };
    const removeLayer = () => {
      this.hidePartLayer(stagePartId, 700);
      this.scene.time.delayedCall(740, finish);
    };
    if (!zoomPartId) {
      removeLayer();
      return;
    }
    const frame = PART_ZOOM_FRAMES[zoomPartId];
    if (!frame) {
      removeLayer();
      return;
    }
    this.activeZoomKey = `remove:${zoomPartId}`;
    this.focusedPartId = zoomPartId;
    this.clearZoomResetTimer();
    this.tweenCharacterFocus(frame.focusY, frame.zoom, 300, "Cubic.easeOut", removeLayer);
  }

  focusBattlePart(partId: PartId, duration = 300) {
    const frame = PART_ZOOM_FRAMES[partId];
    if (!frame) return;
    if (this.focusedPartId === partId) return;
    this.focusedPartId = partId;
    this.activeZoomKey = `focus:${partId}`;
    this.clearZoomResetTimer();
    this.tweenCharacterFocus(frame.focusY, frame.zoom, duration, "Cubic.easeOut");
  }

  clearBattlePartFocus(partId?: PartId, duration = 400) {
    if (partId && this.focusedPartId !== partId) return;
    this.focusedPartId = null;
    this.resetCharacterZoom(duration);
  }

  resetCharacterZoom(duration = 400) {
    this.activeZoomKey = null;
    this.focusedPartId = null;
    this.clearZoomResetTimer();
    this.tweenCharacterFocus(0.5, 1, duration, "Cubic.easeOut");
  }

  hidePartLayer(partId: string, duration = 420) {
    this.hiddenPartIds.add(partId);
    const directLayerIds = this.partLayerIds.get(partId) ?? [];
    const layerIds =
      directLayerIds.length > 0 ? directLayerIds : this.findFallbackLayerIds(partId);
    if (layerIds.length === 0) {
      console.warn("[STAGE] no layer matches part id", partId);
    }
    layerIds.forEach((layerId) => {
      const img = this.layers.get(layerId);
      if (!img) {
        console.warn("[STAGE] layer image missing", layerId);
        return;
      }
      this.playLayerRemovalEffect(img);
      this.scene.tweens.add({
        targets: img,
        alpha: 0,
        duration,
        ease: "Quad.easeOut",
        onComplete: () => img.setVisible(false),
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

  private findFallbackLayerIds(partId: string) {
    const normalized = partId.toLowerCase();
    return [...this.layers.keys()].filter((layerId) =>
      layerId.toLowerCase().includes(normalized)
    );
  }

  private fadeOutExtraLayers(duration: number) {
    this.extraLayers.forEach((img) => {
      this.scene.tweens.add({
        targets: img,
        alpha: 0,
        duration,
        ease: "Quad.easeInOut",
      });
    });
  }

  private completeBattleIntro(skip: boolean) {
    if (!this.battleIntroActive) return;
    const done = this.battleIntroComplete;
    this.battleIntroActive = false;
    this.battleIntroComplete = null;
    this.introProxy = null;
    this.activeZoomKey = null;
    this.focusedPartId = null;
    this.clearZoomResetTimer();
    this.stopZoomTweens();
    void skip;
    this.applyCharacterFocus(0.5, 1);
    done?.();
  }

  private tweenIntroProxy(onComplete: () => void) {
    if (!this.battleIntroActive || !this.introProxy) return;
    const proxy = this.introProxy;
    const tween = this.scene.tweens.add({
      targets: proxy,
      t: 1,
      duration: 5000,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        if (this.battleIntroActive) this.applyIntroFocus(proxy.t);
      },
      onComplete: () => {
        this.zoomTweens = this.zoomTweens.filter((t) => t !== tween);
        if (this.battleIntroActive) onComplete();
      },
    });
    this.zoomTweens.push(tween);
  }

  private applyIntroFocus(t: number) {
    const clamped = Phaser.Math.Clamp(t, 0, 1);
    let focusY: number;
    let zoom: number;
    if (clamped < 0.4) {
      const local = clamped / 0.4;
      focusY = Phaser.Math.Linear(0.92, 0.18, this.smoothIntroStep(local));
      zoom = 2;
    } else if (clamped < 0.7) {
      focusY = 0.18;
      zoom = 2;
    } else {
      const local = (clamped - 0.7) / 0.3;
      const eased = this.smoothIntroStep(local);
      focusY = Phaser.Math.Linear(0.18, 0.5, eased);
      zoom = Phaser.Math.Linear(2, 1, eased);
    }
    this.applyCharacterFocus(focusY, zoom);
  }

  private smoothIntroStep(t: number) {
    const clamped = Phaser.Math.Clamp(t, 0, 1);
    return clamped * clamped * (3 - 2 * clamped);
  }

  private scheduleZoomReset(delay: number) {
    this.clearZoomResetTimer();
    this.zoomResetTimer = this.scene.time.delayedCall(delay, () => {
      this.zoomResetTimer = null;
      if (!this.battleIntroActive) this.resetCharacterZoom(400);
    });
  }

  private clearZoomResetTimer() {
    this.zoomResetTimer?.remove(false);
    this.zoomResetTimer = null;
  }

  private tweenCharacterFocus(
    focusY: number,
    zoom: number,
    duration: number,
    ease: string,
    onComplete?: () => void
  ) {
    this.stopZoomTweens();
    const transform = this.getFocusTransform(focusY, zoom);
    const targets = this.getCharacterImages().filter((img) => !!img.scene);
    if (targets.length === 0) {
      onComplete?.();
      return;
    }
    const tween = this.scene.tweens.add({
      targets,
      x: transform.x,
      y: transform.y,
      scaleX: transform.scale,
      scaleY: transform.scale,
      duration,
      ease,
      onComplete: () => {
        this.zoomTweens = this.zoomTweens.filter((t) => t !== tween);
        onComplete?.();
      },
    });
    this.zoomTweens.push(tween);
  }

  private applyCharacterFocus(focusY: number, zoom: number) {
    const transform = this.getFocusTransform(focusY, zoom);
    this.getCharacterImages().forEach((img) => {
      img.setPosition(transform.x, transform.y);
      img.setScale(transform.scale);
    });
  }

  private getFocusTransform(focusY: number, zoom: number) {
    const sourceHeight = this.baseLayer.height * this.scale;
    const scale = this.scale * zoom;
    const y = this.centerY - (focusY - 0.5) * sourceHeight * zoom;
    return { x: this.centerX, y, scale };
  }

  private getCharacterImages() {
    return [...this.layers.values(), ...this.extraLayers.values()];
  }

  private stopZoomTweens() {
    this.zoomTweens.forEach((tween) => {
      if (tween.isPlaying()) tween.stop();
      tween.remove();
    });
    this.zoomTweens = [];
  }

  private playLayerRemovalEffect(img: Phaser.GameObjects.Image) {
    const cx = img.x;
    const cy = img.y;
    const burstRadius = Math.min(img.displayWidth, img.displayHeight) * 0.18;
    const ring = this.scene.add
      .ellipse(cx, cy, img.displayWidth * 0.32, img.displayHeight * 0.18, 0xffffff, 0)
      .setStrokeStyle(4, 0xfff0a8, 0.85)
      .setDepth(img.depth + 20);
    this.scene.tweens.add({
      targets: ring,
      scaleX: 1.35,
      scaleY: 1.35,
      alpha: 0,
      duration: 520,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy(),
    });

    for (let i = 0; i < 20; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.FloatBetween(burstRadius * 0.35, burstRadius);
      const shard = this.scene.add
        .rectangle(
          cx + Phaser.Math.Between(-18, 18),
          cy + Phaser.Math.Between(-30, 30),
          Phaser.Math.Between(8, 20),
          Phaser.Math.Between(4, 11),
          i % 4 === 0 ? 0xffffff : 0xffd572,
          0.82
        )
        .setAngle(Phaser.Math.Between(0, 180))
        .setDepth(img.depth + 21);
      this.scene.tweens.add({
        targets: shard,
        x: cx + Math.cos(angle) * distance,
        y: cy + Math.sin(angle) * distance * 0.7,
        alpha: 0,
        angle: shard.angle + Phaser.Math.Between(-240, 240),
        scaleX: 0.25,
        scaleY: 0.25,
        duration: Phaser.Math.Between(420, 780),
        ease: "Cubic.easeOut",
        onComplete: () => shard.destroy(),
      });
    }
  }
}
