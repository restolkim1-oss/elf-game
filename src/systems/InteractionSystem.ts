import Phaser from "phaser";
import { INTERACTION_ORDER, type InteractionKey } from "../data/parts";

interface InteractionFrame {
  img: Phaser.GameObjects.Image;
  baseX: number;
  baseY: number;
  baseScale: number;
}

interface OpaqueBounds {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export class InteractionSystem {
  private scene: Phaser.Scene;
  private frames: Map<InteractionKey, InteractionFrame> = new Map();
  private activeKey: InteractionKey = "ani_idle0";
  private hitZone: Phaser.GameObjects.Rectangle | null = null;
  private enabled = false;
  private sequenceTimers: Phaser.Time.TimerEvent[] = [];
  private readonly reactionHoldMs = 2400;

  constructor(
    scene: Phaser.Scene,
    centerX: number,
    centerY: number,
    targetHeight: number
  ) {
    this.scene = scene;

    INTERACTION_ORDER.forEach((key) => {
      const img = scene.add
        .image(centerX, centerY, key)
        .setOrigin(0.5, 0.5)
        .setAlpha(0)
        .setDepth(18);
      this.frames.set(key, {
        img,
        baseX: centerX,
        baseY: centerY,
        baseScale: 1,
      });
    });

    this.calibrateFrames(centerX, centerY, targetHeight);
  }

  enable(width: number, height: number) {
    if (this.enabled) return;
    this.enabled = true;
    this.stopSequence();
    this.showFrame("ani_idle0");

    this.hitZone = this.scene.add
      .rectangle(width / 2, height / 2, width, height, 0xffffff, 0.001)
      .setDepth(17)
      .setInteractive({ useHandCursor: true });
    this.hitZone.on("pointerdown", () => this.handleTap());
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    this.stopSequence();
    this.frames.forEach((frame) => {
      this.scene.tweens.killTweensOf(frame.img);
      frame.img.setAlpha(0);
      frame.img.setPosition(frame.baseX, frame.baseY);
      frame.img.setScale(frame.baseScale);
    });
    if (this.hitZone) {
      this.hitZone.destroy();
      this.hitZone = null;
    }
  }

  private handleTap() {
    if (!this.enabled) return;
    // New taps immediately restart the reaction so the character responds
    // to the latest touch without waiting for a previous sequence to end.
    this.stopSequence();
    if (Math.random() < 0.5) {
      this.playSurprise();
    } else {
      this.playHeart();
    }
  }

  private playSurprise() {
    const seq: InteractionKey[] = [
      "ani_surprise1",
      "ani_surprise2",
      "ani_surprise2",
    ];
    seq.forEach((key, idx) => {
      this.sequenceTimers.push(
        this.scene.time.delayedCall(idx * 115, () => {
          this.showFrame(key);
          this.nudgeFrame(key, -8, 1.016, 100);
        })
      );
    });
    this.sequenceTimers.push(
      this.scene.time.delayedCall(seq.length * 115 + this.reactionHoldMs, () => {
        this.setIdleLocked();
      })
    );
  }

  private playHeart() {
    // Same-name frame family is swapped with hard cuts so the
    // sequence reads like contiguous animation, not blur/fade transitions.
    const seq: InteractionKey[] = [
      "ani_heart1",
      "ani_heart2",
      "ani_heart3",
      "ani_heart2",
    ];

    seq.forEach((key, idx) => {
      this.sequenceTimers.push(
        this.scene.time.delayedCall(idx * 110, () => {
          this.showFrame(key);
          this.nudgeFrame(key, -4, 1.01, 120);
        })
      );
    });

    this.sequenceTimers.push(
      this.scene.time.delayedCall(seq.length * 110 + this.reactionHoldMs, () => {
        this.setIdleLocked();
      })
    );
  }

  private setIdleLocked() {
    this.showFrame("ani_idle0");
  }

  private stopSequence() {
    this.sequenceTimers.forEach((t) => t.remove());
    this.sequenceTimers = [];
  }

  private showFrame(key: InteractionKey) {
    this.activeKey = key;
    this.frames.forEach((frame, frameKey) => {
      const img = frame.img;
      this.scene.tweens.killTweensOf(img);
      img.setPosition(frame.baseX, frame.baseY);
      img.setScale(frame.baseScale);
      img.setAlpha(frameKey === key ? 1 : 0);
    });
  }

  private nudgeFrame(
    key: InteractionKey,
    yOffset: number,
    scaleMul: number,
    duration: number
  ) {
    const frame = this.frames.get(key);
    if (!frame) return;
    if (this.activeKey !== key) return;
    const img = frame.img;
    this.scene.tweens.killTweensOf(img);
    img.setY(frame.baseY + yOffset);
    img.setScale(frame.baseScale * scaleMul);
    this.scene.tweens.add({
      targets: img,
      y: frame.baseY,
      scaleX: frame.baseScale,
      scaleY: frame.baseScale,
      duration,
      ease: "Sine.easeOut",
    });
  }

  // Align every interaction frame to ani_idle0 by opaque-pixel bounds so
  // differing canvas trims/scale don't cause jumpy size or position.
  private calibrateFrames(centerX: number, centerY: number, targetHeight: number) {
    const refKey: InteractionKey = "ani_idle0";
    const refFrame = this.frames.get(refKey);
    if (!refFrame) return;

    const refSource = this.getTextureSource(refFrame.img);
    if (!refSource) return;
    const refCanvasH = refSource.height || 1;
    const refBounds = this.getOpaqueBounds(refSource);
    const refScale = targetHeight / refCanvasH;
    const targetOpaqueHeight = refBounds.height * refScale;
    const refOffsetX = refBounds.centerX - refSource.width / 2;
    const refOffsetY = refBounds.centerY - refSource.height / 2;

    this.frames.forEach((frame) => {
      const src = this.getTextureSource(frame.img);
      if (!src) {
        frame.baseX = centerX;
        frame.baseY = centerY;
        frame.baseScale = refScale;
        return;
      }
      const b = this.getOpaqueBounds(src);
      const scale = b.height > 0 ? targetOpaqueHeight / b.height : refScale;
      const offsetX = b.centerX - src.width / 2;
      const offsetY = b.centerY - src.height / 2;

      frame.baseScale = scale;
      frame.baseX = centerX + (refOffsetX - offsetX) * scale;
      frame.baseY = centerY + (refOffsetY - offsetY) * scale;
    });
  }

  private getTextureSource(
    img: Phaser.GameObjects.Image
  ): { width: number; height: number } & CanvasImageSource | null {
    const src = img.texture.getSourceImage() as
      | (CanvasImageSource & { width: number; height: number })
      | null;
    if (!src || !src.width || !src.height) return null;
    return src;
  }

  private getOpaqueBounds(
    src: CanvasImageSource & { width: number; height: number }
  ): OpaqueBounds {
    const w = src.width;
    const h = src.height;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return {
        width: w,
        height: h,
        centerX: w / 2,
        centerY: h / 2,
      };
    }
    ctx.drawImage(src, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;

    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = data[(y * w + x) * 4 + 3];
        if (a <= 5) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < minX || maxY < minY) {
      return {
        width: w,
        height: h,
        centerX: w / 2,
        centerY: h / 2,
      };
    }

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    return {
      width: bw,
      height: bh,
      centerX: minX + bw / 2,
      centerY: minY + bh / 2,
    };
  }
}
