export interface VinylDeckBackgroundProps {
  controls?: boolean
  shadowAngle?: number
  onShadowAngleChange?: (angle: number) => void
  onAudioFileChange?: (file: File) => void
  onAudioFilesChange?: (files: File[]) => void
}

export function VinylDeckBackground({
  controls = false,
  shadowAngle = 90,
  onShadowAngleChange,
  onAudioFileChange,
  onAudioFilesChange,
}: VinylDeckBackgroundProps) {
  return (
    <>
      <div className="vinyl-deck__background" aria-hidden="true">
        <i className="vinyl-deck__background-grid" />
        <i className="vinyl-deck__background-axis" />
      </div>
      {controls && (
        <div
          className="vinyl-deck__background-controls"
          role="group"
          aria-label="Deck environment controls"
        >
          <label className="vinyl-deck__file-control">
            <span>Load audio</span>
            <input
              type="file"
              accept="audio/*"
              multiple
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? [])
                if (!files.length) return
                onAudioFilesChange?.(files)
                onAudioFileChange?.(files[0])
              }}
            />
          </label>
          <label className="vinyl-deck__angle-control">
            <span>Shadow {Math.round(shadowAngle)}°</span>
            <input
              type="range"
              min="0"
              max="359"
              value={shadowAngle}
              onInput={(event) => onShadowAngleChange?.(Number(event.currentTarget.value))}
            />
          </label>
        </div>
      )}
    </>
  )
}
