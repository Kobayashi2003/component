import './styles.css'
import { RetroRadio } from '..'
import type { RetroRadioStation } from '..'

const demoStations: RetroRadioStation[] = [
  {
    id: '01',
    name: '暖 · 温和圆融',
    frequency: '88.6',
    glyph: '暖',
    angle: -46,
  },
  {
    id: '02',
    name: '直 · 直接坦率',
    frequency: '101.3',
    glyph: '直',
    angle: 0,
  },
  {
    id: '03',
    name: '静 · 内向低调',
    frequency: '106.7',
    glyph: '静',
    angle: 46,
  },
]

export default function RetroRadioShowcase() {
  return <RetroRadio stations={demoStations} />
}
