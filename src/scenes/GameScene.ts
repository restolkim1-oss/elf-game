import Phaser from "phaser";
import { PartSystem } from "../systems/PartSystem";
import { PuzzleSystem } from "../systems/PuzzleSystem";
import { ProgressSystem } from "../systems/ProgressSystem";
import { StageManager } from "../systems/StageManager";
import { InteractionSystem } from "../systems/InteractionSystem";
import {
  PARTS,
  FINALE_STAGE,
  STAGE_TIER,
  type PuzzleType,
  type StageKey,
  stageForRemoved,
} from "../data/parts";

const SHOP = {
  flower: { label: "꽃", cost: 18, affinity: 10 },
  choco: { label: "초콜릿", cost: 30, affinity: 10 },
  perfume: { label: "향수", cost: 44, affinity: 10 },
} as const;
type ShopItemId = keyof typeof SHOP;

const AFFINITY_MAX = 100;
const STAGE2_UNLOCK_AFFINITY = 40;
const STAGE3_UNLOCK_AFFINITY = 100;

type StageSet = 1 | 2 | 3;

export class GameScene extends Phaser.Scene {
  private partSystem!: PartSystem;
  private puzzleSystem!: PuzzleSystem;
  private progressSystem!: ProgressSystem;
  private stageManager!: StageManager;
  private interactionSystem!: InteractionSystem;

  private interactionActive = false;
  private interactionReturnKey: StageKey = "E1";
  private removed = new Set<string>();
  private finaleTriggered = false;
  private puzzleBusy = false;
  private abortingPuzzle = false;

  private stageSet: StageSet = 1;
  private stage2StoryUnlocked = false;
  private stage3StoryUnlocked = false;
  private currency = 0;
  private affinity = 0;
  private inventory: Record<ShopItemId, number> = {
    flower: 0,
    choco: 0,
    perfume: 0,
  };

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

    this.viewingMode = false;
    this.activePointers = [];
    this.isPanning = false;
    this.finaleTriggered = false;
    this.removed = new Set<string>();
    this.interactionReturnKey = "E1";
    this.loadMetaState();
    this.stageSet = this.normalizeStageSet(this.getConfiguredStageSet());
    this.registry.set("stage-set", this.stageSet);
    this.cameras.main.setZoom(1);
    this.cameras.main.setScroll(0, 0);

    const bg = this.add.image(width / 2, height / 2, this.resolveBackgroundKey());
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

    const baseTex = this.textures
      .get(this.resolveTextureKey("E1"))
      .getSourceImage() as HTMLImageElement;
    const origW = baseTex.width;
    const origH = baseTex.height;
    const topUi = 2 * 124 + 30;
    const botUi = 2 * 190 + 30;
    const availableH = height - topUi - botUi;
    const scale = Math.min(availableH / origH, (width * 0.78) / origW);

    const characterX = width / 2;
    const characterY = topUi + availableH / 2;

    this.stageManager = new StageManager(
      this,
      characterX,
      characterY,
      scale,
      (key) => this.resolveTextureKey(key)
    );

    this.interactionSystem = new InteractionSystem(
      this,
      characterX,
      characterY,
      origH * scale
    );
    this.interactionActive = false;

    this.progressSystem = new ProgressSystem(PARTS.length);
    this.partSystem = new PartSystem(this, PARTS, () =>
      this.stageManager.getDisplayBounds()
    );
    this.puzzleSystem = new PuzzleSystem(this);

    this.partSystem.setRemovedSet(this.removed);

    this.partSystem.onPartLocked((part, reason) => {
      this.events.emit("part-locked", { part, reason });
    });

    this.partSystem.onPartTargeted((part) => {
      if (this.puzzleBusy) return;
      this.puzzleBusy = true;
      this.events.emit("puzzle-busy", true);
      this.partSystem.setPuzzleActive(true);
      this.puzzleSystem.start(part, (success) => {
        this.puzzleBusy = false;
        this.events.emit("puzzle-busy", false);
        this.partSystem.setPuzzleActive(false);
        if (success) {
          this.grantCoins(8 + part.difficulty * 4, `${part.label} 성공`);
          this.partSystem.removePart(part.id);
          this.progressSystem.advance();
          this.removed.add(part.id);
          this.events.emit("progress", this.progressSystem.getProgress());
          if (this.progressSystem.isFinished()) {
            this.triggerFinale();
          } else {
            const targetKey = stageForRemoved(this.removed);
            const currentKey = this.stageManager.getCurrentKey();
            if (targetKey !== currentKey) {
              const targetTier = STAGE_TIER[targetKey];
              const currentTier = STAGE_TIER[currentKey];
              if (targetTier > currentTier) {
                this.stageManager.transitionTo(targetKey);
              }
            }
          }
        } else {
          if (this.puzzleSystem.consumeLastCancelled() || this.abortingPuzzle) {
            this.abortingPuzzle = false;
            this.feedback("미니게임을 포기했습니다.");
          } else {
            this.events.emit("failure", part.id);
          }
        }
      });
    });

