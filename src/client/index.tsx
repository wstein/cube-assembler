import { render, h, Fragment } from 'preact'
import { useState, useEffect, useRef } from 'preact/hooks'
import { captureAndProcessFace } from './imageProcessing'
import { assembleCubeFromFaces, validateFaceColors, createSolvedCube, parseColorInput, toCubeIR } from './cubeAssembly'
import { notationForFormat, toURFFacelets, fromURFFacelets } from './notationOutput'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CubeState {
  size: number
  captured: Record<string, boolean>
  colors?: Record<string, string[]>
}

interface FaceCaptureData {
  colors: string[][]
  confidence: number
  timestamp: number
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

async function applyAlgorithm(cube: any, alg: string, size: number): Promise<any> {
  const res = await fetch('/api/apply-alg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cube: toCubeIR(cube, size), alg }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Apply algorithm failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return res.json()
}

async function checkParity(cube: any, size: number): Promise<any> {
  const res = await fetch('/api/parity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cube: toCubeIR(cube, size) }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Parity check failed (${res.status}): ${text.slice(0, 200)}`)
  }
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
  const [capturedFaces, setCapturedFaces] = useState<Record<string, FaceCaptureData>>({})
  const [faceConfidence, setFaceConfidence] = useState<Record<string, number>>({})
  const [activeTab, setActiveTab] = useState('WRG')
  const [loading, setLoading] = useState(false)
  const [captureMessage, setCaptureMessage] = useState('')
  const [manualColorInput, setManualColorInput] = useState('')
  const [showColorInput, setShowColorInput] = useState(false)
  const [inputMode, setInputMode] = useState<'colors' | 'facelets'>('colors')
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

  useEffect(() => {
    const container = document.getElementById('twisty-player-container')
    if (!container) return

    try {
      const player = document.createElement('twisty-player')
      player.setAttribute('visualization', 'side-by-side')
      player.setAttribute('background', 'checkered')
      player.setAttribute('control-panel', 'bottom-row')

      if (cube) {
        try {
          const cubeStr = JSON.stringify(cube)
          player.setAttribute('cube-state', cubeStr)
        } catch (e) {
          console.warn('Could not serialize cube state for TwistyPlayer', e)
        }
      } else {
        player.setAttribute('setup-anchor', 'start')
        player.textContent = `R U R' U' R U R' U'`
      }

      container.innerHTML = ''
      container.appendChild(player)
    } catch (e) {
      console.warn('TwistyPlayer initialization failed:', e)
      container.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--color-text-secondary); background: var(--color-bg-secondary); border-radius: 8px;">
        <p style="margin: 0;">3D Cube Viewer</p>
        <p style="margin: 0.5rem 0 0; font-size: 0.9rem;">TwistyPlayer ready</p>
        ${cube ? `<p style="margin-top: 0.5rem; font-size: 0.85rem;">Puzzle: ${puzzleSize}×${puzzleSize}</p>` : ''}
      </div>`
    }
  }, [cube, puzzleSize])

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Scramble Generation (#8)
  // ─────────────────────────────────────────────────────────────────────────

  const handleGenerateScramble = async () => {
    setLoading(true)
    try {
      const newScramble = await generateScramble(puzzleSize)
      setScramble(newScramble)
    } finally {
      setLoading(false)
    }
  }

  const handleApplyScramble = async () => {
    if (!scramble || !cube) return
    setLoading(true)
    try {
      const result = await applyAlgorithm(cube, scramble, puzzleSize)
      setCube(result.cube || result)
      setScramble('')
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Algorithm Execution (#7)
  // ─────────────────────────────────────────────────────────────────────────

  const handleApplyAlgorithm = async () => {
    if (!algorithm || !cube) return
    setLoading(true)
    try {
      const result = await applyAlgorithm(cube, algorithm, puzzleSize)
      setCube(result.cube || result)
      await updateParityStatus(result.cube || result)
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleInvertAlgorithm = async () => {
    if (!algorithm || !cube) return
    setLoading(true)
    try {
      const inverted = algorithm
        .split(/\s+/)
        .map((m) => (m.endsWith("'") ? m.slice(0, -1) : m + "'"))
        .reverse()
        .join(' ')
      const result = await applyAlgorithm(cube, inverted, puzzleSize)
      setCube(result.cube || result)
      await updateParityStatus(result.cube || result)
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handlePresetAlgorithm = (algo: string) => {
    setAlgorithm(algo)
  }

  const handleApplySolved = async () => {
    const solved = createSolvedCube()
    setCube(solved)
    setCapturedFaces({
      U: { colors: [['W','W','W'],['W','W','W'],['W','W','W']], confidence: 1.0, timestamp: Date.now() },
      R: { colors: [['R','R','R'],['R','R','R'],['R','R','R']], confidence: 1.0, timestamp: Date.now() },
      F: { colors: [['G','G','G'],['G','G','G'],['G','G','G']], confidence: 1.0, timestamp: Date.now() },
      D: { colors: [['Y','Y','Y'],['Y','Y','Y'],['Y','Y','Y']], confidence: 1.0, timestamp: Date.now() },
      L: { colors: [['O','O','O'],['O','O','O'],['O','O','O']], confidence: 1.0, timestamp: Date.now() },
      B: { colors: [['B','B','B'],['B','B','B'],['B','B','B']], confidence: 1.0, timestamp: Date.now() },
    })
    await updateParityStatus(solved)
  }

  const handleApplyColorInput = async () => {
    if (!manualColorInput.trim()) {
      alert('Please enter color data')
      return
    }

    setLoading(true)
    try {
      const faceData = parseColorInput(manualColorInput)
      if (!faceData) {
        alert('Invalid format!\n\nRequired: All 6 faces (U, R, F, D, L, B)\nEach face: exactly 9 colors (W, Y, O, R, G, B)\nValid colors: W, Y, O, R, G, B\n\nAccepted formats:\n\n1) Compact (no spaces between colors):\nU:WWWWWWWWW R:RRRRRRRRR F:GGGGGGGGG D:YYYYYYYYY L:OOOOOOOOO B:BBBBBBBBB\n\n2) Spaced (spaces between colors):\nU W W W W W W W W W\nR R R R R R R R R\nF G G G G G G G G\nD Y Y Y Y Y Y Y Y\nL O O O O O O O O\nB B B B B B B B B')
        return
      }

      const newCube = assembleCubeFromFaces(faceData)
      setCube(newCube)

      const newCapturedFaces: Record<string, FaceCaptureData> = {}
      for (const [face, colors] of Object.entries(faceData)) {
        newCapturedFaces[face] = { colors, confidence: 1.0, timestamp: Date.now() }
      }
      setCapturedFaces(newCapturedFaces)

      await updateParityStatus(newCube)
      setManualColorInput('')
      setShowColorInput(false)
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleApplyURFFacelets = async () => {
    if (!manualColorInput.trim()) {
      alert('Please enter URF facelets string')
      return
    }

    setLoading(true)
    try {
      const newCube = fromURFFacelets(manualColorInput.toUpperCase())
      if (!newCube) {
        alert('Invalid URF facelets. Must be 54 characters (WROGBY colors only)')
        return
      }

      setCube(newCube)
      await updateParityStatus(newCube)
      setManualColorInput('')
      setShowColorInput(false)
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Features: Parity Validation (#10)
  // ─────────────────────────────────────────────────────────────────────────

  const updateParityStatus = async (cubeState: any) => {
    try {
      const result = await checkParity(cubeState, puzzleSize)
      setParity(result)
    } catch (err) {
      console.error('Parity check error:', err)
      setParity({
        valid: false,
        result: err instanceof Error ? err.message : 'Parity check failed',
        checks: {},
      })
    }
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

  const handleCapturePhoto = async () => {
    if (!webcamRef.current) return

    try {
      setLoading(true)
      setCaptureMessage('Processing image...')

      const result = captureAndProcessFace(webcamRef.current)

      if (!validateFaceColors(result.colors)) {
        setCaptureMessage(`❌ Invalid colors detected. Confidence: ${(result.confidence * 100).toFixed(0)}%`)
        return
      }

      const newCapturedFaces = {
        ...capturedFaces,
        [webcamFace]: {
          colors: result.colors,
          confidence: result.confidence,
          timestamp: Date.now(),
        },
      }

      setCapturedFaces(newCapturedFaces)
      setFaceConfidence({ ...faceConfidence, [webcamFace]: result.confidence })

      setCaptureMessage(`✓ ${webcamFace} face captured (${(result.confidence * 100).toFixed(0)}% confidence)`)

      // Try to assemble cube if all 6 faces are captured
      const allFacesCaptured = ['U', 'R', 'F', 'D', 'L', 'B'].every(f => f in newCapturedFaces)
      if (allFacesCaptured) {
        const faceData: Record<string, string[][]> = {}
        for (const [face, data] of Object.entries(newCapturedFaces)) {
          faceData[face] = (data as FaceCaptureData).colors
        }
        const cubeState = assembleCubeFromFaces(faceData)
        setCube(cubeState)
        await updateParityStatus(cubeState)
        setCaptureMessage('✓ All faces captured! Cube state ready.')
        setTimeout(() => setWebcamOpen(false), 1500)
      }
    } catch (err) {
      console.error('Capture error:', err)
      setCaptureMessage(`❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
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

  const getTabContent = () => {
    if (!cube) return 'null'
    if (activeTab === 'Facelets') return toURFFacelets(cube)
    return notationForFormat(cube, activeTab)
  }

  return (
    <div id="app">
      {/* Header */}
      <header class="app-header">
        <div class="header-content">
          <h1>CubeAssembler</h1>
          <p>Assemble, validate, and solve Rubik's Cubes from face photos</p>
        </div>
      </header>

      {/* 3D Viewer */}
      <div class="viewer-region">
        <div class="viewer-controls">
          <h3>Puzzle Size</h3>
          <div class="size-selector">
            {[2, 3, 4, 5, 6, 7].map((size) => (
              <button
                key={size}
                class={`size-btn ${puzzleSize === size ? 'active' : ''}`}
                onClick={() => setPuzzleSize(size)}
              >
                {size}×{size}
              </button>
            ))}
          </div>
        </div>
        <div class="viewer-canvas">
          <div id="twisty-player-container" style={{ width: '100%', height: '100%' }}></div>
          {!cube && <div class="placeholder-text">Capture faces to load cube state</div>}
        </div>
      </div>

      {/* Face Capture Panel */}
      <section class="face-capture-panel">
        <div class="face-capture-header">
          <h2>Capture Cube Faces</h2>
          <div class="face-capture-actions">
            <button class="btn btn-secondary btn-sm" onClick={handleApplySolved}>
              Reset to Solved
            </button>
            <button class="btn btn-secondary btn-sm" onClick={() => setShowColorInput(!showColorInput)}>
              {showColorInput ? '✕ Close' : '+ Manual Input'}
            </button>
          </div>
        </div>
        <div class="face-grid">
          {['U', 'R', 'F', 'D', 'L', 'B'].map((face) => (
            <button
              key={face}
              class={`face-btn ${capturedFaces[face] ? 'captured' : ''}`}
              onClick={() => handleCaptureFace(face)}
              title={capturedFaces[face] ? `${face} face captured` : `Capture ${face} face`}
            >
              <span class="face-label">{face}</span>
              {capturedFaces[face] && <span class="face-check">✓</span>}
            </button>
          ))}
        </div>
        {showColorInput && (
          <div class="color-input-panel">
            <div class="input-tabs">
              <button
                class={`input-tab-btn ${inputMode === 'colors' ? 'active' : ''}`}
                onClick={() => setInputMode('colors')}
              >
                Face Colors
              </button>
              <button
                class={`input-tab-btn ${inputMode === 'facelets' ? 'active' : ''}`}
                onClick={() => setInputMode('facelets')}
              >
                URF Facelets
              </button>
            </div>
            <label>
              {inputMode === 'colors'
                ? 'Enter face colors (compact: "U:WWWWWWWWW R:RRRRRRRRR ..." or spaced: "U W W W ...")'
                : 'Enter 54-character URF facelets string (e.g., "WWWWWWWWWRRRRRRRRR...")'}
            </label>
            <textarea
              value={manualColorInput}
              onInput={(e) => setManualColorInput(e.currentTarget.value)}
              placeholder={inputMode === 'colors'
                ? 'U:WWWWWWWWW R:RRRRRRRRR F:GGGGGGGGG D:YYYYYYYYY L:OOOOOOOOO B:BBBBBBBBB'
                : 'WWWWWWWWWRRRRRRRRRGGGGGGGGGYYYYYYYYYYOOOOOOOOOBBBBBBBBBB'}
              rows={6}
              style={{ width: '100%', marginTop: '0.5rem' }}
            />
            <div class="input-actions">
              <button
                class="btn btn-primary btn-sm"
                onClick={inputMode === 'colors' ? handleApplyColorInput : handleApplyURFFacelets}
                disabled={loading}
              >
                {loading ? '⏳ Processing...' : `Apply ${inputMode === 'colors' ? 'Colors' : 'Facelets'}`}
              </button>
            </div>
          </div>
        )}
      </section>

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

        <button class="btn btn-primary" onClick={handleApplyAlgorithm} disabled={loading || !cube}>
          {loading ? '⏳ Applying...' : 'Apply Algorithm'}
        </button>
        <button class="btn btn-secondary" onClick={handleInvertAlgorithm} disabled={loading || !cube}>
          {loading ? '⏳ Inverting...' : 'Invert & Apply'}
        </button>

        <h2>Scramble</h2>
        <div class="scramble-display">{scramble || 'Press Generate to get a WCA scramble'}</div>
        <button class="btn btn-primary" onClick={handleGenerateScramble} disabled={loading}>
          {loading ? '⏳ Generating...' : 'Generate WCA Scramble'}
        </button>
        <button class="btn btn-secondary" onClick={handleApplyScramble} disabled={loading || !scramble || !cube}>
          {loading ? '⏳ Applying...' : 'Apply Scramble'}
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

        <h2>Notation Output</h2>
        <div class="tab-list">
          {['WRG', 'URF', 'Flat', 'Facelets'].map((tab) => (
            <button
              key={tab}
              class={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <textarea readonly value={getTabContent()} />
        <button class="btn btn-primary" onClick={() => cube && copyToClipboard(getTabContent())}>
          Copy to Clipboard
        </button>
      </aside>

      {/* Webcam Modal */}
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
            {captureMessage && (
              <div class={`capture-message ${captureMessage.includes('✓') ? 'success' : captureMessage.includes('❌') ? 'error' : ''}`}>
                {captureMessage}
              </div>
            )}
            <label>Import from image file</label>
            <input type="file" accept="image/*" />
            <button
              class="btn btn-primary"
              onClick={handleCapturePhoto}
              disabled={loading}
            >
              {loading ? '⏳ Processing...' : 'Capture Photo'}
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