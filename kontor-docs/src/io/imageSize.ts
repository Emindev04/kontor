/** Pixel size from the header of a PNG, GIF or JPEG file, without decoding it. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const u32 = (i: number) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0
  const u16 = (i: number) => (bytes[i] << 8) | bytes[i + 1]
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { width: u32(16), height: u32(20) }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8) }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null
      const marker = bytes[i + 1]
      // Start-of-frame markers carry the size (C0–CF except DHT, JPG and DAC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: u16(i + 7), height: u16(i + 5) }
      i += 2 + u16(i + 2)
    }
  }
  return null
}