    this.partSystem.start();
    this.events.emit("progress", this.progressSystem.getProgress());
    this.emitEconomyState();
    this.events.emit("stage-set", this.stageSet);

    this.events.on("viewing-reset", () => this.resetView());
    this.events.on("enter-interaction", () => this.enterInteractionMode());
    this.events.on("exit-interaction", () => this.exitInteractionMode());
    this.events.on("force-clear", () => this.forceClearAll());
    this.events.on("switch-stage-set", (next: StageSet) =>
      this.switchStageSet(next)
    );
    this.events.on("next-stage", () => this.goToNextStage());
    this.events.on("farm-minigame", () => this.startFarmMinigame());
    this.events.on("buy-item", (id: ShopItemId) => this.buyItem(id));
    this.events.on("gift-item", (id: ShopItemId) => this.giftItem(id));
    this.events.on("request-economy-sync", () => this.emitEconomyState());
    this.events.on("abort-current-puzzle", () => this.abortCurrentPuzzle());
    this.events.emit("puzzle-busy", false);
  }

  private enterInteractionMode() {
    if (this.interactionActive || this.puzzleBusy) return;
    this.interactionActive = true;
    this.interactionReturnKey = this.stageManager.getCurrentKey();
    this.partSystem.setPuzzleActive(true);
    this.partSystem.setInputEnabled(false);

    this.disableViewingMode();
    this.resetView();
    this.stageManager.fadeOutAll(420);

    const { width, height } = this.scale;
    this.interactionSystem.enable(width, height);
  }

  private exitInteractionMode() {
    if (!this.interactionActive) return;
    this.interactionActive = false;
    this.interactionSystem.disable();
    this.partSystem.setPuzzleActive(false);
    this.partSystem.setInputEnabled(true);
    this.stageManager.showKey(this.interactionReturnKey, 420);
  }

  private disableViewingMode() {
    if (!this.viewingMode) return;
    this.viewingMode = false;
    this.input.off("wheel", this.onWheel, this);
    this.input.off("pointerdown", this.onPointerDown, this);
    this.input.off("pointermove", this.onPointerMove, this);
    this.input.off("pointerup", this.onPointerUp, this);
    this.input.off("pointerupoutside", this.onPointerUp, this);
    this.events.off("zoom-in");
    this.events.off("zoom-out");
    this.events.off("zoom-reset");
    this.activePointers = [];
    this.isPanning = false;
  }

  private enableViewingMode() {
    if (this.viewingMode) return;
    this.viewingMode = true;
    this.input.addPointer(2);
    this.events.emit("viewing-mode");

    this.input.on("wheel", this.onWheel, this);
    this.input.on("pointerdown", this.onPointerDown, this);
    this.input.on("pointermove", this.onPointerMove, this);
    this.input.on("pointerup", this.onPointerUp, this);
    this.input.on("pointerupoutside", this.onPointerUp, this);

    this.events.on("zoom-in", () => this.adjustZoomAt(1.25));
    this.events.on("zoom-out", () => this.adjustZoomAt(0.8));
    this.events.on("zoom-reset", () => this.resetView());
  }

  private onWheel = (
    pointer: Phaser.Input.Pointer,
    _over: Phaser.GameObjects.GameObject[],
    _dx: number,
    dy: number
  ) => {
    if (!this.viewingMode) return;
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
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        this.applyZoom(newZoom, midX, midY);
      }
    } else if (this.isPanning && this.activePointers.length === 1) {
      const p = this.activePointers[0];
      if (!p.isDown) return;
      const cam = this.cameras.main;
      if (cam.zoom <= 1.001) return;
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
      const p = this.activePointers[0];
      this.isPanning = true;
      this.panLastX = p.x;
      this.panLastY = p.y;
      this.pinchStartDist = 0;
    }
  };

  private adjustZoomAt(factor: number) {
    const { width, height } = this.scale;
    this.applyZoom(
      Phaser.Math.Clamp(this.cameras.main.zoom * factor, 1, 3.5),
      width / 2,
      height / 2
    );
  }

  private applyZoom(newZoom: number, screenX: number, screenY: number) {
    const cam = this.cameras.main;
    const oldZoom = cam.zoom;
    if (newZoom === oldZoom) return;
    const worldX = cam.scrollX + screenX / oldZoom;
    const worldY = cam.scrollY + screenY / oldZoom;
    cam.setZoom(newZoom);
    cam.scrollX = worldX - screenX / newZoom;
    cam.scrollY = worldY - screenY / newZoom;
    this.clampScroll();
  }

  private clampScroll() {
    const cam = this.cameras.main;
    const { width, height } = this.scale;
    if (cam.zoom <= 1.001) {
      cam.setScroll(0, 0);
      return;
    }
    const visW = width / cam.zoom;
    const visH = height / cam.zoom;
    const padV = visH * 0.5;
    const padH = visW * 0.25;
    cam.scrollX = Phaser.Math.Clamp(cam.scrollX, -padH, width - visW + padH);
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, -padV, height - visH + padV);
  }

  private forceClearAll() {
    if (this.interactionActive) this.exitInteractionMode();

    for (const part of PARTS) {
      if (this.removed.has(part.id)) continue;
      this.partSystem.removePart(part.id);
      this.removed.add(part.id);
      this.progressSystem.advance();
      this.grantCoins(5 + part.difficulty * 2);
    }

    this.events.emit("progress", this.progressSystem.getProgress());
    if (this.progressSystem.isFinished()) {
      this.triggerFinale(240, 700);
    }
  }

  private triggerFinale(transitionDelay = 1400, transitionDuration = 1200) {
    if (this.finaleTriggered) return;
    this.finaleTriggered = true;
    this.events.emit("finale");
    this.time.delayedCall(transitionDelay, () => {
      this.stageManager.transitionTo(FINALE_STAGE, transitionDuration);
      this.time.delayedCall(Math.max(300, transitionDuration + 100), () => {
        this.enableViewingMode();
      });
    });
  }

  private getConfiguredStageSet(): StageSet {
    const raw = this.registry.get("stage-set");
    return raw === 2 || raw === 3 ? raw : 1;
  }

  private resolveTextureKey(stageKey: StageKey): string {
    if (this.stageSet === 2) return `S2_${stageKey}`;
    if (this.stageSet === 3) return `S3_${stageKey}`;
    return stageKey;
  }

  private resolveBackgroundKey(): string {
    if (this.stageSet === 2 && this.textures.exists("bg2")) return "bg2";
    return "bg";
  }

  private switchStageSet(next: StageSet) {
    if (next === 2 && !this.canUseStage2()) {
      this.feedback(`2단계는 호감도 ${STAGE2_UNLOCK_AFFINITY}부터 열립니다.`);
      return;
    }
    if (next === 3 && !this.canUseStage3()) {
      this.feedback("뒷모습 스테이지는 호감도 100에서 열립니다.");
      return;
    }
    if (next === this.stageSet) return;
    this.registry.set("stage-set", next);
    this.scene.restart();
    this.scene.get("UIScene").scene.restart();
  }

  private goToNextStage() {
    if (this.stageSet === 1) {
      this.stage2StoryUnlocked = true;
      this.persistMetaState();
      this.switchStageSet(2);
      return;
    }
    if (this.stageSet === 2) {
      this.stage3StoryUnlocked = true;
      this.persistMetaState();
    }
    const next = this.stageSet === 2 ? 3 : 1;
    this.switchStageSet(next);
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

  private startFarmMinigame() {
    if (this.puzzleBusy || this.interactionActive) {
      this.feedback("지금은 미니게임을 시작할 수 없습니다.");
      return;
    }

    this.puzzleBusy = true;
    this.events.emit("puzzle-busy", true);
    this.partSystem.setPuzzleActive(true);
    const farmPart = this.createFarmPart();
    this.feedback("미니게임을 시작합니다.");
    this.puzzleSystem.start(farmPart, (success) => {
      this.puzzleBusy = false;
      this.events.emit("puzzle-busy", false);
      this.partSystem.setPuzzleActive(false);
      if (success) {
        this.grantCoins(10 + farmPart.difficulty * 4, "미니게임 클리어");
      } else {
        if (this.puzzleSystem.consumeLastCancelled() || this.abortingPuzzle) {
          this.abortingPuzzle = false;
          this.feedback("미니게임을 포기했습니다.");
        } else {
          this.feedback("미니게임 실패");
        }
      }
    });
  }

  private abortCurrentPuzzle() {
    if (!this.puzzleBusy) return;
    this.abortingPuzzle = true;
    this.puzzleSystem.abortCurrent();
  }

  private createFarmPart() {
    const pool: PuzzleType[] = ["pattern", "memory", "tetris"];
    const puzzle = Phaser.Utils.Array.GetRandom(pool);
    const difficulty = Phaser.Math.Between(1, 4) as 1 | 2 | 3 | 4 | 5;
    return {
      id: `farm_${Date.now()}`,
      label: "훈련",
      act: PARTS[0].act,
      puzzle,
      difficulty,
      hitbox: { x: 0, y: 0, w: 0, h: 0 },
      tint: 0xffffff,
      order: 0,
      stageAfter: null,
      prerequisites: [],
    };
  }

  private buyItem(id: ShopItemId) {
    const entry = SHOP[id];
    if (this.currency < entry.cost) {
      this.feedback(`${entry.label} 구입에 코인 ${entry.cost}개가 필요합니다.`);
      return;
    }
    this.currency -= entry.cost;
    this.inventory[id] += 1;
    this.persistMetaState();
    this.emitEconomyState();
    this.feedback(`${entry.label} 구입 완료`);
  }

  private giftItem(id: ShopItemId) {
    const entry = SHOP[id];
    if (this.inventory[id] <= 0) {
      this.feedback(`${entry.label} 보유 수량이 없습니다.`);
      return;
    }
    if (this.affinity >= AFFINITY_MAX) {
      this.feedback("호감도는 이미 최대치(100)입니다.");
      return;
    }

    const before = this.affinity;
    this.inventory[id] -= 1;
    this.affinity = Phaser.Math.Clamp(
      this.affinity + entry.affinity,
      0,
      AFFINITY_MAX
    );

    this.persistMetaState();
    this.emitEconomyState();
    this.feedback(
      `${entry.label} 선물 완료 · 호감도 +${this.affinity - before} (${this.affinity}/100)`
    );

    if (before < STAGE2_UNLOCK_AFFINITY && this.affinity >= STAGE2_UNLOCK_AFFINITY) {
      this.feedback("2단계 포즈가 열렸습니다.");
    }
    if (before < STAGE3_UNLOCK_AFFINITY && this.affinity >= STAGE3_UNLOCK_AFFINITY) {
      this.feedback("뒷모습 스테이지가 열렸습니다.");
    }
  }

  private grantCoins(amount: number, reason?: string) {
    if (amount <= 0) return;
    this.currency += amount;
    this.persistMetaState();
    this.emitEconomyState();
    if (reason) this.feedback(`${reason} · 코인 +${amount}`);
  }

  private canUseStage2() {
    return this.affinity >= STAGE2_UNLOCK_AFFINITY || this.stage2StoryUnlocked;
  }

  private canUseStage3() {
    return this.affinity >= STAGE3_UNLOCK_AFFINITY || this.stage3StoryUnlocked;
  }

  private normalizeStageSet(raw: StageSet): StageSet {
    if (raw === 3 && !this.canUseStage3()) return this.canUseStage2() ? 2 : 1;
    if (raw === 2 && !this.canUseStage2()) return 1;
    return raw;
  }

  private emitEconomyState() {
    this.events.emit("economy-update", {
      currency: this.currency,
      affinity: this.affinity,
      affinityMax: AFFINITY_MAX,
      inventory: { ...this.inventory },
      stageSet: this.stageSet,
      stageUnlocks: {
        stage2: this.canUseStage2(),
        stage3: this.canUseStage3(),
      },
      stageUnlockThresholds: {
        stage2: STAGE2_UNLOCK_AFFINITY,
        stage3: STAGE3_UNLOCK_AFFINITY,
      },
      shop: SHOP,
    });
  }

  private feedback(text: string, color = "#ffd572") {
    this.events.emit("shop-feedback", { text, color });
  }

  private loadMetaState() {
    const c = this.registry.get("meta-currency");
    const a = this.registry.get("meta-affinity");
    const inv = this.registry.get("meta-inventory");
    const stage2Unlocked = this.registry.get("meta-stage2-unlocked");
    const stage3Unlocked = this.registry.get("meta-stage3-unlocked");
    this.currency = Number.isFinite(c) ? Number(c) : 0;
    this.affinity = Phaser.Math.Clamp(
      Number.isFinite(a) ? Number(a) : 0,
      0,
      AFFINITY_MAX
    );
    if (inv && typeof inv === "object") {
      this.inventory = {
        flower: Number((inv as Record<string, unknown>).flower) || 0,
        choco: Number((inv as Record<string, unknown>).choco) || 0,
        perfume: Number((inv as Record<string, unknown>).perfume) || 0,
      };
    }
    this.stage2StoryUnlocked = Boolean(stage2Unlocked);
    this.stage3StoryUnlocked = Boolean(stage3Unlocked);
  }

  private persistMetaState() {
    this.registry.set("meta-currency", this.currency);
    this.registry.set("meta-affinity", this.affinity);
    this.registry.set("meta-inventory", { ...this.inventory });
    this.registry.set("meta-stage2-unlocked", this.stage2StoryUnlocked);
    this.registry.set("meta-stage3-unlocked", this.stage3StoryUnlocked);
  }
}
