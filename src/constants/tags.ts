export const SHOP_TAGS = [
  'karaoke',
  'smoking_allowed',
  'heated_tobacco_allowed',
  'no_smoking',
  'credit_card',
  'wifi',
  'parking',
  'takeout',
  'delivery',
  'barrier_free',
  'pet_friendly',
  'kids_friendly',
  'counter_seats',
  'english_ok',
] as const;

export type ShopTag = typeof SHOP_TAGS[number];
