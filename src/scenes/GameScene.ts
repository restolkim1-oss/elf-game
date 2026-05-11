import Phaser from "phaser";
import { PartSystem } from "../systems/PartSystem";
import { CardBattleSystem } from "../systems/CardBattleSystem";
import { ProgressSystem } from "../systems/ProgressSystem";
import { StageManager } from "../systems/StageManager";
import { InteractionSystem } from "../systems/InteractionSystem";
import {
  FINALE_STAGE,
  STAGE_LAYERS,
  type StageKey,
  type StageSet,
  type PartDef,
  getPartsForStage,
  stageForRemoved,
} from "../data/parts";
import { POSES, getPose } from "../data/posesData";
import type { PartId } from "../data/enemyParts";

const AFFINITY_MAX = 100;
const STAGE2_UNLOCK_AFFINITY = 40;
const STAGE3_UNLOCK_AFFINITY = 100;
const BATTLE_WIN_COIN_REWARD = 100;
const STORAGE_COINS_KEY = "elf_coins";
const STORAGE_UNLOCKED_POSES_KEY = "elf_unlockedPoses";

export class GameScene extends Phaser.Scene {
  private partSystem!: PartSystem;
  private cardBattle!: CardBattleSystem;
  private progressSystem!: ProgressSystem;
  private stageManager!: StageManager;
  private interactionSystem!: InteractionSystem;
  private parts: PartDef[] = [];

  private interactionActive = false;
  private interactionReturnKey: StageKey = "E1";
  private removed = new Set<string>();
  private finaleTriggered = false;
  private puzzleBusy = false;
  private abortingPuzzle = false;
  private battleFlowId = 0;

  private stageSet: StageSet = 1;
  private stage2StoryUnlocked = false;
  private stage3StoryUnlocked = false;
  private coins = 0;
  private affinity = 0;
  private unlockedPoses = new Set<string>(["s1"]);

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
    this.battleFlowId = 0;
    this.removed = new Set<string>();
    this.interactionReturnKey = "E1";
    this.loadMetaState();
    this.stageSet = this.normalizeStageSet(this.getConfiguredStageSet());
    this.parts = getPartsForStage(this.stageSet);
    this.registry.set("stage-set", this.stageSet);
    this.registry.set("current-parts", this.parts);
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
    const topUi = 2 * 210 + 30;
    const botUi = 2 * 230 + 50;
    const availableH = height - topUi - botUi;
    const scale = Math.min(availableH / origH, (width * 0.78) / origW);

    const characterX = width / 2;
    const characterY = topUi + availableH / 2 - height * 0.09;

    this.stageManager = new StageManager(
      this,
      characterX,
      characterY,
      scale,
      (key) => this.resolveTextureKey(key),
      STAGE_LAYERS
    );

    this.interactionSystem = new InteractionSystem(
      this,
      characterX,
      characterY,
      origH * scale
    );
    this.interactionActive = false;

    this.progressSystem = new ProgressSystem(this.parts.length);
    this.partSystem = new PartSystem(this, this.parts, () =>
      this.stageManager.getDisplayBounds()
    );
    this.cardBattle = new CardBattleSystem(this);

    this.partSystem.setRemovedSet(this.removed);

    this.partSystem.onPartLocked((part, reason) => {
      this.events.emit("part-locked", { part, reason });
    });

    this.partSystem.onPartTargeted(() => {
      this.startOrderedBattle();
    });

    this.partSystem.start();
    this.partSystem.setActivePart(this.getNextPart()?.id ?? null);
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
    this.events.on("buy-pose", (id: string) => this.buyPose(id));
    this.events.on("request-economy-sync", () => this.emitEconomyState());
    this.events.on("abort-current-puzzle", () => this.abortCurrentPuzzle());
    this.events.emit("puzzle-busy", false);
    this.time.delayedCall(650, () => this.startOrderedBattle());
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

