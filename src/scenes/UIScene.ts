import Phaser from "phaser";
import { PARTS } from "../data/parts";
import { UI_SCALE } from "../main";

const COLORS = {
  frameDark: 0x07090f,
  frameMid: 0x141926,
  panelDark: 0x15131a,
  panelSoft: 0x28232f,
  glass: 0x1c1a22,
  gold: 0xd4b170,
  goldHot: 0xffe0a3,
  goldDim: 0x7b6845,
  textMain: "#f5e8ce",
  textSub: "#c7b18d",
  textDim: "#8e7a5b",
  success: "#8de89d",
  danger: "#f08f95",
};

const u = (n: number) => n * UI_SCALE;
const px = (n: number) => `${Math.round(n * UI_SCALE * 1.12)}px`;

interface Pill {
  container: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Arc;
  core: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  tip: Phaser.GameObjects.Text;
  glow: Phaser.GameObjects.Arc;
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
  private titleText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private statText!: Phaser.GameObjects.Text;
  private readonly defaultHint =
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
    this.drawFrame(width, height);
    this.drawTopPanel(width);
    this.drawBottomPanel(width, height);
    this.drawBottomMenu(width, height);

    const game = this.scene.get("GameScene");
    game.events.on("progress", (progress: { current: number; total: number }) => {
      this.updateProgress(progress.current, progress.total);
    });
    game.events.on("part-removed", (part: (typeof PARTS)[number]) => {
      this.markCleared(part.id);
      this.flashHint(`${part.label} 해제 완료`, COLORS.success);
    });
    game.events.on("failure", () => {
      this.flashHint("미니게임 실패! 다시 도전해보세요.", COLORS.danger);
    });
    game.events.on(
      "part-locked",
      (payload: { part: (typeof PARTS)[number]; reason: string }) => {
        this.flashHint(payload.reason || "지금은 해제할 수 없는 파츠입니다.", COLORS.textMain);
      }
    );
    game.events.on("economy-update", (state: EconomyState) => {
      this.lastEconomy = state;
      this.updateEconomy(state);
    });
    game.events.on("shop-feedback", (payload: { text: string; color?: string }) => {
      this.flashHint(payload.text, payload.color ?? COLORS.textMain);
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

  private drawFrame(width: number, height: number) {
    const g = this.add.graphics().setDepth(990);
    g.lineStyle(u(2), COLORS.gold, 0.9);
    g.strokeRoundedRect(u(14), u(14), width - u(28), height - u(28), u(42));
    g.lineStyle(u(1), COLORS.goldDim, 0.8);
    g.strokeRoundedRect(u(24), u(24), width - u(48), height - u(48), u(34));

    const corner = u(42);
    const inset = u(16);
    const corners: [number, number, number, number][] = [
      [inset, inset, 1, 1],
      [width - inset, inset, -1, 1],
      [inset, height - inset, 1, -1],
      [width - inset, height - inset, -1, -1],
    ];
    g.lineStyle(u(2), COLORS.gold, 0.55);
    corners.forEach(([cx, cy, sx, sy]) => {
      g.beginPath();
      g.moveTo(cx + sx * corner, cy);
      g.lineTo(cx, cy);
      g.lineTo(cx, cy + sy * corner);
      g.strokePath();
    });
  }

  private drawTopPanel(width: number) {
    const panelY = u(116);
    const panelH = u(220);
    const g = this.add.graphics().setDepth(1000);
    g.fillStyle(COLORS.frameDark, 0.84);
    g.fillRoundedRect(u(34), u(34), width - u(68), panelH, u(30));
    g.fillStyle(COLORS.frameMid, 0.55);
    g.fillRoundedRect(u(42), u(42), width - u(84), panelH - u(16), u(24));
    g.lineStyle(u(1.8), COLORS.gold, 0.8);
    g.strokeRoundedRect(u(34), u(34), width - u(68), panelH, u(30));

    this.titleText = this.add
      .text(width / 2, panelY - u(78), "◆ 엘린 ◆", {
        fontFamily: "serif",
        fontSize: px(26),
        color: COLORS.textMain,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.progressText = this.add
      .text(width / 2, panelY - u(34), `0 / ${PARTS.length}`, {
        fontFamily: "serif",
        fontSize: px(16),
        color: COLORS.textSub,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.drawProgressPills(width, panelY + u(10));
  }

  private drawProgressPills(width: number, y: number) {
    const total = PARTS.length;
    const spacing = Math.min((width * 0.62) / Math.max(1, total - 1), u(140));
    const startX = width / 2 - (spacing * (total - 1)) / 2;

    this.add
      .rectangle(width / 2, y, spacing * (total - 1), u(2), COLORS.goldDim, 0.65)
      .setDepth(1005);

    PARTS.slice()
      .sort((a, b) => a.order - b.order)
      .forEach((part, idx) => {
        const x = startX + idx * spacing;
        const container = this.add.container(x, y).setDepth(1010);

        const glow = this.add.circle(0, 0, u(30), 0xffde9f, 0);
        const ring = this.add
          .circle(0, 0, u(24), 0x000000, 0)
          .setStrokeStyle(u(2), COLORS.gold, 0.85);
        const core = this.add
          .circle(0, 0, u(18), COLORS.panelDark, 0.95)
          .setStrokeStyle(u(1), COLORS.gold, 0.9);
        const label = this.add
          .text(0, 0, String(part.order), {
            fontFamily: "serif",
            fontSize: px(15),
            color: COLORS.textMain,
            fontStyle: "bold",
          })
          .setOrigin(0.5);
        const tip = this.add
          .text(x, y + u(34), `스텝 ${part.order}: ${part.label}`, {
            fontFamily: "serif",
            fontSize: px(9.2),
            color: COLORS.textDim,
            fontStyle: "bold",
          })
          .setOrigin(0.5, 0);

        container.add([glow, ring, core, label]);
        this.pills.push({ container, ring, core, label, tip, glow, cleared: false });
      });
  }

  private drawBottomPanel(width: number, height: number) {
    const panelH = u(284);
    const panelY = height - panelH / 2 - u(20);

    const g = this.add.graphics().setDepth(1000);
    g.fillStyle(COLORS.glass, 0.88);
    g.fillRoundedRect(u(34), height - panelH - u(20), width - u(68), panelH, u(22));
    g.fillStyle(COLORS.panelSoft, 0.46);
    g.fillRoundedRect(u(42), height - panelH - u(12), width - u(84), u(96), u(18));
    g.lineStyle(u(1.6), COLORS.gold, 0.85);
    g.strokeRoundedRect(u(34), height - panelH - u(20), width - u(68), panelH, u(22));

    this.hintText = this.add
      .text(width / 2, panelY - u(92), this.defaultHint, {
        fontFamily: "serif",
        fontSize: px(17),
        color: COLORS.textMain,
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: width * 0.86 },
      })
      .setOrigin(0.5, 0.5)
      .setDepth(1010);

    this.statText = this.add
      .text(width / 2, panelY - u(24), "코인 0 | 호감도 0 / 100 | 스테이지 1", {
        fontFamily: "serif",
        fontSize: px(16),
        color: COLORS.textSub,
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(1010);
  }

  private drawBottomMenu(width: number, height: number) {
    if (this.bottomMenu) return;
    const gs = this.scene.get("GameScene");
    const c = this.add.container(0, 0).setDepth(1750);
    this.bottomMenu = c;

    const labels = [
      { text: "파츠선택", action: () => this.requestInteraction() },
      {
        text: "미니게임",
        action: () => {
          this.hideShopMenu();
          gs.events.emit("farm-minigame");
        },
      },
      { text: "상점", action: () => this.toggleShopMenu() },
      {
        text: "메인으로",
        action: () => {
          this.closeClearMenu();
          gs.events.emit("switch-stage-set", 1);
        },
      },
      { text: "전체 해제", action: () => gs.events.emit("force-clear") },
    ];

    const gap = u(10);
    const btnW = Math.min(u(128), (width - u(88) - gap * (labels.length - 1)) / labels.length);
    const btnH = u(58);
    const totalW = labels.length * btnW + (labels.length - 1) * gap;
    const startX = width / 2 - totalW / 2 + btnW / 2;
    const y = height - u(84);

    labels.forEach((item, idx) => {
      this.makeButton(
        c,
        startX + idx * (btnW + gap),
        y,
        btnW,
        btnH,
        item.text,
        item.action,
        px(12)
      );
    });
  }

  private requestInteraction() {
    if (!this.puzzleBusy) {
      this.enterInteractionMode();
      return;
    }
    this.showConfirmMenu(
      "미니게임이 진행 중입니다.\n파츠선택 모드로 이동할까요?",
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

    const panelW = width * 0.84;
    const panelH = u(176);
    const panelY = height / 2;
    const dim = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.58)
      .setInteractive();
    const panel = this.add
      .rectangle(width / 2, panelY, panelW, panelH, COLORS.panelDark, 0.98)
      .setStrokeStyle(u(2), COLORS.goldHot, 0.9);
    const text = this.add
      .text(width / 2, panelY - u(44), message, {
        fontFamily: "serif",
        fontSize: px(15),
        color: COLORS.textMain,
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5);
    c.add(dim);
    c.add(panel);
    c.add(text);

    this.makeButton(c, width / 2 - u(88), panelY + u(48), u(150), u(44), "이동", () => {
      this.closeConfirmMenu();
      onYes();
    }, px(12));
    this.makeButton(c, width / 2 + u(88), panelY + u(48), u(150), u(44), "취소", () => {
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
      this.flashHint("미니게임 중에는 상점을 열 수 없습니다.", COLORS.textMain);
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
      duration: 180,
      onComplete: () => old.destroy(),
    });
  }

  private drawShopMenu() {
    const { width, height } = this.scale;
    const gs = this.scene.get("GameScene");
    const c = this.add.container(0, 0).setDepth(1900);
    this.shopMenu = c;

    const panelW = width * 0.92;
    const panelH = u(184);
    const panelY = height - u(432);
    const bg = this.add
      .rectangle(width / 2, panelY, panelW, panelH, COLORS.panelDark, 0.97)
      .setStrokeStyle(u(1.8), COLORS.goldHot, 0.92);
    c.add(bg);

    const state = this.lastEconomy;
    const title = this.add
      .text(width / 2, panelY - panelH / 2 + u(14), "상점", {
        fontFamily: "serif",
        fontSize: px(18),
        color: COLORS.textMain,
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    c.add(title);

    const items = [
      { id: "flower", name: "꽃다발", cost: 18, own: state?.inventory.flower ?? 0 },
      { id: "choco", name: "초콜릿", cost: 30, own: state?.inventory.choco ?? 0 },
      { id: "perfume", name: "향수", cost: 44, own: state?.inventory.perfume ?? 0 },
    ] as const;

    const rowW = panelW * 0.31;
    items.forEach((item, idx) => {
      const x = width / 2 - panelW / 2 + rowW * idx + rowW / 2 + u(6);
      const card = this.add
        .rectangle(x, panelY + u(20), rowW - u(10), u(106), COLORS.panelSoft, 0.94)
        .setStrokeStyle(u(1.2), COLORS.gold, 0.8);
      const name = this.add
        .text(x, panelY - u(12), `${item.name} · ${item.cost}코인`, {
          fontFamily: "serif",
          fontSize: px(11),
          color: COLORS.textMain,
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      const own = this.add
        .text(x, panelY + u(14), `보유 ${item.own}`, {
          fontFamily: "serif",
          fontSize: px(10),
          color: COLORS.textDim,
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      c.add(card);
      c.add(name);
      c.add(own);

      this.makeButton(c, x - u(44), panelY + u(48), u(84), u(34), "구입", () => {
        gs.events.emit("buy-item", item.id);
      }, px(10));
      this.makeButton(c, x + u(44), panelY + u(48), u(84), u(34), "선물", () => {
        gs.events.emit("gift-item", item.id);
      }, px(10));
    });

    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 220 });
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
      .setStrokeStyle(u(1.5), COLORS.gold, 0.86)
      .setInteractive({ useHandCursor: true });
    const txt = this.add
      .text(x, y, label, {
        fontFamily: "serif",
        fontSize,
        color: COLORS.textMain,
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5);
    bg.on("pointerover", () => bg.setFillStyle(0x3a3342, 0.98));
    bg.on("pointerout", () => bg.setFillStyle(COLORS.panelSoft, 0.96));
    bg.on("pointerdown", () => {
      this.tweens.add({
        targets: [bg, txt],
        scaleX: 0.93,
        scaleY: 0.93,
        yoyo: true,
        duration: 100,
        onComplete: onClick,
      });
    });
    container.add(bg);
    container.add(txt);
  }

  private updateEconomy(state: EconomyState) {
    this.statText.setText(
      `코인 ${state.currency} | 호감도 ${state.affinity} / ${state.affinityMax} | 스테이지 ${state.stageSet}`
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
    pill.core.setFillStyle(COLORS.gold, 0.98);
    pill.core.setStrokeStyle(u(1.2), COLORS.goldHot, 1);
    pill.ring.setStrokeStyle(u(2.2), COLORS.goldHot, 1);
    pill.label.setColor("#1b1411");
    pill.tip.setColor(COLORS.textMain);
    this.tweens.killTweensOf(pill.glow);
    this.tweens.add({
      targets: pill.container,
      scale: { from: 1, to: 1.2 },
      yoyo: true,
      duration: 240,
    });
    pill.glow.setAlpha(0.82).setScale(1);
    this.tweens.add({
      targets: pill.glow,
      scaleX: 2.15,
      scaleY: 2.15,
      alpha: 0,
      duration: 620,
    });
  }

  private startIdlePillPulse() {
    this.pills.forEach((p) => {
      if (p.cleared) return;
      this.tweens.add({
        targets: p.glow,
        alpha: { from: 0.36, to: 0 },
        scaleX: { from: 1, to: 1.7 },
        scaleY: { from: 1, to: 1.7 },
        duration: 1800,
        repeat: -1,
        ease: "Sine.easeOut",
      });
    });
  }

  private updateProgress(current: number, total: number) {
    this.progressText.setText(`${current} / ${total}`);
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
        this.hintText.setColor(COLORS.textMain);
      },
    });
  }

  private onFinale() {
    this.hintText.setText("클리어! 메뉴를 선택하세요.");
    this.hintText.setColor(COLORS.textMain);
    this.finaleTweens.push(
      this.tweens.add({
        targets: this.titleText,
        alpha: { from: 1, to: 0.45 },
        yoyo: true,
        duration: 1000,
        repeat: -1,
      })
    );
    this.time.delayedCall(800, () => this.showClearMenu());
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

    const panelW = width * 0.9;
    const panelH = u(194);
    const panelY = height - panelH / 2 - u(32);
    const panel = this.add
      .rectangle(width / 2, panelY, panelW, panelH, COLORS.panelDark, 0.98)
      .setStrokeStyle(u(2), COLORS.gold, 0.95);
    c.add(panel);

    const title = this.add
      .text(width / 2, panelY - panelH / 2 + u(10), "클리어 메뉴", {
        fontFamily: "serif",
        fontSize: px(20),
        color: COLORS.textMain,
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    c.add(title);

    const bw = panelW * 0.42;
    const bh = u(42);
    const leftX = width / 2 - panelW * 0.23;
    const rightX = width / 2 + panelW * 0.23;
    const row1 = panelY + u(12);
    const row2 = panelY + u(64);
    this.makeButton(c, leftX, row1, bw, bh, "다음 스테이지", () => {
      gs.events.emit("next-stage");
    }, px(12));
    this.makeButton(c, rightX, row1, bw, bh, "계속 보기", () => this.closeClearMenu(), px(12));
    this.makeButton(c, leftX, row2, bw, bh, "인터렉션", () => this.requestInteraction(), px(12));
    this.makeButton(c, rightX, row2, bw, bh, "처음으로", () => {
      this.closeClearMenu();
      gs.events.emit("switch-stage-set", 1);
    }, px(12));

    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 240 });
  }

  private closeClearMenu() {
    if (!this.clearMenu) return;
    const c = this.clearMenu;
    this.clearMenu = null;
    this.bottomMenu?.setVisible(true);
    this.tweens.add({ targets: c, alpha: 0, duration: 200, onComplete: () => c.destroy() });
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
    this.flashHint("캐릭터를 터치해서 반응 애니메이션을 확인하세요.", COLORS.textMain);
  }

  private drawInteractionControls() {
    if (this.interactionControls) return;
    const { width, height } = this.scale;
    const c = this.add.container(0, 0).setDepth(1800);
    this.interactionControls = c;
    const y = height - u(34);
    this.makeButton(c, width / 2 - u(92), y, u(160), u(42), "돌아가기", () => this.exitInteractionModeUi(), px(12));
    this.makeButton(c, width / 2 + u(92), y, u(160), u(42), "다시 시작", () => this.restartGame(), px(12));
  }

  private exitInteractionModeUi() {
    if (this.interactionControls) {
      this.interactionControls.destroy();
      this.interactionControls = null;
    }
    this.scene.get("GameScene").events.emit("exit-interaction");
    this.flashHint("게임 모드로 복귀했습니다.", COLORS.textMain);
  }

  private drawZoomControls(width: number, height: number) {
    if (this.zoomControls) return;
    const gs = this.scene.get("GameScene");
    const c = this.add.container(0, 0).setDepth(1800);
    this.zoomControls = c;
    const y = height - u(154);
    this.makeButton(c, width / 2 - u(168), y, u(84), u(42), "+", () => gs.events.emit("zoom-in"), px(18));
    this.makeButton(c, width / 2 - u(78), y, u(84), u(42), "-", () => gs.events.emit("zoom-out"), px(18));
    this.makeButton(c, width / 2 + u(20), y, u(112), u(42), "원위치", () => gs.events.emit("zoom-reset"), px(10.5));
    this.makeButton(c, width / 2 + u(142), y, u(112), u(42), "다시", () => this.restartGame(), px(11));
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
