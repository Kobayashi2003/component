import { useCallback, useEffect, useRef, useState } from 'react'
import type { Ref } from 'react'

export type VinylDeckAudioSource = string | URL | Blob | MediaStream

export interface VinylDeckAudioSnapshot {
  currentTime: number
  duration: number
  playing: boolean
}

interface UseVinylDeckAudioOptions {
  source?: VinylDeckAudioSource
  volume: number
  initiallyPlaying: boolean
  autoPlay: boolean
  loop: boolean
  muted: boolean
  externalRef?: Ref<HTMLAudioElement>
  onPlaybackChange?: (playing: boolean) => void
  onTimeUpdate?: (snapshot: VinylDeckAudioSnapshot) => void
  onEnded?: () => boolean | void
  onError?: (error: MediaError | Event) => void
}

interface AudioGraph {
  context: AudioContext
  source: MediaElementAudioSourceNode
  analyser: AnalyserNode
  users: number
  closeTimer?: number
}

const audioGraphs = new WeakMap<HTMLAudioElement, AudioGraph>()

function acquireAudioGraph(audio: HTMLAudioElement) {
  const existing = audioGraphs.get(audio)
  if (existing) {
    if (existing.closeTimer !== undefined) window.clearTimeout(existing.closeTimer)
    existing.closeTimer = undefined
    existing.users += 1
    return existing
  }

  try {
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.78
    const source = context.createMediaElementSource(audio)
    source.connect(analyser)
    analyser.connect(context.destination)
    const graph: AudioGraph = { context, source, analyser, users: 1 }
    audioGraphs.set(audio, graph)
    return graph
  } catch {
    return undefined
  }
}

function releaseAudioGraph(audio: HTMLAudioElement, graph: AudioGraph) {
  graph.users = Math.max(0, graph.users - 1)
  if (graph.users > 0) return
  graph.closeTimer = window.setTimeout(() => {
    if (graph.users > 0) return
    graph.source.disconnect()
    graph.analyser.disconnect()
    audioGraphs.delete(audio)
    void graph.context.close()
  }, 0)
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return
  if (typeof ref === 'function') ref(value)
  else ref.current = value
}

function isMediaStream(source: VinylDeckAudioSource): source is MediaStream {
  return typeof MediaStream !== 'undefined' && source instanceof MediaStream
}

export function useVinylDeckAudio({
  source,
  volume,
  initiallyPlaying,
  autoPlay,
  loop,
  muted,
  externalRef,
  onPlaybackChange,
  onTimeUpdate,
  onEnded,
  onError,
}: UseVinylDeckAudioOptions) {
  const elementRef = useRef<HTMLAudioElement>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const playingRef = useRef(initiallyPlaying)
  const resumeOnSourceChangeRef = useRef(false)
  const [playing, setPlayingState] = useState(initiallyPlaying)

  const commitPlaying = useCallback((next: boolean) => {
    playingRef.current = next
    setPlayingState(next)
    onPlaybackChange?.(next)
  }, [onPlaybackChange])

  useEffect(() => {
    assignRef(externalRef, elementRef.current)
    return () => assignRef(externalRef, null)
  }, [externalRef])

  useEffect(() => {
    const audio = elementRef.current
    if (!audio || typeof AudioContext === 'undefined') return
    const graph = acquireAudioGraph(audio)
    if (!graph) return
    analyserRef.current = graph.analyser
    audioContextRef.current = graph.context

    return () => {
      analyserRef.current = null
      audioContextRef.current = null
      releaseAudioGraph(audio, graph)
    }
  }, [])

  useEffect(() => {
    const audio = elementRef.current
    if (!audio) return
    audio.volume = Math.max(0, Math.min(1, volume / 100))
    audio.loop = loop
    audio.muted = muted
  }, [loop, muted, volume])

  useEffect(() => {
    const audio = elementRef.current
    if (!audio) return

    const shouldResume = autoPlay || playingRef.current || resumeOnSourceChangeRef.current
    resumeOnSourceChangeRef.current = false
    let objectUrl: string | undefined

    audio.pause()
    audio.removeAttribute('src')
    audio.srcObject = null

    if (typeof source === 'string' || source instanceof URL) {
      audio.src = source.toString()
    } else if (source instanceof Blob) {
      objectUrl = URL.createObjectURL(source)
      audio.src = objectUrl
    } else if (source && isMediaStream(source)) {
      audio.srcObject = source
    }

    if (source) {
      audio.load()
      if (shouldResume) {
        void audio.play().catch(() => commitPlaying(false))
      } else {
        commitPlaying(false)
      }
    }

    return () => {
      audio.pause()
      audio.srcObject = null
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [autoPlay, commitPlaying, source])

  useEffect(() => {
    const audio = elementRef.current
    if (!audio) return

    const handlePlay = () => commitPlaying(true)
    const handlePause = () => commitPlaying(false)
    const handleEnded = () => {
      if (audio.loop) return
      if (onEnded?.() === true) {
        resumeOnSourceChangeRef.current = true
        return
      }
      commitPlaying(false)
    }
    const handleTimeUpdate = () => onTimeUpdate?.({
      currentTime: audio.currentTime,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      playing: playingRef.current,
    })
    const handleError = (event: Event) => onError?.(audio.error ?? event)

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('error', handleError)
    }
  }, [commitPlaying, onEnded, onError, onTimeUpdate])

  const setPlayback = useCallback(async (next: boolean) => {
    const audio = elementRef.current

    if (!source || !audio) {
      commitPlaying(next)
      return
    }

    if (!next) {
      audio.pause()
      return
    }

    try {
      if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume()
      await audio.play()
    } catch (error) {
      commitPlaying(false)
      onError?.(error instanceof Event ? error : new Event('audio-playback-error'))
    }
  }, [commitPlaying, onError, source])

  const togglePlayback = useCallback(() => {
    void setPlayback(!playingRef.current)
  }, [setPlayback])

  return {
    elementRef,
    analyserRef,
    playing,
    setPlayback,
    togglePlayback,
  }
}

export type FocusDeckAudioSource = VinylDeckAudioSource
export type FocusDeckAudioSnapshot = VinylDeckAudioSnapshot