  private handlePartCleared(part: PartDef) {
    const alreadyCleared = this.removed.has(part.id);

    this.stageManager.hidePartLayer(part.id);
    this.partSystem.removePart(part.id);
    if (alreadyCleared) {
      return { rewardPart: null as PartDef | null, finished: this.progressSystem.isFinished() };
    }

    this.removed.add(part.id);
    this.progressSystem.advance();
    this.events.emit("progress", this.progressSystem.getProgress());

    if (this.progressSystem.isFinished()) {
      return { rewardPart: part, finished: true };
    }

    const targetKey = stageForRemoved(this.removed, this.stageSet);
    const currentKey = this.stageManager.getCurrentKey();
    if (targetKey !== currentKey) {
      // Stage variants can share the same tier, so key-difference itself
      // should trigger a visual transition.
      this.stageManager.transitionTo(targetKey);
    }
    this.partSystem.setActivePart(this.getNextPart()?.id ?? null);
    return { rewardPart: part, finished: false };
  }

  private handlePartsDestroyedInBattle(partIds: string[], activePartId: string) {
    const destroyedParts: PartDef[] = [];
    for (const partId of partIds) {
      const mappedId = this.mapBattlePartIdToStagePartId(partId);
      if (!mappedId || this.removed.has(mappedId)) continue;
      const part = this.parts.find((candidate) => candidate.id === mappedId);
      if (!part) continue;

      this.stageManager.hidePartLayer(mappedId);
      this.partSystem.removePart(mappedId);
      this.removed.add(mappedId);
      this.progressSystem.advance();
      this.events.emit("progress", this.progressSystem.getProgress());
      destroyedParts.push(part);
      if (mappedId !== activePartId) {
        this.feedback(`${part.label} 파츠가 전투 중 파괴되었습니다.`);
      }
    }
    return destroyedParts;
  }

  private mapBattlePartIdToStagePartId(partId: string) {
    if (partId === "shoes") return "boots";
    return partId;
  }

  private mapStagePartIdToBattlePartId(partId: string): PartId | null {
    switch (partId) {
      case "boots":
        return "shoes";
      case "circlet":
      case "cape":
      case "sweater":
      case "skirt":
      case "underwear":
        return partId;
      default:
        return null;
    }
  }

  private getBattlePartLabel(partId: PartId) {
    switch (partId) {
      case "circlet":
        return "서클릿";
      case "cape":
        return "케이프";
      case "sweater":
        return "스웨터";
      case "skirt":
        return "스커트";
      case "shoes":
        return "신발";
      case "underwear":
        return "언더웨어";
    }
  }

  private getNextPart(): PartDef | null {
    return (
      this.parts
        .slice()
        .sort((a, b) => a.order - b.order)
        .find((part) => !this.removed.has(part.id)) ?? null
    );
  }

  private startOrderedBattle() {
    if (this.puzzleBusy || this.interactionActive || this.finaleTriggered) return;
    const nextPart = this.getNextPart();
    if (!nextPart) {
      this.triggerFinale();
      return;
    }
    this.startPartBattle(nextPart);
  }

  private startPartBattle(part: PartDef) {
    if (this.finaleTriggered) return;
    this.battleFlowId += 1;
    const flowId = this.battleFlowId;
    this.puzzleBusy = true;
    this.events.emit("puzzle-busy", true);
    this.partSystem.setActivePart(part.id);
    this.partSystem.setPuzzleActive(true);
    this.partSystem.setInputEnabled(false);

    this.cardBattle.start(part, (success, battleResult) => {
      if (flowId !== this.battleFlowId) return;
      if (success) {
        const destroyedInBattle = this.handlePartsDestroyedInBattle(battleResult?.destroyedPartIds ?? [], part.id);
        const clearResult = this.handlePartCleared(part);
        const nextPart = this.getNextPart();
        this.grantCoins(BATTLE_WIN_COIN_REWARD);
        this.showBattleReward(clearResult.rewardPart, destroyedInBattle, () => {
          if (flowId !== this.battleFlowId) return;
          if (clearResult.finished && !this.finaleTriggered) {
            this.releaseBattleLock();
            this.triggerFinale();
            return;
          }
          if (nextPart && !this.finaleTriggered) {
            this.queueNextPartBattle(nextPart, flowId);
            return;
          }
          this.releaseBattleLock();
        });
        return;
      }
      if (this.cardBattle.consumeLastCancelled() || this.abortingPuzzle) {
        this.abortingPuzzle = false;
        this.feedback("미니게임을 포기했습니다.");
      } else {
        this.events.emit("failure", part.id);
      }
      this.releaseBattleLock();
    });
  }

