export const CREDIT_COSTS = {
  auto_enhance: 1,
  auto_tone_balance: 1,
  smart_color_balance: 1,
  style_match: 3,
  noise_reduction: 1,
  clarity: 1,
  heal: 2,
  remove_background: 1,
  generative_fill: 3,
  chat_message: 1,
  semantic_search: 3,
} as const;

export type CreditFeature = keyof typeof CREDIT_COSTS;
