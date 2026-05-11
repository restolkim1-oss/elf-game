import Phaser from "phaser";
import {
  INTERACTION_ASSET_PATHS,
  INTERACTION_ORDER,
  MENU_ICONS,
  STAGE_LAYERS,
} from "../data/parts";
import { POSES } from "../data/posesData";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    this.load.image("E1", "/assets/E1_base.png");
    STAGE_LAYERS.forEach((layer) => {
      this.load.image(layer.textureKey, layer.path);
    });
    this.load.image("bg", "/assets/bg.png");
    this.load.image("bg2", "/assets/bg2.png");
    this.load.image("bg3", "/assets/bg3.png");
    this.load.image("E1_clear", "/assets/E1_clear.png");
    POSES.forEach((pose) => {
      this.load.image(pose.textureKey, pose.imagePath);
    });
    MENU_ICONS.forEach((icon) => {
      this.load.image(icon.key, icon.path);
    });
    INTERACTION_ORDER.forEach((key) => {
      this.load.image(key, INTERACTION_ASSET_PATHS[key]);
    });
  }

  create() {
    this.scene.start("GameScene");
    this.scene.launch("UIScene");
  }
}
