import { useEffect, useState } from 'preact/hooks'
import type { FixtureDownloadData } from './fixtureDownloadDialog'
import {
  fixtureUploadBase,
  fixtureUploadServerAvailable,
  pollsFixtureUploadServer,
  uploadFixtureToDevServer,
} from './fixtureUpload'
import {
  FIXTURE_SERVER_COOKIE,
  preferenceCookie,
  readPreference,
} from './preferences'

export function useFixtureDownload() {
  const [fixtureSaveMessage, setFixtureSaveMessage] = useState('')
  const [fixtureUploadMessage, setFixtureUploadMessage] = useState('')
  const [fixtureUploading, setFixtureUploading] = useState(false)
  const [fixtureServerReachable, setFixtureServerReachable] = useState(false)
  const [fixtureServerChecked, setFixtureServerChecked] = useState(false)
  const [fixtureDownload, setFixtureDownload] =
    useState<FixtureDownloadData | null>(null)
  const fixtureUploadUrl = fixtureUploadBase(import.meta.env.DEV)
  const fixtureServerPolling = pollsFixtureUploadServer(
    import.meta.env.DEV,
    readPreference(document.cookie, FIXTURE_SERVER_COOKIE),
  )

  useEffect(() => {
    if (!fixtureDownload || !fixtureServerPolling) return
    let active = true
    let checking = false
    const controller = new AbortController()
    const check = async () => {
      if (checking) return
      checking = true
      const reachable = await fixtureUploadServerAvailable(
        fetch,
        controller.signal,
        fixtureUploadUrl,
      )
      checking = false
      if (active) {
        setFixtureServerReachable(reachable)
        setFixtureServerChecked(true)
      }
    }
    setFixtureServerReachable(false)
    setFixtureServerChecked(false)
    void check()
    const timer = setInterval(() => void check(), 3000)
    return () => {
      active = false
      controller.abort()
      clearInterval(timer)
    }
  }, [fixtureDownload])

  const closeFixtureDownload = () => {
    fixtureDownload?.photoUrls.forEach((url) => URL.revokeObjectURL(url))
    setFixtureDownload(null)
    setFixtureUploadMessage('')
  }

  const uploadFixture = async () => {
    if (!fixtureDownload || fixtureUploading) return
    // The published app checks on the click until the first successful upload.
    if (!fixtureServerReachable && fixtureServerChecked) return
    setFixtureUploading(true)
    setFixtureUploadMessage('')
    try {
      if (
        !fixtureServerChecked &&
        !(await fixtureUploadServerAvailable(
          fetch,
          undefined,
          fixtureUploadUrl,
        ))
      ) {
        throw new Error(
          'No fixture server on 127.0.0.1:7100. Start it with npm run fixture:server.',
        )
      }
      await uploadFixtureToDevServer(
        fixtureDownload.fixture,
        fetch,
        fixtureUploadUrl,
      )
      if (!import.meta.env.DEV)
        document.cookie = preferenceCookie(FIXTURE_SERVER_COOKIE, true)
      setFixtureSaveMessage(`✓ Saved ${fixtureDownload.name} to test/fixtures/`)
      closeFixtureDownload()
    } catch (error) {
      setFixtureUploadMessage(
        `❌ ${error instanceof Error ? error.message : String(error)}`,
      )
      if (fixtureServerChecked)
        void fixtureUploadServerAvailable(
          fetch,
          undefined,
          fixtureUploadUrl,
        ).then(setFixtureServerReachable)
    } finally {
      setFixtureUploading(false)
    }
  }

  const downloadFixture = () => {
    if (!fixtureDownload) return
    const url = URL.createObjectURL(
      new Blob([fixtureDownload.zip as BlobPart], { type: 'application/zip' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `${fixtureDownload.name}.zip`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    setFixtureSaveMessage(
      `✓ Downloaded ${fixtureDownload.name}.zip - unzip it into test/fixtures/ to add it to the tests`,
    )
    closeFixtureDownload()
  }

  return {
    fixtureSaveMessage,
    setFixtureSaveMessage,
    fixtureUploadMessage,
    fixtureUploading,
    fixtureServerReachable,
    fixtureServerChecked,
    fixtureServerPolling,
    fixtureDownload,
    setFixtureDownload,
    closeFixtureDownload,
    uploadFixture,
    downloadFixture,
  }
}
