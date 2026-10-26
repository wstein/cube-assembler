// What a photo file says about itself, read from its bytes: the fingerprint
// the generator writes into synthetic photos (a JPEG comment segment) and the
// camera's EXIF block. Both are read from the file as it was picked, since
// drawing it on a canvas drops them.

type bytes = Uint8Array.t

@get_index external at: (bytes, int) => int = ""
@get external length: bytes => int = "length"
@new external make: int => bytes = "Uint8Array"
@send external subarray: (bytes, int, int) => bytes = "subarray"
@send external copyInto: (bytes, bytes, int) => unit = "set"

type encoder
@new external makeEncoder: unit => encoder = "TextEncoder"
@send external encode: (encoder, string) => bytes = "encode"
type decoder
@new external makeDecoder: unit => decoder = "TextDecoder"
@send external decode: (decoder, bytes) => string = "decode"

// Bytes outside the file read as 0, so truncated data never throws.
let byteAt = (data, i) => i >= 0 && i < length(data) ? at(data, i) : 0

let marker = "cube-assembler:"
// The most a segment's 16-bit length can carry after its own two bytes.
let maxPayload = 65533

type segment = {marker: int, start: int, bodyStart: int, stop: int}

// The segments before the image data, in order. Stops at the scan or at
// anything that is not a well-formed segment.
let segments = (data: bytes): array<segment> => {
  let found = []
  let pos = ref(2)
  let stop = ref(byteAt(data, 0) != 0xff || byteAt(data, 1) != 0xd8)
  while !stop.contents && pos.contents + 4 <= length(data) {
    let p = pos.contents
    let code = byteAt(data, p + 1)
    if byteAt(data, p) != 0xff {
      stop := true
    } else if code == 0xff {
      pos := p + 1
    } else if code == 0xda || code == 0xd9 {
      stop := true
    } else if code == 0x01 || (code >= 0xd0 && code <= 0xd8) {
      pos := p + 2
    } else {
      let size = byteAt(data, p + 2) * 256 + byteAt(data, p + 3)
      let end = p + 2 + size
      if size < 2 || end > length(data) {
        stop := true
      } else {
        found->Array.push({marker: code, start: p, bodyStart: p + 4, stop: end})
        pos := end
      }
    }
  }
  found
}

let startsWith = (data, at, text) => {
  let wanted = encode(makeEncoder(), text)
  let ok = ref(at + length(wanted) <= length(data))
  for i in 0 to length(wanted) - 1 {
    if ok.contents && byteAt(data, at + i) != byteAt(wanted, i) {
      ok := false
    }
  }
  ok.contents
}

let isFingerprint = (data, segment) =>
  segment.marker == 0xfe && startsWith(data, segment.bodyStart, marker)

let readFingerprint = (data: bytes): option<string> =>
  segments(data)
  ->Array.find(segment => isFingerprint(data, segment))
  ->Option.map(segment =>
    decode(makeDecoder(), subarray(data, segment.bodyStart + String.length(marker), segment.stop))
  )

// The photo with the fingerprint as its first segment; one it carried
// already is dropped.
let embedFingerprint = (data: bytes, json: string): bytes => {
  if byteAt(data, 0) != 0xff || byteAt(data, 1) != 0xd8 {
    JsError.throwWithMessage("Not a JPEG")
  }
  let payload = encode(makeEncoder(), marker ++ json)
  if length(payload) > maxPayload {
    JsError.throwWithMessage("The fingerprint is too long for a JPEG comment")
  }
  let old = segments(data)->Array.filter(segment => isFingerprint(data, segment))
  let removed = old->Array.reduce(0, (sum, segment) => sum + segment.stop - segment.start)
  let out = make(length(data) - removed + 4 + length(payload))
  copyInto(out, subarray(data, 0, 2), 0)
  let size = length(payload) + 2
  copyInto(out, Uint8Array.fromArray([0xff, 0xfe, size / 256, mod(size, 256)]), 2)
  copyInto(out, payload, 6)
  let target = ref(6 + length(payload))
  let from = ref(2)
  old->Array.forEach(segment => {
    copyInto(out, subarray(data, from.contents, segment.start), target.contents)
    target := target.contents + segment.start - from.contents
    from := segment.stop
  })
  copyInto(out, subarray(data, from.contents, length(data)), target.contents)
  out
}

