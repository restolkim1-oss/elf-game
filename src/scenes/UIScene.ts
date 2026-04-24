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
  textSubtle: "#6a5540",
  success: "#86e08d",
  danger: "#e0868b",
};

// Scale helpers — multiply design-space pixel values by UI_SCALE
const u = (n: number) => n * UI_SCALE;
const px = (n: number) => `${n * UI_SCALE}px`;

interface Pill {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  ring: Phaser.GameObjects.Arc;
  glow: Phaser.GameObjects.Arc;
  tip: Phaser.GameObjects.Text;
  cleared: boolean;
}

export class UIScene extends Phaser.Scene {
  private pills: Pill[] = [];
  private actLabel!: Phaser.GameObjects.Text;
  private progressCount!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private defaultHint = "파츠를 선택하여 봉인을 해제하세요";
  private clearMenu: Phaser.GameObjects.Container | null = null;
  private finaleTweens: Phaser.Tweens.Tween[] = [];
  private zoomControls: Phaser.GameObjects.Container | null = null;

  constructor() {
    super("UIScene");
  }

  create() {
    this.pills = [];
    this.clearMenu = null;
    this.finaleTweens = [];
    this.zoomControls = null;
    const { width, height } = this.scale;

    this.drawTopPanel(width);
    this.drawBottomPanel(width, height);
    this.drawActLabel(width);
    this.drawProgressPills(width);
    this.drawCornerOrnaments(width, height);

    const game = this.scene.get("GameScene");

    game.events.on(
      "progress",
      (progress: { current: number; total: number }) => {
        this.updateAct(progress.current, progress.total);
      }
    );

    game.events.on("part-removed", (part: (typeof PARTS)[number]) => {
      this.markCleared(part.id);
      this.flashHint(`${part.label} 해제 완료`, COLORS.success);
    });

    game.events.on("failure", (partId: string) => {
      const part = PARTS.find((p) => p.id === partId);
      void part;
      this.flashHint("실패 — 다시 시도하세요", COLORS.danger);
    });

    game.events.on(
      "part-locked",
      (payload: { part: (typeof PARTS)[number]; reason: string }) => {
        this.flashHint(payload.reason || "잠금 상태", COLORS.textHighlight);
      }
    );

    game.events.on("viewing-mode", () => {
      this.drawZoomControls();
    });

    game.events.on("finale", () => {
      this.hintText.setText("◆   모든 봉인 해제   ◆");
      this.hintText.setColor(COLORS.textHighlight);
      this.finaleTweens.push(
        this.tweens.add({
          targets: this.hintText,
          scale: { from: 1, to: 1.12 },
          yoyo: true,
          duration: 640,
          repeat: -1,
          ease: "Sine.easeInOut",
        })
      );
      this.finaleTweens.push(
        this.tweens.add({
          targets: this.actLabel,
          alpha: { from: 1, to: 0.45 },
          yoyo: true,
          duration: 1000,
          repeat: -1,
        })
      );
      // Show clear menu AFTER the final swim crossfade (~2600ms total)
      this.time.delayedCall(3000, () => this.showClearMenu());
    });

    this.startIdlePillPulse();
  }

  // ---------- Decorative panels ----------

  private drawTopPanel(width: number) {
    const panel = this.add.rectangle(
      width / 2,
      u(58),
      width,
      u(124),
      COLORS.panelMid,
      0.95
    );
    void panel;
    // Gradient-like top wash
    this.add.rectangle(
      width / 2,
      u(24),
      width,
      u(48),
      COLORS.panelDeep,
      0.45
    );
    // Hairline at very top
    this.add.rectangle(width / 2, u(1), width, u(1), COLORS.gild, 0.4);
    // Double line at bottom of panel
    this.add.rectangle(
      width / 2,
      u(120),
      width,
      u(1),
      COLORS.gild,
      0.9
    );
    this.add.rectangle(
      width / 2,
      u(124),
      width * 0.55,
      u(1),
      COLORS.gild,
      0.35
    );
    // Central diamond on the bottom border
    this.add
      .text(width / 2, u(122), "◆", {
        fontFamily: "serif",
        fontSize: px(8),
        color: "#ffd572",
      })
      .setOrigin(0.5);
  }

