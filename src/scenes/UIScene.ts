import Phaser from "phaser";
import { PARTS } from "../data/parts";
import { UI_SCALE } from "../main";

const COLORS = {
  panelDeep: 0x07030b,
  panelMid: 0x14091a,
  panelSoft: 0x1f1226,
  gild: 0xd4a656,
  gildHot: 0xffd572,
  gildSoft: 0x8a6a3d,
  text: "#f3e6c9",
  textHighlight: "#ffd572",
  textDim: "#8c7560",
  success: "#86e08d",
  danger: "#e0868b",
};

const u = (n: number) => n * UI_SCALE;
const px = (n: number) => `${Math.round(n * UI_SCALE * 1.2)}px`;

interface Pill {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  ring: Phaser.GameObjects.Arc;
  glow: Phaser.GameObjects.Arc;
  tip: Phaser.GameObjects.Text;
  cleared: boolean;
}

interface EconomyState {
  currency: number;
  affinity: number;
  affinityMax: number;
  inventory: {
    flower: number;
    choco: number;
    perfume: number;
  };
  stageSet: 1 | 2 | 3;
}

export class UIScene extends Phaser.Scene {
  private pills: Pill[] = [];
  private actLabel!: Phaser.GameObjects.Text;
  private progressCount!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private statText!: Phaser.GameObjects.Text;
  private defaultHint =
    "파츠를 선택하고 미니게임을 클리어해 코인과 호감도를 올려보세요.";

  private clearMenu: Phaser.GameObjects.Container | null = null;
  private shopMenu: Phaser.GameObjects.Container | null = null;
  private interactionControls: Phaser.GameObjects.Container | null = null;
  private zoomControls: Phaser.GameObjects.Container | null = null;
  private bottomMenu: Phaser.GameObjects.Container | null = null;
  private confirmMenu: Phaser.GameObjects.Container | null = null;
  private finaleTweens: Phaser.Tweens.Tween[] = [];
  private lastEconomy: EconomyState | null = null;
  private puzzleBusy = false;

  constructor() {
    super("UIScene");
  }

  create() {
    this.pills = [];
    this.clearMenu = null;
    this.shopMenu = null;
    this.interactionControls = null;
    this.zoomControls = null;
    this.bottomMenu = null;
    this.confirmMenu = null;
    this.finaleTweens = [];
    this.puzzleBusy = false;

    const { width, height } = this.scale;
    this.drawTopPanel(width);
    this.drawBottomPanel(width, height);
    this.drawActLabel(width);
    this.drawProgressPills(width);
    this.drawCornerOrnaments(width, height);
    this.drawBottomMenu(width, height);

    const game = this.scene.get("GameScene");
    game.events.on("progress", (progress: { current: number; total: number }) => {
      this.updateAct(progress.current, progress.total);
    });
    game.events.on("part-removed", (part: (typeof PARTS)[number]) => {
      this.markCleared(part.id);
      this.flashHint(`${part.label} 해제 완료`, COLORS.success);
    });
    game.events.on("failure", () => {
      this.flashHint("실패했습니다. 다시 시도해주세요.", COLORS.danger);
    });
    game.events.on(
      "part-locked",
      (payload: { part: (typeof PARTS)[number]; reason: string }) => {
        this.flashHint(payload.reason || "잠금 상태입니다.", COLORS.textHighlight);
      }
    );
    game.events.on("economy-update", (state: EconomyState) => {
      this.lastEconomy = state;
      this.updateEconomy(state);
    });
    game.events.on("shop-feedback", (payload: { text: string; color?: string }) => {
      this.flashHint(payload.text, payload.color ?? COLORS.textHighlight);
    });
    game.events.on("viewing-mode", () => this.drawZoomControls(width, height));
    game.events.on("finale", () => this.onFinale());
    game.events.on("puzzle-busy", (busy: boolean) => {
      this.puzzleBusy = busy;
      if (busy) this.hideShopMenu();
    });

    this.startIdlePillPulse();
    game.events.emit("request-economy-sync");
  }

  private drawTopPanel(width: number) {
    this.add.rectangle(width / 2, u(58), width, u(124), COLORS.panelMid, 0.95);
    this.add.rectangle(width / 2, u(24), width, u(48), COLORS.panelDeep, 0.45);
    this.add.rectangle(width / 2, u(1), width, u(1), COLORS.gild, 0.4);
    this.add.rectangle(width / 2, u(120), width, u(1), COLORS.gild, 0.9);
    this.add.rectangle(width / 2, u(124), width * 0.55, u(1), COLORS.gild, 0.35);
  }

