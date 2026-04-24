import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { UIScene } from "./scenes/UIScene";

// Design space is 720x1280. We render onto a 2x backing canvas (1440x2560)
// so the source art (353x707 native) goes through a smaller upscale
// factor. Phaser's FIT mode shrinks the big canvas down to fit the
// viewport via CSS — the browser downsamples on display, which is the
// cheap way to get high-DPI crispness without every screen re-rendering
// at blurry fractional scale. UI_SCALE is exported so UI code can
// multiply fixed-pixel values (font sizes, circle radii) to match.
export const UI_SCALE = 2;
export const DESIGN_WIDTH = 720;
export const DESIGN_HEIGHT = 1280;
const GAME_WIDTH = DESIGN_WIDTH * UI_SCALE;
const GAME_HEIGHT = DESIGN_HEIGHT * UI_SCALE;

function startGame() {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#0a050f",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    render: {
      antialias: true,
      antialiasGL: true,
      pixelArt: false,
      roundPixels: false,
      powerPreference: "high-performance",
    },
    scene: [BootScene, GameScene, UIScene],
  });
}

startGame();
