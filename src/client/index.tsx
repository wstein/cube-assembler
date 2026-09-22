import { render, h, Fragment } from 'preact'
import { useState, useEffect, useRef } from 'preact/hooks'
import { TwistyPlayer } from 'cubing/twisty'
import { captureAndProcessFace, captureAndProcessImage, extractCubeFaceColors, type ColorDetectionResult } from './imageProcessing'
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

// /api/apply-alg currently returns raw KPatternData (the ReScript
// kPatternDataToIR bridge is an unimplemented stub), not a usable cube
// state. Reject rather than silently corrupting `cube` with a non-cube
// object.
function extractCubeFromApplyAlgResult(result: any): any {
  if (result && result.cube && result.cube.u && result.cube.r) {
    return result.cube
  }
  throw new Error(
    'Applying algorithms is not fully implemented yet: the server returns raw ' +
    'kPatternData instead of face colors. The cube state was left unchanged.'
  )
}

const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B']

const STICKER_HEX: Record<string, string> = {
  W: '#ffffff', Y: '#ffd500', O: '#ff8c00', R: '#c41e3a', G: '#009e60', B: '#0051ba',
}

function confidenceTier(c: number): 'high' | 'medium' | 'low' {
  return c >= 0.8 ? 'high' : c >= 0.5 ? 'medium' : 'low'
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
  const [liveDetection, setLiveDetection] = useState<ColorDetectionResult | null>(null)
  const webcamRef = useRef<HTMLVideoElement>(null)
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null)

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

  // Live sticker-color preview: sample the video feed a few times a second
  // so the 3x3 grid overlay shows detected colors before the user commits
  // to a capture, instead of only finding out the result afterward.
  useEffect(() => {
    if (!webcamOpen) {
      setLiveDetection(null)
      return
    }

    if (!sampleCanvasRef.current) {
      sampleCanvasRef.current = document.createElement('canvas')
    }
    const canvas = sampleCanvasRef.current

    const intervalId = setInterval(() => {
      const video = webcamRef.current
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) return

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(video, 0, 0)
      try {
        setLiveDetection(extractCubeFaceColors(canvas))
      } catch {
        // Transient frame read failure (e.g. camera still warming up) — skip this tick.
      }
    }, 200)

    return () => clearInterval(intervalId)
  }, [webcamOpen])

  const twistyPlayerRef = useRef<TwistyPlayer | null>(null)

  useEffect(() => {
    const container = document.getElementById('twisty-player-container')
    if (!container) return

    const player = new TwistyPlayer({
      puzzle: `${puzzleSize}x${puzzleSize}x${puzzleSize}` as any,
      visualization: '3D',
      background: 'checkered',
      controlPanel: 'bottom-row',
      alg: algorithm || '',
      experimentalSetupAlg: scramble || '',
    })

    container.innerHTML = ''
    container.appendChild(player)
    twistyPlayerRef.current = player

    return () => {
      twistyPlayerRef.current = null
      container.innerHTML = ''
    }
  }, [puzzleSize])

  // TwistyPlayer visualizes puzzles via move sequences (alg /
  // experimentalSetupAlg), not arbitrary facelet colors — there's no API to
  // feed it an assembled cube state directly (that would need a solver to
  // find an equivalent setup alg). So the viewer reflects the entered
  // scramble/algorithm rather than the photo-captured/manual cube state.
  useEffect(() => {
    if (twistyPlayerRef.current) {
      twistyPlayerRef.current.experimentalSetupAlg = scramble || ''
    }
  }, [scramble])

  useEffect(() => {
    if (twistyPlayerRef.current) {
      twistyPlayerRef.current.alg = algorithm || ''
    }
  }, [algorithm])

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
      setCube(extractCubeFromApplyAlgResult(result))
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
      const newCube = extractCubeFromApplyAlgResult(result)
      setCube(newCube)
      await updateParityStatus(newCube)
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
      const newCube = extractCubeFromApplyAlgResult(result)
      setCube(newCube)
      await updateParityStatus(newCube)
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
    setCaptureMessage('')
    setWebcamOpen(true)
  }

  // Stores a capture result for `face`, assembles the cube once all 6 faces
  // are in, and otherwise auto-advances the modal to the next uncaptured
  // face so the user doesn't have to close/reopen it per face.
  const applyFaceCapture = async (
    face: string,
    result: { colors: string[][]; confidence: number }
  ) => {
    if (!validateFaceColors(result.colors)) {
      setCaptureMessage(`❌ Invalid colors detected. Confidence: ${(result.confidence * 100).toFixed(0)}%`)
      return
    }

    const newCapturedFaces = {
      ...capturedFaces,
      [face]: {
        colors: result.colors,
        confidence: result.confidence,
        timestamp: Date.now(),
      },
    }

    setCapturedFaces(newCapturedFaces)
    setFaceConfidence({ ...faceConfidence, [face]: result.confidence })
    setCaptureMessage(`✓ ${face} face captured (${(result.confidence * 100).toFixed(0)}% confidence)`)

    const allFacesCaptured = FACE_ORDER.every(f => f in newCapturedFaces)
    if (allFacesCaptured) {
      const faceData: Record<string, string[][]> = {}
      for (const [f, data] of Object.entries(newCapturedFaces)) {
        faceData[f] = (data as FaceCaptureData).colors
      }
      const cubeState = assembleCubeFromFaces(faceData)
      setCube(cubeState)
      await updateParityStatus(cubeState)
      setCaptureMessage('✓ All faces captured! Cube state ready.')
      setTimeout(() => setWebcamOpen(false), 1200)
    } else {
      const nextFace = FACE_ORDER.find(f => !(f in newCapturedFaces))
      if (nextFace) {
        setTimeout(() => {
          setWebcamFace(nextFace)
          setCaptureMessage('')
        }, 900)
      }
    }
  }

  const handleCapturePhoto = async () => {
    if (!webcamRef.current) return

    try {
      setLoading(true)
      setCaptureMessage('Processing image...')
      const result = captureAndProcessFace(webcamRef.current)
      await applyFaceCapture(webcamFace, result)
    } catch (err) {
      console.error('Capture error:', err)
      setCaptureMessage(`❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleImportImage = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    try {
      setLoading(true)
      setCaptureMessage('Processing image...')

      const url = URL.createObjectURL(file)
      try {
        const img = new Image()
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('Could not load image file'))
          img.src = url
        })
        const result = captureAndProcessImage(img)
        await applyFaceCapture(webcamFace, result)
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('Image import error:', err)
      setCaptureMessage(`❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
      input.value = ''
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
          {FACE_ORDER.map((face) => (
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
            <div class="capture-progress">
              <span class="capture-progress-label">
                Face {FACE_ORDER.indexOf(webcamFace) + 1} of {FACE_ORDER.length}
              </span>
              <div class="capture-progress-dots">
                {FACE_ORDER.map((face) => (
                  <span
                    key={face}
                    class={`progress-dot ${capturedFaces[face] ? 'done' : ''} ${face === webcamFace ? 'current' : ''}`}
                    title={`${face} face${capturedFaces[face] ? ' (captured)' : ''}`}
                  >
                    {face}
                  </span>
                ))}
              </div>
            </div>
            <div class="capture-video-wrapper">
              <video
                ref={webcamRef}
                autoplay
                muted
                playsinline
                class="webcam-feed"
              />
              {liveDetection && (
                <div class="capture-grid-overlay">
                  {liveDetection.colors.map((row, r) =>
                    row.map((color, c) => (
                      <div
                        key={`${r}-${c}`}
                        class={`capture-grid-cell confidence-${confidenceTier(liveDetection.cellConfidences[r][c])}`}
                      >
                        <span
                          class="capture-grid-swatch"
                          style={{ background: STICKER_HEX[color] || '#888' }}
                        />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <p>
              Align cube face in center
              {liveDetection && ` — live confidence: ${(liveDetection.confidence * 100).toFixed(0)}%`}
            </p>
            {captureMessage && (
              <div class={`capture-message ${captureMessage.includes('✓') ? 'success' : captureMessage.includes('❌') ? 'error' : ''}`}>
                {captureMessage}
              </div>
            )}
            <button
              class="btn btn-primary"
              onClick={handleCapturePhoto}
              disabled={loading}
            >
              {loading ? '⏳ Processing...' : 'Capture Photo'}
            </button>

            <label>Import from image file</label>
            <input type="file" accept="image/*" onChange={handleImportImage} disabled={loading} />
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