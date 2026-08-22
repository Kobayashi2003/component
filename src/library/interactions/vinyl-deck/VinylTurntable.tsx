import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import type { VinylDeckAudioSource } from './hooks/useVinylDeckAudio'
import { usePlatterInertia } from './hooks/usePlatterInertia'

export interface VinylDeckItem {
  id: string
  title: string
  genre: string
  release: string
  author: string
  caption: string
  accent?: string
  secondary?: string
  cover?: string
  audio?: VinylDeckAudioSource
  bpm?: string
  format?: string
}

export interface VinylTurntableProps {
  item: VinylDeckItem
  index: number
  itemCount: number
  playing: boolean
  volume: number
  cover?: string
  meterLevels: number[]
  direction: 'previous' | 'next' | null
  shadowAngle?: number
  autoAdvance: boolean
  shuffle: boolean
  onSelect: (step: -1 | 1) => void
  onTogglePlayback: () => void
  onToggleAutoAdvance: () => void
  onToggleShuffle: () => void
  onVolumeChange: (next: number | ((current: number) => number)) => void
}

export function VinylTurntable({
  item,
  index,
  itemCount,
  playing,
  volume,
  cover,
  meterLevels,
  direction,
  shadowAngle = 90,
  autoAdvance,
  shuffle,
  onSelect,
  onTogglePlayback,
  onToggleAutoAdvance,
  onToggleShuffle,
  onVolumeChange,
}: VinylTurntableProps) {
  const [tonearmReady, setTonearmReady] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const dragStartRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)
  const volumeDragRef = useRef(false)
  const volumeGestureRef = useRef({ lastAngle: 0, dialAngle: 0, moved: false, outside: false })
  const lastAudibleVolumeRef = useRef(Math.max(5, volume))
  const platterRotorRef = usePlatterInertia(playing)

  useEffect(() => {
    const readyTimer = window.setTimeout(() => setTonearmReady(true), 1250)
    return () => window.clearTimeout(readyTimer)
  }, [])

  const activateWithKeyboard = (event: KeyboardEvent<SVGGElement>, action: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      action()
    }
  }

  const handlePointerDown = (event: PointerEvent<SVGGElement>) => {
    dragStartRef.current = event.clientX
    suppressClickRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<SVGGElement>) => {
    if (dragStartRef.current === null) return
    const nextOffset = Math.max(-90, Math.min(90, event.clientX - dragStartRef.current))
    setDragOffset(nextOffset)
    if (Math.abs(nextOffset) > 8) suppressClickRef.current = true
  }

  const finishDrag = (event: PointerEvent<SVGGElement>) => {
    if (dragStartRef.current === null) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (Math.abs(dragOffset) > 48) onSelect(dragOffset < 0 ? 1 : -1)
    dragStartRef.current = null
    setDragOffset(0)
  }

  const togglePlayback = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    onTogglePlayback()
  }

  const handlePlatterKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onSelect(-1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      onSelect(1)
    } else {
      activateWithKeyboard(event, onTogglePlayback)
    }
  }

  const getVolumePointer = (event: PointerEvent<SVGGElement>) => {
    const matrix = event.currentTarget.getScreenCTM()
    if (!matrix) return { angle: 0, distance: Number.POSITIVE_INFINITY }
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    const x = point.x - 128
    const y = point.y - 426
    return { angle: (Math.atan2(y, x) * 180) / Math.PI, distance: Math.hypot(x, y) }
  }

  const updateVolumeFromPointer = (event: PointerEvent<SVGGElement>) => {
    if (!volumeDragRef.current) return
    const pointer = getVolumePointer(event)
    if (pointer.distance > 48) {
      volumeGestureRef.current.outside = true
      return
    }
    if (volumeGestureRef.current.outside) {
      volumeGestureRef.current.lastAngle = pointer.angle
      volumeGestureRef.current.outside = false
      return
    }
    let delta = pointer.angle - volumeGestureRef.current.lastAngle
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360
    volumeGestureRef.current.lastAngle = pointer.angle
    if (Math.abs(delta) > 0.8) volumeGestureRef.current.moved = true
    const nextAngle = Math.max(-130, Math.min(130, volumeGestureRef.current.dialAngle + delta * 0.38))
    volumeGestureRef.current.dialAngle = nextAngle
    onVolumeChange(Math.round((((nextAngle + 130) / 260) * 100) / 5) * 5)
  }

  const handleVolumePointerDown = (event: PointerEvent<SVGGElement>) => {
    volumeDragRef.current = true
    const pointer = getVolumePointer(event)
    volumeGestureRef.current = {
      lastAngle: pointer.angle,
      dialAngle: -130 + volume * 2.6,
      moved: false,
      outside: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const finishVolumeDrag = (event: PointerEvent<SVGGElement>) => {
    volumeDragRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleVolumeClick = () => {
    if (volumeGestureRef.current.moved) {
      volumeGestureRef.current.moved = false
      return
    }
    if (volume > 0) {
      lastAudibleVolumeRef.current = volume
      onVolumeChange(0)
    } else {
      onVolumeChange(lastAudibleVolumeRef.current)
    }
  }

  const handleVolumeKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault()
      onVolumeChange((current) => Math.min(100, current + 5))
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault()
      onVolumeChange((current) => Math.max(0, current - 5))
    } else if (event.key === 'Home') {
      event.preventDefault()
      onVolumeChange(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      onVolumeChange(100)
    }
  }

  const shadowRadians = (shadowAngle * Math.PI) / 180
  const style = {
    '--focus-accent': item.accent ?? '#43bdd8',
    '--focus-secondary': item.secondary ?? '#7357e8',
    '--focus-shadow-x': `${Math.cos(shadowRadians) * 10}px`,
    '--focus-shadow-y': `${Math.sin(shadowRadians) * 10}px`,
    '--focus-shadow-small-x': `${Math.cos(shadowRadians) * 4}px`,
    '--focus-shadow-small-y': `${Math.sin(shadowRadians) * 4}px`,
    '--focus-drag': `${dragOffset}px`,
    '--focus-drag-rotation': `${dragOffset * 0.13}deg`,
    '--focus-track-angle': `${-5 + (index / Math.max(1, itemCount - 1)) * 9}deg`,
    '--focus-volume-angle': `${-130 + volume * 2.6}deg`,
  } as CSSProperties

  return (
    <svg
      className={`vinyl-deck__machine ${playing ? 'is-playing' : 'is-paused'} ${tonearmReady ? 'is-tonearm-ready' : 'is-tonearm-parked'} ${direction ? `is-switching-${direction}` : ''}`}
      viewBox="-18 -4 848 564"
      fill="none"
      role="group"
      aria-label={`${item.title} media controls`}
      style={style}
    >
      <defs>
        <linearGradient id="focus-shell" x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#f7f7f5" />
          <stop offset="0.55" stopColor="#dedfdf" />
          <stop offset="1" stopColor="#b9bcbe" />
        </linearGradient>
        <linearGradient id="focus-bevel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#777c7f" />
          <stop offset="1" stopColor="#292d30" />
        </linearGradient>
        <linearGradient id="focus-key" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#303438" />
          <stop offset="1" stopColor="#111416" />
        </linearGradient>
        <radialGradient id="focus-platter" cx="42%" cy="35%" r="68%">
          <stop offset="0" stopColor="#686c6f" />
          <stop offset="0.46" stopColor="#303438" />
          <stop offset="1" stopColor="#15181b" />
        </radialGradient>
        <radialGradient id="focus-label" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d9dbdc" />
        </radialGradient>
        <clipPath id="focus-label-clip"><circle cx="414" cy="274" r="112" /></clipPath>
      </defs>

      <g className="vinyl-deck__blueprint" aria-hidden="true">
        <path pathLength="1" d="M63 6H728L812 82V460L744 540H59L8 484V72L63 6Z" />
        <path pathLength="1" d="M82 32H708L780 96V462L736 526H70L38 472V91L82 32Z" />
        <path pathLength="1" d="M72 108H183L200 125V169L184 184H72L59 171V122Z" />
        <path pathLength="1" d="M72 203H183L200 220V264L184 279H72L59 266V217Z" />
        <path pathLength="1" d="M128 338V362M116 338H140M116 362H140" />
        <circle pathLength="1" cx="128" cy="434" r="40" />
        <circle pathLength="1" cx="414" cy="274" r="209" />
        <circle pathLength="1" cx="680" cy="111" r="57" />
        <path pathLength="1" d="M680 111L585 292L548 337" />
        <path pathLength="1" d="M646 318H739L746 325V380H646L640 374V324Z" />
        <path pathLength="1" d="M646 402H739L746 409V463L739 470H646L640 464V408Z" />
      </g>

      <g className="vinyl-deck__hardware">
      <g
        className={`vinyl-deck__side-mode ${autoAdvance ? 'is-active' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Toggle auto advance"
        aria-pressed={autoAdvance}
        onClick={onToggleAutoAdvance}
        onKeyDown={(event) => activateWithKeyboard(event, onToggleAutoAdvance)}
      >
        <path d="M-14 118H9V180H-14L-17 176V124Z" />
        <text className="vinyl-deck__side-mode-label" textAnchor="middle" dominantBaseline="middle">
          {'AUTO'.split('').map((letter, letterIndex) => <tspan key={letter} x="-3" y={133 + letterIndex * 11}>{letter}</tspan>)}
        </text>
      </g>
      <g
        className={`vinyl-deck__side-mode ${shuffle ? 'is-active' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Toggle shuffle"
        aria-pressed={shuffle}
        onClick={onToggleShuffle}
        onKeyDown={(event) => activateWithKeyboard(event, onToggleShuffle)}
      >
        <path d="M-14 190H9V294H-14L-17 290V196Z" />
        <text className="vinyl-deck__side-mode-label" textAnchor="middle" dominantBaseline="middle">
          {'SHUFFLE'.split('').map((letter, letterIndex) => <tspan key={`${letter}-${letterIndex}`} x="-3" y={209 + letterIndex * 11}>{letter}</tspan>)}
        </text>
      </g>
      <g className="vinyl-deck__assembly" strokeLinejoin="round">
        <path className="vinyl-deck__chassis" d="M63 6H728L812 82V460L744 540H59L8 484V72L63 6Z" fill="url(#focus-bevel)" stroke="#111416" strokeWidth="3" />
        <path className="vinyl-deck__panel" d="M82 32H708L780 96V462L736 526H70L38 472V91L82 32Z" fill="url(#focus-shell)" stroke="#e4e5e5" strokeWidth="2" />
        <path d="M82 32H346L300 76H68L38 104V91Z" fill="#696d70" />
        <path className="vinyl-deck__draw draw-01" pathLength="1" d="M63 6H728L812 82V460L744 540H59L8 484V72L63 6Z" stroke="#15181b" strokeWidth="4" />
        <path className="vinyl-deck__draw draw-02" pathLength="1" d="M82 32H708L780 96V462L736 526H70L38 472V91L82 32Z" stroke="#85898c" strokeWidth="1.5" />
        <path className="vinyl-deck__seam vinyl-deck__draw draw-03" pathLength="1" d="M63 63H286L310 39" />
        {[{ x: 82, y: 90 }, { x: 723, y: 104 }].map((screw) => (
          <g className="vinyl-deck__screw" key={`${screw.x}-${screw.y}`} transform={`translate(${screw.x} ${screw.y})`}>
            <circle r="7" fill="#4d5255" /><circle r="3" fill="#171a1d" /><path d="M-2.5-2.5L2.5 2.5" stroke="#aeb1b2" strokeWidth="1" />
          </g>
        ))}
      </g>

      <g
        className="vinyl-deck__svg-control vinyl-deck__svg-control--previous"
        role="button"
        tabIndex={0}
        aria-label="Previous item"
        onClick={() => onSelect(-1)}
        onKeyDown={(event) => activateWithKeyboard(event, () => onSelect(-1))}
      >
        <path className="vinyl-deck__control-outline vinyl-deck__key-face" d="M72 108H183L200 125V169L184 184H72L59 171V122Z" fill="url(#focus-key)" stroke="#111416" strokeWidth="3" />
        <path d="M183 108L200 125V169L184 184H172L185 169V124L169 108Z" fill="#555a5d" opacity=".7" />
        <path className="vinyl-deck__key-accent" d="M72 108H183" stroke="var(--focus-accent)" strokeWidth="2" />
        <text x="126" y="151" textAnchor="middle">PREV</text><text className="vinyl-deck__key-code" x="74" y="173">◀ 01</text>
        <path className="vinyl-deck__hit-area" d="M72 108H183L200 125V169L184 184H72L59 171V122Z" fill="transparent" />
      </g>
      <g
        className="vinyl-deck__svg-control vinyl-deck__svg-control--next"
        role="button"
        tabIndex={0}
        aria-label="Next item"
        onClick={() => onSelect(1)}
        onKeyDown={(event) => activateWithKeyboard(event, () => onSelect(1))}
      >
        <path className="vinyl-deck__control-outline vinyl-deck__key-face" d="M72 203H183L200 220V264L184 279H72L59 266V217Z" fill="url(#focus-key)" stroke="#111416" strokeWidth="3" />
        <path d="M183 203L200 220V264L184 279H172L185 264V219L169 203Z" fill="#555a5d" opacity=".7" />
        <path className="vinyl-deck__key-accent" d="M72 203H183" stroke="var(--focus-accent)" strokeWidth="2" />
        <text x="126" y="246" textAnchor="middle">NEXT</text><text className="vinyl-deck__key-code" x="74" y="268">▶ 02</text>
        <path className="vinyl-deck__hit-area" d="M72 203H183L200 220V264L184 279H72L59 266V217Z" fill="transparent" />
      </g>

      <path
        className="vinyl-deck__module-bed vinyl-deck__module-bed--left"
        d="M64 300H178L194 316V468L184 480H68L64 474V312Z"
        fill="#c8cacc"
        stroke="#929698"
        strokeWidth="1.5"
        transform="translate(-10 0)"
      />
      <g className="vinyl-deck__pitch" stroke="currentColor" transform="translate(-10 0)">
        <text x="68" y="327">OUTPUT LEVEL</text>
        <text x="184" y="327" textAnchor="end">03</text>
        <path d="M68 338H184" stroke="#85898c" strokeWidth="1" />
      </g>

      <g
        className="vinyl-deck__platter"
        role="button"
        tabIndex={0}
        aria-label={`${playing ? 'Pause' : 'Play'} ${item.title}. Drag or use arrow keys to change item.`}
        aria-pressed={playing}
        onClick={togglePlayback}
        onKeyDown={handlePlatterKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <circle cx="414" cy="274" r="209" fill="#1b1f22" stroke="#0c0f11" strokeWidth="5" />
        <circle cx="414" cy="274" r="200" fill="url(#focus-platter)" stroke="#74787a" strokeWidth="3" />
        <circle className="vinyl-deck__draw vinyl-deck__platter-outline draw-09" pathLength="1" cx="414" cy="274" r="205" stroke="#171a1d" strokeWidth="4" />
        <g ref={platterRotorRef} className="vinyl-deck__rotor">
        <g className="vinyl-deck__rings vinyl-deck__rings--outer">
          <circle cx="414" cy="274" r="190" stroke="#e4e5e5" strokeWidth="5" />
          <circle className="vinyl-deck__segmented-ring ring-01" pathLength="1" cx="414" cy="274" r="181" stroke="#15191c" strokeWidth="14" strokeDasharray=".19 .026 .055 .018" transform="rotate(-18 414 274)" />
          <circle className="vinyl-deck__segmented-ring ring-02" pathLength="1" cx="414" cy="274" r="165" stroke="#aeb1b2" strokeWidth="6" strokeDasharray=".11 .022 .034 .016" transform="rotate(24 414 274)" />
        </g>
        <g className="vinyl-deck__rings vinyl-deck__rings--inner">
          <circle className="vinyl-deck__segmented-ring ring-03" pathLength="1" cx="414" cy="274" r="153" stroke="#171a1d" strokeWidth="12" strokeDasharray=".075 .018 .16 .03" transform="rotate(-38 414 274)" />
          <circle className="vinyl-deck__segmented-ring ring-04" pathLength="1" cx="414" cy="274" r="141" stroke="#74787a" strokeWidth="4" strokeDasharray=".015 .009 .12 .018" transform="rotate(11 414 274)" />
          <circle cx="414" cy="274" r="132" fill="#0f1214" stroke="#e4e5e5" strokeWidth="3" />
        </g>
        <g className="vinyl-deck__art">
          <circle cx="414" cy="274" r="119" fill="url(#focus-label)" stroke="var(--focus-accent)" strokeWidth="3" />
          <g clipPath="url(#focus-label-clip)">
            {cover ? (
              <image href={cover} x="294" y="154" width="240" height="240" preserveAspectRatio="xMidYMid slice" />
            ) : (
              <>
                <rect x="294" y="154" width="240" height="240" fill="var(--focus-accent)" />
                <path d="M294 324L464 154H534V224L364 394H294Z" fill="var(--focus-secondary)" opacity=".46" />
                <text className="vinyl-deck__cover-title" x="414" y="266" textAnchor="middle">{item.title}</text>
                <text className="vinyl-deck__cover-author" x="414" y="288" textAnchor="middle">{item.author}</text>
              </>
            )}
          </g>
          <circle cx="414" cy="274" r="17" fill="#e6e7e7" stroke="#171a1d" strokeWidth="4" />
          <circle cx="414" cy="274" r="5" fill="#171a1d" />
        </g>
        </g>
        <circle className="vinyl-deck__hit-area" cx="414" cy="274" r="205" fill="transparent" />
      </g>

      <g
        className="vinyl-deck__dial"
        role="slider"
        tabIndex={0}
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={volume}
        aria-valuetext={`${volume}%`}
        onPointerDown={handleVolumePointerDown}
        onPointerMove={updateVolumeFromPointer}
        onPointerUp={finishVolumeDrag}
        onPointerCancel={finishVolumeDrag}
        onClick={handleVolumeClick}
        onKeyDown={handleVolumeKeyDown}
        transform="translate(-10 0)"
      >
        <text x="68" y="360">VOLUME</text>
        <text className="vinyl-deck__volume-value" x="184" y="360" textAnchor="end">{String(volume).padStart(3, '0')}</text>
        <circle className="vinyl-deck__dial-mount" cx="128" cy="426" r="43" fill="#b8bbbc" stroke="#777c7f" strokeWidth="2" />
        <circle cx="128" cy="426" r="39" fill="#25292c" stroke="#111416" strokeWidth="3" />
        {Array.from({ length: 21 }, (_, tick) => {
          const selectedIndex = Math.round(volume / 5)
          const knobAngle = -130 + tick * 13
          const angle = (knobAngle - 90) * (Math.PI / 180)
          const selectedTick = tick === selectedIndex
          const chargedTick = tick <= selectedIndex
          const majorTick = tick % 5 === 0
          return (
            <g key={tick} className={`vinyl-deck__dial-tick ${chargedTick ? 'is-charged' : ''} ${selectedTick ? 'is-selected' : ''}`.trim()}>
              <line x1={128 + Math.cos(angle) * 34} y1={426 + Math.sin(angle) * 34} x2={128 + Math.cos(angle) * (selectedTick ? 41 : majorTick ? 39 : 37)} y2={426 + Math.sin(angle) * (selectedTick ? 41 : majorTick ? 39 : 37)} />
              {selectedTick && <circle cx={128 + Math.cos(angle) * 43} cy={426 + Math.sin(angle) * 43} r="2.5" />}
            </g>
          )
        })}
        <g className="vinyl-deck__dial-knob">
          <circle cx="128" cy="426" r="28" fill="#c9cbcc" stroke="#080b0d" strokeWidth="5" />
          <circle cx="128" cy="426" r="22" fill="#4a4f52" stroke="#85898b" strokeWidth="2" />
          <path className="vinyl-deck__volume-pointer" d="M128 426V406" stroke="#f1f1ef" strokeWidth="4" strokeLinecap="round" />
        </g>
        <circle className="vinyl-deck__hit-area" cx="128" cy="426" r="44" fill="transparent" />
      </g>

      <path
        className="vinyl-deck__module-bed vinyl-deck__module-bed--right"
        d="M642 306H740L752 318V469L740 481H634V314Z"
        fill="#bec1c2"
        stroke="#8d9193"
        strokeWidth="1.5"
        transform="translate(10 0)"
      />
      <g className="vinyl-deck__meter" transform="translate(10 0)">
        <path d="M646 318H739L746 325V380H646L640 374V324Z" fill="#15191c" stroke="#34393c" strokeWidth="3" />
        <path d="M648 334H738V373H648Z" fill="#0c0f11" stroke="#5b6063" strokeWidth="1" />
        <text x="650" y="329">SIGNAL / EQ</text><text x="736" y="329" textAnchor="end">{item.bpm ?? '--'}</text>
        <text x="652" y="345">L</text><text x="652" y="369">R</text>
        {Array.from({ length: 13 }, (_, meterIndex) => (
          <line key={meterIndex} x1={662 + meterIndex * 6} y1="368" x2={662 + meterIndex * 6} y2={368 - meterLevels[meterIndex] * 22} stroke="var(--focus-accent)" strokeWidth="3" />
        ))}
        <path d="M660 347H738M660 371H738" stroke="#34393c" strokeWidth="1" />
      </g>

      <g
        className="vinyl-deck__svg-control vinyl-deck__svg-control--enter"
        role="button"
        tabIndex={0}
        aria-label={playing ? 'Pause platter' : 'Start platter'}
        onClick={onTogglePlayback}
        onKeyDown={(event) => activateWithKeyboard(event, onTogglePlayback)}
      >
        <path className="vinyl-deck__control-outline vinyl-deck__key-face" d="M646 402H739L746 409V463L739 470H646L640 464V408Z" fill="url(#focus-key)" stroke="#111416" strokeWidth="3" />
        <path className="vinyl-deck__key-inset" d="M650 408H735L740 413V459L735 464H650L646 460V412Z" fill="none" stroke="#676c6f" strokeWidth="1.5" />
        <path d="M646 402H739" stroke="var(--focus-accent)" strokeWidth="2" />
        <circle cx="655" cy="414" r="3.5" fill="var(--focus-accent)" className="vinyl-deck__status-light" />
        <text x="693" y="442" textAnchor="middle">{playing ? 'PAUSE' : 'PLAY'}</text>
        <path className="vinyl-deck__hit-area" d="M646 402H739L746 409V463L739 470H646L640 464V408Z" fill="transparent" />
      </g>

      <g className="vinyl-deck__tonearm" transform="translate(10 8)">
        <path d="M640 53H720L740 73V149L720 169H640L620 149V73Z" fill="#222629" stroke="#111416" strokeWidth="3" />
        <circle cx="680" cy="111" r="54" fill="#d8dadb" stroke="#15191c" strokeWidth="7" />
        <circle cx="680" cy="111" r="41" fill="#272b2e" stroke="#777b7d" strokeWidth="3" />
        <circle cx="680" cy="111" r="25" fill="#bfc2c3" stroke="#111416" strokeWidth="5" />
        {[0, 90, 180, 270].map((angle) => (
          <circle key={angle} cx={680 + Math.cos((angle * Math.PI) / 180) * 34} cy={111 + Math.sin((angle * Math.PI) / 180) * 34} r="3.5" fill="var(--focus-accent)" />
        ))}
        <g className="vinyl-deck__tonearm-arm">
          <path d="M680 111L585 292" stroke="#1a1e21" strokeWidth="16" strokeLinecap="round" />
          <path d="M680 111L584 289" stroke="#7e8284" strokeWidth="5" strokeLinecap="round" />
          <path d="M585 292L564 320" stroke="#111416" strokeWidth="20" strokeLinecap="round" />
          <path d="M582 290L561 317" stroke="#8a8e90" strokeWidth="6" strokeLinecap="round" />
          <path className="vinyl-deck__cartridge" d="M570 307L553 338L532 326L551 294Z" fill="#272b2e" stroke="#101315" strokeWidth="3" />
          <path d="M556 310L544 331" stroke="#797e80" strokeWidth="3" />
          <path d="M538 329L528 340H520" stroke="#1a1e21" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="519" cy="340" r="2.5" fill="var(--focus-accent)" />
        </g>
        <circle cx="680" cy="111" r="12" fill="#25292c" stroke="#85898b" strokeWidth="3" />
        <circle cx="680" cy="111" r="4.5" fill="#111416" />
      </g>
      </g>
    </svg>
  )
}
