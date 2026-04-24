import Phaser from "phaser";
import { INTERACTION_ORDER, type InteractionKey } from "../data/parts";

interface InteractionFrame {
  img: Phaser.GameObjects.Image;
  baseX: number;
  baseY: number;
  baseScale: number;
}

export class InteractionSystem {
  private scene: Phaser.Scene;
  private frames: Map<InteractionKey, InteractionFrame> = new Map();
  private activeKey: InteractionKey = "ani_idle1";
  private hitZone: Phaser.GameObjects.Rectangle | null = null;
  private enabled = false;
  private sequenceTimers: Phaser.Time.TimerEvent[] = [];

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
      const srcH = img.height;
      if (srcH > 0) {
        img.setScale(targetHeight / srcH);
      }
      this.frames.set(key, {
        img,
        baseX: centerX,
        baseY: centerY,
        baseScale: img.scaleX,
      });
    });
  }

  enable(width: number, height: number) {
    if (this.enabled) return;
    this.enabled = true;
    this.stopSequence();
    this.showFrame("ani_idle1");

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
      "ani_surprise3",
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
      this.scene.time.delayedCall(seq.length * 115 + 80, () => {
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
      "ani_heart4",
      "ani_heart5",
      "ani_heart4",
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
      this.scene.time.delayedCall(seq.length * 110 + 90, () => {
        this.setIdleLocked();
      })
    );
  }

  private setIdleLocked() {
    this.showFrame("ani_idle1");
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
}
