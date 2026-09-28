// Controls for one setting each on the settings page: a switch, a slider
// with its value, or a choice between a few options.
import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'

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

// A text field saved once it reads as valid; `check` returns the value to
// save, or null to show `invalid` instead.
export function TextSetting({
  label,
  hint,
  value,
  placeholder,
  invalid,
  check,
  onChange,
}: {
  label: string
  hint?: ComponentChildren
  value: string
  placeholder?: string
  invalid: string
  check: (text: string) => string | null
  onChange: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState(false)
  const save = () => {
    const checked = check(draft)
    setError(checked === null)
    if (checked !== null) {
      setDraft(checked)
      if (checked !== value) onChange(checked)
    }
  }
  return (
    <label class="settings-row settings-text">
      <span class="settings-label">
        {label}
        {hint && <span class="settings-muted">{hint}</span>}
        {error && (
          <span class="settings-error" role="alert">
            {invalid}
          </span>
        )}
      </span>
      <input
        type="text"
        inputMode="url"
        spellcheck={false}
        placeholder={placeholder}
        value={draft}
        aria-invalid={error}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
        }}
      />
    </label>
  )
}
