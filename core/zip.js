(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.mask2aiZip = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const td = new TextDecoder();
  const te = new TextEncoder();
  const u32 = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | ((b[o + 3] << 24) >>> 0);
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const w32 = (b, o, v) => { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; b[o + 2] = (v >>> 16) & 255; b[o + 3] = (v >>> 24) & 255; };
  const w16 = (b, o, v) => { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; };
  let table;
  const crc32 = bytes => {
    if (!table) {
      table = new Int32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
      }
    }
    let crc = -1;
    for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ -1) >>> 0;
  };
  const inflate = async bytes => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  const deflate = async bytes => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());

  const read = async bytes => {
    let eocd = bytes.length - 22;
    while (eocd >= 0 && u32(bytes, eocd) !== 0x06054b50) eocd--;
    if (eocd < 0) throw new Error('not a zip');
    const count = u16(bytes, eocd + 10);
    let p = u32(bytes, eocd + 16);
    const entries = [];
    for (let i = 0; i < count; i++) {
      if (u32(bytes, p) !== 0x02014b50) throw new Error('bad central directory');
      const method = u16(bytes, p + 10);
      const csize = u32(bytes, p + 20);
      const nlen = u16(bytes, p + 28);
      const elen = u16(bytes, p + 30);
      const clen = u16(bytes, p + 32);
      const offset = u32(bytes, p + 42);
      const name = td.decode(bytes.subarray(p + 46, p + 46 + nlen));
      const lnlen = u16(bytes, offset + 26);
      const lelen = u16(bytes, offset + 28);
      const start = offset + 30 + lnlen + lelen;
      const raw = bytes.subarray(start, start + csize);
      entries.push({ name, data: method === 8 ? await inflate(raw) : method === 0 ? raw : null });
      p += 46 + nlen + elen + clen;
    }
    return entries;
  };

  const write = async entries => {
    const parts = [];
    const central = [];
    let offset = 0;
    for (const { name, data } of entries) {
      const nameBytes = te.encode(name);
      const packed = await deflate(data);
      const method = packed.length < data.length ? 8 : 0;
      const body = method === 8 ? packed : data;
      const crc = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length);
      w32(local, 0, 0x04034b50); w16(local, 4, 20); w16(local, 6, 0x0800); w16(local, 8, method);
      w32(local, 14, crc); w32(local, 18, body.length); w32(local, 22, data.length); w16(local, 26, nameBytes.length);
      local.set(nameBytes, 30);
      const cd = new Uint8Array(46 + nameBytes.length);
      w32(cd, 0, 0x02014b50); w16(cd, 4, 20); w16(cd, 6, 20); w16(cd, 8, 0x0800); w16(cd, 10, method);
      w32(cd, 16, crc); w32(cd, 20, body.length); w32(cd, 24, data.length); w16(cd, 28, nameBytes.length); w32(cd, 42, offset);
      cd.set(nameBytes, 46);
      parts.push(local, body);
      central.push(cd);
      offset += local.length + body.length;
    }
    const cdSize = central.reduce((n, c) => n + c.length, 0);
    const eocd = new Uint8Array(22);
    w32(eocd, 0, 0x06054b50); w16(eocd, 8, entries.length); w16(eocd, 10, entries.length); w32(eocd, 12, cdSize); w32(eocd, 16, offset);
    const out = new Uint8Array(offset + cdSize + 22);
    let p = 0;
    for (const part of [...parts, ...central, eocd]) { out.set(part, p); p += part.length; }
    return out;
  };

  return { read, write, crc32 };
});