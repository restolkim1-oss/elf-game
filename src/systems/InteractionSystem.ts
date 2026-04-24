import Phaser from "phaser";
import { INTERACTION_ORDER, type InteractionKey } from "../data/parts";

// 3-state reaction machine:
//   idle     → slow idle1 ↔ idle2 breathing loop (resting)
//   surprise → single Surprise frame held briefly, auto-returns to idle
//   heart    → Heart1→2→3→4 cycle; each click extends the timer so the
//              player can hold the state as long as they keep tapping
type InteractionState = "idle" | "surprise" | "heart";

export class InteractionSystem {
  private scene: Phaser.Scene;
  private images: Map<InteractionKey, Phaser.GameObjects.Image> = new Map();
  private state: InteractionState = "idle";
  private idleFrame: "idle1" | "idle2" = "idle1";
  private heartFrame: 1 | 2 | 3 | 4 = 1;

  private breathTimer: Phaser.Time.TimerEvent | null = null;
  private returnTimer: Phaser.Time.TimerEvent | null = null;
  private heartCycleTimer: Phaser.Time.TimerEvent | null = null;

  private hitZone: Phaser.GameObjects.Rectangle | null = null;
  private enabled = false;

  constructor(
    scene: Phaser.Scene,
    centerX: number,
    centerY: number,
    targetHeight: number
  ) {
    this.scene = scene;

    // Preload all interaction images at the same pivot, scaled so each
    // one's displayHeight matches the target (the same height as the
    // base E1 character). Widths auto-adjust per-image.
    INTERACTION_ORDER.forEach((key) => {
      const img = scene.add
        .image(centerX, centerY, key)
        .setOrigin(0.5, 0.5)
        .setAlpha(0)
        .setDepth(18); // Above the undress stage (depth 10) but below UI
      const srcH = img.height;
      if (srcH > 0) {
        img.setScale(targetHeight / srcH);
      }
      this.images.set(key, img);
    });
  }

  // Activate interaction mode. Fades in idle1, starts the breathing
  // loop, and puts a full-canvas invisible click capture on top of
  // everything so taps anywhere trigger a reaction.
  enable(width: number, height: number) {
    if (this.enabled) return;
    this.enabled = true;
    this.state = "idle";
    this.idleFrame = "idle1";

    // Fade in idle1 (other frames stay at alpha 0)
    this.crossfadeTo("idle1", 520);
    this.startBreathing();

    // Click-capture rectangle covering the whole canvas
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
    this.images.forEach((img) => {
      this.scene.tweens.killTweensOf(img);
      this.scene.tweens.add({ targets: img, alpha: 0, duration: 300 });
    });
    if (this.hitZone) {
      this.hitZone.destroy();
      this.hitZone = null;
    }
    this.state = "idle";
  }

  // ---------- State transitions ----------

  private handleTap() {
    if (!this.enabled) return;
    if (this.state === "idle") {
      this.goSurprise();
    } else {
      // Already past idle — jump straight to heart state
      this.goHeart();
    }
  }

  private goSurprise() {
    this.state = "surprise";
    this.stopBreathing();
    this.crossfadeTo("surprise", 180);
    if (this.returnTimer) this.returnTimer.remove();
    // If no follow-up tap, go back to idle after ~1.6 s
    this.returnTimer = this.scene.time.delayedCall(1600, () => this.goIdle());
  }

  private goHeart() {
    if (this.returnTimer) this.returnTimer.remove();
    if (this.state !== "heart") {
      this.state = "heart";
      this.heartFrame = 1;
      this.crossfadeTo("heart1", 200);
      this.startHeartCycle();
    }
    // Each tap while in heart state extends the stay
    this.returnTimer = this.scene.time.delayedCall(4800, () => this.goIdle());
  }

  private goIdle() {
    this.state = "idle";
    if (this.returnTimer) {
      this.returnTimer.remove();
      this.returnTimer = null;
    }
    if (this.heartCycleTimer) {
      this.heartCycleTimer.remove();
      this.heartCycleTimer = null;
    }
    this.idleFrame = "idle1";
    this.crossfadeTo("idle1", 380);
    this.startBreathing();
  }

  // ---------- Idle breathing loop ----------

  private startBreathing() {
    if (this.breathTimer) this.breathTimer.remove();
    this.breathTimer = this.scene.time.addEvent({
      delay: 2400,
      loop: true,
      callback: () => {
        if (this.state !== "idle") return;
        this.idleFrame = this.idleFrame === "idle1" ? "idle2" : "idle1";
        this.crossfadeTo(this.idleFrame, 900);
      },
    });
  }

  private stopBreathing() {
    if (this.breathTimer) {
      this.breathTimer.remove();
      this.breathTimer = null;
    }
  }

  // ---------- Heart cycle ----------

  private startHeartCycle() {
    if (this.heartCycleTimer) this.heartCycleTimer.remove();
    this.heartCycleTimer = this.scene.time.addEvent({
      delay: 650,
      loop: true,
      callback: () => {
        if (this.state !== "heart") return;
        this.heartFrame = (this.heartFrame === 4
          ? 1
          : this.heartFrame + 1) as 1 | 2 | 3 | 4;
        this.crossfadeTo(
          `heart${this.heartFrame}` as InteractionKey,
          220
        );
      },
    });
  }

  private stopAllTimers() {
    this.stopBreathing();
    if (this.returnTimer) {
      this.returnTimer.remove();
      this.returnTimer = null;
    }
    if (this.heartCycleTimer) {
      this.heartCycleTimer.remove();
      this.heartCycleTimer = null;
    }
  }

  // ---------- Image alpha helpers ----------

  private crossfadeTo(key: InteractionKey, duration = 300) {
    this.images.forEach((img, k) => {
      const targetAlpha = k === key ? 1 : 0;
      if (Math.abs(img.alpha - targetAlpha) < 0.005) return;
      this.scene.tweens.killTweensOf(img);
      this.scene.tweens.add({ targets: img, alpha: targetAlpha, duration });
    });
  }
}
