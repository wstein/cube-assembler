import { useEffect, useRef, useState } from 'preact/hooks'

export interface CameraInfo {
  label: string
  requested: MediaTrackConstraints
  granted: Partial<MediaTrackSettings>
  supported: Partial<MediaTrackCapabilities> | null
}

// A webcam without explicit size constraints often opens at 640x480, leaving
// too few pixels per sticker on larger cubes. "ideal" still allows a camera
// with lower resolution to open at its best supported size.
const CAMERA_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: 'environment',
  width: { ideal: 1920 },
  height: { ideal: 1080 },
}

// Device and group ids identify hardware but do not describe the capture.
export function withoutDeviceIds<
  T extends { deviceId?: unknown; groupId?: unknown },
>(info: T): Omit<T, 'deviceId' | 'groupId'> {
  const { deviceId: _deviceId, groupId: _groupId, ...rest } = info
  return rest
}

export function useCameraStream(open: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [cameraInfo, setCameraInfo] = useState<CameraInfo | null>(null)

  useEffect(() => {
    if (!open || !videoRef.current) return

    // Hold the stream locally: the video unmounts before cleanup when the
    // dialog closes, and a pending permission request may finish afterward.
    let stream: MediaStream | null = null
    let closed = false
    navigator.mediaDevices
      .getUserMedia({ video: CAMERA_CONSTRAINTS })
      .then((opened) => {
        if (closed) {
          opened.getTracks().forEach((track) => track.stop())
          return
        }
        stream = opened
        if (videoRef.current) videoRef.current.srcObject = stream
        const track = stream.getVideoTracks()[0]
        if (track) {
          setCameraInfo({
            label: track.label || 'Unknown camera',
            requested: CAMERA_CONSTRAINTS,
            granted: withoutDeviceIds(track.getSettings()),
            supported: track.getCapabilities
              ? withoutDeviceIds(track.getCapabilities())
              : null,
          })
        }
      })
      .catch((error) => console.error('Webcam error:', error))

    return () => {
      closed = true
      stream?.getTracks().forEach((track) => track.stop())
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [open])

  return { videoRef, cameraInfo }
}
