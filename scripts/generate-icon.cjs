const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const size = 256
const scale = 3
const canvasSize = size * scale
const pixels = new Uint8Array(canvasSize * canvasSize * 4)

function blendPixel(x, y, color) {
  const index = (y * canvasSize + x) * 4
  pixels[index] = color[0]
  pixels[index + 1] = color[1]
  pixels[index + 2] = color[2]
  pixels[index + 3] = color[3]
}

function fillRoundedRect(x, y, width, height, radius, color) {
  const left = x * scale
  const top = y * scale
  const right = (x + width) * scale
  const bottom = (y + height) * scale
  const scaledRadius = radius * scale
  for (let py = top; py < bottom; py++) {
    for (let px = left; px < right; px++) {
      const nearestX = Math.max(left + scaledRadius, Math.min(px, right - scaledRadius))
      const nearestY = Math.max(top + scaledRadius, Math.min(py, bottom - scaledRadius))
      const dx = px - nearestX
      const dy = py - nearestY
      if (dx * dx + dy * dy <= scaledRadius * scaledRadius) {
        blendPixel(px, py, color)
      }
    }
  }
}

function fillCircle(cx, cy, radius, color) {
  const scaledX = cx * scale
  const scaledY = cy * scale
  const scaledRadius = radius * scale
  const radiusSquared = scaledRadius * scaledRadius
  for (let py = Math.floor(scaledY - scaledRadius); py <= scaledY + scaledRadius; py++) {
    for (let px = Math.floor(scaledX - scaledRadius); px <= scaledX + scaledRadius; px++) {
      const dx = px - scaledX
      const dy = py - scaledY
      if (dx * dx + dy * dy <= radiusSquared) blendPixel(px, py, color)
    }
  }
}

function drawLine(x1, y1, x2, y2, width, color) {
  const startX = x1 * scale
  const startY = y1 * scale
  const endX = x2 * scale
  const endY = y2 * scale
  const radius = width * scale / 2
  const dx = endX - startX
  const dy = endY - startY
  const lengthSquared = dx * dx + dy * dy
  const minX = Math.floor(Math.min(startX, endX) - radius)
  const maxX = Math.ceil(Math.max(startX, endX) + radius)
  const minY = Math.floor(Math.min(startY, endY) - radius)
  const maxY = Math.ceil(Math.max(startY, endY) + radius)

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const t = Math.max(0, Math.min(1, ((px - startX) * dx + (py - startY) * dy) / lengthSquared))
      const nearestX = startX + t * dx
      const nearestY = startY + t * dy
      const distanceX = px - nearestX
      const distanceY = py - nearestY
      if (distanceX * distanceX + distanceY * distanceY <= radius * radius) {
        blendPixel(px, py, color)
      }
    }
  }
}

function drawCurve(points, width, color) {
  let previous = points[0]
  for (let i = 1; i < points.length; i++) {
    drawLine(previous[0], previous[1], points[i][0], points[i][1], width, color)
    previous = points[i]
  }
}

function quadraticCurve(start, control, end, steps = 36) {
  const points = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const inverse = 1 - t
    points.push([
      inverse * inverse * start[0] + 2 * inverse * t * control[0] + t * t * end[0],
      inverse * inverse * start[1] + 2 * inverse * t * control[1] + t * t * end[1],
    ])
  }
  return points
}

const black = [13, 17, 23, 255]
const white = [255, 255, 255, 255]
fillRoundedRect(16, 16, 224, 224, 48, black)
drawLine(82, 72, 82, 184, 11, white)
drawCurve(quadraticCurve([82, 112], [153, 112], [174, 94]), 11, white)
fillCircle(82, 68, 18, white)
fillCircle(174, 92, 18, white)
fillCircle(82, 188, 18, white)

const downsampled = Buffer.alloc(size * size * 4)
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const sums = [0, 0, 0, 0]
    for (let sy = 0; sy < scale; sy++) {
      for (let sx = 0; sx < scale; sx++) {
        const source = (((y * scale + sy) * canvasSize) + x * scale + sx) * 4
        for (let channel = 0; channel < 4; channel++) sums[channel] += pixels[source + channel]
      }
    }
    const target = (y * size + x) * 4
    for (let channel = 0; channel < 4; channel++) {
      downsampled[target + channel] = Math.round(sums[channel] / (scale * scale))
    }
  }
}

const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let value = n
  for (let bit = 0; bit < 8; bit++) {
    value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  crcTable[n] = value >>> 0
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  typeBuffer.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length)
  return chunk
}

const raw = Buffer.alloc((size * 4 + 1) * size)
for (let y = 0; y < size; y++) {
  const row = y * (size * 4 + 1)
  raw[row] = 0
  downsampled.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4)
}

const header = Buffer.alloc(13)
header.writeUInt32BE(size, 0)
header.writeUInt32BE(size, 4)
header[8] = 8
header[9] = 6
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk('IHDR', header),
  pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  pngChunk('IEND', Buffer.alloc(0)),
])

const icoHeader = Buffer.alloc(22)
icoHeader.writeUInt16LE(0, 0)
icoHeader.writeUInt16LE(1, 2)
icoHeader.writeUInt16LE(1, 4)
icoHeader[6] = 0
icoHeader[7] = 0
icoHeader[8] = 0
icoHeader[9] = 0
icoHeader.writeUInt16LE(1, 10)
icoHeader.writeUInt16LE(32, 12)
icoHeader.writeUInt32LE(png.length, 14)
icoHeader.writeUInt32LE(22, 18)

const outputDir = path.join(__dirname, '..', 'build-resources')
fs.mkdirSync(outputDir, { recursive: true })
fs.writeFileSync(path.join(outputDir, 'icon.ico'), Buffer.concat([icoHeader, png]))
fs.writeFileSync(path.join(__dirname, '..', 'rust', 'assets', 'icon.png'), png)
