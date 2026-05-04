import Phaser from "phaser";
import { UI_SCALE } from "../main";

const u = (n: number) => n * UI_SCALE;
const px = (n: number) => `${Math.round(n * UI_SCALE * 1.55)}px`;

export interface DiceRollResult {
  value: number;
  critical: boolean;
}

export class DiceRoller {
  static roll(
    scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container | null,
    x: number,
    y: number,
    onComplete: (result: DiceRollResult) => void
  ) {
    const value = Phaser.Math.Between(1, 6);
    const critical = value >= 4;

    const box = scene.add
      .rectangle(x, y, u(78), u(78), 0xf3e6c9, 0.98)
      .setStrokeStyle(u(3), 0xffd572, 0.95)
      .setDepth(760);
    const text = scene.add
      .text(x, y, "?", {
        fontFamily: "serif",
        fontSize: px(28),
        color: "#2a1a34",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(761);
    const label = scene.add
      .text(x, y + u(58), "DICE", {
        fontFamily: "serif",
        fontSize: px(11),
        color: "#ffd572",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(761);

    parent?.add([box, text, label]);

    // The dice can outlive the parent overlay (e.g. the card that triggered
    // it kills the enemy and battle ends mid-roll). If the overlay was
    // destroyed, our box/text/label become detached from any scene and
    // calling setText/setAngle on them throws. Each callback below bails
    // early on detection so the game loop never sees a stale Text.setText.
    const isAlive = () => !!box.scene && !!text.scene && !!label.scene;

    let resolved = false;
    const resolve = () => {
      if (resolved) return;
      resolved = true;
      onComplete({ value, critical });
    };
    const cleanup = () => {
      if (box.scene) box.destroy();
      if (text.scene) text.destroy();
      if (label.scene) label.destroy();
    };

    let ticks = 0;
    const timer = scene.time.addEvent({
      delay: 48,
      repeat: 13,
      callback: () => {
        if (!isAlive()) {
          timer.remove(false);
          resolve();
          return;
        }
        ticks++;
        text.setText(String(Phaser.Math.Between(1, 6)));
        box.setAngle((ticks % 2 === 0 ? 1 : -1) * Phaser.Math.Between(4, 12));
      },
    });

    scene.time.delayedCall(760, () => {
      if (!isAlive()) {
        timer.remove(false);
        resolve();
        return;
      }
      timer.remove(false);
      text.setText(String(value));
      box.setAngle(0);
      label.setText(critical ? "CRITICAL HIT" : "NORMAL HIT");
      label.setColor(critical ? "#ff5e7a" : "#ffd572");
      scene.tweens.add({
        targets: [box, text, label],
        scaleX: critical ? 1.24 : 1.08,
        scaleY: critical ? 1.24 : 1.08,
        yoyo: true,
        duration: 130,
        onComplete: () => {
          if (!isAlive()) {
            resolve();
            return;
          }
          scene.time.delayedCall(360, () => {
            if (!isAlive()) {
              resolve();
              return;
            }
            scene.tweens.add({
              targets: [box, text, label],
              alpha: 0,
              duration: 220,
              onComplete: () => {
                cleanup();
                resolve();
              },
            });
          });
        },
      });
    });
  }
}
