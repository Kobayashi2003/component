import { RetroRadio } from "./RetroRadio";
import type { RetroRadioStation } from "./RetroRadio";
import "./styles.css";

export { RetroRadio } from "./RetroRadio";
export { RetroRadioBackground } from "./RetroRadioBackground";
export type { RetroRadioProps, RetroRadioStation } from "./RetroRadio";
export type { RetroRadioBackgroundProps } from "./RetroRadioBackground";

const demoStations: RetroRadioStation[] = [
  {
    id: "01",
    name: "暖 · 温和圆融",
    frequency: "88.6",
    glyph: "暖",
    angle: -46,
  },
  {
    id: "02",
    name: "直 · 直接坦率",
    frequency: "101.3",
    glyph: "直",
    angle: 0,
  },
  {
    id: "03",
    name: "静 · 内向低调",
    frequency: "106.7",
    glyph: "静",
    angle: 46,
  },
];

export default function RetroRadioDemo() {
  return <RetroRadio stations={demoStations} />;
}
