// Controls for one setting each on the settings page: a switch, a slider
// with its value, or a choice between a few options.
import type { ComponentChildren } from 'preact'

export function ToggleSetting({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: ComponentChildren
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label class="settings-row settings-toggle">
      <span class="settings-label">
        {label}
        {hint && <span class="settings-muted">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    </label>
  )
}

export function SliderSetting({
  label,
  hint,
  min,
  max,
  step,
  value,
  unit,
  onChange,
}: {
  label: string
  hint?: ComponentChildren
  min: number
  max: number
  step: number
  value: number
  unit: string
  onChange: (value: number) => void
}) {
  return (
    <label class="settings-row settings-slider">
      <span class="settings-label">
        {label}
        {hint && <span class="settings-muted">{hint}</span>}
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(e) => onChange(Number(e.currentTarget.value))}
      />
      <output>
        {value}
        {unit}
      </output>
    </label>
  )
}

export function ChoiceSetting<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string
  hint?: ComponentChildren
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <label class="settings-row settings-choice">
      <span class="settings-label">
        {label}
        {hint && <span class="settings-muted">{hint}</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.currentTarget.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
