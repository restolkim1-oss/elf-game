import Phaser from "phaser";
import { INTERACTION_ORDER, type InteractionKey } from "../data/parts";

type InteractionState = "idle" | "surprise" | "heart";

interface InteractionFrame {
  img: Phaser.GameObjects.Image;
  baseX: number;
  baseY: number;
  baseScale: number;
}

export class InteractionSystem {
  private scene: Phaser.Scene;
  private frames: Map<InteractionKey, InteractionFrame> = new Map();
  private state: InteractionState = "idle";
  private idleFrame: "idle1" | "idle2" = "idle1";
  private heartFrame: 1 | 2 | 3 | 4 = 1;

  private breathTimer: Phaser.Time.TimerEvent | null = null;
  private returnTimer: Phaser.Time.TimerEvent | null = null;
  private heartCycleTimer: Phaser.Time.TimerEvent | null = null;
  private surpriseChainTimer: Phaser.Time.TimerEvent | null = null;

  private hitZone: Phaser.GameObjects.Rectangle | null = null;
  private enabled = false;

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
    this.state = "idle";
    this.idleFrame = "idle1";
    this.heartFrame = 1;

    this.frames.forEach((frame, key) => {
      this.scene.tweens.killTweensOf(frame.img);
      frame.img.setAlpha(key === "idle1" ? 1 : 0);
      frame.img.setPosition(frame.baseX, frame.baseY);
      frame.img.setScale(frame.baseScale);
    });

    this.startBreathing();

    this.hitZone = this.scene.add
      .rectangle(width / 2, height / 2, width, height, 0xffffff, 0.001)
      .setDepth(17)
      .setInteractive({ useHandCursor: true });
    this.hitZone.on("pointerdown", () => this.handleTap());
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    this.stopAllTimers();
    this.frames.forEach((frame) => {
      this.scene.tweens.killTweensOf(frame.img);
      this.scene.tweens.add({
        targets: frame.img,
        alpha: 0,
        duration: 260,
        ease: "Sine.easeOut",
      });
    });
    if (this.hitZone) {
      this.hitZone.destroy();
      this.hitZone = null;
    }
    this.state = "idle";
  }

  private handleTap() {
    if (!this.enabled) return;
    if (this.state === "idle") {
      this.goSurprise();
      return;
    }
    if (this.state === "surprise") {
      this.goHeart();
      return;
    }
    this.goHeart();
  }

  private clearReturnTimers() {
    if (this.returnTimer) {
      this.returnTimer.remove();
      this.returnTimer = null;
    }
    if (this.surpriseChainTimer) {
      this.surpriseChainTimer.remove();
      this.surpriseChainTimer = null;
    }
  }

  private nudgeFrame(
    key: InteractionKey,
    yOffset: number,
    scaleMul: number,
    duration: number
  ) {
    const frame = this.frames.get(key);
    if (!frame) return;
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

  private goSurprise() {
    this.state = "surprise";
    this.stopBreathing();
    this.clearReturnTimers();
    this.crossfadeTo("surprise", 240);
    this.nudgeFrame("surprise", -10, 1.018, 200);
    // Chain to heart automatically so one tap feels like a full reaction.
    this.surpriseChainTimer = this.scene.time.delayedCall(780, () => {
      if (this.state === "surprise") this.goHeart();
    });
  }

  private goHeart() {
    this.clearReturnTimers();
    if (this.state !== "heart") {
      this.state = "heart";
      this.heartFrame = 1;
      this.crossfadeTo("heart1", 250);
      this.nudgeFrame("heart1", -6, 1.012, 260);
      this.startHeartCycle();
    } else {
      const key = `heart${this.heartFrame}` as InteractionKey;
      this.nudgeFrame(key, -3, 1.008, 180);
    }
    this.returnTimer = this.scene.time.delayedCall(4200, () => this.goIdle());
  }

  private goIdle() {
    this.state = "idle";
    this.clearReturnTimers();
    if (this.heartCycleTimer) {
      this.heartCycleTimer.remove();
      this.heartCycleTimer = null;
    }
    this.idleFrame = "idle1";
    this.crossfadeTo("idle1", 420);
    this.nudgeFrame("idle1", 4, 0.992, 320);
    this.startBreathing();
  }

  private startBreathing() {
    if (this.breathTimer) this.breathTimer.remove();
    this.breathTimer = this.scene.time.addEvent({
      delay: 2400,
      loop: true,
      callback: () => {
        if (this.state !== "idle") return;
        this.idleFrame = this.idleFrame === "idle1" ? "idle2" : "idle1";
        this.crossfadeTo(this.idleFrame, 760);
        this.nudgeFrame(this.idleFrame, 5, 0.994, 520);
      },
    });
  }

  private stopBreathing() {
    if (this.breathTimer) {
      this.breathTimer.remove();
      this.breathTimer = null;
    }
  }

  private startHeartCycle() {
    if (this.heartCycleTimer) this.heartCycleTimer.remove();
    this.heartCycleTimer = this.scene.time.addEvent({
      delay: 430,
      loop: true,
      callback: () => {
        if (this.state !== "heart") return;
        this.heartFrame = (this.heartFrame === 4
          ? 1
          : this.heartFrame + 1) as 1 | 2 | 3 | 4;
        const key = `heart${this.heartFrame}` as InteractionKey;
        this.crossfadeTo(key, 300);
        this.nudgeFrame(key, -3, 1.009, 240);
      },
    });
  }

  private stopAllTimers() {
    this.stopBreathing();
    this.clearReturnTimers();
    if (this.heartCycleTimer) {
      this.heartCycleTimer.remove();
      this.heartCycleTimer = null;
    }
  }

  private crossfadeTo(key: InteractionKey, duration = 300) {
    this.frames.forEach((frame, k) => {
      const img = frame.img;
      const targetAlpha = k === key ? 1 : 0;
      if (Math.abs(img.alpha - targetAlpha) < 0.005) return;
      this.scene.tweens.killTweensOf(img);
      this.scene.tweens.add({
        targets: img,
        alpha: targetAlpha,
        duration,
        ease: k === key ? "Sine.easeOut" : "Sine.easeIn",
      });
    });
  }
}
