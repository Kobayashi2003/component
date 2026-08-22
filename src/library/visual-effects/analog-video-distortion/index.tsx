import { AnalogVideoEffect } from './AnalogVideoEffect'
import './styles.css'

export { AnalogVideoEffect }
export type { AnalogVideoEffectProps } from './AnalogVideoEffect'

export default function AnalogVideoDistortionDemo() {
  return (
    <div className="vhs-demo">
      <AnalogVideoEffect noise={0.18} tearing={0.82} smear={0.74} scanlines={0.28} colorShift={0.46}>
        <article className="vhs-demo__broadcast">
          <span className="vhs-demo__archive">Archive / 04</span>
          <h2>LOST SIGNAL</h2>
          <time className="vhs-demo__timecode">00:14:27:08</time>
        </article>
      </AnalogVideoEffect>
    </div>
  )
}
