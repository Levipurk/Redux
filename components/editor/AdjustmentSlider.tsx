"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";

interface AdjustmentSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}

export default function AdjustmentSlider({
  label,
  value,
  onChange,
  onCommit,
}: AdjustmentSliderProps) {
  return (
    <div className="flex flex-col gap-[6px] px-4 py-[6px]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-[#e5e5e5] leading-none select-none">
          {label}
        </span>
        <span
          className="text-[13px] text-[#888888] leading-none tabular-nums cursor-default select-none"
          onDoubleClick={() => {
            onChange(0);
            onCommit(0);
          }}
        >
          {value}
        </span>
      </div>

      <SliderPrimitive.Root
        min={-100}
        max={100}
        step={1}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        onValueCommit={([v]) => onCommit(v)}
        className="relative flex w-full touch-none select-none items-center"
      >
        <SliderPrimitive.Track className="relative h-[2px] w-full grow rounded-full bg-[#2a2a2a]">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-[#505050]" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block h-[12px] w-[12px] rounded-full bg-white shadow-sm outline-none cursor-pointer transition-transform hover:scale-110" />
      </SliderPrimitive.Root>
    </div>
  );
}
