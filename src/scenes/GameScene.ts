import Phaser from "phaser";
import { PartSystem } from "../systems/PartSystem";
import { PuzzleSystem } from "../systems/PuzzleSystem";
import { ProgressSystem } from "../systems/ProgressSystem";
import { StageManager } from "../systems/StageManager";
import {
  PARTS,
  FINALE_STAGE,
  STAGE_TIER,
  stageForRemoved,
} from "../data/parts";

export class GameScene extends Phaser.Scene {
  private partSystem!: PartSystem;
  private puzzleSystem!: PuzzleSystem;
  private progressSystem!: ProgressSystem;
  private stageManager!: StageManager;

  // Viewing mode: after the finale fades in, the player can pinch/wheel-
  // zoom and drag-pan the main character view. Disabled during gameplay
  // so clicks fire on parts, not the camera.
  private viewingMode = false;
  private activePointers: Phaser.Input.Pointer[] = [];
  private pinchStartDist = 0;
  private pinchStartZoom = 1;
  private panLastX = 0;
  private panLastY = 0;
  private isPanning = false;

  constructor() {
    super("GameScene");
  }

  create() {
    const { width, height } = this.scale;

    // Reset per-restart state
    this.viewingMode = false;
    this.activePointers = [];
    this.isPanning = false;
    this.cameras.main.setZoom(1);
    this.cameras.main.setScroll(0, 0);

    const bg = this.add.image(width / 2, height / 2, "bg");
    const bgScale = Math.max(width / bg.width, height / bg.height);
    bg.setScale(bgScale).setAlpha(0.8);

    const vignette = this.add.graphics();
    vignette.fillStyle(0x0a050f, 0.65);
    vignette.fillRect(0, 0, width, height);
    const mask = this.make.graphics({ x: 0, y: 0 }, false);
    mask.fillStyle(0xffffff, 1);
    mask.fillEllipse(width / 2, height / 2, width * 1.15, height * 0.85);
    const geomMask = mask.createGeometryMask();
    geomMask.invertAlpha = true;
    vignette.setMask(geomMask);

    const baseTex = this.textures.get("E1").getSourceImage() as HTMLImageElement;
    const origW = baseTex.width;
    const origH = baseTex.height;
    const scale = Math.min(
      (height * 0.78) / origH,
      (width * 0.75) / origW
    );

    const characterX = width / 2;
    const characterY = height * 0.54;

    this.stageManager = new StageManager(this, characterX, characterY, scale);

    this.progressSystem = new ProgressSystem(PARTS.length);
    this.partSystem = new PartSystem(this, PARTS, () =>
      this.stageManager.getDisplayBounds()
    );
    this.puzzleSystem = new PuzzleSystem(this);

    // Track removed IDs. The current stage is derived from this set via
    // stageForRemoved(). Tier 1 branches: stage5 (boots first) vs stage6
    // (cape first). All other tiers are count-driven. The monotonic guard
    // (compare TIERS not raw keys) prevents the crossfade from ever
    // running backwards even though stage5/stage6 share a tier.
    const removed = new Set<string>();
    this.partSystem.setRemovedSet(removed);

    this.partSystem.onPartLocked((part, reason) => {
      // Forward to UIScene so the hint bar can flash the ordering rule
      this.events.emit("part-locked", { part, reason });
    });

    this.partSystem.onPartTargeted((part) => {
      // Block other parts from being clicked while puzzle is active
      this.partSystem.setPuzzleActive(true);
      this.puzzleSystem.start(part, (success) => {
        // Re-enable part clicking when puzzle ends
        this.partSystem.setPuzzleActive(false);
        if (success) {
          this.partSystem.removePart(part.id);
          this.progressSystem.advance();
          removed.add(part.id);
          this.events.emit("progress", this.progressSystem.getProgress());
          if (this.progressSystem.isFinished()) {
            this.events.emit("finale");
            this.time.delayedCall(1400, () => {
              this.stageManager.transitionTo(FINALE_STAGE, 1200);
              // Enable viewing-mode zoom once the finale image is up
              this.time.delayedCall(1300, () => {
                this.enableViewingMode();
              });
            });
          } else if (part.stageAfter !== null) {
            const targetKey = stageForRemoved(removed);
            const currentKey = this.stageManager.getCurrentKey();
            if (targetKey === currentKey) return;
            const targetTier = STAGE_TIER[targetKey];
            const currentTier = STAGE_TIER[currentKey];
            if (targetTier > currentTier) {
              this.stageManager.transitionTo(targetKey);
            }
          }
        } else {
          this.events.emit("failure", part.id);
        }
      });
    });

    this.partSystem.start();
    this.events.emit("progress", this.progressSystem.getProgress());

    // Cross-scene request to re-center / reset zoom (fired from UIScene
    // when the user picks "다시 하기" etc.)
    this.events.on("viewing-reset", () => this.resetView());
  }

  // ---------- Viewing mode (zoom/pan after finale) ----------

  private enableViewingMode() {
    if (this.viewingMode) return;
    this.viewingMode = true;
    // Two-pointer support for pinch gestures on touch devices
    this.input.addPointer(2);
    // Tell UIScene so it can draw on-screen zoom controls
    this.events.emit("viewing-mode");

    this.input.on("wheel", this.onWheel, this);
    this.input.on("pointerdown", this.onPointerDown, this);
    this.input.on("pointermove", this.onPointerMove, this);
    this.input.on("pointerup", this.onPointerUp, this);
    this.input.on("pointerupoutside", this.onPointerUp, this);

    // React to UIScene zoom-button events (+ / − / ⟲ buttons)
    this.events.on("zoom-in",    () => this.adjustZoomAt(1.25));
    this.events.on("zoom-out",   () => this.adjustZoomAt(0.8));
    this.events.on("zoom-reset", () => this.resetView());
  }

