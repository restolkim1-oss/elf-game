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
  | "reward"
  | "attackHit"
  | "bigHit"
  | "partBreak"
  | "shield"
  | "heal"
  | "poison"
  | "parry";

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
const CASINO_BASE = "/sound/kenney_casino-audio/Audio";
const RPG_BASE = "/sound/kenney_rpg-audio/Audio";
const UI_BASE = "/sound/kenney_interface-sounds/Audio";

export const SOUND_ASSETS: SoundAssetDef[] = [
  // Casino pack kept only where it fits: card motion and dice.
  { key: "s_card_place_1", path: `${CASINO_BASE}/card-place-1.ogg` },
  { key: "s_card_place_2", path: `${CASINO_BASE}/card-place-2.ogg` },
  { key: "s_card_place_3", path: `${CASINO_BASE}/card-place-3.ogg` },
  { key: "s_card_place_4", path: `${CASINO_BASE}/card-place-4.ogg` },
  { key: "s_card_slide_1", path: `${CASINO_BASE}/card-slide-1.ogg` },
  { key: "s_card_slide_2", path: `${CASINO_BASE}/card-slide-2.ogg` },
  { key: "s_card_slide_3", path: `${CASINO_BASE}/card-slide-3.ogg` },
  { key: "s_dice_shake_1", path: `${CASINO_BASE}/dice-shake-1.ogg` },
  { key: "s_dice_shake_2", path: `${CASINO_BASE}/dice-shake-2.ogg` },
  { key: "s_dice_throw_1", path: `${CASINO_BASE}/dice-throw-1.ogg` },
  { key: "s_die_throw_1", path: `${CASINO_BASE}/die-throw-1.ogg` },
  { key: "s_die_throw_2", path: `${CASINO_BASE}/die-throw-2.ogg` },

  // RPG pack for fantasy combat, card magic, equipment, and rewards.
  { key: "s_book_flip_1", path: `${RPG_BASE}/bookFlip1.ogg` },
  { key: "s_book_flip_2", path: `${RPG_BASE}/bookFlip2.ogg` },
  { key: "s_book_flip_3", path: `${RPG_BASE}/bookFlip3.ogg` },
  { key: "s_book_open", path: `${RPG_BASE}/bookOpen.ogg` },
  { key: "s_book_place_1", path: `${RPG_BASE}/bookPlace1.ogg` },
  { key: "s_book_place_2", path: `${RPG_BASE}/bookPlace2.ogg` },
  { key: "s_chop", path: `${RPG_BASE}/chop.ogg` },
  { key: "s_cloth_1", path: `${RPG_BASE}/cloth1.ogg` },
  { key: "s_cloth_2", path: `${RPG_BASE}/cloth2.ogg` },
  { key: "s_cloth_3", path: `${RPG_BASE}/cloth3.ogg` },
  { key: "s_cloth_4", path: `${RPG_BASE}/cloth4.ogg` },
  { key: "s_cloth_belt", path: `${RPG_BASE}/clothBelt.ogg` },
  { key: "s_draw_knife_1", path: `${RPG_BASE}/drawKnife1.ogg` },
  { key: "s_draw_knife_2", path: `${RPG_BASE}/drawKnife2.ogg` },
  { key: "s_draw_knife_3", path: `${RPG_BASE}/drawKnife3.ogg` },
  { key: "s_drop_leather", path: `${RPG_BASE}/dropLeather.ogg` },
  { key: "s_handle_coins", path: `${RPG_BASE}/handleCoins.ogg` },
  { key: "s_handle_coins_2", path: `${RPG_BASE}/handleCoins2.ogg` },
  { key: "s_knife_slice", path: `${RPG_BASE}/knifeSlice.ogg` },
  { key: "s_knife_slice_2", path: `${RPG_BASE}/knifeSlice2.ogg` },
  { key: "s_metal_click", path: `${RPG_BASE}/metalClick.ogg` },
  { key: "s_metal_latch", path: `${RPG_BASE}/metalLatch.ogg` },
  { key: "s_metal_pot_1", path: `${RPG_BASE}/metalPot1.ogg` },
  { key: "s_metal_pot_2", path: `${RPG_BASE}/metalPot2.ogg` },

  // Interface pack for UI, modals, errors, and softer status feedback.
  { key: "s_click_1", path: `${UI_BASE}/click_001.ogg` },
  { key: "s_click_2", path: `${UI_BASE}/click_002.ogg` },
  { key: "s_click_3", path: `${UI_BASE}/click_003.ogg` },
  { key: "s_select_1", path: `${UI_BASE}/select_001.ogg` },
  { key: "s_select_2", path: `${UI_BASE}/select_002.ogg` },
  { key: "s_switch_1", path: `${UI_BASE}/switch_001.ogg` },
  { key: "s_toggle_1", path: `${UI_BASE}/toggle_001.ogg` },
  { key: "s_open_1", path: `${UI_BASE}/open_001.ogg` },
  { key: "s_open_2", path: `${UI_BASE}/open_002.ogg` },
  { key: "s_close_1", path: `${UI_BASE}/close_001.ogg` },
  { key: "s_close_2", path: `${UI_BASE}/close_002.ogg` },
  { key: "s_confirmation_1", path: `${UI_BASE}/confirmation_001.ogg` },
  { key: "s_confirmation_2", path: `${UI_BASE}/confirmation_002.ogg` },
  { key: "s_drop_1", path: `${UI_BASE}/drop_001.ogg` },
  { key: "s_error_1", path: `${UI_BASE}/error_001.ogg` },
  { key: "s_error_2", path: `${UI_BASE}/error_002.ogg` },
  { key: "s_glass_1", path: `${UI_BASE}/glass_001.ogg` },
  { key: "s_glass_2", path: `${UI_BASE}/glass_002.ogg` },
  { key: "s_glitch_1", path: `${UI_BASE}/glitch_001.ogg` },
  { key: "s_glitch_2", path: `${UI_BASE}/glitch_002.ogg` },
  { key: "s_scratch_1", path: `${UI_BASE}/scratch_001.ogg` },
  { key: "s_scratch_2", path: `${UI_BASE}/scratch_002.ogg` },
];

