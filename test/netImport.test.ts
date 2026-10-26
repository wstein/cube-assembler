import { describe, expect, it } from 'vitest'
import { isSinglePicture } from '../src/client/fixtures/netImport'
import { clipboardFiles } from '../src/client/fixtures/usePasteAndDrop'

describe('which uploads may be a net picture', () => {
  it('takes exactly one picture', () => {
    expect(isSinglePicture([{ name: 'net.png', type: 'image/png' }])).toBe(true)
    // Pasted screenshots and some drops carry no type, only a name.
    expect(isSinglePicture([{ name: 'Screenshot 1.PNG', type: '' }])).toBe(true)
  })

  it('leaves six photos, fixtures and other files to their own paths', () => {
    const photo = { name: 'a.jpg', type: 'image/jpeg' }
    expect(isSinglePicture([photo, photo])).toBe(false)
    expect(isSinglePicture([])).toBe(false)
    expect(
      isSinglePicture([{ name: 'meta.json', type: 'application/json' }]),
    ).toBe(false)
    expect(
      isSinglePicture([{ name: 'cube.zip', type: 'application/zip' }]),
    ).toBe(false)
  })
})

describe('files on the clipboard', () => {
  const file = (name: string) => new File(['x'], name, { type: 'image/png' })
  const item = (f: File | null, kind = 'file') => ({
    kind,
    getAsFile: () => f,
  })

  it('takes the files the clipboard lists', () => {
    const a = file('a.png')
    expect(clipboardFiles({ files: [a], items: [] })).toEqual([a])
  })

  it('takes image data that only comes as an item, like a screenshot', () => {
    const shot = file('image.png')
    expect(clipboardFiles({ files: [], items: [item(shot)] })).toEqual([shot])
  })

  it('does not take the same file twice', () => {
    const a = file('a.png')
    expect(clipboardFiles({ files: [a], items: [item(a)] })).toEqual([a])
  })

  it('does not take one file twice when the browser hands out copies', () => {
    const listed = new File(['x'], 'image.png', {
      type: 'image/png',
      lastModified: 5,
    })
    const offered = new File(['x'], 'image.png', {
      type: 'image/png',
      lastModified: 5,
    })
    expect(clipboardFiles({ files: [listed], items: [item(offered)] })).toEqual(
      [listed],
    )
  })

  it('keeps two different files that share a name', () => {
    const a = new File(['x'], 'image.png', { type: 'image/png' })
    const b = new File(['xy'], 'image.png', { type: 'image/png' })
    expect(clipboardFiles({ files: [a], items: [item(b)] })).toHaveLength(2)
  })

  it('leaves out text items and items without a file', () => {
    expect(
      clipboardFiles({
        files: [],
        items: [item(null, 'string'), item(null)],
      }),
    ).toEqual([])
  })
})
