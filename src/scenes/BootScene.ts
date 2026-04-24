import Phaser from "phaser";
import {
  STAGE_ORDER,
  INTERACTION_ORDER,
  INTERACTION_ASSET_PATHS,
} from "../data/parts";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    STAGE_ORDER.forEach((key) => {
      this.load.image(key, `/assets/${key}.png`);
    });
    INTERACTION_ORDER.forEach((key) => {
      this.load.image(key, INTERACTION_ASSET_PATHS[key]);
    });
    this.load.image("bg", "/assets/bg.png");
  }

  create() {
    const allKeys = [...STAGE_ORDER, ...INTERACTION_ORDER];
    allKeys.forEach((key) => {
      if (this.needsCheckerStripping(key)) {
        this.stripCheckerBackground(key);
      }
    });
    this.scene.start("GameScene");
    this.scene.launch("UIScene");
  }

  // Peek the four corner pixels. If ANY corner is already fully
  // transparent we assume the artist delivered a real PNG-with-alpha and
  // skip the aggressive checker-stripping pass entirely. Running the
  // cleanup on an already-transparent image is actively harmful: the
  // border histogram samples nothing but alpha=0 pixels (RGB treated as
  // 0,0,0), minTile collapses to 0, and the "wide checker" test then
  // matches every near-black pixel on the character — eating hair, eyes,
  // and any dark clothing.
  private needsCheckerStripping(key: string): boolean {
    const src = this.textures.get(key).getSourceImage() as HTMLImageElement;
    const w = src.width;
    const h = src.height;
    const probe = document.createElement("canvas");
    probe.width = w;
    probe.height = h;
    const ctx = probe.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(src, 0, 0);
    const corners = [
      ctx.getImageData(0, 0, 1, 1).data[3],
      ctx.getImageData(w - 1, 0, 1, 1).data[3],
      ctx.getImageData(0, h - 1, 1, 1).data[3],
      ctx.getImageData(w - 1, h - 1, 1, 1).data[3],
    ];
    const anyTransparent = corners.some((a) => a === 0);
    return !anyTransparent;
  }

  private stripCheckerBackground(key: string) {
    const src = this.textures.get(key).getSourceImage() as HTMLImageElement;
    const w = src.width;
    const h = src.height;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    const data = img.data;
    const total = w * h;

    // --- Core idea ---
    // The checker pattern is made of TWO pure-grayscale tile colors.
    // Anti-aliased seam pixels between tiles are also pure grayscale
    // (blend of two gray values is still gray). So any checker pixel
    // satisfies r ≈ g ≈ b exactly. Real character content (skin, hair,
    // lips, eyes, fabric) almost always has a subtle chromatic tint
    // even when it looks "gray-ish". We lean hard on that signal:
    // strict-grayscale is our primary filter.
    const GRAY_TOL = 3;
    const isStrictGray = (r: number, g: number, b: number) =>
      Math.abs(r - g) <= GRAY_TOL &&
      Math.abs(g - b) <= GRAY_TOL &&
      Math.abs(r - b) <= GRAY_TOL;

    // --- Sample the border to learn which grayscale values this image
    // uses for its checker. Different stage PNGs have different tile
    // shades (170, 184, 205, 211, 217, 253 seen in our assets). ---
    const grayHist = new Map<number, number>();
    const sampleBorder = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (!isStrictGray(r, g, b)) return;
      const v = Math.round((r + g + b) / 3);
      grayHist.set(v, (grayHist.get(v) ?? 0) + 1);
    };
    const BAND = 32;
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < Math.min(BAND, h); y++) sampleBorder(x, y);
      for (let y = Math.max(0, h - BAND); y < h; y++) sampleBorder(x, y);
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < Math.min(BAND, w); x++) sampleBorder(x, y);
      for (let x = Math.max(0, w - BAND); x < w; x++) sampleBorder(x, y);
    }

    // Top-k border grays, then cluster into tile centers.
    const sortedGrays = [...grayHist.entries()].sort((a, b) => b[1] - a[1]);
    const topGrays = sortedGrays.slice(0, 8).map(([v]) => v);
    if (topGrays.length === 0) topGrays.push(217, 255);
    topGrays.sort((a, b) => a - b);
    const tileColors: number[] = [];
    for (const v of topGrays) {
      let merged = false;
      for (let i = 0; i < tileColors.length; i++) {
        if (Math.abs(tileColors[i] - v) <= 6) {
          tileColors[i] = Math.round((tileColors[i] + v) / 2);
          merged = true;
          break;
        }
      }
      if (!merged) tileColors.push(v);
    }
    const minTile = Math.min(...tileColors);
    const maxTile = Math.max(...tileColors);

    const nearTile = (v: number, tol: number) => {
      for (const t of tileColors) if (Math.abs(v - t) <= tol) return true;
      return false;
    };

    // Wide match: strict-gray AND inside the tile-shade range (includes
    // anti-aliased seams between the two tiles). Used for flood fill
    // propagation and pocket cleanup. The strict-gray requirement keeps
    // skin/hair/lips safe because they carry a tiny color tint.
    const isWideChecker = (i: number) => {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (!isStrictGray(r, g, b)) return false;
      const v = (r + g + b) / 3;
      return v >= minTile - 8 && v <= maxTile + 8;
    };

    // Tight match: very close to a detected tile center.
    const isTightChecker = (i: number) => {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (!isStrictGray(r, g, b)) return false;
      const v = (r + g + b) / 3;
      return nearTile(v, 4);
    };

    // --- Pass 1: flood fill from every border pixel ---
    const visited = new Uint8Array(total);
    const stack: number[] = [];
    const seed = (x: number, y: number) => {
      const p = y * w + x;
      if (visited[p]) return;
      if (!isWideChecker(p * 4)) return;
      visited[p] = 1;
      stack.push(p);
    };
    for (let x = 0; x < w; x++) {
      seed(x, 0);
      seed(x, h - 1);
    }
    for (let y = 0; y < h; y++) {
      seed(0, y);
      seed(w - 1, y);
    }
    while (stack.length) {
      const p = stack.pop() as number;
      const x = p % w;
      const y = (p - x) / w;
      data[p * 4 + 3] = 0;
      const expand = (np: number) => {
        if (visited[np]) return;
        if (!isWideChecker(np * 4)) return;
        visited[np] = 1;
        stack.push(np);
      };
      if (x > 0) expand(p - 1);
      if (x < w - 1) expand(p + 1);
      if (y > 0) expand(p - w);
      if (y < h - 1) expand(p + w);
    }

    // --- Pass 2: strict tile-color pixels that live in a strict-gray
    // cluster. Requiring ≥2 strict-gray neighbors means we only kill
    // pixels that are part of a connected checker region. An isolated
    // pure-white hair highlight surrounded by colored hair has 0
    // strict-gray neighbors and survives. ---
    for (let p = 0; p < total; p++) {
      const i = p * 4;
      if (data[i + 3] === 0) continue;
      if (!isTightChecker(i)) continue;
      const x = p % w;
      const y = (p - x) / w;
      let grayNeighbors = 0;
      if (x > 0 && isWideChecker((p - 1) * 4)) grayNeighbors++;
      if (x < w - 1 && isWideChecker((p + 1) * 4)) grayNeighbors++;
      if (y > 0 && isWideChecker((p - w) * 4)) grayNeighbors++;
      if (y < h - 1 && isWideChecker((p + w) * 4)) grayNeighbors++;
      if (grayNeighbors >= 2) {
        data[i + 3] = 0;
      }
    }

    // --- Pass 3: flood fill from every already-transparent pixel into
    // wide-match grayscale neighbors. This catches anti-aliased seam
    // pixels in pockets enclosed by hair/fabric — as long as the pocket
    // has at least one strict-tile pixel for pass 2 to seed, this step
    // eats the rest of that pocket. Because we require strict grayscale,
    // the flood cannot cross into skin or colored hair. ---
    const stack2: number[] = [];
    for (let p = 0; p < total; p++) {
      if (data[p * 4 + 3] === 0) stack2.push(p);
    }
    while (stack2.length) {
      const p = stack2.pop() as number;
      const x = p % w;
      const y = (p - x) / w;
      const eat = (np: number) => {
        if (data[np * 4 + 3] === 0) return;
        if (!isWideChecker(np * 4)) return;
        data[np * 4 + 3] = 0;
        stack2.push(np);
      };
      if (x > 0) eat(p - 1);
      if (x < w - 1) eat(p + 1);
      if (y > 0) eat(p - w);
      if (y < h - 1) eat(p + w);
    }

    // --- Pass 4: 1-pixel silhouette erosion. Repeat up to 3 times. Any
    // strict-gray, near-tile pixel touching any transparent neighbor
    // gets killed. This shaves off the final thin ring of AA fringe at
    // the edge of the character. Because of the strict-gray guard, skin
    // edges (which are warm, never r=g=b) are completely safe. ---
    for (let iter = 0; iter < 3; iter++) {
      const alphaSnap = new Uint8Array(total);
      for (let p = 0; p < total; p++) alphaSnap[p] = data[p * 4 + 3];
      let changed = 0;
      for (let p = 0; p < total; p++) {
        if (alphaSnap[p] === 0) continue;
        const i = p * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (!isStrictGray(r, g, b)) continue;
        const v = (r + g + b) / 3;
        if (!nearTile(v, 18)) continue;
        const x = p % w;
        const y = (p - x) / w;
        let touchesTransparent =
          (x > 0 && alphaSnap[p - 1] === 0) ||
          (x < w - 1 && alphaSnap[p + 1] === 0) ||
          (y > 0 && alphaSnap[p - w] === 0) ||
          (y < h - 1 && alphaSnap[p + w] === 0);
        if (!touchesTransparent) continue;
        data[i + 3] = 0;
        changed++;
      }
      if (changed === 0) break;
    }

    ctx.putImageData(img, 0, 0);
    this.textures.remove(key);
    this.textures.addCanvas(key, canvas);
  }
}