  private drawBottomPanel(width: number, height: number) {
    const panelH = u(210);
    this.add.rectangle(width / 2, height - panelH / 2, width, panelH, COLORS.panelMid, 0.96);
    this.add.rectangle(width / 2, height - panelH + u(22), width, u(46), COLORS.panelDeep, 0.45);
    this.add.rectangle(width / 2, height - panelH, width, u(1), COLORS.gild, 0.9);
    this.add.rectangle(width / 2, height - panelH - u(4), width * 0.55, u(1), COLORS.gild, 0.35);

    this.hintText = this.add
      .text(width / 2, height - panelH + u(14), this.defaultHint, {
        fontFamily: "serif",
        fontSize: px(17),
        color: COLORS.text,
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: width * 0.9 },
      })
      .setOrigin(0.5, 0);

    this.statText = this.add
      .text(width / 2, height - panelH + u(60), "코인 0  |  호감도 0 / 100", {
        fontFamily: "serif",
        fontSize: px(15),
        color: COLORS.textHighlight,
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
  }

  private drawActLabel(width: number) {
    this.actLabel = this.add
      .text(width / 2, u(8), "◆  엘린  ◆", {
        fontFamily: "serif",
        fontSize: px(24),
        color: COLORS.textHighlight,
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);

    this.add.rectangle(width / 2 - u(96), u(28), u(60), u(1), COLORS.gildSoft, 0.55);
    this.add.rectangle(width / 2 + u(96), u(28), u(60), u(1), COLORS.gildSoft, 0.55);

    this.progressCount = this.add
      .text(width / 2, u(46), `0 / ${PARTS.length}`, {
        fontFamily: "serif",
        fontSize: px(13),
        color: COLORS.textDim,
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
  }

  private drawProgressPills(width: number) {
    const pillY = u(92);
    const total = PARTS.length;
    const spacing = Math.min((width * 0.78) / total, u(64));
    const startX = width / 2 - (spacing * (total - 1)) / 2;
    this.add.rectangle(width / 2, pillY, spacing * (total - 1), u(1), COLORS.gildSoft, 0.45);

    PARTS.forEach((part, idx) => {
      const x = startX + idx * spacing;
      const container = this.add.container(x, pillY);
      const glow = this.add
        .circle(0, 0, u(24), 0xffd572, 0)
        .setStrokeStyle(u(1.5), COLORS.gildHot, 0.4);
      const ring = this.add
        .circle(0, 0, u(18), 0x000000, 0)
        .setStrokeStyle(u(1.2), COLORS.gild, 0.7);
      const bg = this.add
        .circle(0, 0, u(15), COLORS.panelDeep)
        .setStrokeStyle(u(1), COLORS.gild, 0.9);
      const label = this.add
        .text(0, 0, String(part.order), {
          fontFamily: "serif",
          fontSize: px(13),
          color: COLORS.text,
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      const tip = this.add
        .text(x, pillY + u(24), part.label, {
          fontFamily: "serif",
          fontSize: px(10),
          color: "#6a5540",
          fontStyle: "bold",
        })
        .setOrigin(0.5, 0);

      container.add([glow, ring, bg, label]);
      this.pills.push({ container, bg, label, ring, glow, tip, cleared: false });
    });
  }

  private drawCornerOrnaments(width: number, height: number) {
    const g = this.add.graphics().setDepth(1002);
    g.lineStyle(u(1.2), COLORS.gild, 0.65);
    const arm = u(44);
    const inset = u(12);
    const corners: [number, number, number, number][] = [
      [inset, inset, 1, 1],
      [width - inset, inset, -1, 1],
      [inset, height - inset, 1, -1],
      [width - inset, height - inset, -1, -1],
    ];
    corners.forEach(([cx, cy, sx, sy]) => {
      g.beginPath();
      g.moveTo(cx + sx * arm, cy);
      g.lineTo(cx, cy);
      g.lineTo(cx, cy + sy * arm);
      g.strokePath();
    });
  }

  private drawBottomMenu(width: number, height: number) {
    if (this.bottomMenu) return;
    const gs = this.scene.get("GameScene");
    const c = this.add.container(0, 0).setDepth(1750);
    this.bottomMenu = c;

    const labels = [
      { text: "인터렉션", action: () => this.requestInteraction() },
      {
        text: "미니게임",
        action: () => {
          this.hideShopMenu();
          gs.events.emit("farm-minigame");
        },
      },
      { text: "상점", action: () => this.toggleShopMenu() },
      { text: "전체 해제", action: () => gs.events.emit("force-clear") },
    ];
    const gap = u(8);
    const btnW = Math.min(
      u(132),
      (width - u(46) - gap * (labels.length - 1)) / labels.length
    );
    const btnH = u(46);
    const totalW = labels.length * btnW + (labels.length - 1) * gap;
    const startX = width / 2 - totalW / 2 + btnW / 2;
    const y = height - u(92);

    labels.forEach((item, idx) => {
      this.makeButton(
        c,
        startX + idx * (btnW + gap),
        y,
        btnW,
        btnH,
        item.text,
        item.action,
        px(11)
      );
    });
  }

  private requestInteraction() {
    if (!this.puzzleBusy) {
      this.enterInteractionMode();
      return;
    }
    this.showConfirmMenu(
      "미니게임이 진행 중입니다.\n인터렉션으로 이동할까요?",
      () => {
        this.scene.get("GameScene").events.emit("abort-current-puzzle");
        this.time.delayedCall(120, () => this.enterInteractionMode());
      }
    );
  }

  private showConfirmMenu(message: string, onYes: () => void) {
    if (this.confirmMenu) return;
    const { width, height } = this.scale;
    const c = this.add.container(0, 0).setDepth(2100);
    this.confirmMenu = c;

    const panelW = width * 0.86;
    const panelH = u(154);
    const panelY = height / 2;
    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.55).setInteractive();
    const panel = this.add
      .rectangle(width / 2, panelY, panelW, panelH, COLORS.panelMid, 0.98)
      .setStrokeStyle(u(2), COLORS.gildHot, 0.9);
    const text = this.add
      .text(width / 2, panelY - u(44), message, {
        fontFamily: "serif",
        fontSize: px(14),
        color: COLORS.text,
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5, 0.5);
    c.add(dim);
    c.add(panel);
    c.add(text);

    this.makeButton(c, width / 2 - u(86), panelY + u(44), u(140), u(40), "이동", () => {
      this.closeConfirmMenu();
      onYes();
    }, px(12));
    this.makeButton(c, width / 2 + u(86), panelY + u(44), u(140), u(40), "취소", () => {
      this.closeConfirmMenu();
    }, px(12));
  }

  private closeConfirmMenu() {
    if (!this.confirmMenu) return;
    const c = this.confirmMenu;
    this.confirmMenu = null;
    c.destroy();
  }

  private toggleShopMenu() {
    if (this.puzzleBusy) {
      this.flashHint("미니게임 중에는 상점을 열 수 없습니다.", COLORS.textHighlight);
      return;
    }
    if (this.shopMenu) {
      this.hideShopMenu();
      return;
    }
    this.drawShopMenu();
  }

  private hideShopMenu() {
    if (!this.shopMenu) return;
    const old = this.shopMenu;
    this.shopMenu = null;
    this.tweens.add({
      targets: old,
      alpha: 0,
      duration: 160,
      onComplete: () => old.destroy(),
    });
  }

  private drawShopMenu() {
    const { width, height } = this.scale;
    const gs = this.scene.get("GameScene");
    const c = this.add.container(0, 0).setDepth(1900);
    this.shopMenu = c;

    const panelW = width * 0.94;
    const panelH = u(152);
    const panelY = height - u(210) - panelH / 2;
    const bg = this.add
      .rectangle(width / 2, panelY, panelW, panelH, COLORS.panelMid, 0.98)
      .setStrokeStyle(u(1.8), COLORS.gildHot, 0.95);
    c.add(bg);

    const state = this.lastEconomy;
    const title = this.add
      .text(width / 2, panelY - panelH / 2 + u(12), "상점", {
        fontFamily: "serif",
        fontSize: px(16),
        color: COLORS.textHighlight,
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    c.add(title);

    const items = [
      { id: "flower", name: "꽃", cost: 18, own: state?.inventory.flower ?? 0 },
      { id: "choco", name: "초콜릿", cost: 30, own: state?.inventory.choco ?? 0 },
      { id: "perfume", name: "향수", cost: 44, own: state?.inventory.perfume ?? 0 },
    ] as const;

    const rowW = panelW * 0.3;
    items.forEach((item, idx) => {
      const x = width / 2 - panelW / 2 + rowW * idx + rowW / 2 + u(8);
      const card = this.add
        .rectangle(x, panelY + u(18), rowW - u(10), u(90), COLORS.panelSoft, 0.95)
        .setStrokeStyle(u(1.2), COLORS.gild, 0.8);
      const name = this.add
        .text(x, panelY - u(8), `${item.name}  ${item.cost}코인`, {
          fontFamily: "serif",
          fontSize: px(10),
          color: COLORS.text,
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      const own = this.add
        .text(x, panelY + u(10), `보유 ${item.own}`, {
          fontFamily: "serif",
          fontSize: px(9),
          color: COLORS.textDim,
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      c.add(card);
      c.add(name);
      c.add(own);

      this.makeButton(c, x - u(42), panelY + u(40), u(80), u(32), "구입", () => {
        gs.events.emit("buy-item", item.id);
      }, px(9));
      this.makeButton(c, x + u(42), panelY + u(40), u(80), u(32), "선물", () => {
        gs.events.emit("gift-item", item.id);
      }, px(9));
    });

    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 180 });
  }

  private makeButton(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    onClick: () => void,
    fontSize = px(11)
  ) {
    const bg = this.add
      .rectangle(x, y, w, h, COLORS.panelSoft, 0.96)
      .setStrokeStyle(u(1.5), COLORS.gild, 0.82)
      .setInteractive({ useHandCursor: true });
    const txt = this.add
      .text(x, y, label, {
        fontFamily: "serif",
        fontSize,
        color: COLORS.text,
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5);
    bg.on("pointerover", () => bg.setFillStyle(0x2a1a34, 0.98));
    bg.on("pointerout", () => bg.setFillStyle(COLORS.panelSoft, 0.96));
    bg.on("pointerdown", () => {
      this.tweens.add({
        targets: [bg, txt],
        scaleX: 0.94,
        scaleY: 0.94,
        yoyo: true,
        duration: 90,
        onComplete: onClick,
      });
    });
    container.add(bg);
    container.add(txt);
  }

  private updateEconomy(state: EconomyState) {
    this.statText.setText(
      `코인 ${state.currency}  |  호감도 ${state.affinity} / ${state.affinityMax}  |  스테이지 ${state.stageSet}`
    );
    if (this.shopMenu) {
      const old = this.shopMenu;
      old.destroy();
      this.shopMenu = null;
      this.drawShopMenu();
    }
  }

  private markCleared(partId: string) {
    const idx = PARTS.findIndex((p) => p.id === partId);
    if (idx < 0) return;
    const pill = this.pills[idx];
    if (pill.cleared) return;
    pill.cleared = true;
    pill.bg.setFillStyle(COLORS.gild);
    pill.bg.setStrokeStyle(u(1.5), COLORS.gildHot, 1);
    pill.label.setColor("#1a0f22");
    pill.ring.setStrokeStyle(u(1.5), COLORS.gildHot, 0.9);
    pill.tip.setColor(COLORS.text);
    this.tweens.killTweensOf(pill.glow);
    this.tweens.add({
      targets: pill.container,
      scale: { from: 1, to: 1.5 },
      yoyo: true,
      duration: 340,
    });
    pill.glow.setAlpha(0.9).setScale(1);
    this.tweens.add({
      targets: pill.glow,
      scaleX: 2.3,
      scaleY: 2.3,
      alpha: 0,
      duration: 650,
    });
  }

  private startIdlePillPulse() {
    this.pills.forEach((p) => {
      if (p.cleared) return;
      this.tweens.add({
        targets: p.glow,
        alpha: { from: 0.4, to: 0 },
        scaleX: { from: 1, to: 1.7 },
        scaleY: { from: 1, to: 1.7 },
        duration: 1900,
        repeat: -1,
        ease: "Sine.easeOut",
      });
    });
  }

  private updateAct(current: number, total: number) {
    this.progressCount.setText(`${current} / ${total}`);
  }

  private flashHint(text: string, color: string) {
    this.tweens.killTweensOf(this.hintText);
    this.hintText.setAlpha(1);
    this.hintText.setScale(1);
    this.hintText.setText(text);
    this.hintText.setColor(color);
    this.tweens.add({
      targets: this.hintText,
      alpha: { from: 1, to: 0.45 },
      yoyo: true,
      duration: 260,
      repeat: 1,
      onComplete: () => {
        this.hintText.setText(this.defaultHint);
        this.hintText.setColor(COLORS.text);
      },
    });
  }

  private onFinale() {
    this.hintText.setText("클리어 완료");
    this.hintText.setColor(COLORS.textHighlight);
    this.finaleTweens.push(
      this.tweens.add({
        targets: this.actLabel,
        alpha: { from: 1, to: 0.45 },
        yoyo: true,
        duration: 1000,
        repeat: -1,
      })
    );
    this.time.delayedCall(3000, () => this.showClearMenu());
  }

  private showClearMenu() {
    if (this.clearMenu) return;
    const { width, height } = this.scale;
    const gs = this.scene.get("GameScene");
    const c = this.add.container(0, 0).setDepth(2000);
    this.clearMenu = c;
    this.bottomMenu?.setVisible(false);
    this.hideShopMenu();
    this.zoomControls?.destroy();
    this.zoomControls = null;

    const panelW = width * 0.94;
    const panelH = u(170);
    const panelY = height - panelH / 2 - u(20);
    const panel = this.add
      .rectangle(width / 2, panelY, panelW, panelH, COLORS.panelMid, 0.98)
      .setStrokeStyle(u(2), COLORS.gild, 0.95);
    c.add(panel);

    const title = this.add
      .text(width / 2, panelY - panelH / 2 + u(8), "클리어", {
        fontFamily: "serif",
        fontSize: px(20),
        color: COLORS.textHighlight,
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    c.add(title);

    const bw = panelW * 0.42;
    const bh = u(38);
    const leftX = width / 2 - panelW * 0.23;
    const rightX = width / 2 + panelW * 0.23;
    const row1 = panelY + u(8);
    const row2 = panelY + u(54);
    this.makeButton(c, leftX, row1, bw, bh, "다음 스테이지", () => {
      gs.events.emit("next-stage");
    }, px(11));
    this.makeButton(c, rightX, row1, bw, bh, "계속 보기", () => this.closeClearMenu(), px(11));
    this.makeButton(c, leftX, row2, bw, bh, "인터렉션", () => this.requestInteraction(), px(11));
    this.makeButton(c, rightX, row2, bw, bh, "처음으로", () => {
      this.closeClearMenu();
      gs.events.emit("switch-stage-set", 1);
    }, px(11));

    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 260 });
  }

  private closeClearMenu() {
    if (!this.clearMenu) return;
    const c = this.clearMenu;
    this.clearMenu = null;
    this.bottomMenu?.setVisible(true);
    this.tweens.add({ targets: c, alpha: 0, duration: 220, onComplete: () => c.destroy() });
    this.drawZoomControls(this.scale.width, this.scale.height);
  }

  private enterInteractionMode() {
    this.closeClearMenu();
    if (this.zoomControls) {
      this.zoomControls.destroy();
      this.zoomControls = null;
    }
    this.hideShopMenu();
    this.scene.get("GameScene").events.emit("enter-interaction");
    this.drawInteractionControls();
    this.flashHint("캐릭터를 터치해 반응을 확인하세요.", COLORS.textHighlight);
  }

  private drawInteractionControls() {
    if (this.interactionControls) return;
    const { width, height } = this.scale;
    const c = this.add.container(0, 0).setDepth(1800);
    this.interactionControls = c;
    const y = height - u(36);
    this.makeButton(c, width / 2 - u(88), y, u(150), u(40), "돌아가기", () => this.exitInteractionModeUi(), px(12));
    this.makeButton(c, width / 2 + u(88), y, u(150), u(40), "다시 시작", () => this.restartGame(), px(12));
  }

  private exitInteractionModeUi() {
    if (this.interactionControls) {
      this.interactionControls.destroy();
      this.interactionControls = null;
    }
    this.scene.get("GameScene").events.emit("exit-interaction");
    this.flashHint("게임 모드로 돌아왔습니다.", COLORS.textHighlight);
  }

  private drawZoomControls(width: number, height: number) {
    if (this.zoomControls) return;
    const gs = this.scene.get("GameScene");
    const c = this.add.container(0, 0).setDepth(1800);
    this.zoomControls = c;
    const y = height - u(36);
    this.makeButton(c, width / 2 - u(132), y, u(76), u(40), "+", () => gs.events.emit("zoom-in"), px(16));
    this.makeButton(c, width / 2 - u(44), y, u(76), u(40), "-", () => gs.events.emit("zoom-out"), px(16));
    this.makeButton(c, width / 2 + u(44), y, u(76), u(40), "원위치", () => gs.events.emit("zoom-reset"), px(10));
    this.makeButton(c, width / 2 + u(132), y, u(76), u(40), "재시작", () => this.restartGame(), px(10));
  }

  private restartGame() {
    this.finaleTweens.forEach((t) => t.stop());
    this.finaleTweens = [];
    const gs = this.scene.get("GameScene");
    gs.events.emit("viewing-reset");
    gs.scene.restart();
    this.scene.restart();
  }
}
