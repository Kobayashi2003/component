import { VinylDeck } from './VinylDeck'
import type { VinylDeckItem } from './VinylTurntable'
import './styles.css'

export { VinylDeck, FocusDeck } from './VinylDeck'
export { VinylTurntable } from './VinylTurntable'
export { VinylDeckBackground } from './VinylDeckBackground'
export type { VinylTurntableProps, VinylDeckItem } from './VinylTurntable'
export type { VinylDeckBackgroundProps } from './VinylDeckBackground'
export type { VinylDeckProps, FocusDeckItem, FocusDeckProps } from './VinylDeck'
export type { VinylDeckAudioSnapshot, VinylDeckAudioSource, FocusDeckAudioSnapshot, FocusDeckAudioSource } from './hooks/useVinylDeckAudio'

const demoItems: VinylDeckItem[] = [
  {
    id: '01',
    title: 'Blue Static',
    genre: 'Breakcore',
    release: '2026 / 08',
    author: 'Afterimage',
    caption: 'Noise becomes rhythm when the loop finds its edge.',
    accent: '#43bdd8',
    secondary: '#7357e8',
  },
  {
    id: '02',
    title: 'Soft Collision',
    genre: 'Jungle',
    release: '2026 / 10',
    author: 'Monoform',
    caption: 'Every return leaves the mechanism slightly changed.',
    accent: '#38bad7',
    secondary: '#a38cff',
  },
  {
    id: '03',
    title: 'Liminal Drive',
    genre: 'Ambient DnB',
    release: '2027 / 01',
    author: 'North Relay',
    caption: 'Motion feels clearest just before it disappears.',
    accent: '#49bfd0',
    secondary: '#586cff',
  },
]

export default function VinylDeckDemo() {
  return <VinylDeck items={demoItems} backgroundControls />
}
