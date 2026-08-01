import zlib from "zlib";

// Stateless PDF text extraction.
//
// `pdf-parse` (pdf.js 1.10) accumulates internal state and starts throwing
// "bad XRef entry" on perfectly valid files after roughly eight parses in one
// process — which is exactly what a 40-file bulk upload does. Silently marking
// most of a batch unreadable would push the manual work straight back onto the
// reviewer, so this walks the content streams directly instead: pull every
// FlateDecode stream, inflate it, and read the text-showing operators.
//
// It only understands the common case (Flate-compressed content streams,
// WinAnsi-ish text). Anything it cannot read returns empty, which surfaces as
// an `unreadable` flag for a human — never as a guess.

function decodeLiteralString(raw) {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (char !== "\\") {
      out += char;
      continue;
    }

    const next = raw[i + 1];
    i += 1;
    switch (next) {
      case "n": out += "\n"; break;
      case "r": out += "\r"; break;
      case "t": out += "\t"; break;
      case "b": out += "\b"; break;
      case "f": out += "\f"; break;
      case "(": out += "("; break;
      case ")": out += ")"; break;
      case "\\": out += "\\"; break;
      case "\n": break;          // line continuation
      case "\r": if (raw[i + 1] === "\n") i += 1; break;
      default:
        if (next >= "0" && next <= "7") {
          let octal = next;
          while (octal.length < 3 && raw[i + 1] >= "0" && raw[i + 1] <= "7") {
            octal += raw[i + 1];
            i += 1;
          }
          out += String.fromCharCode(Number.parseInt(octal, 8));
        } else {
          out += next ?? "";
        }
    }
  }
  return out;
}

function decodeHexString(raw) {
  const hex = raw.replace(/[^0-9A-Fa-f]/g, "");
  let out = "";
  for (let i = 0; i + 1 < hex.length; i += 2) {
    out += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
}

// Pull the raw bytes of every `stream ... endstream` object.
function collectStreams(buffer) {
  const streams = [];
  const haystack = buffer.toString("latin1");
  const marker = /stream\r\n|stream\n|stream\r/g;
  let match;

  while ((match = marker.exec(haystack)) !== null) {
    const start = match.index + match[0].length;
    const end = haystack.indexOf("endstream", start);
    if (end === -1) break;
    streams.push(buffer.subarray(start, end));
    marker.lastIndex = end;
  }

  return streams;
}

function inflate(chunk) {
  for (const fn of [zlib.inflateSync, zlib.inflateRawSync]) {
    try {
      return fn(chunk);
    } catch {
      // try the next encoding
    }
  }
  return null;
}

// Read text-showing operators out of one decoded content stream.
function readContentStream(content) {
  const lines = [];
  let current = "";

  const push = () => {
    const trimmed = current.replace(/\s+/g, " ").trim();
    if (trimmed) lines.push(trimmed);
    current = "";
  };

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    if (char === "(") {
      // Scan to the matching unescaped ')', honouring nesting.
      let depth = 1;
      let raw = "";
      i += 1;
      while (i < content.length && depth > 0) {
        const inner = content[i];
        if (inner === "\\") {
          raw += inner + (content[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (inner === "(") depth += 1;
        else if (inner === ")") {
          depth -= 1;
          if (depth === 0) break;
        }
        raw += inner;
        i += 1;
      }
      current += decodeLiteralString(raw);
      continue;
    }

    if (char === "<" && content[i + 1] !== "<") {
      const close = content.indexOf(">", i);
      if (close !== -1) {
        current += decodeHexString(content.slice(i + 1, close));
        i = close;
        continue;
      }
    }

    // Any operator that moves to a new line ends the current text run.
    if (char === "T" && ["d", "D", "*"].includes(content[i + 1])) {
      push();
      i += 1;
      continue;
    }
    if (char === "E" && content[i + 1] === "T") {
      push();
      i += 1;
    }
  }

  push();
  return lines.join("\n");
}

/**
 * @returns {string} extracted text, or "" when the file has no readable text
 *                   layer. Never throws.
 */
export function extractPdfText(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.subarray(0, 5).toString("latin1") !== "%PDF-") return "";

  const parts = [];
  for (const raw of collectStreams(buffer)) {
    const inflated = inflate(raw);
    // Uncompressed content streams are legal too; only treat the raw bytes as
    // content if they actually look like page operators.
    const candidate = inflated || (raw.includes("Tj") || raw.includes("TJ") ? raw : null);
    if (!candidate) continue;

    const text = readContentStream(candidate.toString("latin1"));
    if (text) parts.push(text);
  }

  return parts.join("\n");
}
