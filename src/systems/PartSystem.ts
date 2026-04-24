import Phaser from "phaser";
import type { PartDef } from "../data/parts";
import { isPartUnlocked, lockReason } from "../data/parts";
import { UI_SCALE } from "../main";

const u = (n: number) => n * UI_SCALE;

type TargetedCallback = (part: PartDef) => void;
type LockedCallback = (part: PartDef, reason: string) => void;

interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PartVisual {
  rect: Phaser.GameObjects.Rectangle;
  marker: Phaser.GameObjects.Arc;
  markerRing: Phaser.GameObjects.Arc;
  lockIcon: Phaser.GameObjects.Text;
  pulse: Phaser.Tweens.Tween | null;
  ringPulse: Phaser.Tweens.Tween | null;
  cx: number;
  cy: number;
  locked: boolean;
}

export class PartSystem {
  private scene: Phaser.Scene;
  private parts: PartDef[];
  private visuals: Map<string, PartVisual> = new Map();
  private removed: Set<string> = new Set();
  private targetedCb: TargetedCallback | null = null;
  private lockedCb: LockedCallback | null = null;
  private getBounds: () => Bounds;
  private puzzleActive = false;

  constructor(
    scene: Phaser.Scene,
    parts: PartDef[],
    getBounds: () => Bounds
  ) {
    this.scene = scene;
    this.parts = [...parts].sort((a, b) => a.order - b.order);
    this.getBounds = getBounds;
  }

  onPartTargeted(cb: TargetedCallback) {
    this.targetedCb = cb;
  }

  onPartLocked(cb: LockedCallback) {
    this.lockedCb = cb;
  }

  // Called by GameScene when a puzzle starts/ends
  setPuzzleActive(active: boolean) {
    this.puzzleActive = active;
  }

