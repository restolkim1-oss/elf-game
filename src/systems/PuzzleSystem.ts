import Phaser from "phaser";
import type { PartDef } from "../data/parts";
import { UI_SCALE } from "../main";

const u = (n: number) => n * UI_SCALE;
const gpx = (n: number) => `${Math.round(n * UI_SCALE * 2.2)}px`;

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

  private makePanel(title: string, subtitle: string, heightRatio = 0.42) {
    const { width, height } = this.scene.scale;
    const w = width * 0.9;
    const h = height * heightRatio;

    const shadow = this.scene.add.rectangle(
      width / 2 + u(4),
      height / 2 + u(6),
      w,
      h,
      0x000000,
      0.55
    );
    const bg = this.scene.add
      .rectangle(width / 2, height / 2, w, h, 0x14091a, 0.97)
      .setStrokeStyle(u(2), 0xd4a656, 0.95);
    // Inner hairline
    const innerBorder = this.scene.add
      .rectangle(width / 2, height / 2, w - u(10), h - u(10), 0x000000, 0)
      .setStrokeStyle(u(1), 0xd4a656, 0.4);
    // Top gild line with diamond flourish
    const gildedLine = this.scene.add.rectangle(
      width / 2,
      height / 2 - h / 2 + u(50),
      w * 0.82,
      u(1),
      0xd4a656,
      0.8
    );
    const gildedDia = this.scene.add
      .text(width / 2, height / 2 - h / 2 + u(50), "◆", {
        fontFamily: "serif",
        fontSize: gpx(10),
        color: "#ffd572",
      })
      .setOrigin(0.5);

    const titleText = this.scene.add
      .text(width / 2, height / 2 - h / 2 + u(20), title, {
        fontFamily: "serif",
        fontSize: gpx(22),
        color: "#f3e6c9",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);

    const subText = this.scene.add
      .text(width / 2, height / 2 - h / 2 + u(62), subtitle, {
        fontFamily: "serif",
        fontSize: gpx(13),
        color: "#d4a656",
        fontStyle: "italic",
      })
      .setOrigin(0.5, 0);

    this.overlay = this.scene.add
      .container(0, 0, [
        shadow,
        bg,
        innerBorder,
        gildedLine,
        gildedDia,
        titleText,
        subText,
      ])
      .setDepth(500);

    return { w, h, top: height / 2 - h / 2, bottom: height / 2 + h / 2 };
  }

  private startPattern(part: PartDef, done: PuzzleResult) {
    const { width, height } = this.scene.scale;
    this.makePanel(`${part.label}`, "순서대로 눌러주세요");

    const colors = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f];
    const sequenceLength = 2 + part.difficulty;
    const sequence: number[] = [];
    for (let i = 0; i < sequenceLength; i++) {
      sequence.push(Math.floor(Math.random() * colors.length));
    }

    const buttons: Phaser.GameObjects.Rectangle[] = [];
    colors.forEach((c, i) => {
      const b = this.scene.add
        .rectangle(
          width / 2 + (i - 1.5) * u(80),
          height / 2 + u(54),
          u(60),
          u(60),
          c
        )
        .setStrokeStyle(u(2), 0xd4a656, 0.5);
      buttons.push(b);
      this.overlay?.add(b);
    });

    const statusText = this.scene.add
      .text(width / 2, height / 2 - u(14), "관찰하세요...", {
        fontFamily: "serif",
        fontSize: gpx(17),
        color: "#f3e6c9",
        fontStyle: "italic",
      })
      .setOrigin(0.5);
    this.overlay?.add(statusText);

    let playerIdx = 0;
    let locked = true;
    let finished = false;

    buttons.forEach((b, i) => {
      b.setInteractive({ useHandCursor: true });
      b.on("pointerdown", () => {
        if (locked || finished) return;
        this.scene.tweens.add({
          targets: b,
          scaleX: 1.25,
          scaleY: 1.25,
          yoyo: true,
          duration: 150,
        });
        if (i === sequence[playerIdx]) {
          playerIdx++;
          statusText.setText(`${playerIdx} / ${sequenceLength}`);
          if (playerIdx >= sequence.length) {
            finished = true;
            locked = true;
            statusText.setText("✓ 성공");
            statusText.setColor("#86e08d");
            this.scene.time.delayedCall(400, () => {
              this.cleanup();
              done(true);
            });
          }
        } else {
          finished = true;
          locked = true;
          statusText.setText("✗ 실패");
          statusText.setColor("#e0868b");
          this.scene.time.delayedCall(600, () => {
            this.cleanup();
            done(false);
          });
        }
      });
    });

    const showSequence = (step: number) => {
      if (step >= sequence.length) {
        statusText.setText(`따라해주세요 (${sequenceLength}단계)`);
        locked = false;
        return;
      }
      const btn = buttons[sequence[step]];
      this.scene.tweens.add({
        targets: btn,
        scaleX: 1.3,
        scaleY: 1.3,
        yoyo: true,
        duration: 280,
        onComplete: () => showSequence(step + 1),
      });
    };

    this.scene.time.delayedCall(500, () => showSequence(0));
  }

  private startTetris(part: PartDef, done: PuzzleResult) {
    void part;
    const { width } = this.scene.scale;
    const panel = this.makePanel(
      `가죽 스커트`,
      "줄 3개를 지워 봉인을 풀어주세요",
      0.72
    );

    const COLS = 6;
    const ROWS = 12;
    const cell = u(26);
    const gap = u(2);
    const boardW = COLS * cell + (COLS - 1) * gap;
    const boardH = ROWS * cell + (ROWS - 1) * gap;
    const boardX = width / 2 - boardW / 2 + cell / 2;
    const boardY = panel.top + u(110);

    // Tetromino shapes: list of rotations (each rotation is list of [dr, dc])
    type Shape = number[][][];
    const SHAPES: { color: number; rots: Shape }[] = [
      {
        color: 0x5dade2,
        rots: [
          [[0, 0], [0, 1], [0, 2], [0, 3]],
          [[0, 0], [1, 0], [2, 0], [3, 0]],
        ],
      },
      {
        color: 0xf4d03f,
        rots: [[[0, 0], [0, 1], [1, 0], [1, 1]]],
      },
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
        color: 0xe67e22,
        rots: [
          [[0, 0], [1, 0], [2, 0], [2, 1]],
          [[0, 0], [0, 1], [0, 2], [1, 0]],
          [[0, 0], [0, 1], [1, 1], [2, 1]],
          [[0, 2], [1, 0], [1, 1], [1, 2]],
        ],
      },
      {
        color: 0x3498db,
        rots: [
          [[0, 1], [1, 1], [2, 0], [2, 1]],
          [[0, 0], [1, 0], [1, 1], [1, 2]],
          [[0, 0], [0, 1], [1, 0], [2, 0]],
          [[0, 0], [0, 1], [0, 2], [1, 2]],
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

    const board: (number | null)[][] = [];
    for (let r = 0; r < ROWS; r++) board.push(Array(COLS).fill(null));

    const cellSprites: Phaser.GameObjects.Rectangle[][] = [];
    for (let r = 0; r < ROWS; r++) {
      const row: Phaser.GameObjects.Rectangle[] = [];
      for (let c = 0; c < COLS; c++) {
        const x = boardX + c * (cell + gap);
        const y = boardY + r * (cell + gap);
        const rect = this.scene.add
          .rectangle(x, y, cell, cell, 0x1a1022, 0.9)
          .setStrokeStyle(u(1), 0x3a2a44, 0.7);
        this.overlay?.add(rect);
        row.push(rect);
      }
      cellSprites.push(row);
    }

    let curShapeIdx = 0;
    let curRot = 0;
    let curRow = 0;
    let curCol = 0;
    let cleared = 0;
    let finished = false;
    let dropEvent: Phaser.Time.TimerEvent | null = null;

    const status = this.scene.add
      .text(width / 2, panel.top + u(82), "지운 줄: 0 / 3", {
        fontFamily: "serif",
        fontSize: gpx(14),
        color: "#f3e6c9",
      })
      .setOrigin(0.5, 0);
    this.overlay?.add(status);

    const getCells = (shapeIdx: number, rot: number, r: number, c: number) => {
      const rots = SHAPES[shapeIdx].rots;
      const cells = rots[rot % rots.length];
      return cells.map(([dr, dc]) => [r + dr, c + dc] as [number, number]);
    };

    const canPlace = (shapeIdx: number, rot: number, r: number, c: number) => {
      for (const [rr, cc] of getCells(shapeIdx, rot, r, c)) {
        if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) return false;
        if (board[rr][cc] !== null) return false;
      }
      return true;
    };

    const draw = () => {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const v = board[r][c];
          if (v === null) {
            cellSprites[r][c].setFillStyle(0x1a1022, 0.9);
            cellSprites[r][c].setStrokeStyle(u(1), 0x3a2a44, 0.7);
          } else {
            cellSprites[r][c].setFillStyle(v, 1);
            cellSprites[r][c].setStrokeStyle(u(1), 0xffffff, 0.25);
          }
        }
      }
      if (!finished) {
        const col = SHAPES[curShapeIdx].color;
        for (const [rr, cc] of getCells(curShapeIdx, curRot, curRow, curCol)) {
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
          cellSprites[rr][cc].setFillStyle(col, 1);
          cellSprites[rr][cc].setStrokeStyle(u(1), 0xffffff, 0.6);
        }
      }
    };

    const spawnPiece = () => {
      curShapeIdx = Math.floor(Math.random() * SHAPES.length);
      curRot = 0;
      curRow = 0;
      curCol = Math.floor(COLS / 2) - 1;
      if (!canPlace(curShapeIdx, curRot, curRow, curCol)) {
        finished = true;
        if (dropEvent) dropEvent.remove(false);
        status.setText("봉인 실패 · 보드가 가득 참");
        status.setColor("#e0868b");
        this.scene.time.delayedCall(900, () => {
          this.cleanup();
          done(false);
        });
        return;
      }
      draw();
    };

    const lockPiece = () => {
      const col = SHAPES[curShapeIdx].color;
      for (const [rr, cc] of getCells(curShapeIdx, curRot, curRow, curCol)) {
        if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
          board[rr][cc] = col;
        }
      }
      let linesCleared = 0;
      for (let r = ROWS - 1; r >= 0; r--) {
        let full = true;
        for (let c = 0; c < COLS; c++) {
          if (board[r][c] === null) {
            full = false;
            break;
          }
        }
        if (full) {
          board.splice(r, 1);
          board.unshift(Array(COLS).fill(null));
          linesCleared++;
          r++;
        }
      }
      if (linesCleared > 0) {
        cleared += linesCleared;
        status.setText(`지운 줄: ${Math.min(cleared, 3)} / 3`);
        this.scene.tweens.add({
          targets: cellSprites.flat(),
          alpha: { from: 1, to: 0.55 },
          yoyo: true,
          duration: 140,
        });
      }
      if (cleared >= 3) {
        finished = true;
        if (dropEvent) dropEvent.remove(false);
        status.setText("◆ 봉인 해제 ◆");
        status.setColor("#86e08d");
        this.scene.time.delayedCall(900, () => {
          this.cleanup();
          done(true);
        });
        return;
      }
      spawnPiece();
    };

    const tryMove = (dr: number, dc: number) => {
      if (finished) return false;
      if (canPlace(curShapeIdx, curRot, curRow + dr, curCol + dc)) {
        curRow += dr;
        curCol += dc;
        draw();
        return true;
      }
      return false;
    };

    const tryRotate = () => {
      if (finished) return;
      const nextRot = (curRot + 1) % SHAPES[curShapeIdx].rots.length;
      const offsets = [0, -1, 1, -2, 2];
      for (const off of offsets) {
        if (canPlace(curShapeIdx, nextRot, curRow, curCol + off)) {
          curRot = nextRot;
          curCol += off;
          draw();
          return;
        }
      }
    };

    const softDrop = () => {
      if (finished) return;
      if (!tryMove(1, 0)) {
        lockPiece();
      }
    };

    const hardDrop = () => {
      if (finished) return;
      while (tryMove(1, 0)) {
        /* keep falling */
      }
      lockPiece();
    };

    dropEvent = this.scene.time.addEvent({
      delay: 700,
      loop: true,
      callback: softDrop,
    });

    const btnY = boardY + boardH + u(28);
    const btnSpacing = u(58);
    const btnDefs: { label: string; dx: number; action: () => void }[] = [
      { label: "◀", dx: -btnSpacing * 1.5, action: () => tryMove(0, -1) },
      { label: "↻", dx: -btnSpacing * 0.5, action: () => tryRotate() },
      { label: "▼", dx: btnSpacing * 0.5, action: () => softDrop() },
      { label: "▶", dx: btnSpacing * 1.5, action: () => tryMove(0, 1) },
    ];
    btnDefs.forEach((d) => {
      const bx = width / 2 + d.dx;
      const bg = this.scene.add
        .rectangle(bx, btnY, u(46), u(46), 0x2a1a34, 0.95)
        .setStrokeStyle(u(1.5), 0xd4a656, 0.75)
        .setInteractive({ useHandCursor: true });
      const lbl = this.scene.add
        .text(bx, btnY, d.label, {
          fontFamily: "serif",
          fontSize: gpx(20),
          color: "#f3e6c9",
        })
        .setOrigin(0.5);
      bg.on("pointerover", () => {
        bg.setFillStyle(0x3a2544, 0.98);
      });
      bg.on("pointerout", () => {
        bg.setFillStyle(0x2a1a34, 0.95);
      });
      bg.on("pointerdown", () => {
        if (finished) return;
        this.scene.tweens.add({
          targets: bg,
          scale: { from: 1.15, to: 1 },
          duration: 120,
        });
        d.action();
      });
      this.overlay?.add(bg);
      this.overlay?.add(lbl);
    });

    const dropAllBtn = this.scene.add
      .text(width / 2, btnY + u(40), "⟱  한번에 내리기", {
        fontFamily: "serif",
        fontSize: gpx(13),
        color: "#d4a656",
      })
      .setOrigin(0.5, 0)
      .setInteractive({ useHandCursor: true });
    dropAllBtn.on("pointerdown", () => {
      if (finished) return;
      hardDrop();
    });
    this.overlay?.add(dropAllBtn);

    const giveUpBtn = this.scene.add
      .text(width / 2, btnY + u(64), "포기 (실패)", {
        fontFamily: "serif",
        fontSize: gpx(11),
        color: "#6a4a5a",
      })
      .setOrigin(0.5, 0)
      .setInteractive({ useHandCursor: true });
    giveUpBtn.on("pointerdown", () => {
      if (finished) return;
      finished = true;
      if (dropEvent) dropEvent.remove(false);
      status.setText("봉인 실패");
      status.setColor("#e0868b");
      this.scene.time.delayedCall(800, () => {
        this.cleanup();
        done(false);
      });
    });
    this.overlay?.add(giveUpBtn);

    const keyboard = this.scene.input.keyboard;
    if (keyboard) {
      const onKey = (e: KeyboardEvent) => {
        if (finished) return;
        if (e.key === "ArrowLeft") tryMove(0, -1);
        else if (e.key === "ArrowRight") tryMove(0, 1);
        else if (e.key === "ArrowDown") softDrop();
        else if (e.key === "ArrowUp" || e.key === "x" || e.key === "X")
          tryRotate();
        else if (e.key === " ") hardDrop();
      };
      keyboard.on("keydown", onKey);
      const cleanupKey = () => keyboard.off("keydown", onKey);
      this.scene.events.once("shutdown", cleanupKey);
      this.overlay?.once("destroy", cleanupKey);
    }

    spawnPiece();
  }

  private startMemory(part: PartDef, done: PuzzleResult) {
    const { width } = this.scene.scale;

    // Grid sizing: difficulty N → N+2 pairs. Layout chosen so the grid
    // stays wider than tall to match our panel proportions.
    const pairs = Math.min(6, 2 + part.difficulty); // 3..6 pairs
    const totalCards = pairs * 2;
    const cols = pairs <= 3 ? 3 : pairs === 4 ? 4 : pairs === 5 ? 5 : 4;
    const rows = Math.ceil(totalCards / cols);

    const heightRatio = rows <= 3 ? 0.54 : 0.64;
    const panel = this.makePanel(
      part.label,
      "같은 문양을 짝지어 봉인을 풀어주세요",
      heightRatio
    );

    // Symbol + color palette. We pair a unique symbol with a unique color
    // so even players who can't distinguish one cue can use the other.
    const SYMBOL_POOL = ["◆", "★", "♥", "✦", "❖", "☽", "♣", "♠", "✿"];
    const COLOR_POOL = [
      0xe74c3c, 0xf1c40f, 0x3498db, 0x2ecc71, 0xaf7ac5, 0xe67e22,
      0x1abc9c, 0xec7063, 0xf7dc6f,
    ];

    // Build the deck: `pairs` unique (symbol, color) tokens, each duplicated
    const tokens: { symbol: string; color: number; id: number }[] = [];
    const symbolIdxs = shuffled(SYMBOL_POOL.length).slice(0, pairs);
    const colorIdxs = shuffled(COLOR_POOL.length).slice(0, pairs);
    for (let i = 0; i < pairs; i++) {
      const symbol = SYMBOL_POOL[symbolIdxs[i]];
      const color = COLOR_POOL[colorIdxs[i]];
      tokens.push({ symbol, color, id: i });
      tokens.push({ symbol, color, id: i });
    }
    shuffleInPlace(tokens);

    // Card dimensions scaled to fit the grid
    const maxBoardW = width * 0.78;
    const maxBoardH = panel.h * 0.62;
    const gap = u(6);
    const cellByW = (maxBoardW - gap * (cols - 1)) / cols;
    const cellByH = (maxBoardH - gap * (rows - 1)) / rows;
    const cellSize = Math.min(cellByW, cellByH, u(64));
    const boardW = cellSize * cols + gap * (cols - 1);
    const boardLeft = width / 2 - boardW / 2;
    const boardTop = panel.top + u(100);

    interface Card {
      bg: Phaser.GameObjects.Rectangle;
      front: Phaser.GameObjects.Text;
      backMark: Phaser.GameObjects.Text;
      token: (typeof tokens)[number];
      flipped: boolean;
      matched: boolean;
    }
    const cards: Card[] = [];

    const backColor = 0x2a1a34;
    const backStroke = 0xd4a656;
    const matchedColor = 0x1d3a26;

    tokens.forEach((tok, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx = boardLeft + col * (cellSize + gap) + cellSize / 2;
      const cy = boardTop + row * (cellSize + gap) + cellSize / 2;

      const bg = this.scene.add
        .rectangle(cx, cy, cellSize, cellSize, backColor, 0.98)
        .setStrokeStyle(u(1.5), backStroke, 0.85)
        .setInteractive({ useHandCursor: true });

      // Back-face decoration: small diamond
      const backMark = this.scene.add
        .text(cx, cy, "◈", {
          fontFamily: "serif",
          fontSize: gpx(Math.round(cellSize / UI_SCALE / 2.4)),
          color: "#d4a656",
        })
        .setOrigin(0.5)
        .setAlpha(0.5);

      // Front-face symbol (hidden until flipped)
      const front = this.scene.add
        .text(cx, cy, tok.symbol, {
          fontFamily: "serif",
          fontSize: gpx(Math.round(cellSize / UI_SCALE / 1.8)),
          color: colorHex(tok.color),
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setAlpha(0);

      this.overlay?.add(bg);
      this.overlay?.add(backMark);
      this.overlay?.add(front);

      const card: Card = {
        bg,
        front,
        backMark,
        token: tok,
        flipped: false,
        matched: false,
      };
      cards.push(card);

      bg.on("pointerover", () => {
        if (card.flipped || card.matched || locked) return;
        this.scene.tweens.add({
          targets: bg,
          scaleX: 1.05,
          scaleY: 1.05,
          duration: 120,
        });
      });
      bg.on("pointerout", () => {
        this.scene.tweens.add({
          targets: bg,
          scaleX: 1,
          scaleY: 1,
          duration: 120,
        });
      });
      bg.on("pointerdown", () => tryFlip(card));
    });

    let first: Card | null = null;
    let locked = false;
    let matches = 0;
    let attempts = 0;
    let finished = false;
    const attemptBudget = pairs + Math.max(2, Math.floor(pairs * 0.75));

    const status = this.scene.add
      .text(
        width / 2,
        panel.top + u(80),
        `짝: 0 / ${pairs}   ·   기회: ${attemptBudget}`,
        {
          fontFamily: "serif",
          fontSize: gpx(13),
          color: "#f3e6c9",
        }
      )
      .setOrigin(0.5);
    this.overlay?.add(status);

    const updateStatus = () => {
      const remaining = attemptBudget - attempts;
      status.setText(
        `짝: ${matches} / ${pairs}   ·   기회: ${Math.max(0, remaining)}`
      );
    };

    const flipUp = (card: Card) => {
      card.flipped = true;
      this.scene.tweens.add({
        targets: card.bg,
        scaleX: { from: 1, to: 0 },
        duration: 120,
        onComplete: () => {
          card.bg.setFillStyle(0x0e0614, 1);
          card.bg.setStrokeStyle(u(1.5), card.token.color, 1);
          card.backMark.setAlpha(0);
          card.front.setAlpha(1);
          this.scene.tweens.add({
            targets: card.bg,
            scaleX: { from: 0, to: 1 },
            duration: 120,
          });
        },
      });
    };

    const flipDown = (card: Card) => {
      this.scene.tweens.add({
        targets: card.bg,
        scaleX: { from: 1, to: 0 },
        duration: 120,
        onComplete: () => {
          card.bg.setFillStyle(backColor, 0.98);
          card.bg.setStrokeStyle(u(1.5), backStroke, 0.85);
          card.front.setAlpha(0);
          card.backMark.setAlpha(0.5);
          card.flipped = false;
          this.scene.tweens.add({
            targets: card.bg,
            scaleX: { from: 0, to: 1 },
            duration: 120,
          });
        },
      });
    };

    const lockMatched = (card: Card) => {
      card.matched = true;
      card.bg.disableInteractive();
      this.scene.tweens.add({
        targets: card.bg,
        scale: { from: 1.15, to: 1 },
        duration: 260,
      });
      card.bg.setFillStyle(matchedColor, 0.95);
      card.bg.setStrokeStyle(u(1.5), 0x86e08d, 0.9);
    };

    const tryFlip = (card: Card) => {
      if (finished || locked) return;
      if (card.flipped || card.matched) return;
      flipUp(card);

      if (!first) {
        first = card;
        return;
      }

      // Second card chosen — resolve after a beat
      attempts++;
      const a = first;
      const b = card;
      first = null;

      if (a.token.id === b.token.id) {
        locked = true;
        this.scene.time.delayedCall(360, () => {
          lockMatched(a);
          lockMatched(b);
          matches++;
          updateStatus();
          locked = false;
          if (matches >= pairs) {
            finished = true;
            status.setText("◆   봉인 해제   ◆");
            status.setColor("#86e08d");
            this.scene.time.delayedCall(700, () => {
              this.cleanup();
              done(true);
            });
          }
        });
      } else {
        locked = true;
        updateStatus();
        this.scene.time.delayedCall(720, () => {
          flipDown(a);
          flipDown(b);
          locked = false;
          if (attempts >= attemptBudget && matches < pairs) {
            finished = true;
            status.setText("봉인 실패 · 기회 소진");
            status.setColor("#e0868b");
            this.scene.time.delayedCall(820, () => {
              this.cleanup();
              done(false);
            });
          }
        });
      }
    };

    const giveUpBtn = this.scene.add
      .text(width / 2, panel.bottom - u(36), "포기 (실패)", {
        fontFamily: "serif",
        fontSize: gpx(12),
        color: "#6a4a5a",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    giveUpBtn.on("pointerdown", () => {
      if (finished) return;
      finished = true;
      status.setText("봉인 실패");
      status.setColor("#e0868b");
      this.scene.time.delayedCall(600, () => {
        this.cleanup();
        done(false);
      });
    });
    this.overlay?.add(giveUpBtn);
  }
}

// Local helpers — outside the class because they don't need `this`.
function shuffled(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  shuffleInPlace(arr);
  return arr;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function colorHex(c: number): string {
  return "#" + c.toString(16).padStart(6, "0");
}
