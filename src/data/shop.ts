export const SHOP_GALLERY = [
  { id: "s1", label: "감상 이미지 1", textureKey: "shop_s1", path: "/assets/s1.png", cost: 60 },
  { id: "s2", label: "감상 이미지 2", textureKey: "shop_s2", path: "/assets/s2.png", cost: 80 },
  { id: "s3", label: "감상 이미지 3", textureKey: "shop_s3", path: "/assets/s3.png", cost: 100 },
  { id: "s4", label: "감상 이미지 4", textureKey: "shop_s4", path: "/assets/s4.png", cost: 120 },
  { id: "s5", label: "감상 이미지 5", textureKey: "shop_s5", path: "/assets/s5.png", cost: 150 },
  { id: "s6", label: "감상 이미지 6", textureKey: "shop_s6", path: "/assets/s6.png", cost: 180 },
  { id: "s7", label: "감상 이미지 7", textureKey: "shop_s7", path: "/assets/s7.png", cost: 220 },
] as const;

export type ShopArtId = (typeof SHOP_GALLERY)[number]["id"];

export function createEmptyGalleryInventory(): Record<ShopArtId, number> {
  return SHOP_GALLERY.reduce(
    (acc, item) => {
      acc[item.id] = 0;
      return acc;
    },
    {} as Record<ShopArtId, number>
  );
}

export function getShopGalleryItem(id: ShopArtId) {
  return SHOP_GALLERY.find((item) => item.id === id);
}
