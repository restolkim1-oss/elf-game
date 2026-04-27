import Phaser from "phaser";
import type { PartDef } from "../data/parts";
import { UI_SCALE } from "../main";

const u = (n: number) => n * UI_SCALE;
const gpx = (n: number) => `${Math.round(n * UI_SCALE * 1.55)}px`;

type PuzzleResult = (success: boolean) => void;

export class PuzzleSystem {
  private scene: Phaser.Scene;
  private overlay: Phaser.GameObjects.Container | null = null;
  private activeDone: PuzzleResult | null = null;
  private cancelled = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  start(part: PartDef, done: PuzzleResult) {
    this.cleanup();
    this.cancelled = false;
    this.activeDone = done;
    switch (part.puzzle) {
      case "instant":
        this.playInstant();
        break;
      case "pattern":
        this.startPattern(part);
        break;
      case "tetris":
        this.startTetris(part);
        break;
      case "memory":
        this.startMemory(part);
        break;
    }
  }

  abortCurrent() {
    if (!this.activeDone) return;
    this.cancelled = true;
    this.finish(false);
  }

  consumeLastCancelled() {
    const v = this.cancelled;
    this.cancelled = false;
    return v;
  }

  private finish(success: boolean) {
    const done = this.activeDone;
    this.activeDone = null;
    this.cleanup();
    if (done) done(success);
  }

  private cleanup() {
    this.overlay?.destroy();
    this.overlay = null;
  }

  private playInstant() {
    this.scene.time.delayedCall(120, () => this.finish(true));
  }

  private makePanel(title: string, subtitle: string, heightRatio = 0.56) {
    const { width, height } = this.scene.scale;
    const w = width * 0.9;
    const h = height * heightRatio;
    const top = height / 2 - h / 2;
    const bottom = height / 2 + h / 2;

    const shadow = this.scene.add.rectangle(width / 2 + u(4), height / 2 + u(6), w, h, 0x000000, 0.55);
    const bg = this.scene.add
      .rectangle(width / 2, height / 2, w, h, 0x14091a, 0.97)
      .setStrokeStyle(u(2), 0xd4a656, 0.95);
    const inner = this.scene.add
      .rectangle(width / 2, height / 2, w - u(10), h - u(10), 0x000000, 0)
      .setStrokeStyle(u(1), 0xd4a656, 0.45);
    const line = this.scene.add.rectangle(width / 2, top + u(56), w * 0.84, u(1), 0xd4a656, 0.82);

    const titleText = this.scene.add
      .text(width / 2, top + u(18), title, {
        fontFamily: "serif",
        fontSize: gpx(20),
        color: "#f3e6c9",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: w * 0.82 },
      })
      .setOrigin(0.5, 0);

