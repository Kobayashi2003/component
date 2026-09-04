import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, Ref } from 'react'
import { VinylDeckBackground } from './VinylDeckBackground'
import { VinylTurntable } from './VinylTurntable'
import type { VinylDeckItem } from './VinylTurntable'
import { useVinylDeckAudio } from './hooks/useVinylDeckAudio'
import type { VinylDeckAudioSnapshot, VinylDeckAudioSource } from './hooks/useVinylDeckAudio'
import { useVinylDeckMeter } from './hooks/useVinylDeckMeter'
import { extractAudioMetadata } from './utils/extractAudioMetadata'

// Public component contract ----------------------------------------------------
export interface VinylDeckProps {
  items: VinylDeckItem[]
  source?: VinylDeckAudioSource
  initialIndex?: number
  autoPlay?: boolean
  loop?: boolean
  muted?: boolean
  volume?: number
  defaultVolume?: number
  shadowAngle?: number
  defaultShadowAngle?: number
  autoAdvance?: boolean
  defaultAutoAdvance?: boolean
  shuffle?: boolean
  defaultShuffle?: boolean
  showBackground?: boolean
  backgroundControls?: boolean
  audioRef?: Ref<HTMLAudioElement>
  onChange?: (item: VinylDeckItem, index: number) => void
  onPlaybackChange?: (playing: boolean) => void
  onTimeUpdate?: (snapshot: VinylDeckAudioSnapshot) => void
  onVolumeChange?: (volume: number) => void
  onShadowAngleChange?: (angle: number) => void
  onAutoAdvanceChange?: (enabled: boolean) => void
  onShuffleChange?: (enabled: boolean) => void
  onAudioFileChange?: (file: File) => void
  onAudioFilesChange?: (files: File[]) => void
  onError?: (error: MediaError | Event) => void
}

