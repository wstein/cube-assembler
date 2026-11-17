import { CapturePhotoBinding } from '../../src/client/capture/photoProvenance'
import { ExplicitCaptureRecoveryDialog } from '../../src/client/capture/explicitCaptureRecoveryDialog'
import { STICKER_HEX } from '../../src/client/vision/stickerDisplay'
import { h, render } from 'preact'
import { Recovery } from '@puzlwerk/capture-recovery'
import { useExplicitCaptureRecovery } from '../../src/client/capture/useExplicitCaptureRecovery'
import type { CapturedPhotos } from '../../src/client/capture/recoverySearchAdapter'

// Browser integration harness only: exercises the real hook and checker while
// observing its external atomic install callback, which the DOM cannot count.
export function recoveryDriver(
  faces: CapturedPhotos,
  options: {
    retake?: boolean
    budget?: number
    dialog?: boolean
    rejectInstall?: boolean
  } = {},
) {
  const authority = new CapturePhotoBinding()
  authority.update(faces, 4)
  if (options.retake) {
    const original = faces.U.photoIdentity!
    faces = {
      ...faces,
      U: {
        ...faces.U,
        photoIdentity: { ...original, photoId: `${original.photoId}-retaken` },
      },
    }
    authority.update(faces, 4)
  }
  const root = document.createElement('div')
  document.body.append(root)
  const commits: Recovery.confirmation[] = []
  let rememberedUse: (() => void) | undefined
  let controller: ReturnType<typeof useExplicitCaptureRecovery>
  function Harness() {
    controller = useExplicitCaptureRecovery({
      captured: faces,
      size: 4,
      commit: (value, approvedFaces) => {
        const evidence = authority.currentEvidence(
          value.candidate,
          approvedFaces,
          4,
        )
        if (!evidence?.candidate) return false
        if (options.rejectInstall) return false
        commits.push(value)
        return true
      },
      ...{
        sourceBinding: () => authority.fork(faces, 4),
        initialBudget: options.budget ?? 5000,
      },
    })
    return options.dialog && controller.state
      ? h(ExplicitCaptureRecoveryDialog, {
          recovery: controller,
          size: 4,
          colors: STICKER_HEX,
          focusDialog: () => {},
        })
      : null
  }
  render(h(Harness, {}), root)
  return {
    find: () => controller.find(),
    cancel: () => controller.cancel(),
    rememberUse: () => {
      rememberedUse = controller.use
    },
    resetCaptured: () => {
      faces = {}
      authority.reset()
      render(h(Harness, {}), root)
    },
    lateUse: () => {
      rememberedUse?.()
      return { active: !!controller.state, commits: commits.length }
    },
    choose: () => {
      const current = controller.state
      if (!current) throw new Error('No active search')
      const choice = Recovery.choices(current.review)[0]
      if (choice) controller.choose(choice.placement)
      return !!choice
    },
    useTwice: () => {
      const use = controller.use
      use()
      use()
      return commits.length
    },
    get committed() {
      return commits
    },
    dispose: () => {
      render(null, root)
      root.remove()
    },
  }
}