  private onWheel = (
    pointer: Phaser.Input.Pointer,
    _over: Phaser.GameObjects.GameObject[],
    _dx: number,
    dy: number
  ) => {
    if (!this.viewingMode) return;
    // Zoom toward the cursor position so the hovered area stays fixed
    const factor = dy > 0 ? 0.9 : 1.1;
    this.applyZoom(
      Phaser.Math.Clamp(this.cameras.main.zoom * factor, 1, 3.5),
      pointer.x,
      pointer.y
    );
  };

  private onPointerDown = (pointer: Phaser.Input.Pointer) => {
    if (!this.viewingMode) return;
    if (!this.activePointers.includes(pointer)) {
      this.activePointers.push(pointer);
    }
    if (this.activePointers.length === 1) {
      this.isPanning = true;
      this.panLastX = pointer.x;
      this.panLastY = pointer.y;
    } else if (this.activePointers.length === 2) {
      // Begin pinch — record the current gap and zoom level
      this.isPanning = false;
      const [a, b] = this.activePointers;
      this.pinchStartDist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
      this.pinchStartZoom = this.cameras.main.zoom;
    }
  };

  private onPointerMove = (pointer: Phaser.Input.Pointer) => {
    if (!this.viewingMode) return;
    void pointer;
    if (this.activePointers.length === 2) {
      const [a, b] = this.activePointers;
      const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
      if (this.pinchStartDist > 0) {
        const ratio = d / this.pinchStartDist;
        const newZoom = Phaser.Math.Clamp(this.pinchStartZoom * ratio, 1, 3.5);
        // Zoom toward the midpoint between both fingers
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        this.applyZoom(newZoom, midX, midY);
      }
    } else if (this.isPanning && this.activePointers.length === 1) {
      const p = this.activePointers[0];
      if (!p.isDown) return;
      const cam = this.cameras.main;
      if (cam.zoom <= 1.001) return;
      // Map screen-space drag delta to world-space scroll delta.
      // scrollX/Y define the top-left corner in world coords, so moving
      // the pointer right (dx>0) means the world should scroll left
      // (scrollX decreases) — the content follows the finger.
      const dx = p.x - this.panLastX;
      const dy = p.y - this.panLastY;
      cam.scrollX -= dx / cam.zoom;
      cam.scrollY -= dy / cam.zoom;
      this.panLastX = p.x;
      this.panLastY = p.y;
      this.clampScroll();
    }
  };

  private onPointerUp = (pointer: Phaser.Input.Pointer) => {
    const idx = this.activePointers.indexOf(pointer);
    if (idx >= 0) this.activePointers.splice(idx, 1);
    if (this.activePointers.length === 0) {
      this.isPanning = false;
    } else if (this.activePointers.length === 1) {
      // Transitioning pinch → single-finger pan: reseed the anchor
      const p = this.activePointers[0];
      this.isPanning = true;
      this.panLastX = p.x;
      this.panLastY = p.y;
      this.pinchStartDist = 0;
    }
  };

  // Zoom toward the center of the viewport (used by + / − buttons)
  private adjustZoomAt(factor: number) {
    const { width, height } = this.scale;
    this.applyZoom(
      Phaser.Math.Clamp(this.cameras.main.zoom * factor, 1, 3.5),
      width / 2,
      height / 2
    );
  }

  // Core zoom helper: set an exact zoom level while keeping the world
  // point under (screenX, screenY) visually anchored.
  private applyZoom(newZoom: number, screenX: number, screenY: number) {
    const cam = this.cameras.main;
    const oldZoom = cam.zoom;
    if (newZoom === oldZoom) return;
    // World point currently under the anchor screen position
    const worldX = cam.scrollX + screenX / oldZoom;
    const worldY = cam.scrollY + screenY / oldZoom;
    cam.setZoom(newZoom);
    // Adjust scroll so that same world point is still under the anchor
    cam.scrollX = worldX - screenX / newZoom;
    cam.scrollY = worldY - screenY / newZoom;
    this.clampScroll();
  }

  // Keep the scroll within reachable bounds. At zoom=1 snap to origin.
  // At higher zoom we allow the scroll to go slightly negative so the
  // character's head (which sits near the top of the canvas) is reachable
  // even after deep zoom. The extra vertical headroom is one half-viewport
  // worth of canvas height; horizontally we add a quarter-viewport margin.
  private clampScroll() {
    const cam = this.cameras.main;
    const { width, height } = this.scale;
    if (cam.zoom <= 1.001) {
      cam.setScroll(0, 0);
      return;
    }
    const visW = width  / cam.zoom;
    const visH = height / cam.zoom;
    // Allow scrolling up to half a viewport ABOVE the canvas top so the
    // head (at ~15% of canvas height) is always reachable at any zoom.
    const padV = visH * 0.5;
    const padH = visW * 0.25;
    cam.scrollX = Phaser.Math.Clamp(cam.scrollX, -padH, width  - visW + padH);
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, -padV, height - visH + padV);
  }

  private resetView() {
    this.tweens.add({
      targets: this.cameras.main,
      zoom: 1,
      scrollX: 0,
      scrollY: 0,
      duration: 280,
      ease: "Quad.easeOut",
    });
  }
}
