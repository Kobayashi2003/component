import { GlassAlpineFlower } from './components/GlassAlpineFlower'
import './styles.css'

export { GlassAlpineFlower }
export type {
  GlassFlowerControls,
  LightName,
  LightPosition,
  RenderMode,
} from './model'

export default function GlassAlpineFlowerDemo() {
  return <GlassAlpineFlower />
}
