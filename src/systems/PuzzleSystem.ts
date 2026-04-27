import Phaser from "phaser";
import type { PartDef } from "../data/parts";
import { UI_SCALE } from "../main";

const u = (n: number) => n * UI_SCALE;
const gpx = (n: number) => `${Math.round(n * UI_SCALE * 1.35)}px`;

type PuzzleResult = (success: boolean) => void;

export class PuzzleSystem {
  private scene: Phaser.Scene;
  private overlay: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  start(part: PartDef, done: PuzzleResult) {
    this.cleanup();
    switch (part.puzzle) {
      case "instant":
        this.playInstant(done);
        break;
      case "pattern":
        this.startPattern(part, done);
        break;
      case "tetris":
        this.startTetris(part, done);
        break;
      case "memory":
        this.startMemory(part, done);
        break;
    }
  }

  private cleanup() {
    this.overlay?.destroy();
    this.overlay = null;
  }

  private playInstant(done: PuzzleResult) {
    this.scene.time.delayedCall(120, () => done(true));
  }

  private makePanel(title: string, subtitle: string, heightRatio = 0.54) {
    const { width, height } = this.scene.scale;
    const w = width * 0.9;
    const h = height * heightRatio;
    const top = height / 2 - h / 2;
    const bottom = height / 2 + h / 2;

    const shadow = this.scene.add.rectangle(width / 2 + u(4), height / 2 + u(6), w, h, 0x000000, 0.55);
    const bg = this.scene.add
      .rectangle(width / 2, height / 2, w, h, 0x14091a, 0.97)
      .setStrokeStyle(u(2), 0xd4a656, 0.95);
    const innerBorder = this.scene.add
      .rectangle(width / 2, height / 2, w - u(10), h - u(10), 0x000000, 0)
      .setStrokeStyle(u(1), 0xd4a656, 0.4);
    const line = this.scene.add.rectangle(width / 2, top + u(52), w * 0.82, u(1), 0xd4a656, 0.8);
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
      .text(width / 2, top + u(62), subtitle, {
        fontFamily: "serif",
        fontSize: gpx(12),
        color: "#d4a656",
        fontStyle: "italic",
        align: "center",
        wordWrap: { width: w * 0.82 },
      })
      .setOrigin(0.5, 0);

    this.overlay = this.scene.add
      .container(0, 0, [shadow, bg, innerBorder, line, titleText, subtitleText])
      .setDepth(500);

    return { w, h, top, bottom };
  }

  private startPattern(part: PartDef, done: PuzzleResult) {
    const { width, height } = this.scene.scale;
    this.makePanel(part.label, "Watch the sequence, then tap in order.", 0.44);

    const colors = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f];
    const sequenceLength = 2 + part.difficulty;
    const sequence = Array.from({ length: sequenceLength }, () =>
      Math.floor(Math.random() * colors.length)
    );

    const statusText = this.scene.add
      .text(width / 2, height / 2 - u(14), "Watch carefully...", {
        fontFamily: "serif",
        fontSize: gpx(15),
        color: "#f3e6c9",
        fontStyle: "italic",
      })
      .setOrigin(0.5);
    this.overlay?.add(statusText);

