import './styles.css'
import { useState } from 'react'
import { RotaryKnob } from '..'

export default function RotaryKnobShowcase() {
  const [value, setValue] = useState(50)
  const [damping, setDamping] = useState(0.35)
  const [detentStep, setDetentStep] = useState(10)
  const [strength, setStrength] = useState(0.6)
  return (
    <section className="knob-demo">
      <header>
        <span>INSTRUMENTS / 01</span>
        <h2>A little resistance.</h2>
        <p>Turn slowly. Find the notch. Make it feel right.</p>
      </header>
      <div className="knob-demo__bench">
        <div className="knob-demo__instrument">
          <span className="knob-demo__serial">01 / PRECISION</span>
          <RotaryKnob
            label="Output"
            value={value}
            onChange={setValue}
            damping={damping}
            detentStep={detentStep}
            detentStrength={strength}
          />
          <p>Adjustable response</p>
        </div>
        <div className="knob-demo__instrument">
          <span className="knob-demo__serial">02 / CONTINUOUS</span>
          <RotaryKnob
            label="Blend"
            appearance="ivory"
            defaultValue={36}
            damping={0.1}
            detentStep={0}
          />
          <p>Light & smooth</p>
        </div>
        <div className="knob-demo__instrument">
          <span className="knob-demo__serial">03 / INDEXED</span>
          <RotaryKnob
            label="Channel"
            appearance="signal"
            defaultValue={4}
            min={0}
            max={12}
            unit=""
            damping={0.2}
            detentStep={1}
            detentStrength={1}
          />
          <p>Firm mechanical steps</p>
        </div>
      </div>
      <div className="knob-demo__settings">
        <div>
          <b>Response tuning</b>
          <p>Applies to Output · drag around the rim</p>
        </div>
        <label>
          Damping <output>{damping.toFixed(2)}</output>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={damping}
            onChange={(e) => setDamping(Number(e.target.value))}
          />
        </label>
        <label>
          Detent spacing <output>{detentStep === 0 ? 'Off' : detentStep}</output>
          <input
            type="range"
            min="0"
            max="25"
            step="1"
            value={detentStep}
            onChange={(e) => setDetentStep(Number(e.target.value))}
          />
        </label>
        <label>
          Detent strength <output>{strength.toFixed(2)}</output>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={strength}
            onChange={(e) => setStrength(Number(e.target.value))}
          />
        </label>
      </div>
      <footer>
        ROTATE TO ADJUST <span>Keyboard: arrows · Page Up / Down · Home / End</span>
      </footer>
    </section>
  )
}
