export const DEFAULT_ADJUSTMENTS = {
  brightness: 0,
  exposure: 0,
  contrast: 0,
  blacks: 0,
  whites: 0,
  highlights: 0,
  shadows: 0,
  vibrance: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  hue: 0,
  sharpen: 0,
  noiseReduction: 0,
  vignette: 0,
  grain: 0,
  clarity: 0,
} as const;

export type AdjustmentKey = keyof typeof DEFAULT_ADJUSTMENTS;
