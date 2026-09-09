import './styles.css'
import { VinylDeck } from '..'
import type { VinylDeckItem } from '..'

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

export default function VinylDeckShowcase() {
  return <VinylDeck items={demoItems} backgroundControls />
}