const CUES: Record<SoundCue, CueDef> = {
  uiClick: { keys: ["s_click_1", "s_click_2", "s_click_3"], volume: 0.42, rate: [0.96, 1.05] },
  uiToggle: { keys: ["s_switch_1", "s_toggle_1"], volume: 0.48, rate: [0.96, 1.04] },
  shopOpen: { keys: ["s_open_1", "s_open_2"], volume: 0.46 },
  modalOpen: { keys: ["s_open_1", "s_select_1"], volume: 0.38 },
  modalClose: { keys: ["s_close_1", "s_close_2"], volume: 0.36 },
  cardDraw: { keys: ["s_card_slide_1", "s_card_slide_2", "s_card_slide_3"], volume: 0.34, rate: [0.96, 1.08] },
  cardUse: { keys: ["s_card_place_1", "s_card_place_2", "s_card_place_3", "s_card_place_4"], volume: 0.42, rate: [0.96, 1.08] },
  cardMerge: { keys: ["s_book_flip_1", "s_book_flip_2", "s_book_flip_3", "s_book_open"], volume: 0.5, rate: [0.94, 1.04] },
  invalidDrop: { keys: ["s_error_1", "s_error_2", "s_drop_1"], volume: 0.42, rate: [0.92, 1.02] },
  diceShake: { keys: ["s_dice_shake_1", "s_dice_shake_2"], volume: 0.48 },
  diceThrow: { keys: ["s_dice_throw_1", "s_die_throw_1", "s_die_throw_2"], volume: 0.5 },
  coinGain: { keys: ["s_handle_coins", "s_handle_coins_2"], volume: 0.48 },
  coinSpend: { keys: ["s_handle_coins_2", "s_metal_click"], volume: 0.44 },
  reward: { keys: ["s_confirmation_1", "s_confirmation_2", "s_handle_coins"], volume: 0.52 },
  attackHit: { keys: ["s_knife_slice", "s_knife_slice_2"], volume: 0.48, rate: [0.94, 1.06] },
  bigHit: { keys: ["s_chop", "s_metal_pot_1", "s_metal_pot_2"], volume: 0.55, rate: [0.9, 1.02] },
  partBreak: { keys: ["s_cloth_1", "s_cloth_2", "s_cloth_3", "s_cloth_4", "s_cloth_belt", "s_drop_leather"], volume: 0.58, rate: [0.94, 1.06] },
  shield: { keys: ["s_metal_click", "s_metal_latch"], volume: 0.45, rate: [0.96, 1.04] },
  heal: { keys: ["s_confirmation_1", "s_glass_1", "s_glass_2"], volume: 0.42, rate: [0.98, 1.08] },
  poison: { keys: ["s_glitch_1", "s_glitch_2", "s_scratch_1", "s_scratch_2"], volume: 0.38, rate: [0.9, 1.04] },
  parry: { keys: ["s_draw_knife_1", "s_draw_knife_2", "s_draw_knife_3", "s_metal_click"], volume: 0.5, rate: [0.96, 1.08] },
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
