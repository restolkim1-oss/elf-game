import Phaser from "phaser";

export type SoundCue =
  | "uiClick"
  | "uiToggle"
  | "shopOpen"
  | "modalOpen"
  | "modalClose"
  | "cardDraw"
  | "cardUse"
  | "cardMerge"
  | "invalidDrop"
  | "diceShake"
  | "diceThrow"
  | "coinGain"
  | "coinSpend"
  | "reward";

interface SoundAssetDef {
  key: string;
  path: string;
}

interface CueDef {
  keys: string[];
  volume?: number;
  rate?: [number, number];
}

const STORAGE_MUTED_KEY = "elf_sound_muted";
const STORAGE_VOLUME_KEY = "elf_sound_volume";
const DEFAULT_VOLUME = 0.7;
const AUDIO_BASE = "/sound/kenney_casino-audio/Audio";

export const SOUND_ASSETS: SoundAssetDef[] = [
  { key: "s_card_fan_1", path: `${AUDIO_BASE}/card-fan-1.ogg` },
  { key: "s_card_fan_2", path: `${AUDIO_BASE}/card-fan-2.ogg` },
  { key: "s_card_place_1", path: `${AUDIO_BASE}/card-place-1.ogg` },
  { key: "s_card_place_2", path: `${AUDIO_BASE}/card-place-2.ogg` },
  { key: "s_card_place_3", path: `${AUDIO_BASE}/card-place-3.ogg` },
  { key: "s_card_place_4", path: `${AUDIO_BASE}/card-place-4.ogg` },
  { key: "s_card_shove_1", path: `${AUDIO_BASE}/card-shove-1.ogg` },
  { key: "s_card_shove_2", path: `${AUDIO_BASE}/card-shove-2.ogg` },
  { key: "s_card_shove_3", path: `${AUDIO_BASE}/card-shove-3.ogg` },
  { key: "s_card_slide_1", path: `${AUDIO_BASE}/card-slide-1.ogg` },
  { key: "s_card_slide_2", path: `${AUDIO_BASE}/card-slide-2.ogg` },
  { key: "s_card_slide_3", path: `${AUDIO_BASE}/card-slide-3.ogg` },
  { key: "s_card_shuffle", path: `${AUDIO_BASE}/card-shuffle.ogg` },
  { key: "s_chip_lay_1", path: `${AUDIO_BASE}/chip-lay-1.ogg` },
  { key: "s_chip_lay_2", path: `${AUDIO_BASE}/chip-lay-2.ogg` },
  { key: "s_chips_stack_1", path: `${AUDIO_BASE}/chips-stack-1.ogg` },
  { key: "s_chips_stack_2", path: `${AUDIO_BASE}/chips-stack-2.ogg` },
  { key: "s_chips_collide_1", path: `${AUDIO_BASE}/chips-collide-1.ogg` },
  { key: "s_chips_handle_1", path: `${AUDIO_BASE}/chips-handle-1.ogg` },
  { key: "s_dice_shake_1", path: `${AUDIO_BASE}/dice-shake-1.ogg` },
  { key: "s_dice_shake_2", path: `${AUDIO_BASE}/dice-shake-2.ogg` },
  { key: "s_dice_throw_1", path: `${AUDIO_BASE}/dice-throw-1.ogg` },
  { key: "s_die_throw_1", path: `${AUDIO_BASE}/die-throw-1.ogg` },
  { key: "s_die_throw_2", path: `${AUDIO_BASE}/die-throw-2.ogg` },
];

const CUES: Record<SoundCue, CueDef> = {
  uiClick: { keys: ["s_chip_lay_1", "s_chip_lay_2"], volume: 0.45, rate: [0.98, 1.05] },
  uiToggle: { keys: ["s_chips_handle_1"], volume: 0.46, rate: [0.96, 1.04] },
  shopOpen: { keys: ["s_chips_handle_1", "s_chips_collide_1"], volume: 0.5 },
  modalOpen: { keys: ["s_card_fan_1"], volume: 0.42 },
  modalClose: { keys: ["s_card_slide_1"], volume: 0.36 },
  cardDraw: { keys: ["s_card_slide_1", "s_card_slide_2", "s_card_slide_3"], volume: 0.36, rate: [0.96, 1.08] },
  cardUse: { keys: ["s_card_place_1", "s_card_place_2", "s_card_place_3", "s_card_place_4"], volume: 0.48, rate: [0.96, 1.08] },
  cardMerge: { keys: ["s_card_shove_1", "s_card_shove_2", "s_card_shove_3", "s_card_fan_2"], volume: 0.56 },
  invalidDrop: { keys: ["s_card_shove_1"], volume: 0.34, rate: [0.88, 0.94] },
  diceShake: { keys: ["s_dice_shake_1", "s_dice_shake_2"], volume: 0.5 },
  diceThrow: { keys: ["s_dice_throw_1", "s_die_throw_1", "s_die_throw_2"], volume: 0.52 },
  coinGain: { keys: ["s_chips_stack_1", "s_chips_stack_2"], volume: 0.58 },
  coinSpend: { keys: ["s_chip_lay_1", "s_chip_lay_2"], volume: 0.52 },
  reward: { keys: ["s_chips_collide_1", "s_chips_stack_2"], volume: 0.56 },
};

export class SoundManager {
  private static initialized = false;
  private static muted = false;
  private static volume = DEFAULT_VOLUME;

  static init(scene: Phaser.Scene) {
    if (this.initialized) return;
    this.initialized = true;
    this.muted = this.readMuted();
    this.volume = this.readVolume();
    scene.sound.mute = this.muted;
  }

  static play(scene: Phaser.Scene, cue: SoundCue, volumeScale = 1) {
    this.init(scene);
    if (this.muted) return;
    const def = CUES[cue];
    if (!def) return;
    const keys = def.keys.filter((key) => scene.cache.audio.exists(key));
    if (keys.length === 0) return;
    const key = Phaser.Utils.Array.GetRandom(keys);
    const rate = def.rate ? Phaser.Math.FloatBetween(def.rate[0], def.rate[1]) : 1;
    scene.sound.play(key, {
      volume: Phaser.Math.Clamp(this.volume * (def.volume ?? 1) * volumeScale, 0, 1),
      rate,
    });
  }

  static toggleMute(scene: Phaser.Scene) {
    this.init(scene);
    this.setMuted(scene, !this.muted);
    this.play(scene, "uiToggle");
    return this.muted;
  }

  static isMuted(scene?: Phaser.Scene) {
    if (scene) this.init(scene);
    return this.muted;
  }

  static getVolume(scene?: Phaser.Scene) {
    if (scene) this.init(scene);
    return this.volume;
  }

  static setMuted(scene: Phaser.Scene, muted: boolean) {
    this.init(scene);
    this.muted = muted;
    scene.sound.mute = muted;
    try {
      window.localStorage.setItem(STORAGE_MUTED_KEY, muted ? "1" : "0");
    } catch {
      // localStorage may be unavailable; runtime sound state still works.
    }
  }

  private static readMuted() {
    try {
      return window.localStorage.getItem(STORAGE_MUTED_KEY) === "1";
    } catch {
      return false;
    }
  }

  private static readVolume() {
    try {
      const raw = window.localStorage.getItem(STORAGE_VOLUME_KEY);
      const parsed = raw === null ? DEFAULT_VOLUME : Number(raw);
      return Number.isFinite(parsed) ? Phaser.Math.Clamp(parsed, 0, 1) : DEFAULT_VOLUME;
    } catch {
      return DEFAULT_VOLUME;
    }
  }
}
