import { useCallback, useEffect, useId, useRef, useState } from "react";
import type {
  ChangeEvent,
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import darkTexture from "./assets/bg-dark-denim.png";
import woodTexture from "./assets/wood-cabinet.jpg";
import { RetroRadioBackground } from "./RetroRadioBackground";

export interface RetroRadioStation {
  id: string;
  name: string;
  frequency: string;
  glyph: string;
  tagline?: string;
  angle?: number;
}

export interface RetroRadioProps {
  stations: RetroRadioStation[];
  initialIndex?: number;
  defaultVolume?: number;
  showBackground?: boolean;
  onStationChange?: (station: RetroRadioStation, index: number) => void;
  onVolumeChange?: (volume: number) => void;
  onPlaybackChange?: (playing: boolean) => void;
  onMusicChange?: (file: File) => void;
}

type ScreenView = "mode" | "vol" | "play" | "viz";

interface DialGesture {
  pointerId: number | null;
  lastAngle: number;
  dialAngle: number;
  startClientX: number;
  startClientY: number;
  moved: boolean;
  outside: boolean;
}

interface AntennaState {
  angle: number;
  length: number;
}

const TUNE_MIN = -62;
const TUNE_MAX = 62;
const TUNE_SNAP = 9;
const VOLUME_MIN = -140;
const VOLUME_MAX = 140;
const KNOB_DAMPING = 0.38;
const MODE_VIEW_DURATION = 2000;
const ANTENNA_BASE = { x: 600, y: 74 };
const ANTENNA_MIN_LENGTH = 150;
const ANTENNA_MAX_LENGTH = 690;
const slots = Array.from({ length: 7 }, (_, index) => 98 + index * 30);

// Shared geometry helpers keep pointer math independent of rendered size.
function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizedDelta(delta: number) {
  if (delta > 180) return delta - 360;
  if (delta < -180) return delta + 360;
  return delta;
}

function stationAngle(
  station: RetroRadioStation,
  index: number,
  count: number,
) {
  if (station.angle !== undefined) return station.angle;
  if (count < 2) return 0;
  return -46 + (index / (count - 1)) * 92;
}

function stationLabel(name: string) {
  return name.split("·").at(-1)?.trim() || name;
}

function volumeToAngle(volume: number) {
  return VOLUME_MIN + (volume / 100) * (VOLUME_MAX - VOLUME_MIN);
}

function angleToVolume(angle: number) {
  return Math.round(((angle - VOLUME_MIN) / (VOLUME_MAX - VOLUME_MIN)) * 100);
}

export function RetroRadio({
  stations,
  initialIndex = 1,
  defaultVolume = 62,
  showBackground = true,
  onStationChange,
  onVolumeChange,
  onPlaybackChange,
  onMusicChange,
}: RetroRadioProps) {
  const safeInitialIndex = stations.length
    ? Math.round(clamp(initialIndex, 0, stations.length - 1))
    : 0;
  const initialVolume = clamp(Math.round(defaultVolume), 0, 100);
  const initialTuneAngle = stations[safeInitialIndex]
    ? stationAngle(
        stations[safeInitialIndex],
        safeInitialIndex,
        stations.length,
      )
    : 0;

  const [stationIndex, setStationIndex] = useState(safeInitialIndex);
  const [previewIndex, setPreviewIndex] = useState(safeInitialIndex);
  const [tuneAngle, setTuneAngle] = useState(initialTuneAngle);
  const [tuneDetent, setTuneDetent] = useState(false);
  const [volume, setVolume] = useState(initialVolume);
  const [volumeAngle, setVolumeAngle] = useState(volumeToAngle(initialVolume));
  const [playing, setPlaying] = useState(false);
  const [hasMusic, setHasMusic] = useState(false);
  const [musicName, setMusicName] = useState("");
  const [screenView, setScreenViewState] = useState<ScreenView>("mode");
  const [switching, setSwitching] = useState(false);
  const [antenna, setAntenna] = useState<AntennaState>({
    angle: -20,
    length: 215,
  });
  const [sparkPaths, setSparkPaths] = useState<string[]>([]);

  const radioSvgRef = useRef<SVGSVGElement>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const spectrumFrameRef = useRef(0);
  const stationIndexRef = useRef(safeInitialIndex);
  const tuneAngleRef = useRef(initialTuneAngle);
  const volumeRef = useRef(initialVolume);
  const playingRef = useRef(false);
  const playbackCallbackRef = useRef(onPlaybackChange);
  const antennaPointer = useRef<number | null>(null);
  const antennaCleanup = useRef<(() => void) | null>(null);
  const screenTimer = useRef<number | null>(null);
  const switchTimer = useRef<number | null>(null);
  const tuneGesture = useRef<DialGesture>({
    pointerId: null,
    lastAngle: 0,
    dialAngle: initialTuneAngle,
    startClientX: 0,
    startClientY: 0,
    moved: false,
    outside: false,
  });
  const volumeGesture = useRef<DialGesture>({
    pointerId: null,
    lastAngle: 0,
    dialAngle: volumeToAngle(initialVolume),
    startClientX: 0,
    startClientY: 0,
    moved: false,
    outside: false,
  });
  const id = useId().replace(/:/g, "");

  const displayStation = stations[previewIndex] ?? stations[stationIndex];

  // Preview the closest mode while dragging; commit it only on pointerup.
  const nearestStation = useCallback(
    (angle: number) => {
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      stations.forEach((item, index) => {
        const distance = Math.abs(
          stationAngle(item, index, stations.length) - angle,
        );
        if (distance < nearestDistance) {
          nearestIndex = index;
          nearestDistance = distance;
        }
      });

      return { index: nearestIndex, distance: nearestDistance };
    },
    [stations],
  );

  const setScreenView = useCallback(
    (view: ScreenView, revertAfter?: number) => {
      if (screenTimer.current !== null) {
        window.clearTimeout(screenTimer.current);
        screenTimer.current = null;
      }

      setScreenViewState(view);
      if (revertAfter === undefined) return;

      // Match the source receiver's view priority: interaction feedback is
      // temporary, while live audio analysis remains the resting screen.
      screenTimer.current = window.setTimeout(() => {
        setScreenViewState(playingRef.current ? "viz" : "mode");
        screenTimer.current = null;
      }, revertAfter);
    },
    [],
  );

  const setPlaybackState = useCallback((nextPlaying: boolean) => {
    playingRef.current = nextPlaying;
    setPlaying(nextPlaying);
    playbackCallbackRef.current?.(nextPlaying);
  }, []);

  // The source project paints analyser data directly to the CRT canvas. Keeping
  // the canvas outside React avoids a render for every animation frame.
  const drawSpectrum = useCallback(function drawSpectrumFrame() {
    const analyser = analyserRef.current;
    const canvas = spectrumCanvasRef.current;

    if (analyser && canvas) {
      const context = canvas.getContext("2d");
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);

      analyser.getByteFrequencyData(frequencyData);
      context?.clearRect(0, 0, canvas.width, canvas.height);

      if (context) {
        const barWidth = canvas.width / frequencyData.length;
        context.fillStyle = "#9dffb0";

        frequencyData.forEach((level, index) => {
          const barHeight = (level / 255) * canvas.height;
          context.fillRect(
            index * barWidth + 1,
            canvas.height - barHeight,
            Math.max(1, barWidth - 2),
            barHeight,
          );
        });
      }
    }

    spectrumFrameRef.current = window.requestAnimationFrame(drawSpectrumFrame);
  }, []);

  const ensureAudioGraph = useCallback(() => {
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.preload = "metadata";
      audio.addEventListener("ended", () => {
        setPlaybackState(false);
        setScreenView("play", 1100);
      });
      audioRef.current = audio;
    }

    let audioContext = audioContextRef.current;
    if (!audioContext) {
      audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const gain = audioContext.createGain();
      const source = audioContext.createMediaElementSource(audio);

      analyser.fftSize = 64;
      gain.gain.value = volumeRef.current / 100;
      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      gainRef.current = gain;

      if (!spectrumFrameRef.current) drawSpectrum();
    }

    return { audio, audioContext };
  }, [drawSpectrum, setPlaybackState, setScreenView]);

  const loadMusic = useCallback(
    async (file: File) => {
      const { audio, audioContext } = ensureAudioGraph();

      audio.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);

      const nextUrl = URL.createObjectURL(file);
      audioUrlRef.current = nextUrl;
      audio.src = nextUrl;
      audio.load();

      const nextName = file.name.replace(/\.[^.]+$/, "") || file.name;
      setMusicName(nextName);
      setHasMusic(true);
      onMusicChange?.(file);

      try {
        await audioContext.resume();
        await audio.play();
        setPlaybackState(true);
        setScreenView("viz");
      } catch {
        setPlaybackState(false);
        setScreenView("play", 1100);
      }
    },
    [ensureAudioGraph, onMusicChange, setPlaybackState, setScreenView],
  );

  const handleMusicChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void loadMusic(file);
  };

  const playSwitchAnimation = useCallback(() => {
    setSwitching(false);
    window.requestAnimationFrame(() => setSwitching(true));

    if (switchTimer.current !== null) {
      window.clearTimeout(switchTimer.current);
    }

    switchTimer.current = window.setTimeout(() => {
      setSwitching(false);
      switchTimer.current = null;
    }, 520);
  }, []);

  const selectStation = useCallback(
    (nextIndex: number) => {
      if (!stations.length) return;

      const normalized = (nextIndex + stations.length) % stations.length;
      const nextAngle = stationAngle(
        stations[normalized],
        normalized,
        stations.length,
      );
      const changed = normalized !== stationIndexRef.current;

      stationIndexRef.current = normalized;
      tuneAngleRef.current = nextAngle;
      setStationIndex(normalized);
      setPreviewIndex(normalized);
      setTuneAngle(nextAngle);
      setScreenView("mode", MODE_VIEW_DURATION);
      playSwitchAnimation();

      if (changed) onStationChange?.(stations[normalized], normalized);
    },
    [onStationChange, playSwitchAnimation, setScreenView, stations],
  );

  const changeVolumeFromAngle = useCallback(
    (nextAngle: number) => {
      const normalizedAngle = clamp(nextAngle, VOLUME_MIN, VOLUME_MAX);
      const normalizedVolume = angleToVolume(normalizedAngle);

      volumeRef.current = normalizedVolume;
      setVolumeAngle(normalizedAngle);
      setVolume(normalizedVolume);
      if (gainRef.current) gainRef.current.gain.value = normalizedVolume / 100;
      setScreenView("vol", 1000);
      onVolumeChange?.(normalizedVolume);
    },
    [onVolumeChange, setScreenView],
  );

  const changeVolume = useCallback(
    (nextVolume: number) => {
      const normalizedVolume = clamp(Math.round(nextVolume), 0, 100);
      changeVolumeFromAngle(volumeToAngle(normalizedVolume));
    },
    [changeVolumeFromAngle],
  );

  const getDialPointer = (
    event: ReactPointerEvent<HTMLButtonElement>,
    element: HTMLButtonElement,
  ) => {
    const bounds = element.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const x = event.clientX - centerX;
    const y = event.clientY - centerY;
    return {
      angle: (Math.atan2(y, x) * 180) / Math.PI,
      distance: Math.hypot(x, y),
      // offsetWidth is not inflated by the knob's CSS rotation.
      limit: element.offsetWidth * 0.8,
    };
  };

  const beginDial = (
    event: ReactPointerEvent<HTMLButtonElement>,
    gesture: typeof tuneGesture,
    base: number,
  ) => {
    const pointer = getDialPointer(event, event.currentTarget);
    gesture.current = {
      pointerId: event.pointerId,
      lastAngle: pointer.angle,
      dialAngle: base,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      outside: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  // Match vinyl-deck's incremental rotary gesture: accumulate small angular
  // deltas, freeze outside the active ring, and rebase cleanly on re-entry.
  const updateDial = (
    event: ReactPointerEvent<HTMLButtonElement>,
    gesture: typeof tuneGesture,
    minimum: number,
    maximum: number,
  ) => {
    const current = gesture.current;
    if (current.pointerId !== event.pointerId) return null;

    if (
      Math.hypot(
        event.clientX - current.startClientX,
        event.clientY - current.startClientY,
      ) > 6
    ) {
      current.moved = true;
    }

    const pointer = getDialPointer(event, event.currentTarget);
    if (pointer.distance > pointer.limit) {
      current.outside = true;
      return null;
    }
    if (current.outside) {
      current.lastAngle = pointer.angle;
      current.outside = false;
      return null;
    }

    const delta = normalizedDelta(pointer.angle - current.lastAngle);
    current.lastAngle = pointer.angle;
    if (Math.abs(delta) > 0.8) current.moved = true;
    current.dialAngle = clamp(
      current.dialAngle + delta * KNOB_DAMPING,
      minimum,
      maximum,
    );
    return current.dialAngle;
  };

  const moveTune = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rawAngle = updateDial(event, tuneGesture, TUNE_MIN, TUNE_MAX);
    if (rawAngle === null) return;
    const nearest = nearestStation(rawAngle);
    const inDetent = nearest.distance < TUNE_SNAP;
    const nextAngle = inDetent
      ? stationAngle(stations[nearest.index], nearest.index, stations.length)
      : rawAngle;

    tuneAngleRef.current = nextAngle;
    setTuneAngle(nextAngle);
    setTuneDetent(inDetent);
    setPreviewIndex(nearest.index);
    setScreenView("mode", MODE_VIEW_DURATION);
  };

  const finishTune = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (tuneGesture.current.pointerId !== event.pointerId) return;
    const moved = tuneGesture.current.moved;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    tuneGesture.current.pointerId = null;
    tuneGesture.current.moved = false;
    tuneGesture.current.outside = false;
    setTuneDetent(false);

    if (moved)
      selectStation(nearestStation(tuneGesture.current.dialAngle).index);
    else selectStation(stationIndexRef.current + 1);
  };

  const moveVolume = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const nextAngle = updateDial(event, volumeGesture, VOLUME_MIN, VOLUME_MAX);
    if (nextAngle === null) return;

    const steppedVolume = Math.round(angleToVolume(nextAngle) / 5) * 5;
    changeVolume(steppedVolume);
  };

  const finishVolume = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (volumeGesture.current.pointerId !== event.pointerId) return;
    const moved = volumeGesture.current.moved;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    volumeGesture.current.pointerId = null;
    volumeGesture.current.moved = false;
    volumeGesture.current.outside = false;

    if (!moved) togglePlayback();
  };

  const cancelDial = (
    event: ReactPointerEvent<HTMLButtonElement>,
    gesture: typeof tuneGesture,
  ) => {
    if (gesture.current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    gesture.current.pointerId = null;
    gesture.current.moved = false;
    gesture.current.outside = false;
    if (gesture === tuneGesture) setTuneDetent(false);
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    const audioContext = audioContextRef.current;

    if (!audio || !hasMusic) {
      setScreenView("play", 1100);
      return;
    }

    if (playingRef.current) {
      audio.pause();
      setPlaybackState(false);
      setScreenView("play", 1100);
      return;
    }

    try {
      await audioContext?.resume();
      await audio.play();
      setPlaybackState(true);
    } catch {
      setPlaybackState(false);
    }
    setScreenView("play", 1100);
  };

  const handleTuneClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0) selectStation(stationIndexRef.current + 1);
  };

  const handleVolumeClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0) togglePlayback();
  };

  const handleTuneKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    selectStation(
      stationIndexRef.current + (event.key === "ArrowRight" ? 1 : -1),
    );
  };

  const handleVolumeKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowDown",
        "ArrowUp",
        "Home",
        "End",
      ].includes(event.key)
    ) {
      return;
    }

    event.preventDefault();
    if (event.key === "Home") changeVolume(0);
    else if (event.key === "End") changeVolume(100);
    else {
      const increase = event.key === "ArrowRight" || event.key === "ArrowUp";
      changeVolume(volume + (increase ? 5 : -5));
    }
  };

  const toSvgPoint = (clientX: number, clientY: number) => {
    const matrix = radioSvgRef.current?.getScreenCTM();
    if (!matrix) return null;
    return new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  };

  const beginAntennaDrag = (event: ReactPointerEvent<SVGCircleElement>) => {
    const pointerId = event.pointerId;
    const hitTarget = event.currentTarget;
    antennaCleanup.current?.();
    antennaPointer.current = pointerId;
    hitTarget.setPointerCapture(pointerId);

    // Window listeners retain the drag after leaving the small SVG hit area.
    const move = (moveEvent: PointerEvent) => {
      if (antennaPointer.current !== moveEvent.pointerId) return;
      const point = toSvgPoint(moveEvent.clientX, moveEvent.clientY);
      if (!point) return;

      const dx = point.x - ANTENNA_BASE.x;
      const dy = point.y - ANTENNA_BASE.y;
      setAntenna({
        angle: clamp((Math.atan2(dx, -dy) * 180) / Math.PI, -88, 88),
        length: clamp(
          Math.hypot(dx, dy),
          ANTENNA_MIN_LENGTH,
          ANTENNA_MAX_LENGTH,
        ),
      });
    };

    const finish = (finishEvent: PointerEvent) => {
      if (antennaPointer.current !== finishEvent.pointerId) return;
      antennaPointer.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (hitTarget.hasPointerCapture(pointerId)) {
        hitTarget.releasePointerCapture(pointerId);
      }
      antennaCleanup.current = null;
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    antennaCleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      antennaPointer.current = null;
    };

    event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => {
    playbackCallbackRef.current = onPlaybackChange;
  }, [onPlaybackChange]);

  useEffect(() => {
    let clearTimer: number | null = null;
    let sparkTimer: number | null = null;

    // Short, irregular bursts look less mechanical than a repeating CSS loop.
    const tick = () => {
      if (Math.random() < 0.6) {
        const pathCount = 1 + Math.floor(Math.random() * 2);
        const paths = Array.from({ length: pathCount }, () => {
          let x = 0;
          let y = 0;
          let path = "M0 0";
          const segmentCount = 2 + Math.floor(Math.random() * 2);

          for (let segment = 0; segment < segmentCount; segment += 1) {
            x += (Math.random() - 0.5) * 18;
            y += (Math.random() - 0.5) * 18;
            path += `L${x.toFixed(1)} ${y.toFixed(1)}`;
          }
          return path;
        });

        setSparkPaths(paths);
        clearTimer = window.setTimeout(() => setSparkPaths([]), 110);
      }

      sparkTimer = window.setTimeout(tick, 500 + Math.random() * 900);
    };

    tick();
    return () => {
      if (clearTimer !== null) window.clearTimeout(clearTimer);
      if (sparkTimer !== null) window.clearTimeout(sparkTimer);
    };
  }, []);

  // Keep controlled station collections safe if a parent adds, removes, or
  // reorders modes after the radio has mounted.
  useEffect(() => {
    if (!stations.length) return;

    const nextIndex = Math.round(
      clamp(stationIndexRef.current, 0, stations.length - 1),
    );
    const nextAngle = stationAngle(
      stations[nextIndex],
      nextIndex,
      stations.length,
    );
    stationIndexRef.current = nextIndex;
    tuneAngleRef.current = nextAngle;
    setStationIndex(nextIndex);
    setPreviewIndex(nextIndex);
    setTuneAngle(nextAngle);
  }, [stations]);

  useEffect(
    () => () => {
      antennaCleanup.current?.();
      if (screenTimer.current !== null)
        window.clearTimeout(screenTimer.current);
      if (switchTimer.current !== null)
        window.clearTimeout(switchTimer.current);

      window.cancelAnimationFrame(spectrumFrameRef.current);
      audioRef.current?.pause();
      audioRef.current?.removeAttribute("src");
      audioRef.current?.load();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      void audioContextRef.current?.close();
    },
    [],
  );

  if (!displayStation) {
    return (
      <section className="retro-radio retro-radio--empty">No stations</section>
    );
  }

  const antennaRadians = (antenna.angle * Math.PI) / 180;
  const antennaTip = {
    x: ANTENNA_BASE.x + Math.sin(antennaRadians) * antenna.length,
    y: ANTENNA_BASE.y - Math.cos(antennaRadians) * antenna.length,
  };
  const antennaSegmentCount = Math.max(2, Math.round(antenna.length / 90));
  const antennaTicks = Array.from(
    { length: antennaSegmentCount - 1 },
    (_, index) => {
      const progress = (index + 1) / antennaSegmentCount;
      const x = ANTENNA_BASE.x + (antennaTip.x - ANTENNA_BASE.x) * progress;
      const y = ANTENNA_BASE.y + (antennaTip.y - ANTENNA_BASE.y) * progress;
      const perpendicularX = Math.cos(antennaRadians) * 2.4;
      const perpendicularY = Math.sin(antennaRadians) * 2.4;
      return {
        x1: x - perpendicularX,
        y1: y - perpendicularY,
        x2: x + perpendicularX,
        y2: y + perpendicularY,
      };
    },
  );
  const style = {
    "--retro-dark-texture": `url(${darkTexture})`,
    "--retro-tune-angle": `${tuneAngle}deg`,
    "--retro-volume-angle": `${volumeAngle}deg`,
    "--retro-volume": `${volume}%`,
  } as CSSProperties;

  const patternId = `${id}-wood-pattern`;
  const cabinetClipId = `${id}-cabinet-clip`;
  const speakerClipId = `${id}-speaker-clip`;
  const shadowId = `${id}-shadow`;
  const antennaGradientId = `${id}-antenna`;
  const antennaGlowId = `${id}-antenna-glow`;
  const clothGradientId = `${id}-cloth`;
  const clothTextureId = `${id}-cloth-texture`;
  const slotGradientId = `${id}-slot`;
  const screenGradientId = `${id}-screen`;
  const woodLightId = `${id}-wood-light`;
  const vignetteId = `${id}-vignette`;

  return (
    <section
      className={`retro-radio ${playing ? "is-playing" : "is-paused"}`}
      style={style}
      aria-label="Retro radio showcase"
    >
      {showBackground && <RetroRadioBackground />}

      <label className="retro-radio__music-control">
        <span>{hasMusic ? musicName : "Load audio"}</span>
        <input type="file" accept="audio/*" onChange={handleMusicChange} />
      </label>

      <header className="retro-radio__header">
        <h2>Archive Receiver</h2>
        <p>Sessions in sound, collected after midnight.</p>
      </header>

      <div className="retro-radio__stage">
        <div className={`retro-radio__body ${switching ? "is-switching" : ""}`}>
          <div className="retro-radio__tilt">
            <svg
              ref={radioSvgRef}
              className="retro-radio__cabinet"
              viewBox="0 56 660 340"
              aria-hidden="true"
            >
              <defs>
                <pattern
                  id={patternId}
                  patternUnits="userSpaceOnUse"
                  width="660"
                  height="440"
                >
                  <image
                    href={woodTexture}
                    x="-40"
                    y="-60"
                    width="740"
                    height="560"
                    preserveAspectRatio="xMidYMid slice"
                  />
                </pattern>
                <linearGradient
                  id={antennaGradientId}
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="0"
                >
                  <stop offset="0" stopColor="#5a4a2e" />
                  <stop offset=".38" stopColor="#d8c89e" />
                  <stop offset=".5" stopColor="#fff8ea" />
                  <stop offset=".62" stopColor="#c9a24b" />
                  <stop offset="1" stopColor="#4a3a20" />
                </linearGradient>
                <radialGradient id={antennaGlowId}>
                  <stop offset="0" stopColor="#eafaff" stopOpacity=".95" />
                  <stop offset="40%" stopColor="#8fdcff" stopOpacity=".6" />
                  <stop offset="100%" stopColor="#8fdcff" stopOpacity="0" />
                </radialGradient>
                <linearGradient
                  id={clothGradientId}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop stopColor="#2a1c0e" />
                  <stop offset="1" stopColor="#120b05" />
                </linearGradient>
                <linearGradient id={slotGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#7a4d2b" />
                  <stop offset=".5" stopColor="#4a2c17" />
                  <stop offset="1" stopColor="#2e1a0d" />
                </linearGradient>
                <linearGradient
                  id={screenGradientId}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop stopColor="#3a2814" />
                  <stop offset="1" stopColor="#160d06" />
                </linearGradient>
                <linearGradient id={woodLightId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fff" stopOpacity=".28" />
                  <stop offset="14%" stopColor="#fff" stopOpacity="0" />
                  <stop offset="82%" stopColor="#000" stopOpacity="0" />
                  <stop offset="100%" stopColor="#000" stopOpacity=".42" />
                </linearGradient>
                <radialGradient id={vignetteId} cx="50%" cy="42%" r="72%">
                  <stop offset="60%" stopColor="#000" stopOpacity="0" />
                  <stop offset="100%" stopColor="#000" stopOpacity=".4" />
                </radialGradient>
                <clipPath id={cabinetClipId}>
                  <rect x="20" y="70" width="620" height="300" rx="26" />
                </clipPath>
                <clipPath id={speakerClipId}>
                  <rect x="46" y="96" width="250" height="210" rx="10" />
                </clipPath>
                <filter
                  id={shadowId}
                  x="-30%"
                  y="-30%"
                  width="160%"
                  height="160%"
                >
                  <feDropShadow
                    dx="0"
                    dy="5"
                    stdDeviation="5"
                    floodColor="#000"
                    floodOpacity=".5"
                  />
                </filter>
                <filter
                  id={clothTextureId}
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                >
                  <feTurbulence
                    type="turbulence"
                    baseFrequency="0.5 0.55"
                    numOctaves={2}
                    seed={8}
                    result="texture"
                  />
                  <feColorMatrix
                    in="texture"
                    type="matrix"
                    values="0 0 0 0 0.12  0 0 0 0 0.08  0 0 0 0 0.03  0.7 0.7 0.7 0 -0.2"
                  />
                </filter>
              </defs>

              <g className="retro-radio__antenna">
                <line
                  x1={ANTENNA_BASE.x}
                  y1={ANTENNA_BASE.y}
                  x2={antennaTip.x}
                  y2={antennaTip.y}
                  stroke="#120b05"
                  strokeWidth="5"
                  strokeLinecap="round"
                  opacity=".45"
                />
                <line
                  x1={ANTENNA_BASE.x}
                  y1={ANTENNA_BASE.y}
                  x2={antennaTip.x}
                  y2={antennaTip.y}
                  stroke={`url(#${antennaGradientId})`}
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
                <line
                  x1={ANTENNA_BASE.x}
                  y1={ANTENNA_BASE.y}
                  x2={antennaTip.x}
                  y2={antennaTip.y}
                  stroke="#fff8ea"
                  strokeWidth=".9"
                  strokeLinecap="round"
                  opacity=".7"
                />
                {antennaTicks.map((tick, index) => (
                  <line
                    key={index}
                    {...tick}
                    stroke="#2b1b0c"
                    strokeWidth=".9"
                    opacity=".72"
                  />
                ))}
                <circle
                  cx={ANTENNA_BASE.x}
                  cy={ANTENNA_BASE.y}
                  r="6.5"
                  fill="#2e2211"
                  stroke="#6b5426"
                  strokeWidth="1.2"
                />
                <circle
                  cx={ANTENNA_BASE.x}
                  cy={ANTENNA_BASE.y}
                  r="2.4"
                  fill="#c9a24b"
                />
                <g
                  className="retro-radio__antenna-spark"
                  transform={`translate(${antennaTip.x} ${antennaTip.y})`}
                >
                  {sparkPaths.map((path, index) => (
                    <path key={`${path}-${index}`} d={path} />
                  ))}
                </g>
                <circle
                  className="retro-radio__antenna-glow"
                  cx={antennaTip.x}
                  cy={antennaTip.y}
                  r="10"
                  fill={`url(#${antennaGlowId})`}
                />
                <circle
                  cx={antennaTip.x}
                  cy={antennaTip.y}
                  r="5"
                  fill={`url(#${antennaGradientId})`}
                  stroke="#3a2c14"
                  strokeWidth=".6"
                />
                <circle
                  className="retro-radio__antenna-hit"
                  cx={antennaTip.x}
                  cy={antennaTip.y}
                  r="17"
                  fill="transparent"
                  onPointerDown={beginAntennaDrag}
                />
              </g>

              <g filter={`url(#${shadowId})`}>
                <rect
                  x="20"
                  y="70"
                  width="620"
                  height="300"
                  rx="26"
                  fill={`url(#${patternId})`}
                />
              </g>
              <g clipPath={`url(#${cabinetClipId})`}>
                <rect
                  x="20"
                  y="70"
                  width="620"
                  height="300"
                  fill={`url(#${woodLightId})`}
                />
                <rect
                  x="20"
                  y="70"
                  width="620"
                  height="300"
                  fill={`url(#${vignetteId})`}
                />
              </g>
              <rect
                x="20"
                y="70"
                width="620"
                height="300"
                rx="26"
                fill="none"
                stroke="#1a0f07"
                strokeWidth="3"
              />
              <rect
                x="24"
                y="74"
                width="612"
                height="292"
                rx="22"
                fill="none"
                stroke="#e8c98a"
                strokeWidth="1"
                opacity=".22"
              />
              <rect
                x="42"
                y="92"
                width="258"
                height="218"
                rx="14"
                fill="#0e0904"
              />
              <rect
                x="46"
                y="96"
                width="250"
                height="210"
                rx="10"
                fill="none"
                stroke="#7a5a30"
                strokeWidth="1"
                opacity=".3"
              />
              <g clipPath={`url(#${speakerClipId})`}>
                <rect
                  x="46"
                  y="96"
                  width="250"
                  height="210"
                  fill={`url(#${clothGradientId})`}
                />
                <rect
                  x="46"
                  y="96"
                  width="250"
                  height="210"
                  fill="#000"
                  filter={`url(#${clothTextureId})`}
                  opacity=".8"
                  style={{ mixBlendMode: "multiply" }}
                />
              </g>
              {slots.map((y) => (
                <g key={y}>
                  <rect
                    x="56"
                    y={y}
                    width="230"
                    height="23"
                    rx="5"
                    fill={`url(#${slotGradientId})`}
                  />
                  <rect
                    x="56"
                    y={y}
                    width="230"
                    height="2"
                    rx="1"
                    fill="#c69a5a"
                    opacity=".32"
                  />
                </g>
              ))}
              <rect
                x="326"
                y="90"
                width="292"
                height="140"
                rx="16"
                fill={`url(#${screenGradientId})`}
                stroke="#120a04"
                strokeWidth="2"
              />
              <rect
                x="332"
                y="96"
                width="280"
                height="128"
                rx="12"
                fill="#050a04"
              />
              <rect
                x="326"
                y="90"
                width="292"
                height="140"
                rx="16"
                fill="none"
                stroke="#e8c98a"
                strokeWidth="1"
                opacity=".18"
              />
              {/* The SVG bases line up with the source project's CSS knobs. */}
              <ellipse
                cx="414"
                cy="334"
                rx="40"
                ry="12"
                fill="#0d0804"
                opacity=".6"
              />
              <ellipse
                cx="530"
                cy="334"
                rx="40"
                ry="12"
                fill="#0d0804"
                opacity=".6"
              />
              <rect
                x="70"
                y="366"
                width="72"
                height="16"
                rx="6"
                fill="#160d06"
              />
              <rect
                x="520"
                y="366"
                width="72"
                height="16"
                rx="6"
                fill="#160d06"
              />
            </svg>

            <div
              className={`retro-radio__screen ${switching ? "is-booting" : ""}`}
              data-view={screenView}
              aria-live="polite"
            >
              <div className="retro-radio__crt-view retro-radio__crt-mode">
                <span className="retro-radio__glyph">
                  {displayStation.glyph}
                </span>
                <strong>{stationLabel(displayStation.name)}</strong>
                <small>FM · {displayStation.frequency}</small>
              </div>
              <div className="retro-radio__crt-view retro-radio__crt-volume">
                <span>音量</span>
                <div className="retro-radio__volume-bar">
                  <i />
                </div>
                <strong>{volume}</strong>
              </div>
              <div className="retro-radio__crt-view retro-radio__crt-play">
                <span>{hasMusic ? (playing ? "▶" : "❚❚") : "♪"}</span>
                <strong>
                  {hasMusic ? (playing ? "PLAYING" : "PAUSED") : "LOAD AUDIO"}
                </strong>
              </div>
              <div className="retro-radio__crt-view retro-radio__crt-viz">
                <span>{displayStation.glyph}</span>
                <canvas
                  ref={spectrumCanvasRef}
                  className="retro-radio__spectrum-canvas"
                  width="280"
                  height="128"
                  aria-hidden="true"
                />
                <strong>♪ {musicName}</strong>
              </div>
              <div className="retro-radio__scanlines" aria-hidden="true" />
              <div className="retro-radio__screen-flicker" aria-hidden="true" />
              <div className="retro-radio__boot-line" aria-hidden="true" />
            </div>

            <button
              type="button"
              className={`retro-radio__knob retro-radio__knob--tune ${tuneDetent ? "is-detent" : ""}`}
              aria-label="Tune station"
              aria-valuemin={0}
              aria-valuemax={Math.max(0, stations.length - 1)}
              aria-valuenow={stationIndex}
              onPointerDown={(event) =>
                beginDial(event, tuneGesture, tuneAngleRef.current)
              }
              onPointerMove={moveTune}
              onPointerUp={finishTune}
              onPointerCancel={(event) => cancelDial(event, tuneGesture)}
              onClick={handleTuneClick}
              onKeyDown={handleTuneKey}
            >
              <i />
            </button>
            <button
              type="button"
              className="retro-radio__knob retro-radio__knob--volume"
              aria-label="Volume and playback"
              aria-pressed={playing}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={volume}
              onPointerDown={(event) =>
                beginDial(event, volumeGesture, volumeAngle)
              }
              onPointerMove={moveVolume}
              onPointerUp={finishVolume}
              onPointerCancel={(event) => cancelDial(event, volumeGesture)}
              onClick={handleVolumeClick}
              onKeyDown={handleVolumeKey}
            >
              <i />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