  private showBattleReward(rewardPart: PartDef | null, destroyedInBattle: PartDef[], onContinue: () => void) {
    const rewardPartId = rewardPart ? this.mapStagePartIdToBattlePartId(rewardPart.id) : null;
    const destroyedPartIds = destroyedInBattle
      .map((part) => this.mapStagePartIdToBattlePartId(part.id))
      .filter((partId): partId is PartId => partId !== null);
    this.events.emit("battle-reward-show", {
      coins: BATTLE_WIN_COIN_REWARD,
      rewardPartId,
      rewardPartLabel: rewardPartId ? this.getBattlePartLabel(rewardPartId) : null,
      battleDestroyedPartIds: destroyedPartIds,
      battleDestroyedLabels: destroyedPartIds.map((partId) => this.getBattlePartLabel(partId)),
      onContinue,
    });
  }

  private queueNextPartBattle(part: PartDef, flowId = this.battleFlowId) {
    this.puzzleBusy = true;
    this.events.emit("puzzle-busy", true);
    this.partSystem.setPuzzleActive(true);
    this.partSystem.setInputEnabled(false);
    this.partSystem.setActivePart(part.id);
    this.time.delayedCall(720, () => {
      if (flowId !== this.battleFlowId) return;
      if (this.finaleTriggered || this.interactionActive) {
        this.releaseBattleLock();
        return;
      }
      if (this.removed.has(part.id)) {
        const next = this.getNextPart();
        if (next) {
          this.queueNextPartBattle(next, flowId);
        } else {
          this.releaseBattleLock();
          this.triggerFinale();
        }
        return;
      }
      this.startPartBattle(part);
    });
  }

  private releaseBattleLock() {
    this.puzzleBusy = false;
    this.events.emit("puzzle-busy", false);
    this.partSystem.setPuzzleActive(false);
    this.partSystem.setActivePart(this.getNextPart()?.id ?? null);
    this.partSystem.setInputEnabled(true);
  }

  private forceClearAll() {
    if (this.interactionActive) this.exitInteractionMode();

    for (const part of this.parts) {
      if (this.removed.has(part.id)) continue;
      this.partSystem.removePart(part.id);
      this.stageManager.hidePartLayer(part.id, 240);
      this.removed.add(part.id);
      this.progressSystem.advance();
    }

    this.events.emit("progress", this.progressSystem.getProgress());
    if (this.progressSystem.isFinished()) {
      this.partSystem.setActivePart(null);
      this.triggerFinale(240, 700);
    }
  }

