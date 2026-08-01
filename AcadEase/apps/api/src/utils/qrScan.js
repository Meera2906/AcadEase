import zlib from "zlib";
import jsQR from "jsqr";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

// Finds and decodes QR codes in an uploaded document.
//
// For images this is a straight decode. For PDFs the QR is an embedded image
// XObject, so the page's image streams are pulled out and decoded individually.
// Nothing here interprets what a QR *means* — that is qrAuthenticity.js. This
// module only answers "what bytes does the QR in this file encode".

const MAX_IMAGES_PER_PDF = 12;
const MAX_PIXELS = 40e6; // refuse to allocate for a decompression bomb

function toRgba(pixels, width, height, channels) {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const src = i * channels;
    const dst = i * 4;
    if (channels === 1) {
      out[dst] = out[dst + 1] = out[dst + 2] = pixels[src];
    } else {
      out[dst] = pixels[src];
      out[dst + 1] = pixels[src + 1];
      out[dst + 2] = pixels[src + 2];
    }
    out[dst + 3] = 255;
  }
  return out;
}

function decodeRgba(rgba, width, height) {
  try {
    const found = jsQR(new Uint8ClampedArray(rgba), width, height, { inversionAttempts: "attemptBoth" });
    return found?.data || null;
  } catch {
    return null;
  }
}

async function decodeImageBuffer(buffer, mimeType) {
  try {
    if (mimeType === "image/png" || buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
      const png = PNG.sync.read(buffer);
      if (png.width * png.height > MAX_PIXELS) return null;
      return decodeRgba(png.data, png.width, png.height);
    }
    if (mimeType === "image/jpeg" || (buffer[0] === 0xff && buffer[1] === 0xd8)) {
      const img = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 256 });
      if (img.width * img.height > MAX_PIXELS) return null;
      return decodeRgba(img.data, img.width, img.height);
    }
  } catch {
    // A QR that cannot be decoded is reported as absent, never as a failure.
  }
  return null;
}

// ── PDF image extraction ───────────────────────────────────────────────────

// Reverses the PNG row predictors that PDF writers apply to Flate image data.
function undoPngPredictor(data, colors, bitsPerComponent, columns) {
  const bpp = Math.ceil((colors * bitsPerComponent) / 8);
  const rowLength = Math.ceil((colors * bitsPerComponent * columns) / 8);
  const rows = Math.floor(data.length / (rowLength + 1));
  const out = Buffer.alloc(rows * rowLength);

  let prevRow = Buffer.alloc(rowLength);
  for (let r = 0; r < rows; r += 1) {
    const filter = data[r * (rowLength + 1)];
    const row = data.subarray(r * (rowLength + 1) + 1, (r + 1) * (rowLength + 1));
    const decoded = Buffer.alloc(rowLength);

    for (let i = 0; i < rowLength; i += 1) {
      const raw = row[i];
      const left = i >= bpp ? decoded[i - bpp] : 0;
      const up = prevRow[i];
      const upLeft = i >= bpp ? prevRow[i - bpp] : 0;

      switch (filter) {
        case 0: decoded[i] = raw; break;
        case 1: decoded[i] = (raw + left) & 0xff; break;
        case 2: decoded[i] = (raw + up) & 0xff; break;
        case 3: decoded[i] = (raw + ((left + up) >> 1)) & 0xff; break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          const pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          decoded[i] = (raw + pred) & 0xff;
          break;
        }
        default: decoded[i] = raw;
      }
    }

    decoded.copy(out, r * rowLength);
    prevRow = decoded;
  }

  return out;
}

function dictNumber(dict, key) {
  const match = dict.match(new RegExp(`/${key}\\s+(\\d+)`));
  return match ? Number(match[1]) : null;
}