  private drawBottomPanel(width: number, height: number) {
    this.add.rectangle(
      width / 2,
      height - u(54),
      width,
      u(108),
      COLORS.panelMid,
      0.95
    );
    this.add.rectangle(
      width / 2,
      height - u(99),
      width,
      u(48),
      COLORS.panelDeep,
      0.4
    );
    this.add.rectangle(
      width / 2,
      height - u(107),
      width,
      u(1),
      COLORS.gild,
      0.9
    );
    this.add.rectangle(
      width / 2,
      height - u(111),
      width * 0.55,
      u(1),
      COLORS.gild,
      0.35
    );
    this.add
      .text(width / 2, height - u(107), "◆", {
        fontFamily: "serif",
        fontSize: px(8),
        color: "#ffd572",
      })
      .setOrigin(0.5);

    this.hintText = this.add
      .text(width / 2, height - u(72), this.defaultHint, {
        fontFamily: "serif",
        fontSize: px(18),
        color: COLORS.text,
        fontStyle: "italic",
      })
      .setOrigin(0.5, 0);

    this.add
      .text(width / 2, height - u(34), "·   E L V E   U N W R A P   ·", {
        fontFamily: "serif",
        fontSize: px(9),
        color: COLORS.textSubtle,
        fontStyle: "italic",
      })
      .setOrigin(0.5, 0);
  }