  private triggerFinale(transitionDelay = 1400, transitionDuration = 1200) {
    if (this.finaleTriggered) return;
    this.finaleTriggered = true;
    this.events.emit("finale");
    this.time.delayedCall(transitionDelay, () => {
      const showedClearArt = this.stageManager.transitionToTexture(
        "clear",
        this.resolveClearTextureKey(),
        transitionDuration
      );
      if (!showedClearArt) {
        this.stageManager.transitionTo(FINALE_STAGE, transitionDuration);
      }
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
    if (stageKey === "E1") return "E1_base";
    return stageKey;
  }

  private resolveBackgroundKey(): string {
    if (this.stageSet === 3 && this.textures.exists("bg3")) return "bg3";
    if (this.stageSet === 2 && this.textures.exists("bg2")) return "bg2";
    return "bg";
  }

  private resolveClearTextureKey(): string {
    return "E1_base";
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

  private abortCurrentPuzzle() {
    if (!this.puzzleBusy) return;
    this.abortingPuzzle = true;
    this.cardBattle.abortCurrent();
  }

  private buyPose(id: string) {
    const pose = getPose(id);
    if (!pose) return;
    if (this.unlockedPoses.has(pose.id)) {
      this.feedback(`${pose.displayName}은 이미 구매했습니다.`);
      return;
    }
    if (this.coins < pose.price) {
      this.feedback("코인이 부족합니다.", "#e0868b");
      return;
    }
    this.coins = Math.max(0, this.coins - pose.price);
    this.unlockedPoses.add(pose.id);
    this.persistMetaState();
    this.emitEconomyState();
    this.feedback(`${pose.displayName} 구매 완료`, "#86e08d");
  }

  private grantCoins(amount: number) {
    if (amount <= 0) return;
    this.coins += amount;
    this.persistMetaState();
    this.emitEconomyState();
  }

  private canUseStage2() {
    return true;
  }

  private canUseStage3() {
    return true;
  }

  private normalizeStageSet(raw: StageSet): StageSet {
    if (raw === 3 && !this.canUseStage3()) return this.canUseStage2() ? 2 : 1;
    if (raw === 2 && !this.canUseStage2()) return 1;
    return raw;
  }

  private emitEconomyState() {
    this.events.emit("economy-update", {
      currency: this.coins,
      affinity: this.affinity,
      affinityMax: AFFINITY_MAX,
      unlockedPoses: [...this.unlockedPoses],
      stageSet: this.stageSet,
      stageUnlocks: {
        stage2: this.canUseStage2(),
        stage3: this.canUseStage3(),
      },
      stageUnlockThresholds: {
        stage2: STAGE2_UNLOCK_AFFINITY,
        stage3: STAGE3_UNLOCK_AFFINITY,
      },
      poses: POSES,
    });
  }

  private feedback(text: string, color = "#ffd572") {
    this.events.emit("shop-feedback", { text, color });
  }

  private loadMetaState() {
    const c = this.registry.get("meta-currency");
    const a = this.registry.get("meta-affinity");
    const unlocked = this.registry.get("meta-unlocked-poses");
    const stage2Unlocked = this.registry.get("meta-stage2-unlocked");
    const stage3Unlocked = this.registry.get("meta-stage3-unlocked");
    this.coins = this.readStoredCoins(Number.isFinite(c) ? Number(c) : 0);
    this.affinity = Phaser.Math.Clamp(
      Number.isFinite(a) ? Number(a) : 0,
      0,
      AFFINITY_MAX
    );
    this.unlockedPoses = this.readStoredUnlockedPoses(Array.isArray(unlocked) ? unlocked.map(String) : ["s1"]);
    this.stage2StoryUnlocked = Boolean(stage2Unlocked);
    this.stage3StoryUnlocked = Boolean(stage3Unlocked);
  }

  private persistMetaState() {
    this.registry.set("meta-currency", this.coins);
    this.registry.set("meta-affinity", this.affinity);
    this.registry.set("meta-unlocked-poses", [...this.unlockedPoses]);
    this.registry.set("meta-stage2-unlocked", this.stage2StoryUnlocked);
    this.registry.set("meta-stage3-unlocked", this.stage3StoryUnlocked);
    this.writeMetaStorage();
  }

  private readStoredCoins(fallback: number) {
    try {
      const raw = window.localStorage.getItem(STORAGE_COINS_KEY);
      const parsed = raw === null ? fallback : Number(raw);
      return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
    } catch {
      return fallback;
    }
  }

  private readStoredUnlockedPoses(fallback: string[]) {
    try {
      const raw = window.localStorage.getItem(STORAGE_UNLOCKED_POSES_KEY);
      const parsed = raw ? JSON.parse(raw) : fallback;
      const list = Array.isArray(parsed) ? parsed.map(String) : fallback;
      const valid = new Set<string>(POSES.map((pose) => pose.id));
      const next = new Set(list.filter((id) => valid.has(id)));
      next.add("s1");
      return next;
    } catch {
      return new Set(["s1"]);
    }
  }

  private writeMetaStorage() {
    try {
      window.localStorage.setItem(STORAGE_COINS_KEY, String(Math.max(0, Math.floor(this.coins))));
      window.localStorage.setItem(STORAGE_UNLOCKED_POSES_KEY, JSON.stringify([...this.unlockedPoses]));
    } catch {
      // localStorage can fail in private browsing; in-memory state remains valid.
    }
  }
}
