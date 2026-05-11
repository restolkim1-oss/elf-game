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
    const diceScale = 0.8;
    const startY = y + u(44);
    const apexY = y - u(70);

    const group = scene.add.container(x, startY).setDepth(760).setScale(diceScale);
    const shadow = scene.add
      .ellipse(0, u(92), u(112), u(22), 0x000000, 0.28)
      .setScale(0.65, 0.65);
    const glow = scene.add
      .circle(0, 0, u(58), critical ? 0xff5e7a : 0xffd572, 0.16)
      .setAlpha(0);
    const box = scene.add
      .rectangle(0, 0, u(84), u(84), 0xf7ead0, 0.98)
      .setStrokeStyle(u(4), 0xffd572, 0.98);
    const shine = scene.add
      .rectangle(-u(16), -u(18), u(42), u(9), 0xffffff, 0.32)
      .setAngle(-26);
    const text = scene.add
      .text(0, 0, "?", {
        fontFamily: "serif",
        fontSize: px(30),
        color: "#2a1a34",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const label = scene.add
      .text(0, u(68), "ROLL", {
        fontFamily: "serif",
        fontSize: px(11),
        color: "#ffd572",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    group.add([shadow, glow, box, shine, text, label]);
    parent?.add(group);

    const isAlive = () => !!group.scene && !!box.scene && !!text.scene;
    let resolved = false;
    const resolve = () => {
      if (resolved) return;
      resolved = true;
      onComplete({ value, critical });
    };
    const cleanup = () => {
      if (group.scene) group.destroy(true);
    };

    let ticks = 0;
    const timer = scene.time.addEvent({
      delay: 54,
      repeat: 18,
      callback: () => {
        if (!isAlive()) {
          timer.remove(false);
          resolve();
          return;
        }
        ticks++;
        text.setText(String(Phaser.Math.Between(1, 6)));
        box.setAngle(box.angle + Phaser.Math.Between(28, 54));
        shine.setAlpha(ticks % 2 === 0 ? 0.48 : 0.2);
      },
    });

    scene.tweens.add({
      targets: group,
      y: apexY,
      scaleX: diceScale * 1.16,
      scaleY: diceScale * 1.16,
      duration: 360,
      ease: "Cubic.easeOut",
      onUpdate: () => shadow.setScale(0.42, 0.42),
      onComplete: () => {
        if (!isAlive()) {
          timer.remove(false);
          resolve();
          return;
        }
        scene.tweens.add({
          targets: group,
          y,
          scaleX: diceScale,
          scaleY: diceScale,
          duration: 440,
          ease: "Bounce.easeOut",
          onUpdate: () => shadow.setScale(0.9, 0.9),
          onComplete: () => {
            if (!isAlive()) {
              timer.remove(false);
              resolve();
              return;
            }
            timer.remove(false);
            box.setAngle(0);
            text.setText(String(value));
            label.setText(critical ? "CRITICAL HIT" : value === 6 ? "LUCKY SIX" : "NORMAL HIT");
            label.setColor(critical ? "#ff5e7a" : value === 6 ? "#82ffe6" : "#ffd572");
            scene.tweens.add({
              targets: glow,
              alpha: critical || value === 6 ? 0.55 : 0.26,
              scaleX: critical ? 1.45 : 1.22,
              scaleY: critical ? 1.45 : 1.22,
              yoyo: true,
              duration: 180,
            });
            scene.cameras.main.shake(critical ? 180 : 90, critical ? 0.006 : 0.002);
            scene.time.delayedCall(560, () => {
              if (!isAlive()) {
                resolve();
                return;
              }
              scene.tweens.add({
                targets: group,
                y: y + u(18),
                alpha: 0,
                duration: 260,
                ease: "Quad.easeIn",
                onComplete: () => {
                  cleanup();
                  resolve();
                },
              });
            });
          },
        });
      },
    });
  }
}
