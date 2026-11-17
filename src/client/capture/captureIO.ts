// Browser I/O ownership only. Puzzle rules, observations and source mappings
// remain in ReScript; a canceled callback cannot write into a newer UI job.
export interface CaptureIOOperation {
  isCurrent: () => boolean
}

export class CaptureIO {
  private active: CaptureIOOperation | undefined

  begin(): CaptureIOOperation {
    const operation = { isCurrent: () => this.active === operation }
    this.active = operation
    return operation
  }

  cancel(): boolean {
    const pending = this.active !== undefined
    this.active = undefined
    return pending
  }

  finish(operation: CaptureIOOperation): boolean {
    if (!operation.isCurrent()) return false
    this.active = undefined
    return true
  }
}