  private drawActLabel(width: number) {
    // 캐릭터 이름 표시 (기승전결 대신)
    this.actLabel = this.add
      .text(width / 2, u(12), "◆   엘 린   ◆", {
        fontFamily: "serif",
        fontSize: px(20),
        color: "#ffd572",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);

    // Flanking lines
    this.add.rectangle(width / 2 - u(96), u(24), u(60), u(1), COLORS.gildSoft, 0.55);
    this.add.rectangle(width / 2 + u(96), u(24), u(60), u(1), COLORS.gildSoft, 0.55);
    // Flanking tip diamonds
    this.add.text(width / 2 - u(128), u(24), "◆", {
      fontFamily: "serif", fontSize: px(7), color: "#8a6a3d",
    }).setOrigin(0.5);
    this.add.text(width / 2 + u(128), u(24), "◆", {
      fontFamily: "serif", fontSize: px(7), color: "#8a6a3d",
    }).setOrigin(0.5);

    this.progressCount = this.add
      .text(width / 2, u(42), "0 / " + PARTS.length, {
        fontFamily: "serif",
        fontSize: px(11),
        color: COLORS.textDim,
        fontStyle: "italic",
      })
      .setOrigin(0.5, 0);
  }

  private drawProgressPills(width: number) {
    const pillY = u(84);
    const total = PARTS.length;
    const spacing = Math.min((width * 0.78) / total, u(64));
    const startX = width / 2 - (spacing * (total - 1)) / 2;

    // Connector line behind pills
    const lineLen = spacing * (total - 1);
    this.add.rectangle(
      width / 2,
      pillY,
      lineLen,
      u(1),
      COLORS.gildSoft,
      0.45
    );

    PARTS.forEach((part, idx) => {
      const x = startX + idx * spacing;
      const container = this.add.container(x, pillY);

      const glow = this.add
        .circle(0, 0, u(22), 0xffd572, 0)
        .setStrokeStyle(u(1.5), COLORS.gildHot, 0.4);
      const ring = this.add
        .circle(0, 0, u(18), 0x000000, 0)
        .setStrokeStyle(u(1.2), COLORS.gild, 0.7);
      const bg = this.add
        .circle(0, 0, u(14), COLORS.panelDeep)
        .setStrokeStyle(u(1), COLORS.gild, 0.9);
      const label = this.add
        .text(0, 0, String(part.order), {
          fontFamily: "serif",
          fontSize: px(13),
          color: COLORS.text,
          fontStyle: "bold",
        })
        .setOrigin(0.5);

      container.add([glow, ring, bg, label]);

      const tip = this.add
        .text(x, pillY + u(22), part.label, {
          fontFamily: "serif",
          fontSize: px(9),
          color: COLORS.textSubtle,
        })
        .setOrigin(0.5, 0);

      this.pills.push({
        container,
        bg,
        label,
        ring,
        glow,
        tip,
        cleared: false,
      });
    });
  }

  private drawCornerOrnaments(width: number, height: number) {
    // ── Side vignette strips ──────────────────────────────────────────
    // Soft dark bands on left and right so edges don't look bare/sharp
    const SIDE_W = u(40);
    const midY = height / 2;

    // Left strip: dark → transparent (simulated with stacked rects)
    [
      { a: 0.55, w: SIDE_W * 0.25 },
      { a: 0.38, w: SIDE_W * 0.5 },
      { a: 0.22, w: SIDE_W * 0.75 },
      { a: 0.10, w: SIDE_W },
    ].forEach(({ a, w }) => {
      this.add.rectangle(w / 2, midY, w, height, COLORS.panelDeep, a).setDepth(5);
      this.add.rectangle(width - w / 2, midY, w, height, COLORS.panelDeep, a).setDepth(5);
    });

    // ── Vertical decorative lines on each side ───────────────────────
    const lineX = u(20);
    const lineH = height * 0.28;         // only in the middle stretch
    const g2 = this.add.graphics().setDepth(1001);
    // Left line + right line (dashed feel via two rects)
    [[lineX, midY], [width - lineX, midY]].forEach(([x, y]) => {
      g2.lineStyle(u(1), COLORS.gild, 0.28);
      g2.beginPath();
      g2.moveTo(x, y - lineH / 2);
      g2.lineTo(x, y + lineH / 2);
      g2.strokePath();
      // Centre diamond on the line
      const d = u(4);
      g2.lineStyle(u(1), COLORS.gild, 0.55);
      g2.beginPath();
      g2.moveTo(x,     y - d);
      g2.lineTo(x + d, y);
      g2.lineTo(x,     y + d);
      g2.lineTo(x - d, y);
      g2.closePath();
      g2.strokePath();
    });

    // ── Corner brackets (longer, more elegant) ───────────────────────
    const g = this.add.graphics().setDepth(1002);
    g.lineStyle(u(1.2), COLORS.gild, 0.65);
    const arm  = u(44);   // bracket arm length
    const inset = u(12);
    const corners: [number, number, number, number][] = [
      [inset,          inset,          1,  1],   // top-left
      [width - inset,  inset,         -1,  1],   // top-right
      [inset,          height - inset, 1, -1],   // bottom-left
      [width - inset,  height - inset,-1, -1],   // bottom-right
    ];
    corners.forEach(([cx, cy, sx, sy]) => {
      g.beginPath();
      g.moveTo(cx + sx * arm, cy);
      g.lineTo(cx,             cy);
      g.lineTo(cx,             cy + sy * arm);
      g.strokePath();
    });

    // Inner corner dots
    g.lineStyle(u(1), COLORS.gild, 0.8);
    corners.forEach(([cx, cy, sx, sy]) => {
      const ox = cx + sx * (arm + u(4));
      const oy = cy + sy * (arm + u(4));
      const d  = u(3);
      g.beginPath();
      g.moveTo(ox,     oy - d);
      g.lineTo(ox + d, oy);
      g.lineTo(ox,     oy + d);
      g.lineTo(ox - d, oy);
      g.closePath();
      g.strokePath();
    });

    // Outer corner diamonds (at the very tip of each bracket)
    g.lineStyle(u(1), COLORS.gild, 0.45);
    corners.forEach(([cx, cy]) => {
      const d = u(5);
      g.beginPath();
      g.moveTo(cx,     cy - d);
      g.lineTo(cx + d, cy);
      g.lineTo(cx,     cy + d);
      g.lineTo(cx - d, cy);
      g.closePath();
      g.strokePath();
    });
  }

  // ---------- State updates ----------

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
      ease: "Quad.easeOut",
    });
    pill.glow.setAlpha(0.9).setScale(1);
    this.tweens.add({
      targets: pill.glow,
      scaleX: { from: 1, to: 2.3 },
      scaleY: { from: 1, to: 2.3 },
      alpha: { from: 0.9, to: 0 },
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
    // 이름은 고정, 진행 카운트만 업데이트
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

  // ---------- Clear menu ----------

  private showClearMenu() {
    if (this.clearMenu) return;
    const { width, height } = this.scale;

    const container = this.add.container(0, 0).setDepth(2000);
    this.clearMenu = container;

    // Click-blocking dim overlay
    const dim = this.add
      .rectangle(width / 2, height / 2, width, height, COLORS.panelDeep, 0.72)
      .setInteractive();
    container.add(dim);

    const panelW = width * 0.84;
    const panelH = u(380);
    const panelY = height / 2;

    // Drop shadow
    const shadow = this.add.rectangle(
      width / 2 + u(3),
      panelY + u(6),
      panelW,
      panelH,
      0x000000,
      0.65
    );
    container.add(shadow);

    // Outer panel
    const panel = this.add
      .rectangle(width / 2, panelY, panelW, panelH, COLORS.panelMid, 0.98)
      .setStrokeStyle(u(2), COLORS.gild, 0.95);
    container.add(panel);

    // Inner border
    const innerBorder = this.add
      .rectangle(
        width / 2,
        panelY,
        panelW - u(14),
        panelH - u(14),
        0x000000,
        0
      )
      .setStrokeStyle(u(1), COLORS.gild, 0.45);
    container.add(innerBorder);

    // Top divider with diamond
    const topLineY = panelY - panelH / 2 + u(54);
    const topLine = this.add.rectangle(
      width / 2,
      topLineY,
      panelW * 0.74,
      u(1),
      COLORS.gild,
      0.85
    );
    container.add(topLine);
    const topDia = this.add
      .text(width / 2, topLineY, "◆", {
        fontFamily: "serif",
        fontSize: px(12),
        color: "#ffd572",
      })
      .setOrigin(0.5);
    container.add(topDia);

    // Title
    const title = this.add
      .text(width / 2, panelY - panelH / 2 + u(86), "C L E A R", {
        fontFamily: "serif",
        fontSize: px(42),
        color: "#ffd572",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    container.add(title);

    // Subtitle
    const sub = this.add
      .text(
        width / 2,
        panelY - panelH / 2 + u(150),
        "◆   모든 봉인을 해제했습니다   ◆",
        {
          fontFamily: "serif",
          fontSize: px(14),
          color: COLORS.text,
          fontStyle: "italic",
        }
      )
      .setOrigin(0.5, 0);
    container.add(sub);

    // Stats line
    const stats = this.add
      .text(
        width / 2,
        panelY - panelH / 2 + u(182),
        `봉인 ${PARTS.length} / ${PARTS.length}   ·   해제 완료`,
        {
          fontFamily: "serif",
          fontSize: px(11),
          color: COLORS.textDim,
        }
      )
      .setOrigin(0.5, 0);
    container.add(stats);

    // Decorative divider
    const div = this.add.rectangle(
      width / 2,
      panelY - panelH / 2 + u(218),
      panelW * 0.42,
      u(1),
      COLORS.gildSoft,
      0.6
    );
    container.add(div);

    // Buttons
    const makeBtn = (
      y: number,
      label: string,
      onClick: () => void,
      primary: boolean
    ) => {
      const bw = panelW * 0.72;
      const bh = u(48);
      const fill = primary ? 0x2a1a34 : 0x120a1a;
      const fillHover = primary ? 0x3a2544 : 0x1c1028;
      const stroke = primary ? COLORS.gildHot : COLORS.gild;

      const bg = this.add
        .rectangle(width / 2, y, bw, bh, fill, 0.98)
        .setStrokeStyle(u(1.5), stroke, primary ? 1 : 0.75)
        .setInteractive({ useHandCursor: true });
      const lbl = this.add
        .text(width / 2, y, label, {
          fontFamily: "serif",
          fontSize: px(17),
          color: primary ? "#ffd572" : COLORS.text,
          fontStyle: "bold",
        })
        .setOrigin(0.5);

      bg.on("pointerover", () => {
        bg.setFillStyle(fillHover, 0.98);
        this.tweens.add({
          targets: [bg, lbl],
          scaleX: 1.03,
          scaleY: 1.03,
          duration: 140,
        });
      });
      bg.on("pointerout", () => {
        bg.setFillStyle(fill, 0.98);
        this.tweens.add({
          targets: [bg, lbl],
          scaleX: 1,
          scaleY: 1,
          duration: 140,
        });
      });
      bg.on("pointerdown", () => {
        this.tweens.add({
          targets: [bg, lbl],
          scaleX: 0.96,
          scaleY: 0.96,
          yoyo: true,
          duration: 90,
          onComplete: onClick,
        });
      });

      container.add(bg);
      container.add(lbl);
    };

    makeBtn(panelY + u(30), "✦   다시 하기", () => this.restartGame(), true);
    makeBtn(
      panelY + u(96),
      "✧   계속 감상",
      () => this.dismissClearMenu(),
      false
    );

    // Entrance animation
    container.setAlpha(0);
    [panel, shadow, innerBorder].forEach((o) => o.setScale(0.9));
    title.setScale(0.82);

    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 380,
      ease: "Quad.easeOut",
    });
    this.tweens.add({
      targets: [panel, shadow, innerBorder],
      scale: 1,
      duration: 540,
      ease: "Back.easeOut",
    });
    this.tweens.add({
      targets: title,
      scale: 1,
      duration: 720,
      delay: 120,
      ease: "Back.easeOut",
    });
    // Title shimmer
    this.tweens.add({
      targets: title,
      alpha: { from: 1, to: 0.78 },
      yoyo: true,
      duration: 1400,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private dismissClearMenu() {
    if (!this.clearMenu) return;
    const c = this.clearMenu;
    this.clearMenu = null;
    this.tweens.add({
      targets: c,
      alpha: 0,
      duration: 380,
      onComplete: () => c.destroy(),
    });
    // Nudge the player toward the zoom controls now that the menu is gone
    this.flashHint("· 스크롤 · 핀치 · 드래그로 확대 ·", COLORS.textHighlight);
  }

  // ---------- Zoom controls (viewing mode) ----------

  private drawZoomControls() {
    if (this.zoomControls) return;
    const { width, height } = this.scale;
    // Larger buttons, anchored further from the edge so they read clearly
    // on phones. BTN_R is the visual radius of each circular button.
    const BTN_R = u(32);
    const GAP = u(74);   // vertical spacing between buttons
    const cx = width - BTN_R - u(24);
    // Stack starts high enough that the "처음으로" button clears the
    // bottom UI panel (~u(108)) with room to spare.
    const cy0 = height - u(132) - GAP * 3 - u(60);
    const gs = this.scene.get("GameScene");

    const container = this.add.container(0, 0).setDepth(1800);
    this.zoomControls = container;

    // Round icon button forwarding events to GameScene
    const makeIconBtn = (cy: number, glyph: string, evt: string) => {
      const bg = this.add
        .circle(cx, cy, BTN_R, COLORS.panelMid, 0.94)
        .setStrokeStyle(u(2), COLORS.gild, 0.95)
        .setInteractive({ useHandCursor: true });
      const lbl = this.add
        .text(cx, cy, glyph, {
          fontFamily: "serif",
          fontSize: px(30),
          color: "#ffd572",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      bg.on("pointerover", () => {
        bg.setFillStyle(COLORS.panelSoft, 0.95);
        this.tweens.add({ targets: [bg, lbl], scaleX: 1.08, scaleY: 1.08, duration: 120 });
      });
      bg.on("pointerout", () => {
        bg.setFillStyle(COLORS.panelMid, 0.94);
        this.tweens.add({ targets: [bg, lbl], scaleX: 1, scaleY: 1, duration: 120 });
      });
      bg.on("pointerdown", () => {
        this.tweens.add({ targets: [bg, lbl], scaleX: 0.92, scaleY: 0.92, yoyo: true, duration: 90 });
        gs.events.emit(evt);
      });
      container.add(bg);
      container.add(lbl);
    };

    makeIconBtn(cy0,              "+", "zoom-in");
    makeIconBtn(cy0 + GAP,        "−", "zoom-out");
    makeIconBtn(cy0 + GAP * 2,    "⟲", "zoom-reset");

    // Separator line
    const sepY = cy0 + GAP * 2 + u(50);
    const sep = this.add.rectangle(cx, sepY, u(52), u(1), COLORS.gildSoft, 0.6);
    container.add(sep);

    // "처음으로" (back to title / restart) — text button below separator
    const quitY = sepY + u(38);
    const quitW = u(104);
    const quitH = u(54);
    const quitBg = this.add
      .rectangle(cx, quitY, quitW, quitH, COLORS.panelMid, 0.94)
      .setStrokeStyle(u(1.5), COLORS.gild, 0.85)
      .setInteractive({ useHandCursor: true });
    const quitLbl = this.add
      .text(cx, quitY, "처음으로", {
        fontFamily: "serif",
        fontSize: px(15),
        color: COLORS.text,
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    quitBg.on("pointerover", () => {
      quitBg.setFillStyle(COLORS.panelSoft, 0.95);
      this.tweens.add({ targets: [quitBg, quitLbl], scaleX: 1.06, scaleY: 1.06, duration: 120 });
    });
    quitBg.on("pointerout", () => {
      quitBg.setFillStyle(COLORS.panelMid, 0.92);
      this.tweens.add({ targets: [quitBg, quitLbl], scaleX: 1, scaleY: 1, duration: 120 });
    });
    quitBg.on("pointerdown", () => {
      this.tweens.add({
        targets: [quitBg, quitLbl],
        scaleX: 0.92, scaleY: 0.92,
        yoyo: true,
        duration: 90,
        onComplete: () => this.restartGame(),
      });
    });
    container.add(quitBg);
    container.add(quitLbl);

    // Entrance fade
    container.setAlpha(0);
    this.tweens.add({ targets: container, alpha: 1, duration: 500, ease: "Quad.easeOut" });
  }

  private restartGame() {
    // Stop finale tweens before tearing down
    this.finaleTweens.forEach((t) => t.stop());
    this.finaleTweens = [];
    const gs = this.scene.get("GameScene");
    // Reset camera zoom/scroll before the scene restarts so the first
    // frame of the new run is framed correctly
    gs.events.emit("viewing-reset");
    gs.scene.restart();
    this.scene.restart();
  }
}