@genType
type exif = {
  make?: string,
  model?: string,
  orientation?: int,
  exposureTime?: float,
  fNumber?: float,
  iso?: int,
  focalLength?: float,
  whiteBalance?: string,
  dateTime?: string,
}

let exifHeader = "Exif\u0000\u0000"

// TIFF value sizes by type: byte, ascii, short, long, rational.
let typeSize = kind =>
  switch kind {
  | 3 => 2
  | 4 => 4
  | 5 => 8
  | _ => 1
  }

let readExif = (data: bytes): option<exif> => {
  let block =
    segments(data)->Array.find(segment =>
      segment.marker == 0xe1 && startsWith(data, segment.bodyStart, exifHeader)
    )
  switch block {
  | None => None
  | Some(block) =>
    let base = block.bodyStart + 6
    let little = byteAt(data, base) == 0x49
    let u16 = i =>
      little
        ? byteAt(data, i) + byteAt(data, i + 1) * 256
        : byteAt(data, i) * 256 + byteAt(data, i + 1)
    let byteFloat = i => Int.toFloat(byteAt(data, i))
    let u32 = i =>
      little
        ? byteFloat(i) +.
          byteFloat(i + 1) *. 256.0 +.
          byteFloat(i + 2) *. 65536.0 +.
          byteFloat(i + 3) *. 16777216.0
        : byteFloat(i) *. 16777216.0 +.
          byteFloat(i + 1) *. 65536.0 +.
          byteFloat(i + 2) *. 256.0 +.
          byteFloat(i + 3)
    // Where the value of `tag` in the IFD at `offset` is stored, with its
    // type and count.
    let find = (offset, tag) => {
      let entries = min(u16(base + offset), 256)
      let result = ref(None)
      for i in 0 to entries - 1 {
        let entry = base + offset + 2 + i * 12
        if result.contents == None && u16(entry) == tag {
          let kind = u16(entry + 2)
          let count = Float.toInt(u32(entry + 4))
          let inline = count * typeSize(kind) <= 4
          let place = inline ? entry + 8 : base + Float.toInt(u32(entry + 8))
          result := Some((kind, count, place))
        }
      }
      result.contents
    }
    let text = (offset, tag) =>
      find(offset, tag)->Option.flatMap(((_, count, place)) => {
        let out = ref("")
        let done = ref(false)
        for i in 0 to min(count, 256) - 1 {
          let code = byteAt(data, place + i)
          if code == 0 {
            done := true
          } else if !done.contents {
            out := out.contents ++ String.fromCharCode(code)
          }
        }
        out.contents == "" ? None : Some(out.contents)
      })
    let short = (offset, tag) => find(offset, tag)->Option.map(((_, _, place)) => u16(place))
    let rational = (offset, tag) =>
      find(offset, tag)->Option.flatMap(((_, _, place)) => {
        let denominator = u32(place + 4)
        denominator == 0.0 ? None : Some(u32(place) /. denominator)
      })
    let first = Float.toInt(u32(base + 4))
    let exifIfd = find(first, 0x8769)->Option.map(((_, _, place)) => Float.toInt(u32(place)))
    let inExif = read =>
      switch exifIfd {
      | Some(offset) => read(offset)
      | None => None
      }
    let result = {
      make: ?text(first, 0x010f),
      model: ?text(first, 0x0110),
      orientation: ?short(first, 0x0112),
      exposureTime: ?inExif(offset => rational(offset, 0x829a)),
      fNumber: ?inExif(offset => rational(offset, 0x829d)),
      iso: ?inExif(offset => short(offset, 0x8827)),
      focalLength: ?inExif(offset => rational(offset, 0x920a)),
      whiteBalance: ?(
        inExif(offset => short(offset, 0xa403))->Option.map(kind => kind == 0 ? "auto" : "manual")
      ),
      dateTime: ?inExif(offset => text(offset, 0x9003)),
    }
    result == {} ? None : Some(result)
  }
}
