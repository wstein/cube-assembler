import { useMemo, useState } from 'preact/hooks'
import type { CubeState } from '../cube/cubeAssembly'
import {
  toURFFacelets,
  toWRGFacelets,
} from '../cube/notation/NotationOutput.gen'
import { encodeOrbit64State } from '../cube/notation/orbit64'

type NotationFormat = 'wrg' | 'urf'
type CopyStatus =
  | 'idle'
  | 'facelets-copied'
  | 'facelets-failed'
  | 'token-copied'
  | 'token-failed'

interface NotationCardProps {
  cube: CubeState | null
  canSaveFixture: boolean
  size: number
  format: NotationFormat
  loading: boolean
  fixtureSaveMessage: string
  onFormatChange: (format: NotationFormat) => void
  onSaveFixture: () => void
}

export function NotationCard({
  cube,
  canSaveFixture,
  size,
  format,
  loading,
  fixtureSaveMessage,
  onFormatChange,
  onSaveFixture,
}: NotationCardProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const facelets = cube
    ? format === 'wrg'
      ? toWRGFacelets(cube)
      : toURFFacelets(cube)
    : ''
  const orbit64Token = useMemo(
    () => (cube && size <= 7 ? encodeOrbit64State(toURFFacelets(cube)) : null),
    [cube, size],
  )
  const copyToClipboard = async (
    value: string,
    target: 'facelets' | 'token',
  ) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopyStatus(`${target}-copied`)
    } catch (error) {
      console.error('Copy failed:', error)
      setCopyStatus(`${target}-failed`)
    }
    setTimeout(() => setCopyStatus('idle'), 1500)
  }

  return (
    <section class="card notation-card">
      <div class="card-header">
        <h2>Notation</h2>
        <div class="segmented" role="group" aria-label="Notation format">
          <button
            type="button"
            class={format === 'wrg' ? 'active' : ''}
            aria-pressed={format === 'wrg'}
            onClick={() => onFormatChange('wrg')}
          >
            Colors (WRG)
          </button>
          <button
            type="button"
            class={format === 'urf' ? 'active' : ''}
            aria-pressed={format === 'urf'}
            onClick={() => onFormatChange('urf')}
          >
            Faces (URF)
          </button>
        </div>
        <div class="header-spacer" />
        {canSaveFixture && (
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            onClick={onSaveFixture}
            disabled={loading}
            title="Download this capture's photos + reviewed colors as a zip - unzipped into test/fixtures/ it becomes a regression test"
          >
            Save as test fixture
          </button>
        )}
        <button
          type="button"
          class="btn btn-primary btn-sm"
          onClick={() => cube && copyToClipboard(facelets, 'facelets')}
          disabled={!cube}
        >
          <span aria-live="polite">
            {copyStatus === 'facelets-copied'
              ? '✓ Copied'
              : copyStatus === 'facelets-failed'
                ? 'Copy failed'
                : 'Copy'}
          </span>
        </button>
      </div>
      <textarea
        class="notation-output"
        readOnly
        aria-label="Notation"
        value={facelets}
      />
      {orbit64Token && (
        <div class="orbit64-token-row">
          <span>
            Orbit64 state token: <code>{orbit64Token}</code>
          </span>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            onClick={() => copyToClipboard(orbit64Token, 'token')}
          >
            <span aria-live="polite">
              {copyStatus === 'token-copied'
                ? '✓ Copied'
                : copyStatus === 'token-failed'
                  ? 'Copy failed'
                  : 'Copy token'}
            </span>
          </button>
        </div>
      )}
      {cube && !orbit64Token && (
        <p class="notation-hint">
          Orbit64 token unavailable until the facelets form a valid cube state.
        </p>
      )}
      <p class="notation-hint">
        {format === 'wrg'
          ? `6 blocks of ${size * size} colors (W O G R B Y) in U R F D L B order.`
          : `6 blocks of ${size * size} face letters (U R F D L B) in U R F D L B order.`}
      </p>
      {fixtureSaveMessage && (
        <div
          role="status"
          class={`capture-message ${fixtureSaveMessage.includes('✓') ? 'success' : fixtureSaveMessage.includes('❌') ? 'error' : ''}`}
        >
          {fixtureSaveMessage}
        </div>
      )}
    </section>
  )
}