  start() {
    const bounds = this.getBounds();

    this.parts.forEach((part, idx) => {
      const hx = bounds.left + part.hitbox.x * bounds.width;
      const hy = bounds.top + part.hitbox.y * bounds.height;
      const hw = part.hitbox.w * bounds.width;
      const hh = part.hitbox.h * bounds.height;
      const cx = hx + hw / 2;
      const cy = hy + hh / 2;

      const rect = this.scene.add
        .rectangle(cx, cy, hw, hh, 0xffffff, 0.001)
        .setDepth(100 + idx);
      rect.setInteractive({ useHandCursor: true });

      const markerRing = this.scene.add
        .circle(cx, cy, u(12), 0xffd572, 0)
        .setStrokeStyle(u(1.5), 0xffd572, 0.45)
        .setDepth(160 + idx);

      const marker = this.scene.add
        .circle(cx, cy, u(3.5), 0xffd572, 0.7)
        .setDepth(161 + idx);

      const lockIcon = this.scene.add
        .text(cx, cy, "✕", {
          fontFamily: "serif",
          fontSize: `${u(10)}px`,
          color: "#6a4a5a",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(162 + idx)
        .setAlpha(0);

      rect.on("pointerover", () => {
        if (this.removed.has(part.id)) return;
        const v = this.visuals.get(part.id);
        if (!v) return;
        this.scene.tweens.killTweensOf(rect);
        this.scene.tweens.add({
          targets: rect,
          fillAlpha: v.locked ? 0.04 : 0.12,
          duration: 160,
        });
        if (!v.locked) {
          this.scene.tweens.killTweensOf(v.marker);
          this.scene.tweens.add({
            targets: v.marker,
            scale: 1.6,
            alpha: 1,
            duration: 180,
          });
        }
      });
      rect.on("pointerout", () => {
        if (this.removed.has(part.id)) return;
        this.scene.tweens.killTweensOf(rect);
        this.scene.tweens.add({
          targets: rect,
          fillAlpha: 0.001,
          duration: 160,
        });
        this.applyRestingStyle(part.id);
      });
      rect.on("pointerdown", () => {
        // Block clicks while a puzzle is active to prevent double-launching
        if (this.puzzleActive) return;
        if (this.removed.has(part.id)) return;
        const v = this.visuals.get(part.id);
        if (v?.locked) {
          // Shake the lock icon so the player knows the click registered
          this.scene.tweens.killTweensOf(v.lockIcon);
          v.lockIcon.setAlpha(1);
          this.scene.tweens.add({
            targets: v.lockIcon,
            x: { from: cx - u(4), to: cx + u(4) },
            yoyo: true,
            duration: 60,
            repeat: 2,
            onComplete: () => v.lockIcon.setX(cx),
          });
          this.lockedCb?.(part, lockReason(part.id, this.removed));
          return;
        }
        console.log(`[PartSystem] triggering puzzle for ${part.id}`);
        this.targetedCb?.(part);
      });

      this.visuals.set(part.id, {
        rect,
        marker,
        markerRing,
        lockIcon,
        pulse: null,
        ringPulse: null,
        cx,
        cy,
        locked: false,
      });
    });

    this.refreshLocks();
  }

  // Call after the caller's removed-set changes (after a successful
  // puzzle). Re-evaluates lock state for every surviving part and re-runs
  // the resting animation with the right colors.
  refreshLocks() {
    this.parts.forEach((part) => {
      if (this.removed.has(part.id)) return;
      const v = this.visuals.get(part.id);
      if (!v) return;
      const unlocked = isPartUnlocked(part.id, this.removed);
      v.locked = !unlocked;
      this.applyRestingStyle(part.id);
    });
  }

  setRemovedSet(removed: Set<string>) {
    this.removed = removed;
  }

  private applyRestingStyle(id: string) {
    const v = this.visuals.get(id);
    if (!v) return;
    if (this.removed.has(id)) return;
    this.scene.tweens.killTweensOf(v.marker);
    this.scene.tweens.killTweensOf(v.markerRing);
    this.scene.tweens.killTweensOf(v.lockIcon);
    if (v.pulse) {
      v.pulse.stop();
      v.pulse = null;
    }
    if (v.ringPulse) {
      v.ringPulse.stop();
      v.ringPulse = null;
    }

    if (v.locked) {
      // Locked: muted greyish marker, subtle X overlay, no pulse
      v.marker.setFillStyle(0x6a5540, 0.5);
      v.marker.setScale(0.85);
      v.markerRing.setStrokeStyle(u(1), 0x6a5540, 0.28);
      v.markerRing.setScale(1);
      v.lockIcon.setAlpha(0.55);
    } else {
      // Available: bright gold, pulsing ring
      v.marker.setFillStyle(0xffd572, 0.7);
      v.marker.setScale(1);
      v.markerRing.setStrokeStyle(u(1.5), 0xffd572, 0.45);
      v.markerRing.setScale(1);
      v.lockIcon.setAlpha(0);
      v.pulse = this.scene.tweens.add({
        targets: v.marker,
        scale: { from: 0.8, to: 1.3 },
        alpha: { from: 0.8, to: 0.35 },
        yoyo: true,
        duration: 1100,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      v.ringPulse = this.scene.tweens.add({
        targets: v.markerRing,
        scale: { from: 1, to: 1.9 },
        alpha: { from: 0.6, to: 0 },
        duration: 1600,
        repeat: -1,
        ease: "Quad.easeOut",
      });
    }
  }

  removePart(id: string) {
    if (this.removed.has(id)) return;
    this.removed.add(id);

    const v = this.visuals.get(id);
    if (v) {
      const flash = this.scene.add
        .circle(v.cx, v.cy, u(18), 0xffd572, 0.7)
        .setDepth(200);
      this.scene.tweens.add({
        targets: flash,
        alpha: 0,
        scale: 3.5,
        duration: 600,
        onComplete: () => flash.destroy(),
      });
      v.rect.disableInteractive();
      this.scene.tweens.killTweensOf(v.marker);
      this.scene.tweens.killTweensOf(v.markerRing);
      this.scene.tweens.killTweensOf(v.lockIcon);
      this.scene.tweens.add({
        targets: [v.rect, v.marker, v.markerRing, v.lockIcon],
        alpha: 0,
        duration: 320,
        onComplete: () => {
          v.rect.destroy();
          v.marker.destroy();
          v.markerRing.destroy();
          v.lockIcon.destroy();
          if (v.pulse) v.pulse.stop();
          if (v.ringPulse) v.ringPulse.stop();
        },
      });
    }

    const part = this.parts.find((p) => p.id === id);
    if (part) this.scene.events.emit("part-removed", part);

    // After a removal, some other parts might have just unlocked
    this.refreshLocks();
  }
}
