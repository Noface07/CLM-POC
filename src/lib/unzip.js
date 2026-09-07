const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function findEndOfCentralDirectory(view, length) {
  // The EOCD is last, but a trailing comment can push it up to 64 KB from the end.
  const earliest = Math.max(0, length - 0xffff - 22);
  for (let i = length - 22; i >= earliest; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) return i;
  }
  return -1;
}

export async function readZip(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const eocd = findEndOfCentralDirectory(view, bytes.length);
  if (eocd === -1) throw new Error("Not a ZIP archive: no end-of-central-directory record. A .doc is not a .docx.");

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  const decoder = new TextDecoder();
  const out = new Map();

  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== CD_SIG) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);

    if (!name.endsWith("/")) {
      if (method === 0) out.set(name, raw);
      else if (method === 8) out.set(name, await inflateRaw(raw));
      else throw new Error(`Unsupported compression method ${method} for ${name}.`);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

export async function readZipText(input, entryName) {
  const entries = await readZip(input);
  const bytes = entries.get(entryName);
  return bytes ? new TextDecoder().decode(bytes) : null;
}