export function VinylDeck({
  items,
  source,
  initialIndex = 0,
  autoPlay = false,
  loop = false,
  muted = false,
  volume: controlledVolume,
  defaultVolume = 64,
  shadowAngle: controlledShadowAngle,
  defaultShadowAngle = 90,
  autoAdvance: controlledAutoAdvance,
  defaultAutoAdvance = false,
  shuffle: controlledShuffle,
  defaultShuffle = false,
  showBackground = true,
  backgroundControls = false,
  audioRef,
  onChange,
  onPlaybackChange,
  onTimeUpdate,
  onVolumeChange,
  onShadowAngleChange,
  onAutoAdvanceChange,
  onShuffleChange,
  onAudioFileChange,
  onAudioFilesChange,
  onError,
}: VinylDeckProps) {
  // Playlist and user-provided media -------------------------------------------
  const [index, setIndex] = useState(() => Math.max(0, Math.min(items.length - 1, initialIndex)))

  // Controlled / uncontrolled deck settings -----------------------------------
  const [internalVolume, setInternalVolume] = useState(defaultVolume)
  const [internalShadowAngle, setInternalShadowAngle] = useState(defaultShadowAngle)
  const [internalAutoAdvance, setInternalAutoAdvance] = useState(defaultAutoAdvance)
  const [internalShuffle, setInternalShuffle] = useState(defaultShuffle)

  // Transient UI state and resource bookkeeping --------------------------------
  const [uploadedItems, setUploadedItems] = useState<VinylDeckItem[]>([])
  const [direction, setDirection] = useState<'previous' | 'next' | null>(null)
  const directionTimerRef = useRef<number | undefined>(undefined)
  const coverUrlsRef = useRef<string[]>([])
  const uploadGenerationRef = useRef(0)

  // Normalized state consumed by the render layer ------------------------------
  const activeItems = uploadedItems.length ? uploadedItems : items
  const safeIndex = activeItems.length ? Math.min(index, activeItems.length - 1) : 0
  const item = activeItems[safeIndex]
  const volume = Math.max(0, Math.min(100, controlledVolume ?? internalVolume))
  const shadowAngle = controlledShadowAngle ?? internalShadowAngle
  const autoAdvance = controlledAutoAdvance ?? internalAutoAdvance
  const shuffle = controlledShuffle ?? internalShuffle
  const activeSource = source ?? item?.audio

  // Track navigation ------------------------------------------------------------
  const select = useCallback((step: -1 | 1) => {
    if (activeItems.length < 2) return
    const nextIndex = shuffle && step > 0
      ? (safeIndex + 1 + Math.floor(Math.random() * (activeItems.length - 1))) % activeItems.length
      : (safeIndex + step + activeItems.length) % activeItems.length
    setDirection(step > 0 ? 'next' : 'previous')
    setIndex(nextIndex)
    onChange?.(activeItems[nextIndex], nextIndex)
    if (directionTimerRef.current !== undefined) window.clearTimeout(directionTimerRef.current)
    directionTimerRef.current = window.setTimeout(() => setDirection(null), 380)
  }, [activeItems, onChange, safeIndex, shuffle])

  const handleEnded = useCallback(() => {
    if (!autoAdvance || activeItems.length < 2) return false
    select(1)
    return true
  }, [activeItems.length, autoAdvance, select])

  // Audio engine + visualization data ------------------------------------------
  const { elementRef, analyserRef, playing, togglePlayback } = useVinylDeckAudio({
    source: activeSource,
    volume,
    initiallyPlaying: autoPlay,
    autoPlay,
    loop,
    muted,
    externalRef: audioRef,
    onPlaybackChange,
    onTimeUpdate,
    onEnded: handleEnded,
    onError,
  })
  const meterLevels = useVinylDeckMeter(analyserRef, playing, Boolean(activeSource))

  // Resource cleanup ------------------------------------------------------------
  useEffect(() => () => {
    if (directionTimerRef.current !== undefined) window.clearTimeout(directionTimerRef.current)
  }, [])

  useEffect(() => () => coverUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)), [])

  // Controlled / uncontrolled setters -----------------------------------------
  const changeVolume = useCallback((next: number | ((current: number) => number)) => {
    const resolved = Math.max(0, Math.min(100, typeof next === 'function' ? next(volume) : next))
    if (controlledVolume === undefined) setInternalVolume(resolved)
    onVolumeChange?.(resolved)
  }, [controlledVolume, onVolumeChange, volume])

  const changeShadowAngle = useCallback((next: number) => {
    if (controlledShadowAngle === undefined) setInternalShadowAngle(next)
    onShadowAngleChange?.(next)
  }, [controlledShadowAngle, onShadowAngleChange])

  const toggleAutoAdvance = useCallback(() => {
    const next = !autoAdvance
    if (controlledAutoAdvance === undefined) setInternalAutoAdvance(next)
    onAutoAdvanceChange?.(next)
  }, [autoAdvance, controlledAutoAdvance, onAutoAdvanceChange])

  const toggleShuffle = useCallback(() => {
    const next = !shuffle
    if (controlledShuffle === undefined) setInternalShuffle(next)
    onShuffleChange?.(next)
  }, [controlledShuffle, onShuffleChange, shuffle])

  // Local-file ingestion --------------------------------------------------------
  const loadAudioFiles = useCallback((files: File[]) => {
    const generation = uploadGenerationRef.current + 1
    uploadGenerationRef.current = generation
    // The previous covers stay live until the new queue is ready; revoking them
    // now would break the artwork still on screen.
    const retiredUrls = coverUrlsRef.current
    const pendingUrls: string[] = []
    setIndex(0)
    onAudioFilesChange?.(files)
    onAudioFileChange?.(files[0])

    void Promise.all(files.map(async (file, fileIndex) => {
      const metadata = await extractAudioMetadata(file)
      const cover = metadata.artwork ? URL.createObjectURL(metadata.artwork) : undefined
      if (cover) pendingUrls.push(cover)
      return {
        id: String(fileIndex + 1).padStart(2, '0'),
        title: metadata.title ?? file.name.replace(/\.[^.]+$/, ''),
        genre: metadata.genre ?? 'Local audio',
        release: metadata.year ?? 'Local file',
        author: metadata.artist ?? 'Unknown artist',
        caption: metadata.album ?? file.name,
        accent: items[fileIndex % Math.max(1, items.length)]?.accent,
        secondary: items[fileIndex % Math.max(1, items.length)]?.secondary,
        cover,
        audio: file,
        bpm: metadata.bpm,
        format: file.type.replace(/^audio\//, '').toUpperCase() || file.name.split('.').pop()?.toUpperCase() || 'AUDIO',
      } satisfies VinylDeckItem
    })).then((nextItems) => {
      if (uploadGenerationRef.current !== generation) {
        pendingUrls.forEach((url) => URL.revokeObjectURL(url))
        return
      }
      coverUrlsRef.current = pendingUrls
      setUploadedItems(nextItems)
      retiredUrls.forEach((url) => URL.revokeObjectURL(url))
    })
  }, [items, onAudioFileChange, onAudioFilesChange])

  if (!item) return <section className="vinyl-deck vinyl-deck--empty">No tracks</section>

  // React -> CSS visual-state bridge -------------------------------------------
  const shadowRadians = (shadowAngle * Math.PI) / 180
  const style = {
    '--focus-accent': item.accent ?? '#43bdd8',
    '--focus-secondary': item.secondary ?? '#7357e8',
    '--focus-shadow-x': `${Math.cos(shadowRadians) * 10}px`,
    '--focus-shadow-y': `${Math.sin(shadowRadians) * 10}px`,
    '--focus-shadow-small-x': `${Math.cos(shadowRadians) * 4}px`,
    '--focus-shadow-small-y': `${Math.sin(shadowRadians) * 4}px`,
  } as CSSProperties

  // Composition ----------------------------------------------------------------
  return (
    <section className={`vinyl-deck ${playing ? 'is-playing' : 'is-paused'}`} style={style} aria-label="Vinyl media deck">
      {/* Environment / optional development controls */}
      {showBackground && (
        <VinylDeckBackground
          controls={backgroundControls}
          shadowAngle={shadowAngle}
          onShadowAngleChange={changeShadowAngle}
          onAudioFilesChange={loadAudioFiles}
        />
      )}

      {/* The media element is intentionally separate from the SVG control surface. */}
      <audio ref={elementRef} preload="metadata" crossOrigin="anonymous" />

      {/* Left metadata rail */}
      <aside className="vinyl-deck__information">
        <h2 className="vinyl-deck__section-label"><i />Information <small>UNIT / 01</small></h2>
        <dl>
          {[
            ['01', 'Track', item.title],
            ['02', 'Genre', item.genre],
            ['03', 'Release', item.release],
            ['04', 'Author', item.author],
          ].map(([number, label, value]) => (
            <div key={label}><b>{number}</b><span><dt>{label}</dt><dd>{value}</dd></span></div>
          ))}
        </dl>
      </aside>

      {/* Central interactive SVG machine */}
      <VinylTurntable
        item={item}
        index={safeIndex}
        itemCount={activeItems.length}
        playing={playing}
        volume={volume}
        cover={item.cover}
        meterLevels={meterLevels}
        direction={direction}
        shadowAngle={shadowAngle}
        autoAdvance={autoAdvance}
        shuffle={shuffle}
        onSelect={select}
        onTogglePlayback={togglePlayback}
        onToggleAutoAdvance={toggleAutoAdvance}
        onToggleShuffle={toggleShuffle}
        onVolumeChange={changeVolume}
      />

      {/* Right status / editorial rail */}
      <aside className="vinyl-deck__summary">
        <div className="vinyl-deck__counter">
          <span><i />Work</span>
          <strong>{String(safeIndex + 1).padStart(2, '0')} <em>/ {String(activeItems.length).padStart(2, '0')}</em></strong>
          <div className="vinyl-deck__progress"><i style={{ width: `${((safeIndex + 1) / activeItems.length) * 100}%` }} /></div>
          <small>{playing ? 'PLAYING' : 'STANDBY'} / {item.format ?? 'AUDIO'}</small>
        </div>
        <div className="vinyl-deck__statement"><p>{item.caption}</p><small>TRACK / {item.id}</small></div>
      </aside>
    </section>
  )
}

/** Compatibility alias. Prefer `VinylDeck` in new code. */
export const FocusDeck = VinylDeck
export type FocusDeckItem = VinylDeckItem
export type FocusDeckProps = VinylDeckProps