// Expand sub-byte samples (1/2/4 bpc) out to one byte each.
function expandBits(data, bitsPerComponent, width, height, components) {
  if (bitsPerComponent === 8) return data;
  const out = Buffer.alloc(width * height * components);
  const perRow = Math.ceil((width * components * bitsPerComponent) / 8);
  const max = (1 << bitsPerComponent) - 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width * components; x += 1) {
      const bitIndex = x * bitsPerComponent;
      const byte = data[y * perRow + (bitIndex >> 3)];
      if (byte === undefined) continue;
      const shift = 8 - bitsPerComponent - (bitIndex & 7);
      const value = (byte >> shift) & max;
      out[y * width * components + x] = Math.round((value / max) * 255);
    }
  }
  return out;
}

function extractPdfImages(buffer) {
  const images = [];
  const haystack = buffer.toString("latin1");
  // Image XObjects, located by their dictionary then read to `endstream`.
  const objectPattern = /<<([^>]*?\/Subtype\s*\/Image[\s\S]*?)>>\s*stream\r?\n?/g;
  let match;

  while ((match = objectPattern.exec(haystack)) !== null && images.length < MAX_IMAGES_PER_PDF) {
    const dict = match[1];
    const start = match.index + match[0].length;
    const end = haystack.indexOf("endstream", start);
    if (end === -1) continue;

    const raw = buffer.subarray(start, end);
    const width = dictNumber(dict, "Width");
    const height = dictNumber(dict, "Height");
    if (!width || !height || width * height > MAX_PIXELS) continue;

    if (/\/DCTDecode/.test(dict)) {
      images.push({ kind: "jpeg", buffer: raw });
      continue;
    }

    if (/\/FlateDecode/.test(dict)) {
      let data;
      try {
        data = zlib.inflateSync(raw);
      } catch {
        continue;
      }

      const bpc = dictNumber(dict, "BitsPerComponent") || 8;
      const indexed = /\/Indexed/.test(dict);
      const rgb = /\/DeviceRGB/.test(dict);
      const components = indexed ? 1 : rgb ? 3 : 1;

      const predictor = dictNumber(dict, "Predictor");
      if (predictor && predictor >= 10) {
        const columns = dictNumber(dict, "Columns") || width;
        const colors = dictNumber(dict, "Colors") || components;
        data = undoPngPredictor(data, colors, bpc, columns);
      }

      const expanded = expandBits(data, bpc, width, height, components);
      images.push({ kind: "raw", data: expanded, width, height, components, indexed });
    }
  }

  return images;
}

/**
 * @returns {Promise<{ payloads: string[], imagesScanned: number }>}
 */
export async function scanForQrCodes(buffer, mimeType) {
  const payloads = new Set();

  if (mimeType !== "application/pdf") {
    const decoded = await decodeImageBuffer(buffer, mimeType);
    if (decoded) payloads.add(decoded);
    return { payloads: [...payloads], imagesScanned: 1 };
  }

  const images = extractPdfImages(buffer);
  for (const image of images) {
    let decoded = null;
    if (image.kind === "jpeg") {
      decoded = await decodeImageBuffer(image.buffer, "image/jpeg");
    } else {
      // An indexed QR is black-on-white either way round; jsQR tries both
      // polarities, so feeding the index values straight through is enough.
      const rgba = toRgba(image.data, image.width, image.height, image.components);
      decoded = decodeRgba(rgba, image.width, image.height);
    }
    if (decoded) payloads.add(decoded);
  }

  return { payloads: [...payloads], imagesScanned: images.length };
}

// Verification URLs are frequently also present as link annotations or printed
// text, which is a useful second channel when the QR bitmap will not decode.
export function extractPdfLinks(buffer) {
  const haystack = buffer.toString("latin1");
  const links = new Set();

  for (const match of haystack.matchAll(/\/URI\s*\(([^)]{4,300})\)/g)) {
    links.add(match[1].replace(/\\([()\\])/g, "$1").trim());
  }
  for (const match of haystack.matchAll(/https?:\/\/[^\s()<>"']{4,300}/g)) {
    links.add(match[0].trim());
  }

  return [...links];
}