    const subtitleText = this.scene.add
      .text(width / 2, top + u(68), subtitle, {
        fontFamily: "serif",
        fontSize: gpx(13),
        color: "#d4a656",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: w * 0.84 },
      })
      .setOrigin(0.5, 0);

    this.overlay = this.scene.add.container(0, 0, [shadow, bg, inner, line, titleText, subtitleText]).setDepth(500);
    return { w, h, top, bottom };
  }

  private addCancelButton(y: number) {
    const { width } = this.scene.scale;
    this.addMiniButton(width / 2, y, u(180), u(36), "포기", () => {
      this.cancelled = true;
      this.finish(false);
    });
  }

  private startPattern(part: PartDef) {
    const { width, height } = this.scene.scale;
    const panel = this.makePanel(part.label, "순서를 본 뒤 같은 순서로 누르세요.", 0.46);

    const colors = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f];
    const sequenceLength = 2 + part.difficulty;
    const sequence = Array.from({ length: sequenceLength }, () => Math.floor(Math.random() * colors.length));

    const statusText = this.scene.add
      .text(width / 2, height / 2 - u(18), "집중해서 보세요...", {
        fontFamily: "serif",
        fontSize: gpx(15),
        color: "#f3e6c9",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.overlay?.add(statusText);

    const buttons: Phaser.GameObjects.Rectangle[] = [];
    const size = u(62);
    colors.forEach((c, i) => {
      const b = this.scene.add
        .rectangle(width / 2 + (i - 1.5) * u(84), height / 2 + u(64), size, size, c)
        .setStrokeStyle(u(2), 0xd4a656, 0.5)
        .setInteractive({ useHandCursor: true });
      buttons.push(b);
      this.overlay?.add(b);
    });

    let playerIdx = 0;
    let locked = true;
    let finished = false;

    buttons.forEach((b, i) => {
      b.on("pointerdown", () => {
        if (locked || finished) return;
        this.scene.tweens.add({ targets: b, scaleX: 1.18, scaleY: 1.18, yoyo: true, duration: 120 });
        if (i !== sequence[playerIdx]) {
          finished = true;
          locked = true;
          statusText.setText("실패");
          statusText.setColor("#e0868b");
          this.scene.time.delayedCall(480, () => this.finish(false));
          return;
        }
        playerIdx++;
        statusText.setText(`${playerIdx} / ${sequenceLength}`);
        if (playerIdx >= sequence.length) {
          finished = true;
          locked = true;
          statusText.setText("성공");
          statusText.setColor("#86e08d");
          this.scene.time.delayedCall(380, () => this.finish(true));
        }
      });
    });

    const showSequence = (step: number) => {
      if (step >= sequence.length) {
        statusText.setText(`내 차례 (${sequenceLength}단계)`);
        locked = false;
        return;
      }
      const btn = buttons[sequence[step]];
      this.scene.tweens.add({
        targets: btn,
        scaleX: 1.26,
        scaleY: 1.26,
        yoyo: true,
        duration: 250,
        onComplete: () => showSequence(step + 1),
      });
    };

    this.scene.time.delayedCall(500, () => showSequence(0));
    this.addCancelButton(panel.bottom - u(34));
  }

  private startTetris(part: PartDef) {
    void part;
    const { width } = this.scene.scale;
    const panel = this.makePanel("블록 정리", "줄 3개를 지우면 성공입니다.", 0.74);

    const cols = 6;
    const rows = 10;
    const gap = u(2);
    const maxCellByH = (panel.h * 0.62 - gap * (rows - 1)) / rows;
    const maxCellByW = (panel.w * 0.56 - gap * (cols - 1)) / cols;
    const cell = Math.min(u(34), maxCellByH, maxCellByW);
    const boardW = cols * cell + (cols - 1) * gap;
    const boardH = rows * cell + (rows - 1) * gap;
    const boardX = width / 2 - boardW / 2 + cell / 2;
    const boardY = panel.top + u(118);

    type Shape = number[][][];
    const shapes: { color: number; rots: Shape }[] = [
      {
        color: 0x5dade2,
        rots: [
          [[0, 0], [0, 1], [0, 2], [0, 3]],
          [[0, 0], [1, 0], [2, 0], [3, 0]],
        ],
      },
      { color: 0xf4d03f, rots: [[[0, 0], [0, 1], [1, 0], [1, 1]]] },
      {
        color: 0xaf7ac5,
        rots: [
          [[0, 0], [0, 1], [0, 2], [1, 1]],
          [[0, 1], [1, 0], [1, 1], [2, 1]],
          [[1, 0], [1, 1], [1, 2], [0, 1]],
          [[0, 0], [1, 0], [2, 0], [1, 1]],
        ],
      },
      {
        color: 0x2ecc71,
        rots: [
          [[0, 1], [0, 2], [1, 0], [1, 1]],
          [[0, 0], [1, 0], [1, 1], [2, 1]],
        ],
      },
      {
        color: 0xe74c3c,
        rots: [
          [[0, 0], [0, 1], [1, 1], [1, 2]],
          [[0, 1], [1, 0], [1, 1], [2, 0]],
        ],
      },
    ];

    const board: (number | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null));
    const cellSprites: Phaser.GameObjects.Rectangle[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: Phaser.GameObjects.Rectangle[] = [];
      for (let c = 0; c < cols; c++) {
        const rect = this.scene.add
          .rectangle(boardX + c * (cell + gap), boardY + r * (cell + gap), cell, cell, 0x1a1022, 0.9)
          .setStrokeStyle(u(1), 0x3a2a44, 0.7);
        this.overlay?.add(rect);
        row.push(rect);
      }
      cellSprites.push(row);
    }

    const status = this.scene.add
      .text(width / 2, panel.top + u(88), "지운 줄 0 / 3", {
        fontFamily: "serif",
        fontSize: gpx(13),
        color: "#f3e6c9",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    this.overlay?.add(status);

    let shapeIdx = 0;
    let rot = 0;
    let curRow = 0;
    let curCol = 0;
    let cleared = 0;
    let finished = false;
    let dropEvent: Phaser.Time.TimerEvent | null = null;

    const getCells = (s: number, r: number, y: number, x: number) =>
      shapes[s].rots[r % shapes[s].rots.length].map(([dy, dx]) => [y + dy, x + dx] as [number, number]);

    const canPlace = (s: number, r: number, y: number, x: number) =>
      getCells(s, r, y, x).every(
        ([yy, xx]) => yy >= 0 && yy < rows && xx >= 0 && xx < cols && board[yy][xx] === null
      );

    const draw = () => {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const v = board[r][c];
          cellSprites[r][c].setFillStyle(v ?? 0x1a1022, v === null ? 0.9 : 1);
        }
      }
      if (!finished) {
        for (const [yy, xx] of getCells(shapeIdx, rot, curRow, curCol)) {
          if (yy >= 0 && yy < rows && xx >= 0 && xx < cols) {
            cellSprites[yy][xx].setFillStyle(shapes[shapeIdx].color, 1);
          }
        }
      }
    };

    const spawn = () => {
      shapeIdx = Math.floor(Math.random() * shapes.length);
      rot = 0;
      curRow = 0;
      curCol = Math.floor(cols / 2) - 1;
      if (!canPlace(shapeIdx, rot, curRow, curCol)) {
        finished = true;
        dropEvent?.remove(false);
        status.setText("실패");
        status.setColor("#e0868b");
        this.scene.time.delayedCall(600, () => this.finish(false));
        return;
      }
      draw();
    };

    const lockPiece = () => {
      for (const [yy, xx] of getCells(shapeIdx, rot, curRow, curCol)) {
        if (yy >= 0 && yy < rows && xx >= 0 && xx < cols) {
          board[yy][xx] = shapes[shapeIdx].color;
        }
      }
      let lineCount = 0;
      for (let r = rows - 1; r >= 0; r--) {
        if (board[r].every((v) => v !== null)) {
          board.splice(r, 1);
          board.unshift(Array(cols).fill(null));
          lineCount++;
          r++;
        }
      }
      if (lineCount > 0) {
        cleared += lineCount;
        status.setText(`지운 줄 ${Math.min(cleared, 3)} / 3`);
      }
      if (cleared >= 3) {
        finished = true;
        dropEvent?.remove(false);
        status.setText("성공");
        status.setColor("#86e08d");
        this.scene.time.delayedCall(520, () => this.finish(true));
        return;
      }
      spawn();
    };

    const tryMove = (dy: number, dx: number) => {
      if (finished) return false;
      if (!canPlace(shapeIdx, rot, curRow + dy, curCol + dx)) return false;
      curRow += dy;
      curCol += dx;
      draw();
      return true;
    };

    const rotate = () => {
      const next = (rot + 1) % shapes[shapeIdx].rots.length;
      if (canPlace(shapeIdx, next, curRow, curCol)) {
        rot = next;
        draw();
      }
    };

    const softDrop = () => {
      if (!tryMove(1, 0)) lockPiece();
    };

    const hardDrop = () => {
      while (tryMove(1, 0)) {
        /* keep falling */
      }
      lockPiece();
    };

    dropEvent = this.scene.time.addEvent({ delay: 640, loop: true, callback: softDrop });

    const btnY = Math.min(panel.bottom - u(92), boardY + boardH + u(30));
    const defs = [
      { label: "◀", dx: -u(92), fn: () => tryMove(0, -1) },
      { label: "회전", dx: -u(30), fn: rotate },
      { label: "▼", dx: u(30), fn: softDrop },
      { label: "▶", dx: u(92), fn: () => tryMove(0, 1) },
    ];
    defs.forEach((d) => this.addMiniButton(width / 2 + d.dx, btnY, u(56), u(42), d.label, d.fn));
    this.addMiniButton(width / 2, btnY + u(52), u(200), u(36), "즉시 낙하", hardDrop);
    this.addCancelButton(btnY + u(98));

    const keyboard = this.scene.input.keyboard;
    if (keyboard) {
      const onKey = (e: KeyboardEvent) => {
        if (finished) return;
        if (e.key === "ArrowLeft") tryMove(0, -1);
        else if (e.key === "ArrowRight") tryMove(0, 1);
        else if (e.key === "ArrowDown") softDrop();
        else if (e.key === "ArrowUp" || e.key === "x" || e.key === "X") rotate();
        else if (e.key === " ") hardDrop();
      };
      keyboard.on("keydown", onKey);
      this.overlay?.once("destroy", () => keyboard.off("keydown", onKey));
    }

    spawn();
  }

  private startMemory(part: PartDef) {
    const { width } = this.scene.scale;
    const pairs = Math.min(6, 2 + part.difficulty);
    const totalCards = pairs * 2;
    const cols = pairs <= 3 ? 3 : pairs === 4 ? 4 : pairs === 5 ? 5 : 4;
    const rows = Math.ceil(totalCards / cols);
    const panel = this.makePanel(part.label, "같은 그림 짝을 모두 맞추세요.", rows <= 3 ? 0.56 : 0.66);

    const maxBoardW = width * 0.74;
    const maxBoardH = panel.h * 0.55;
    const gap = u(7);
    const cell = Math.min(
      (maxBoardW - gap * (cols - 1)) / cols,
      (maxBoardH - gap * (rows - 1)) / rows,
      u(64)
    );
    const boardW = cell * cols + gap * (cols - 1);
    const boardLeft = width / 2 - boardW / 2;
    const boardTop = panel.top + u(118);
    const symbols = ["◆", "★", "♥", "✦", "❖", "☽"];
    const colors = [0xe74c3c, 0xf1c40f, 0x3498db, 0x2ecc71, 0xaf7ac5, 0xe67e22];
    const tokens = shuffleInPlace(
      Array.from({ length: pairs }, (_, i) => [
        { symbol: symbols[i], color: colors[i], id: i },
        { symbol: symbols[i], color: colors[i], id: i },
      ]).flat()
    );

    interface Card {
      bg: Phaser.GameObjects.Rectangle;
      front: Phaser.GameObjects.Text;
      back: Phaser.GameObjects.Text;
      token: (typeof tokens)[number];
      flipped: boolean;
      matched: boolean;
    }
    const cards: Card[] = [];

    tokens.forEach((token, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = boardLeft + col * (cell + gap) + cell / 2;
      const y = boardTop + row * (cell + gap) + cell / 2;
      const bg = this.scene.add
        .rectangle(x, y, cell, cell, 0x2a1a34, 0.98)
        .setStrokeStyle(u(1.5), 0xd4a656, 0.85)
        .setInteractive({ useHandCursor: true });
      const back = this.scene.add
        .text(x, y, "◈", {
          fontFamily: "serif",
          fontSize: gpx(18),
          color: "#d4a656",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setAlpha(0.55);
      const front = this.scene.add
        .text(x, y, token.symbol, {
          fontFamily: "serif",
          fontSize: gpx(18),
          color: colorHex(token.color),
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setAlpha(0);
      this.overlay?.add(bg);
      this.overlay?.add(back);
      this.overlay?.add(front);
      const card = { bg, front, back, token, flipped: false, matched: false };
      cards.push(card);
      bg.on("pointerdown", () => tryFlip(card));
    });

    let first: Card | null = null;
    let locked = false;
    let matches = 0;
    let attempts = 0;
    let finished = false;
    const attemptBudget = pairs + Math.max(2, Math.floor(pairs * 0.75));

    const status = this.scene.add
      .text(width / 2, panel.top + u(88), `짝 0 / ${pairs}  |  기회 ${attemptBudget}`, {
        fontFamily: "serif",
        fontSize: gpx(13),
        color: "#f3e6c9",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.overlay?.add(status);

    const updateStatus = () => {
      status.setText(`짝 ${matches} / ${pairs}  |  기회 ${Math.max(0, attemptBudget - attempts)}`);
    };

    const showCard = (card: Card, show: boolean) => {
      card.flipped = show;
      card.bg.setFillStyle(show ? 0x0e0614 : 0x2a1a34, show ? 1 : 0.98);
      card.bg.setStrokeStyle(u(1.5), show ? card.token.color : 0xd4a656, show ? 1 : 0.85);
      card.front.setAlpha(show ? 1 : 0);
      card.back.setAlpha(show ? 0 : 0.55);
    };

    const tryFlip = (card: Card) => {
      if (finished || locked || card.flipped || card.matched) return;
      showCard(card, true);
      if (!first) {
        first = card;
        return;
      }
      attempts++;
      const a = first;
      const b = card;
      first = null;
      locked = true;
      if (a.token.id === b.token.id) {
        this.scene.time.delayedCall(260, () => {
          a.matched = true;
          b.matched = true;
          matches++;
          updateStatus();
          locked = false;
          if (matches >= pairs) {
            finished = true;
            status.setText("성공");
            status.setColor("#86e08d");
            this.scene.time.delayedCall(520, () => this.finish(true));
          }
        });
      } else {
        updateStatus();
        this.scene.time.delayedCall(600, () => {
          showCard(a, false);
          showCard(b, false);
          locked = false;
          if (attempts >= attemptBudget && matches < pairs) {
            finished = true;
            status.setText("실패");
            status.setColor("#e0868b");
            this.scene.time.delayedCall(620, () => this.finish(false));
          }
        });
      }
    };

    this.addCancelButton(panel.bottom - u(34));
  }

  private addMiniButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    action: () => void
  ) {
    const bg = this.scene.add
      .rectangle(x, y, w, h, 0x2a1a34, 0.95)
      .setStrokeStyle(u(1.5), 0xd4a656, 0.75)
      .setInteractive({ useHandCursor: true });
    const text = this.scene.add
      .text(x, y, label, {
        fontFamily: "serif",
        fontSize: gpx(12),
        color: "#f3e6c9",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    bg.on("pointerdown", action);
    this.overlay?.add(bg);
    this.overlay?.add(text);
  }
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function colorHex(c: number): string {
  return "#" + c.toString(16).padStart(6, "0");
}