    const buttons: Phaser.GameObjects.Rectangle[] = [];
    const size = u(58);
    colors.forEach((c, i) => {
      const b = this.scene.add
        .rectangle(width / 2 + (i - 1.5) * u(78), height / 2 + u(62), size, size, c)
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
        this.scene.tweens.add({ targets: b, scaleX: 1.18, scaleY: 1.18, yoyo: true, duration: 130 });
        if (i !== sequence[playerIdx]) {
          finished = true;
          locked = true;
          statusText.setText("Failed");
          statusText.setColor("#e0868b");
          this.scene.time.delayedCall(600, () => {
            this.cleanup();
            done(false);
          });
          return;
        }
        playerIdx++;
        statusText.setText(`${playerIdx} / ${sequenceLength}`);
        if (playerIdx >= sequence.length) {
          finished = true;
          locked = true;
          statusText.setText("Success");
          statusText.setColor("#86e08d");
          this.scene.time.delayedCall(400, () => {
            this.cleanup();
            done(true);
          });
        }
      });
    });

    const showSequence = (step: number) => {
      if (step >= sequence.length) {
        statusText.setText(`Your turn (${sequenceLength} steps)`);
        locked = false;
        return;
      }
      const btn = buttons[sequence[step]];
      this.scene.tweens.add({
        targets: btn,
        scaleX: 1.25,
        scaleY: 1.25,
        yoyo: true,
        duration: 260,
        onComplete: () => showSequence(step + 1),
      });
    };

    this.scene.time.delayedCall(500, () => showSequence(0));
  }

  private startTetris(part: PartDef, done: PuzzleResult) {
    void part;
    const { width } = this.scene.scale;
    const panel = this.makePanel("Block Clear", "Clear 3 lines to win.", 0.72);

    const cols = 6;
    const rows = 12;
    const gap = u(2);
    const maxCellByH = (panel.h * 0.58 - gap * (rows - 1)) / rows;
    const maxCellByW = (panel.w * 0.42 - gap * (cols - 1)) / cols;
    const cell = Math.min(u(26), maxCellByH, maxCellByW);
    const boardW = cols * cell + (cols - 1) * gap;
    const boardH = rows * cell + (rows - 1) * gap;
    const boardX = width / 2 - boardW / 2 + cell / 2;
    const boardY = panel.top + u(114);

    type Shape = number[][][];
    const shapes: { color: number; rots: Shape }[] = [
      { color: 0x5dade2, rots: [[[0, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [2, 0]]] },
      { color: 0xf4d03f, rots: [[[0, 0], [0, 1], [1, 0], [1, 1]]] },
      { color: 0xaf7ac5, rots: [[[0, 0], [0, 1], [0, 2], [1, 1]], [[0, 1], [1, 0], [1, 1], [2, 1]]] },
      { color: 0x2ecc71, rots: [[[0, 1], [0, 2], [1, 0], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]]] },
      { color: 0xe74c3c, rots: [[[0, 0], [0, 1], [1, 1], [1, 2]], [[0, 1], [1, 0], [1, 1], [2, 0]]] },
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
      .text(width / 2, panel.top + u(84), "Lines 0 / 3", {
        fontFamily: "serif",
        fontSize: gpx(12),
        color: "#f3e6c9",
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
      getCells(s, r, y, x).every(([yy, xx]) => yy >= 0 && yy < rows && xx >= 0 && xx < cols && board[yy][xx] === null);

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
        status.setText("Failed");
        status.setColor("#e0868b");
        this.scene.time.delayedCall(700, () => {
          this.cleanup();
          done(false);
        });
        return;
      }
      draw();
    };

    const lockPiece = () => {
      for (const [yy, xx] of getCells(shapeIdx, rot, curRow, curCol)) {
        if (yy >= 0 && yy < rows && xx >= 0 && xx < cols) board[yy][xx] = shapes[shapeIdx].color;
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
        status.setText(`Lines ${Math.min(cleared, 3)} / 3`);
      }
      if (cleared >= 3) {
        finished = true;
        dropEvent?.remove(false);
        status.setText("Success");
        status.setColor("#86e08d");
        this.scene.time.delayedCall(700, () => {
          this.cleanup();
          done(true);
        });
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
    const softDrop = () => {
      if (!tryMove(1, 0)) lockPiece();
    };
    const hardDrop = () => {
      while (tryMove(1, 0)) {
        /* falling */
      }
      lockPiece();
    };
    const rotate = () => {
      const next = (rot + 1) % shapes[shapeIdx].rots.length;
      if (canPlace(shapeIdx, next, curRow, curCol)) {
        rot = next;
        draw();
      }
    };

    dropEvent = this.scene.time.addEvent({ delay: 720, loop: true, callback: softDrop });

    const btnY = Math.min(panel.bottom - u(82), boardY + boardH + u(28));
    const defs = [
      { label: "<", dx: -u(84), fn: () => tryMove(0, -1) },
      { label: "R", dx: -u(28), fn: rotate },
      { label: "v", dx: u(28), fn: softDrop },
      { label: ">", dx: u(84), fn: () => tryMove(0, 1) },
    ];
    defs.forEach((d) => this.addMiniButton(width / 2 + d.dx, btnY, u(44), u(40), d.label, d.fn));
    this.addMiniButton(width / 2, btnY + u(48), u(168), u(34), "DROP", hardDrop);

    spawn();
  }

  private startMemory(part: PartDef, done: PuzzleResult) {
    const { width } = this.scene.scale;
    const pairs = Math.min(6, 2 + part.difficulty);
    const totalCards = pairs * 2;
    const cols = pairs <= 3 ? 3 : pairs === 4 ? 4 : pairs === 5 ? 5 : 4;
    const rows = Math.ceil(totalCards / cols);
    const panel = this.makePanel(part.label, "Match all pairs before attempts run out.", rows <= 3 ? 0.54 : 0.64);

    const maxBoardW = width * 0.72;
    const maxBoardH = panel.h * 0.54;
    const gap = u(6);
    const cell = Math.min((maxBoardW - gap * (cols - 1)) / cols, (maxBoardH - gap * (rows - 1)) / rows, u(58));
    const boardW = cell * cols + gap * (cols - 1);
    const boardLeft = width / 2 - boardW / 2;
    const boardTop = panel.top + u(116);
    const symbols = ["A", "B", "C", "D", "E", "F"];
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
        .text(x, y, "?", { fontFamily: "serif", fontSize: gpx(20), color: "#d4a656", fontStyle: "bold" })
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
      .text(width / 2, panel.top + u(86), `Pairs 0 / ${pairs}  |  Try ${attemptBudget}`, {
        fontFamily: "serif",
        fontSize: gpx(12),
        color: "#f3e6c9",
      })
      .setOrigin(0.5);
    this.overlay?.add(status);

    const updateStatus = () => {
      status.setText(`Pairs ${matches} / ${pairs}  |  Try ${Math.max(0, attemptBudget - attempts)}`);
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
        this.scene.time.delayedCall(280, () => {
          a.matched = true;
          b.matched = true;
          matches++;
          updateStatus();
          locked = false;
          if (matches >= pairs) {
            finished = true;
            status.setText("Success");
            status.setColor("#86e08d");
            this.scene.time.delayedCall(600, () => {
              this.cleanup();
              done(true);
            });
          }
        });
      } else {
        updateStatus();
        this.scene.time.delayedCall(620, () => {
          showCard(a, false);
          showCard(b, false);
          locked = false;
          if (attempts >= attemptBudget && matches < pairs) {
            finished = true;
            status.setText("Failed");
            status.setColor("#e0868b");
            this.scene.time.delayedCall(700, () => {
              this.cleanup();
              done(false);
            });
          }
        });
      }
    };
  }

  private addMiniButton(x: number, y: number, w: number, h: number, label: string, action: () => void) {
    const bg = this.scene.add
      .rectangle(x, y, w, h, 0x2a1a34, 0.95)
      .setStrokeStyle(u(1.5), 0xd4a656, 0.75)
      .setInteractive({ useHandCursor: true });
    const text = this.scene.add
      .text(x, y, label, { fontFamily: "serif", fontSize: gpx(12), color: "#f3e6c9", fontStyle: "bold" })
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
