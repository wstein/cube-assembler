import { render, h, Fragment } from 'preact'
import { useState, useEffect, useRef } from 'preact/hooks'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CubeState {
  size: number
  captured: Record<string, boolean>
  colors?: Record<string, string[]>
}

interface AssemblyResult {
  type: 'start' | 'stage' | 'result' | 'error'
  total?: number
  stage?: string
  count?: number
  tested?: number
  states?: any[]
  message?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// API Calls
// ─────────────────────────────────────────────────────────────────────────────

async function generateScramble(size: number): Promise<string> {
  const res = await fetch(`/api/scramble?size=${size}`)
  const data = await res.json()
  return data.scramble || 'Failed to generate scramble'
}

async function applyAlgorithm(cube: any, alg: string): Promise<any> {
  const res = await fetch('/api/apply-alg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cube, alg }),
  })
  const data = await res.json()
  return data
}

async function checkParity(cube: any): Promise<any> {
  const res = await fetch('/api/parity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cube }),
  })
  return res.json()
}

function streamAssembly(faces: any, size: number): EventSource {
  return new EventSource(
    `/api/assemble?faces=${encodeURIComponent(JSON.stringify(faces))}&size=${size}`
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// App Component
// ─────────────────────────────────────────────────────────────────────────────

function App() {
  const [puzzleSize, setPuzzleSize] = useState(3)
  const [cube, setCube] = useState<any>(null)
  const [scramble, setScramble] = useState('')
  const [algorithm, setAlgorithm] = useState('')
  const [assemblyResults, setAssemblyResults] = useState<any[]>([])
  const [parity, setParity] = useState<any>(null)
  const [webcamOpen, setWebcamOpen] = useState(false)
  const [webcamFace, setWebcamFace] = useState('U')
  const [showExport, setShowExport] = useState(false)
  const webcamRef = useRef<HTMLVideoElement>(null)

  // ─────────────────────────────────────────────────────────────────────────
  // Webcam Capture
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!webcamOpen || !webcamRef.current) return

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (webcamRef.current) {
          webcamRef.current.srcObject = stream
        }
      })
      .catch((err) => console.error('Webcam error:', err))

    return () => {
      if (webcamRef.current?.srcObject) {
        (webcamRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop())
      }
    }
  }, [webcamOpen])

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Scramble Generation (#8)
  // ─────────────────────────────────────────────────────────────────────────

  const handleGenerateScramble = async () => {
    const newScramble = await generateScramble(puzzleSize)
    setScramble(newScramble)
  }

  const handleApplyScramble = async () => {
    if (!scramble || !cube) return
    const result = await applyAlgorithm(cube, scramble)
    setCube(result.cube || result)
    setScramble('')
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Algorithm Execution (#7)
  // ─────────────────────────────────────────────────────────────────────────

  const handleApplyAlgorithm = async () => {
    if (!algorithm || !cube) return
    const result = await applyAlgorithm(cube, algorithm)
    setCube(result.cube || result)
    await updateParityStatus(result.cube || result)
  }

  const handleInvertAlgorithm = async () => {
    if (!algorithm || !cube) return
    const inverted = algorithm
      .split(/\s+/)
      .map((m) => (m.endsWith("'") ? m.slice(0, -1) : m + "'"))
      .reverse()
      .join(' ')
    const result = await applyAlgorithm(cube, inverted)
    setCube(result.cube || result)
    await updateParityStatus(result.cube || result)
  }

  const handlePresetAlgorithm = (algo: string) => {
    setAlgorithm(algo)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Parity Validation (#10)
  // ─────────────────────────────────────────────────────────────────────────

  const updateParityStatus = async (cubeState: any) => {
    const result = await checkParity(cubeState)
    setParity(result)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: WRG Notation Parser (#5, #6 partial)
  // ─────────────────────────────────────────────────────────────────────────

  const handleParseWRG = async (notation: string) => {
    if (!notation.trim()) return
    const res = await fetch('/api/parse-wrg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notation, size: puzzleSize }),
    })
    const data = await res.json()
    if (data.cube) {
      setCube(data.cube)
      await updateParityStatus(data.cube)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Assembly Pipeline (#6)
  // ─────────────────────────────────────────────────────────────────────────

  const handleRunAssembly = async () => {
    if (!cube) return

    const eventSource = streamAssembly([cube.u, cube.r, cube.f, cube.d, cube.l, cube.b], puzzleSize)

    eventSource.onmessage = (e) => {
      const msg = JSON.parse(e.data) as AssemblyResult
      setAssemblyResults((prev) => [...prev, msg])

      if (msg.type === 'result' && msg.states && msg.states.length > 0) {
        setCube(msg.states[0])
        updateParityStatus(msg.states[0])
      }

      if (msg.type === 'error') {
        console.error('Assembly error:', msg.message)
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Face Capture Modal (#5)
  // ─────────────────────────────────────────────────────────────────────────

  const handleCaptureFace = (face: string) => {
    setWebcamFace(face)
    setWebcamOpen(true)
  }

  const handleCapturePhoto = () => {
    if (!webcamRef.current) return

    const canvas = document.createElement('canvas')
    canvas.width = webcamRef.current.videoWidth
    canvas.height = webcamRef.current.videoHeight
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(webcamRef.current, 0, 0)
      // TODO: Send to image processing pipeline for color extraction
      console.log('Photo captured for face:', webcamFace)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Copy to Clipboard (#11)
  // ─────────────────────────────────────────────────────────────────────────

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      alert('Copied to clipboard!')
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UI: Preset Algorithms
  // ─────────────────────────────────────────────────────────────────────────

  const presets = {
    Trigger: "R U R' U'",
    Sune: "R U R' U R U2 R'",
    Slices: "M' U M U2 M' U M",
    Rotations: "x y z",
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div id="app">
      {/* 3D Viewer (Placeholder for TwistyPlayer) - Finding #4 */}
      <div class="viewer-region">
        <h3>3D Cube Viewer</h3>
        <div class="viewer-canvas">
          TwistyPlayer integration coming soon...
          {cube && <span>Puzzle size: {puzzleSize}×{puzzleSize}</span>}
        </div>
      </div>

      {/* Right Panel: Algorithms & Results */}
      <aside class="panel panel-controls">
        <h2>WCA Notation</h2>
        <label>Algorithm</label>
        <input
          type="text"
          placeholder="R U R' U'  F' U F  ..."
          value={algorithm}
          onInput={(e) => setAlgorithm(e.currentTarget.value)}
        />

        <div class="algo-presets">
          {Object.entries(presets).map(([name, algo]) => (
            <button
              class="preset-btn"
              onClick={() => handlePresetAlgorithm(algo)}
              key={name}
            >
              {name}
            </button>
          ))}
        </div>

        <button class="btn btn-primary" onClick={handleApplyAlgorithm}>
          Apply Algorithm
        </button>
        <button class="btn btn-secondary" onClick={handleInvertAlgorithm}>
          Invert & Apply
        </button>

        <h2>Scramble</h2>
        <div class="scramble-display">{scramble || 'Press Generate to get a WCA scramble'}</div>
        <button class="btn btn-primary" onClick={handleGenerateScramble}>
          Generate WCA Scramble
        </button>
        <button class="btn btn-secondary" onClick={handleApplyScramble} disabled={!scramble || !cube}>
          Apply Scramble
        </button>

        <h2>Parity Status</h2>
        {parity ? (
          <>
            <div class={`status-line ${parity.valid ? 'success' : 'error'}`}>
              <span class={`status-dot ${parity.valid ? 'success' : 'error'}`}></span>
              {parity.result}
            </div>
            <div class="parity-checks">
              {Object.entries(parity.checks).map(([check, valid]: [string, any]) => (
                <div class="status-line" key={check}>
                  <span class={`status-dot ${valid ? 'success' : 'error'}`}></span>
                  {check}: {valid ? '✓' : '✗'}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div class="status-line">No cube loaded. Capture all 6 faces to validate.</div>
        )}

        <h2>URF / WRG Output</h2>
        <div class="tab-list">
          <button class="tab-btn active">WRG</button>
          <button class="tab-btn">URF</button>
          <button class="tab-btn">Flat</button>
        </div>
        <textarea readonly value={JSON.stringify(cube, null, 2)} />
        <button class="btn btn-primary" onClick={() => cube && copyToClipboard(JSON.stringify(cube))}>
          Copy to Clipboard
        </button>
      </aside>

      {/* Webcam Modal - Finding #5 */}
      {webcamOpen && (
        <div class="modal open">
          <div class="modal-content">
            <div class="modal-header">
              <h2>Capturing: {webcamFace} Face</h2>
              <button class="modal-close" onClick={() => setWebcamOpen(false)}>×</button>
            </div>
            <video
              ref={webcamRef}
              autoplay
              playsinline
              class="webcam-feed"
            />
            <p>Align cube face in center</p>
            <label>Import from image file</label>
            <input type="file" accept="image/*" />
            <button class="btn btn-primary" onClick={handleCapturePhoto}>
              Capture Photo
            </button>

            <h3>Manual Color Override</h3>
            <div class="color-palette">
              {['W', 'O', 'G', 'R', 'B', 'Y'].map((color) => (
                <button class="color-btn" key={color} style={{ background: color }} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Hydrate
// ─────────────────────────────────────────────────────────────────────────────

const app = document.querySelector('#app')
if (app) {
  render(<App />, app)
}