import Phaser from "phaser";
import {
  INTERACTION_ASSET_PATHS,
  INTERACTION_ORDER,
  MENU_ICONS,
  STAGE_LAYERS,
} from "../data/parts";
import { CARD_IMAGE_ASSETS } from "../data/cardImages";
import { POSES } from "../data/posesData";
import { SOUND_ASSETS } from "../systems/SoundManager";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    STAGE_LAYERS.forEach((layer) => {
      this.load.image(layer.textureKey, layer.path);
    });
    this.load.image("bg", "/assets/bg.png");
    this.load.image("bg2", "/assets/bg2.png");
    this.load.image("bg3", "/assets/bg3.png");
    POSES.forEach((pose) => {
      this.load.image(pose.textureKey, pose.imagePath);
    });
    CARD_IMAGE_ASSETS.forEach((card) => {
      this.load.image(card.key, card.path);
    });
    MENU_ICONS.forEach((icon) => {
      this.load.image(icon.key, icon.path);
    });
    INTERACTION_ORDER.forEach((key) => {
      this.load.image(key, INTERACTION_ASSET_PATHS[key]);
    });
    SOUND_ASSETS.forEach((sound) => {
      this.load.audio(sound.key, sound.path);
    });
  }

  create() {
    this.scene.start("GameScene");
    this.scene.launch("UIScene");
  }
}
