import Phaser from "phaser";
import type { PartDef } from "../data/parts";
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
  private inputEnabled = true;

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

  // Used by GameScene when switching to interaction mode.
  setInputEnabled(enabled: boolean) {
    this.inputEnabled = enabled;
    this.visuals.forEach((v, id) => {
      if (this.removed.has(id)) return;
      if (enabled) {
        v.rect.setInteractive({ useHandCursor: true });
        v.rect.setAlpha(0.001);
        this.applyRestingStyle(id);
      } else {
        v.rect.disableInteractive();
        this.scene.tweens.killTweensOf(v.rect);
        this.scene.tweens.killTweensOf(v.marker);
        this.scene.tweens.killTweensOf(v.markerRing);
        v.rect.setAlpha(0);
        v.marker.setAlpha(0);
        v.markerRing.setAlpha(0);
        v.lockIcon.setAlpha(0);
      }
    });
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
      const touchW = Math.max(hw, u(112));
      const touchH = Math.max(hh, u(96));

      const rect = this.scene.add
        .rectangle(cx, cy, touchW, touchH, 0xffffff, 0.001)
        .setDepth(100 + idx);
      rect.setInteractive({ useHandCursor: true });

      const markerRing = this.scene.add
        .circle(cx, cy, u(28), 0xffd572, 0.1)
        .setStrokeStyle(u(3), 0xffd572, 0.75)
        .setDepth(160 + idx);

      const marker = this.scene.add
        .circle(cx, cy, u(12), 0xffd572, 0.9)
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
        if (!this.inputEnabled) return;
        if (this.removed.has(part.id)) return;
        const v = this.visuals.get(part.id);
        if (!v) return;
        this.scene.tweens.killTweensOf(rect);
        this.scene.tweens.add({
          targets: rect,
          fillAlpha: v.locked ? 0.08 : 0.18,
          duration: 160,
        });
        if (!v.locked) {
          this.scene.tweens.killTweensOf(v.marker);
          this.scene.tweens.add({
            targets: v.marker,
            scale: 1.35,
            alpha: 1,
            duration: 180,
          });
        }
      });
      rect.on("pointerout", () => {
        if (!this.inputEnabled) return;
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
        if (!this.inputEnabled) return;
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
          this.lockedCb?.(part, this.lockReason(part.id));
          return;
        }
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
      const unlocked = this.isPartUnlocked(part.id);
      v.locked = !unlocked;
      this.applyRestingStyle(part.id);
    });
  }

  setRemovedSet(removed: Set<string>) {
    this.removed = removed;
  }

  private getPart(partId: string): PartDef | undefined {
    return this.parts.find((p) => p.id === partId);
  }

  private isPartUnlocked(partId: string): boolean {
    if (this.removed.has(partId)) return false;
    return true;
  }

  private lockReason(partId: string): string {
    const part = this.getPart(partId);
    if (!part) return "";
    const missing = part.prerequisites.filter((id) => !this.removed.has(id));
    if (missing.length === 0) return "";
    const labels = missing.map((id) => this.getPart(id)?.label ?? id);
    return `먼저 ${labels.join(" > ")} 해제가 필요합니다.`;
  }

  private applyRestingStyle(id: string) {
    const v = this.visuals.get(id);
    if (!v) return;
    if (this.removed.has(id)) return;
    if (!this.inputEnabled) return;
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
      v.markerRing.setStrokeStyle(u(2), 0x6a5540, 0.45);
      v.markerRing.setScale(1);
      v.lockIcon.setAlpha(0.55);
    } else {
      // Available: bright gold, pulsing ring
      v.marker.setFillStyle(0xffd572, 0.92);
      v.marker.setScale(1);
      v.markerRing.setStrokeStyle(u(3), 0xffd572, 0.78);
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
      this.scene.cameras.main.shake(180, 0.006);
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
      const shockwave = this.scene.add
        .circle(v.cx, v.cy, u(26), 0xffffff, 0)
        .setStrokeStyle(u(3), 0xfff1a6, 0.92)
        .setDepth(201);
      this.scene.tweens.add({
        targets: shockwave,
        alpha: 0,
        scale: 4.2,
        duration: 520,
        ease: "Quad.easeOut",
        onComplete: () => shockwave.destroy(),
      });
      for (let i = 0; i < 18; i++) {
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const dist = Phaser.Math.Between(u(42), u(120));
        const shard = this.scene.add
          .rectangle(
            v.cx + Phaser.Math.Between(-u(14), u(14)),
            v.cy + Phaser.Math.Between(-u(14), u(14)),
            Phaser.Math.Between(u(5), u(14)),
            Phaser.Math.Between(u(3), u(9)),
            i % 3 === 0 ? 0xffffff : 0xffd572,
            0.9
          )
          .setAngle(Phaser.Math.Between(0, 180))
          .setDepth(202);
        this.scene.tweens.add({
          targets: shard,
          x: v.cx + Math.cos(angle) * dist,
          y: v.cy + Math.sin(angle) * dist * 0.75,
          alpha: 0,
          angle: shard.angle + Phaser.Math.Between(-220, 220),
          scale: Phaser.Math.FloatBetween(0.25, 0.55),
          duration: Phaser.Math.Between(460, 760),
          ease: "Cubic.easeOut",
          onComplete: () => shard.destroy(),
        });
      }
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
          // Drop the entry so later iterations of `visuals` don't see a
          // map slot pointing at destroyed Phaser objects.
          this.visuals.delete(id);
        },
      });
    }

    const part = this.parts.find((p) => p.id === id);
    if (part) this.scene.events.emit("part-removed", part);

    // After a removal, some other parts might have just unlocked
    this.refreshLocks();
  }
}
