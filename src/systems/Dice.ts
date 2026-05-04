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

    let ticks = 0;
    const timer = scene.time.addEvent({
      delay: 48,
      repeat: 13,
      callback: () => {
        ticks++;
        text.setText(String(Phaser.Math.Between(1, 6)));
        box.setAngle((ticks % 2 === 0 ? 1 : -1) * Phaser.Math.Between(4, 12));
      },
    });

    scene.time.delayedCall(760, () => {
      timer.remove(false);
      text.setText(String(value));
      box.setAngle(0);
      const critical = value >= 4;
      label.setText(critical ? "CRITICAL HIT" : "NORMAL HIT");
      label.setColor(critical ? "#ff5e7a" : "#ffd572");
      scene.tweens.add({
        targets: [box, text, label],
        scaleX: critical ? 1.24 : 1.08,
        scaleY: critical ? 1.24 : 1.08,
        yoyo: true,
        duration: 130,
        onComplete: () => {
          scene.time.delayedCall(360, () => {
            scene.tweens.add({
              targets: [box, text, label],
              alpha: 0,
              duration: 220,
              onComplete: () => {
                box.destroy();
                text.destroy();
                label.destroy();
                onComplete({ value, critical });
              },
            });
          });
        },
      });
    });
  }
}
