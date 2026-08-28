import { GeometryLightLab } from './components/GeometryLightLab'
import './styles.css'

export { GeometryLightLab }
export type {
  GeometryLightControls,
  GeometryType,
  LightPosition,
  LightSource,
  RenderMode,
} from './model'

export default function GeometryLightLabDemo() {
  return <GeometryLightLab />
}
