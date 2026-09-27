import { describe, expect, it } from 'vitest'
import {
  orderPhotoUploads,
  isNamedFaceCrop,
  uploadKind,
  photoReadModes,
} from '../src/client/photoUpload'

const image = (name: string) => ({ name, type: 'image/jpeg', size: 10 })

describe('photo uploads', () => {
  it('routes extracted files with fixture metadata to fixture loading', () => {
    const photos = Array.from({ length: 6 }, (_, index) =>
      image(`photo-${index}.jpg`),
    )
    expect(uploadKind(photos)).toBe('photos')
    expect(uploadKind([...photos, { name: 'meta.json' }])).toBe('fixture')
  })

  it('orders six named face crops by capture slot', () => {
    const files = [
      'face-d.jpg',
      'face-u.jpg',
      'face-b.jpg',
      'face-f.jpg',
      'face-l.jpg',
      'face-r.jpg',
    ].map(image)
    expect(orderPhotoUploads(files).map((file) => file.name)).toEqual([
      'face-u.jpg',
      'face-r.jpg',
      'face-f.jpg',
      'face-d.jpg',
      'face-l.jpg',
      'face-b.jpg',
    ])
  })

  it('keeps arbitrary image order for the user to review', () => {
    const files = [
      'six.jpg',
      'one.jpg',
      'two.jpg',
      'three.jpg',
      'four.jpg',
      'five.jpg',
    ].map(image)
    expect(orderPhotoUploads(files)).toEqual(files)
  })

  it('requires six nonempty images', () => {
    expect(() => orderPhotoUploads([image('one.jpg')])).toThrow('six photos')
    const files = Array.from({ length: 6 }, (_, index) => image(`${index}.jpg`))
    expect(() =>
      orderPhotoUploads([{ ...files[0], size: 0 }, ...files.slice(1)]),
    ).toThrow('nonempty images')
    expect(() =>
      orderPhotoUploads([
        { ...files[0], type: 'application/json' },
        ...files.slice(1),
      ]),
    ).toThrow('nonempty images')
  })

  it('recognizes fixture-style crops without metadata', () => {
    expect(isNamedFaceCrop('face-u.jpg')).toBe(true)
    expect(isNamedFaceCrop('FACE-R.PNG')).toBe(true)
    expect(isNamedFaceCrop('photo-u.jpg')).toBe(false)
  })

  it('reads cropped and full-frame photos according to the chosen mode', () => {
    expect(photoReadModes('face-u.jpg', 'auto')).toEqual(['cropped'])
    expect(photoReadModes('camera.jpg', 'auto')).toEqual(['aligned', 'cropped'])
    expect(photoReadModes('camera.jpg', 'cropped')).toEqual(['cropped'])
    expect(photoReadModes('face-u.jpg', 'full')).toEqual(['aligned'])
    expect(photoReadModes('camera.jpg', 'full', 'guide')).toEqual(['fixed'])
    expect(photoReadModes('camera.jpg', 'auto', 'guide')).toEqual(['fixed'])
    expect(photoReadModes('face-u.jpg', 'auto', 'guide')).toEqual(['cropped'])
  })
})
