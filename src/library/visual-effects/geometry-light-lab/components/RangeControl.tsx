type RangeControlProps = {
  label: string
  value: number
  min: number
  max: number
  suffix: string
  onChange: (value: number) => void
}

export function RangeControl({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: RangeControlProps) {
  return (
    <label className="geometry-range">
      <span>{label}<em>{value}{suffix}</em></span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}
