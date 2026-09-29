// The Colors tab of the profiles page: compare saved sticker color profiles,
// delete them, merge the ones that only differ by room light, and try two
// profiles on the last capture. The sections live in their own files; all
// grouping and merging logic lives in colorProfileReview.ts.
import { useState } from 'preact/hooks'
import {
  AdvancedSection,
  PairsSection,
  SplitSection,
} from './colorCompareSections'
import { SimilarProfilesSection } from './colorGroupsSection'
import { whiteBalancedColors, type ReviewFace } from './colorProfileReview'
import { ProfilesTableSection } from './colorProfilesTable'
import { TryOnSection } from './colorTryOnSection'
import {
  AUTO_COLORS_ID,
  allColorProfiles,
  builtinColorProfiles,
  type ColorProfile,
  type ProfileSettings,
} from './profileSettings'

export interface ReviewCapture {
  // Per face in capture order: reviewed colors and measured sticker colors.
  faces: ReviewFace[]
}

interface Props {
  settings: ProfileSettings
  onChange: (settings: ProfileSettings) => void
  capture: ReviewCapture | null
}

export function ColorReviewTab({ settings, onChange, capture }: Props) {
  // Automatic isn't a palette of its own; the JSON palettes are references.
  const profiles = allColorProfiles(settings).filter(
    (profile) => profile.id !== AUTO_COLORS_ID,
  )
  const saved = settings.colors
  // A starts on the profile in use, B on the first other saved one.
  const [a, setA] = useState(() =>
    settings.activeColorsId !== AUTO_COLORS_ID
      ? settings.activeColorsId
      : builtinColorProfiles()[0].id,
  )
  const [b, setB] = useState(
    () =>
      saved.find((p) => p.id !== a)?.id ??
      builtinColorProfiles().find((p) => p.id !== a)!.id,
  )
  const [balanced, setBalanced] = useState(true)
  const [undo, setUndo] = useState<ProfileSettings[]>([])
  const [message, setMessage] = useState('')

  const byId = (id: string) =>
    profiles.find((profile) => profile.id === id) ?? profiles[0]
  const shown = (profile: ColorProfile) =>
    balanced ? whiteBalancedColors(profile.colors) : profile.colors
  const A = byId(a),
    B = byId(b)
  const colorsA = shown(A),
    colorsB = shown(B)

  const undoLast = () => {
    const previous = undo[undo.length - 1]
    setUndo(undo.slice(0, -1))
    onChange(previous)
    setMessage('Undone.')
  }
  const status = (
    <div class="color-review-toolbar">
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        disabled={undo.length === 0}
        onClick={undoLast}
      >
        Undo last change
      </button>
      {message && (
        <span
          role="status"
          class={`color-review-message ${message.startsWith('❌') ? 'error' : ''}`}
        >
          {message}
        </span>
      )}
    </div>
  )
  const commit = (next: ProfileSettings, text: string) => {
    setUndo([...undo, settings])
    onChange(next)
    setMessage(text)
  }
  return (
    <>
      <div
        class="color-review-picker card"
        role="group"
        aria-label="Profiles to compare"
      >
        <label for="review-a">
          <span>
            <span class="color-review-badge a">A</span>Profile
          </span>
          <select
            id="review-a"
            value={A.id}
            onChange={(e) => setA(e.currentTarget.value)}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label for="review-b">
          <span>
            <span class="color-review-badge b">B</span>Profile
          </span>
          <select
            id="review-b"
            value={B.id}
            onChange={(e) => setB(e.currentTarget.value)}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          onClick={() => {
            setA(B.id)
            setB(A.id)
          }}
        >
          Swap A and B
        </button>
        <label class="color-review-check" for="review-balanced">
          <input
            type="checkbox"
            id="review-balanced"
            checked={balanced}
            onChange={(e) => setBalanced(e.currentTarget.checked)}
          />
          White-balanced (lighting removed)
        </label>
      </div>

      <SimilarProfilesSection
        settings={settings}
        status={status}
        commit={commit}
        setMessage={setMessage}
        onMerged={(ids, id) => {
          if (ids.includes(a)) setA(id)
          if (ids.includes(b)) setB(id)
        }}
        onCompare={(first, second) => {
          setA(first)
          setB(second)
        }}
      />

      <ProfilesTableSection
        settings={settings}
        profiles={profiles}
        shown={shown}
        aId={A.id}
        bId={B.id}
        status={status}
        commit={commit}
        setMessage={setMessage}
      />

      <SplitSection colorsA={colorsA} colorsB={colorsB} />

      <PairsSection A={A} B={B} shown={shown} />

      <TryOnSection
        capture={capture}
        balanced={balanced}
        A={A}
        B={B}
        colorsA={colorsA}
        colorsB={colorsB}
      />

      <AdvancedSection
        profiles={profiles}
        colorsA={colorsA}
        colorsB={colorsB}
      />
    </>
  )
}
