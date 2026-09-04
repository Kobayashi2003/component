// Tags live at the head of the file. Reading further would only inflate peak
// memory, which matters because a queue is parsed in parallel.
const MAX_METADATA_BYTES = 2 * 1024 * 1024

export interface EmbeddedAudioMetadata {
  title?: string
  artist?: string
  album?: string
  genre?: string
  year?: string
  bpm?: string
  artwork?: Blob
}

function readSyncSafe(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] & 0x7f) << 21)
    | ((bytes[offset + 1] & 0x7f) << 14)
    | ((bytes[offset + 2] & 0x7f) << 7)
    | (bytes[offset + 3] & 0x7f)
}

function readUint32(bytes: Uint8Array, offset: number, littleEndian = false) {
  if (offset < 0 || offset + 4 > bytes.length) return 0
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, littleEndian)
}

function findTerminator(bytes: Uint8Array, offset: number, wide: boolean) {
  for (let index = offset; index < bytes.length - (wide ? 1 : 0); index += wide ? 2 : 1) {
    if (bytes[index] === 0 && (!wide || bytes[index + 1] === 0)) return index
  }
  return -1
}

function decodeText(payload: Uint8Array) {
  if (payload.length < 2) return undefined
  const encoding = payload[0]
  const label = encoding === 0 ? 'latin1' : encoding === 3 ? 'utf-8' : encoding === 2 ? 'utf-16be' : 'utf-16'
  try {
    return new TextDecoder(label).decode(payload.subarray(1)).replaceAll('\0', '').trim() || undefined
  } catch {
    return new TextDecoder('utf-8').decode(payload.subarray(1)).replaceAll('\0', '').trim() || undefined
  }
}

function parseApic(payload: Uint8Array) {
  if (payload.length < 8) return undefined
  const encoding = payload[0]
  const mimeEnd = findTerminator(payload, 1, false)
  if (mimeEnd < 0) return undefined
  const mime = new TextDecoder('latin1').decode(payload.subarray(1, mimeEnd)) || 'image/jpeg'
  const descriptionStart = mimeEnd + 2
  const wideDescription = encoding === 1 || encoding === 2
  const descriptionEnd = findTerminator(payload, descriptionStart, wideDescription)
  if (descriptionEnd < 0) return undefined
  const imageStart = descriptionEnd + (wideDescription ? 2 : 1)
  if (imageStart >= payload.length) return undefined
  return new Blob([payload.slice(imageStart)], { type: mime })
}

function parseId3(bytes: Uint8Array): EmbeddedAudioMetadata | undefined {
  if (bytes.length < 10 || String.fromCharCode(...bytes.subarray(0, 3)) !== 'ID3') return undefined
  const frameMap: Record<string, keyof EmbeddedAudioMetadata> = {
    TIT2: 'title', TPE1: 'artist', TALB: 'album', TCON: 'genre', TDRC: 'year', TYER: 'year', TBPM: 'bpm',
  }
  const metadata: EmbeddedAudioMetadata = {}
  const version = bytes[3]
  const tagEnd = Math.min(bytes.length, 10 + readSyncSafe(bytes, 6))
  let offset = 10

  while (offset + 10 <= tagEnd) {
    const id = new TextDecoder('latin1').decode(bytes.subarray(offset, offset + 4))
    if (!id.trim()) break
    const size = version === 4 ? readSyncSafe(bytes, offset + 4) : readUint32(bytes, offset + 4)
    if (size <= 0 || offset + 10 + size > tagEnd) break
    const payload = bytes.subarray(offset + 10, offset + 10 + size)
    if (id === 'APIC') metadata.artwork = parseApic(payload)
    else if (frameMap[id]) {
      const value = decodeText(payload)
      if (value) (metadata as Record<string, string | Blob | undefined>)[frameMap[id]] = value
    }
    offset += 10 + size
  }
  return metadata
}

function parseFlacPicture(bytes: Uint8Array, start: number, end: number) {
  let cursor = start + 4
  const mimeLength = readUint32(bytes, cursor)
  cursor += 4
  const mime = new TextDecoder('utf-8').decode(bytes.subarray(cursor, cursor + mimeLength)) || 'image/jpeg'
  cursor += mimeLength
  const descriptionLength = readUint32(bytes, cursor)
  cursor += 4 + descriptionLength + 16
  const imageLength = readUint32(bytes, cursor)
  cursor += 4
  return cursor + imageLength <= end ? new Blob([bytes.slice(cursor, cursor + imageLength)], { type: mime }) : undefined
}

function parseVorbisComments(bytes: Uint8Array, start: number, end: number, metadata: EmbeddedAudioMetadata) {
  let cursor = start
  const vendorLength = readUint32(bytes, cursor, true)
  cursor += 4 + vendorLength
  if (cursor + 4 > end) return
  const count = readUint32(bytes, cursor, true)
  cursor += 4
  const keyMap: Record<string, keyof EmbeddedAudioMetadata> = {
    TITLE: 'title', ARTIST: 'artist', ALBUM: 'album', GENRE: 'genre', DATE: 'year', YEAR: 'year', BPM: 'bpm',
  }
  for (let index = 0; index < count && cursor + 4 <= end; index += 1) {
    const length = readUint32(bytes, cursor, true)
    cursor += 4
    if (cursor + length > end) break
    const comment = new TextDecoder('utf-8').decode(bytes.subarray(cursor, cursor + length))
    cursor += length
    const separator = comment.indexOf('=')
    const key = comment.slice(0, separator).toUpperCase()
    const value = comment.slice(separator + 1).trim()
    if (separator > 0 && value && keyMap[key]) (metadata as Record<string, string | Blob | undefined>)[keyMap[key]] = value
  }
}

function parseFlac(bytes: Uint8Array): EmbeddedAudioMetadata | undefined {
  if (bytes.length < 8 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'fLaC') return undefined
  const metadata: EmbeddedAudioMetadata = {}
  let offset = 4
  while (offset + 4 <= bytes.length) {
    const header = bytes[offset]
    const last = (header & 0x80) !== 0
    const type = header & 0x7f
    const length = (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]
    const start = offset + 4
    const end = start + length
    if (end > bytes.length) break
    if (type === 4) parseVorbisComments(bytes, start, end, metadata)
    if (type === 6) metadata.artwork = parseFlacPicture(bytes, start, end)
    if (last) break
    offset = end
  }
  return metadata
}

// A malformed tag must degrade to "no metadata", never reject: the caller uses
// the result to build the visible queue.
export async function extractAudioMetadata(file: File): Promise<EmbeddedAudioMetadata> {
  try {
    const bytes = new Uint8Array(await file.slice(0, MAX_METADATA_BYTES).arrayBuffer())
    return parseId3(bytes) ?? parseFlac(bytes) ?? {}
  } catch {
    return {}
  }
}
