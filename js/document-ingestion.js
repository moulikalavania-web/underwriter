/**
 * ============================================================================
 * DOCUMENT INGESTION PIPELINE (Add-On)
 * ----------------------------------------------------------------------------
 * Turns any document that arrives with a submission into text, tables and
 * fields the underwriter can review, without ever altering the original.
 *
 *   1. Upload       validate size and type; the file's signature decides what
 *                   it is, not its extension (a renamed file is rejected).
 *   2. Detect       PDF, Word, Excel, PowerPoint, CSV/TXT/JSON, email (EML),
 *                   image/scan, or unsupported.
 *   3. Extract      the extractor is chosen by the detected type:
 *                     digital PDF -> PDF text      Word -> document parser
 *                     Excel -> spreadsheet parser  PowerPoint -> slide parser
 *                     CSV/TXT/JSON -> direct text  EML -> email parser (+ attachments)
 *                     image / scanned PDF / handwriting -> OCR service
 *                   There is no OCR engine inside this prototype. Set
 *                   window.DOCUMENT_OCR_PROVIDER = async (name, bytes, kind) =>
 *                   ({ text, confidence }) to connect one (Textract, OCI,
 *                   Azure, Tesseract). Until then such files are reported as
 *                   "needs OCR"; nothing is guessed or invented.
 *   4. Normalize    each document is read independently; the results are then
 *                   consolidated into one canonical submission record that
 *                   keeps, for every field, the document and line it came from,
 *                   and records conflicts between documents. Missing values
 *                   stay null.
 *   5. Validate     format and cross-checks run before anything is applied; a
 *                   person reviews, corrects and confirms.
 *
 * The originals (sub.rawAttachments) and the extraction results
 * (sub.documentExtractions) are stored separately. Nothing here makes an
 * underwriting decision.
 * ============================================================================
 */

var DI_MAX_FILE_BYTES = 15 * 1024 * 1024;
var DI_MAX_TEXT_CHARS = 200000;
var DI_MAX_STORED_TEXT = 20000;
var DI_MAX_UNZIPPED_BYTES = 60 * 1024 * 1024;
var DI_MAX_EML_DEPTH = 2;

var DI_KIND_INFO = {
  pdf:  { label: "PDF", exts: ["pdf"] },
  docx: { label: "Word document (DOCX)", exts: ["docx"] },
  xlsx: { label: "Excel workbook (XLSX)", exts: ["xlsx"] },
  pptx: { label: "PowerPoint (PPTX)", exts: ["pptx"] },
  jpeg: { label: "JPEG image", exts: ["jpg", "jpeg"] },
  png:  { label: "PNG image", exts: ["png"] },
  tiff: { label: "TIFF image", exts: ["tif", "tiff"] },
  eml:  { label: "Email (EML)", exts: ["eml"] },
  json: { label: "JSON data", exts: ["json"] },
  csv:  { label: "CSV / delimited text", exts: ["csv", "tsv"] },
  txt:  { label: "Plain text", exts: ["txt", "text", "log"] },
  ole:  { label: "Legacy Office / Outlook binary", exts: ["doc", "xls", "ppt", "msg"] },
  gif:  { label: "GIF image", exts: ["gif"] },
  zip:  { label: "ZIP archive", exts: ["zip"] },
  unknown: { label: "Unrecognised format", exts: [] }
};
var DI_BLOCKED_EXTS = ["exe", "dll", "msi", "bat", "cmd", "com", "scr", "js", "vbs", "ps1", "sh", "jar", "apk", "app", "lnk", "iso"];
/** Programs and scripts are never accepted as documents, whatever they are renamed to. */
function diIsExecutable(bytes, name) {
  return DI_BLOCKED_EXTS.indexOf(diExt(name)) > -1 || diStartsWith(bytes, [0x4D, 0x5A]) || diStartsWith(bytes, [0x7F, 0x45, 0x4C, 0x46]) || diStartsWith(bytes, [0x23, 0x21]);
}
var DI_TEXT_KINDS = ["eml", "json", "csv", "txt"];
var DI_SUPPORTED_KINDS = ["pdf", "docx", "xlsx", "pptx", "jpeg", "png", "tiff", "eml", "json", "csv", "txt"];
var DI_IMAGE_KINDS = ["jpeg", "png", "tiff"];

function diEsc(s) { return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function diBytes(n) { return n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : (n / 1048576).toFixed(1) + " MB"; }
function diExt(name) { const m = /\.([A-Za-z0-9]+)$/.exec(String(name || "")); return m ? m[1].toLowerCase() : ""; }

// ----------------------------------------------------------------------------
// 1. TYPE DETECTION (by file signature, not by name)
// ----------------------------------------------------------------------------
function diDecodeText(bytes) {
  let b = bytes;
  if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) b = b.subarray(3);
  if (b.length >= 2 && ((b[0] === 0xFF && b[1] === 0xFE) || (b[0] === 0xFE && b[1] === 0xFF))) {
    return new TextDecoder(b[0] === 0xFF ? "utf-16le" : "utf-16be").decode(b.subarray(2));
  }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b); }
  catch (e) { return new TextDecoder("windows-1252").decode(b); }
}

function diLooksLikeText(bytes) {
  const n = Math.min(bytes.length, 8192);
  if (n === 0) return false;
  if (bytes.length >= 2 && ((bytes[0] === 0xFF && bytes[1] === 0xFE) || (bytes[0] === 0xFE && bytes[1] === 0xFF))) return true;
  let ctrl = 0;
  for (let i = 0; i < n; i++) {
    const c = bytes[i];
    if (c === 0) return false;
    if (c < 9 || (c > 13 && c < 32)) ctrl++;
  }
  return ctrl / n < 0.02;
}

function diStartsWith(bytes, sig) { for (let i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) return false; return true; }

/** Returns { kind, label, ext, supported, mismatch, note } from the content of the file. */
function diDetectType(bytes, name) {
  const ext = diExt(name);
  let kind = "unknown";
  if (diStartsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2D])) kind = "pdf";
  else if (diStartsWith(bytes, [0x50, 0x4B, 0x03, 0x04])) kind = "zip";
  else if (diStartsWith(bytes, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])) kind = "ole";
  else if (diStartsWith(bytes, [0xFF, 0xD8, 0xFF])) kind = "jpeg";
  else if (diStartsWith(bytes, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) kind = "png";
  else if (diStartsWith(bytes, [0x49, 0x49, 0x2A, 0x00]) || diStartsWith(bytes, [0x4D, 0x4D, 0x00, 0x2A])) kind = "tiff";
  else if (diStartsWith(bytes, [0x47, 0x49, 0x46, 0x38])) kind = "gif";
  else if (diLooksLikeText(bytes)) {
    const head = diDecodeText(bytes.subarray(0, Math.min(bytes.length, 4096)));
    const trimmed = head.replace(/^\s+/, "");
    if (/^(?:received|return-path|mime-version|from|date|subject|to|message-id|x-[\w-]+):/i.test(trimmed) && /^(?:subject|from|to|mime-version):/im.test(head)) kind = "eml";
    else if (/^[[{]/.test(trimmed) && ext !== "csv") kind = "json";
    else if (ext === "csv" || ext === "tsv") kind = "csv";
    else if (ext === "json") kind = "json";
    else if (ext === "eml") kind = "eml";
    else kind = "txt";
  }
  const info = { kind: kind, ext: ext, mismatch: false, note: "" };
  info.supported = DI_SUPPORTED_KINDS.indexOf(kind) > -1 || kind === "zip";
  info.label = (DI_KIND_INFO[kind] || DI_KIND_INFO.unknown).label;
  return info;
}

/** Called once the ZIP directory is known: tells DOCX / XLSX / PPTX apart from any other ZIP. */
function diResolveZipKind(entries) {
  if (entries["word/document.xml"]) return "docx";
  if (entries["xl/workbook.xml"]) return "xlsx";
  if (entries["ppt/presentation.xml"]) return "pptx";
  return "zip";
}

/** The extension is only a claim. If it names a different kind than the content, the file is refused rather than renamed. */
function diCheckExtension(info) {
  if (!info.ext) return info;
  const claimed = Object.keys(DI_KIND_INFO).filter(k => DI_KIND_INFO[k].exts.indexOf(info.ext) > -1)[0];
  if (!claimed) return info;
  const sameFamily = claimed === info.kind || (DI_TEXT_KINDS.indexOf(claimed) > -1 && DI_TEXT_KINDS.indexOf(info.kind) > -1);
  if (!sameFamily) {
    info.mismatch = true;
    info.note = `The name says ${(DI_KIND_INFO[claimed] || {}).label}, but the content is ${info.label}. The file was not processed; ask the sender for the original.`;
  }
  return info;
}

// ----------------------------------------------------------------------------
// 2. ZIP + XML helpers (DOCX / XLSX / PPTX are ZIP containers)
// ----------------------------------------------------------------------------
async function diInflate(data, format) {
  if (typeof DecompressionStream === "undefined") throw new Error("this browser cannot decompress files (DecompressionStream is unavailable)");
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function diReadZipDirectory(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a valid ZIP container");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = {};
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    entries[new TextDecoder("utf-8").decode(bytes.subarray(p + 46, p + 46 + nlen))] = { method: method, csize: csize, usize: usize, lho: lho };
    p += 46 + nlen + elen + clen;
  }
  return { bytes: bytes, dv: dv, entries: entries };
}

async function diZipRead(zip, name) {
  const e = zip.entries[name];
  if (!e) return null;
  if (e.usize > DI_MAX_UNZIPPED_BYTES) throw new Error("an entry in the archive is too large to open safely");
  const lh = e.lho;
  const start = lh + 30 + zip.dv.getUint16(lh + 26, true) + zip.dv.getUint16(lh + 28, true);
  const data = zip.bytes.subarray(start, start + e.csize);
  if (e.method === 0) return data;
  if (e.method === 8) return diInflate(data, "deflate-raw");
  throw new Error("unsupported ZIP compression method " + e.method);
}

async function diZipXml(zip, name) {
  const data = await diZipRead(zip, name);
  if (!data) return null;
  const doc = new DOMParser().parseFromString(new TextDecoder("utf-8").decode(data), "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error(name + " is not valid XML");
  return doc;
}

function diKids(node, tag) { return Array.prototype.filter.call(node.childNodes, n => n.nodeType === 1 && n.nodeName === tag); }

// ----------------------------------------------------------------------------
// 3. EXTRACTORS. Each returns { text, tables, pages, notes } or throws.
// ----------------------------------------------------------------------------
// Words that make a cell read as a form label ("Named Insured", "Business Address", "Policy Period"), as opposed to a value.
var DI_LABEL_WORDS = /\b(?:insured|name|address|type|date|reference|number|no|carrier|insurer|policy|period|line of business|agency|broker|valuation|prepared|garaging|location|radius|mileage|use|ownership|lienholder|notes?|status|total|limit|premium|fein|dot|mc|state|effective|expiration|currency|years?|business|revenue|contact|email|phone|operations?|commodit[a-z]*|cargo|haul[a-z]*|freight)\b/i;
function diLooksLikeLabel(c) {
  return !!c && c.length <= 70 && /^[A-Za-z][A-Za-z\s\/&()'.,:?-]*$/.test(c) && (DI_LABEL_WORDS.test(c) || /:$/.test(c));
}

/**
 * Forms are laid out as tables of "Label | Value | Label | Value". When the cells at the even positions are labels in
 * nearly every row, each pair is one field, so they are written as "Label: value" lines (not as a header row and data).
 */
function diIsPairTable(clean) {
  const width = Math.max.apply(null, clean.map(r => r.length));
  if (width < 2 || width % 2) return false;
  if (width === 2) return clean.every(r => r.filter(Boolean).length === 2);
  const isLabelRow = r => { const ev = r.filter((c, i) => i % 2 === 0 && c); return ev.length > 0 && ev.every(diLooksLikeLabel) && r.filter((c, i) => i % 2 === 1 && c).length >= 1; };
  return clean.filter(isLabelRow).length / clean.length >= 0.75;
}

function diTableToText(rows) {
  const clean = rows.map(r => r.map(c => String(c === null || c === undefined ? "" : c).replace(/\s+/g, " ").trim())).filter(r => r.some(Boolean));
  if (!clean.length) return "";
  if (diIsPairTable(clean)) {
    const lines = [];
    clean.forEach(r => { for (let i = 0; i + 1 < r.length; i += 2) if (r[i] && r[i + 1]) lines.push(r[i].replace(/:$/, "") + ": " + r[i + 1]); });
    return lines.join("\n");
  }
  if (clean.every(r => r.filter(Boolean).length === 2 && r.length <= 3)) return clean.map(r => r.filter(Boolean).join(": ")).join("\n");
  const header = clean[0];
  const headerLooksLikeLabels = clean.length > 1 && header.every(h => h && isNaN(Number(h.replace(/[$,%]/g, ""))));
  if (headerLooksLikeLabels) return clean.slice(1).map(r => r.map((c, i) => c ? `${header[i] || "Column " + (i + 1)}: ${c}` : "").filter(Boolean).join("; ")).join("\n");
  return clean.map(r => r.filter(Boolean).join(" | ")).join("\n");
}

function diParseCsv(text, delimiter) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delimiter) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ""));
}

function diExtractPlainText(bytes, kind) {
  const text = diDecodeText(bytes);
  if (kind === "csv") {
    const delim = (text.split("\n")[0].match(/\t/g) || []).length > (text.split("\n")[0].match(/,/g) || []).length ? "\t" : ",";
    const rows = diParseCsv(text, delim);
    return { text: diTableToText(rows), tables: [{ name: "CSV", rows: rows }], pages: [], notes: [] };
  }
  return { text: text, tables: [], pages: [], notes: [] };
}

function diHumanKey(k) {
  return String(k).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, c => c.toUpperCase());
}
function diFlattenJson(v, key, out) {
  if (v === null || v === undefined) return;
  if (Array.isArray(v)) { v.forEach(x => diFlattenJson(x, key, out)); return; }
  if (typeof v === "object") { Object.keys(v).forEach(k => diFlattenJson(v[k], k, out)); return; }
  out.push((key ? diHumanKey(key) : "Value") + ": " + v);
}
function diExtractJson(bytes) {
  let data;
  try { data = JSON.parse(diDecodeText(bytes)); } catch (e) { throw new Error("the JSON is not valid (" + e.message + ")"); }
  const lines = []; diFlattenJson(data, "", lines);
  return { text: lines.join("\n"), tables: [], pages: [], notes: [] };
}

function diStripHtml(html) {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
}

function diDecodeTransfer(body, enc) {
  enc = (enc || "").toLowerCase();
  if (enc === "base64") {
    const bin = atob(body.replace(/[^A-Za-z0-9+/=]/g, ""));
    const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out;
  }
  if (enc === "quoted-printable") {
    const s = body.replace(/=\r?\n/g, ""); const out = [];
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) { out.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
      else out.push(s.charCodeAt(i) & 0xFF);
    }
    return new Uint8Array(out);
  }
  const out = new Uint8Array(body.length); for (let i = 0; i < body.length; i++) out[i] = body.charCodeAt(i) & 0xFF; return out;
}

function diParseMimeEntity(raw) {
  const split = raw.search(/\r?\n\r?\n/);
  const headText = split < 0 ? raw : raw.slice(0, split);
  const body = split < 0 ? "" : raw.slice(split).replace(/^\r?\n\r?\n/, "");
  const headers = {};
  headText.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/).forEach(l => { const m = /^([^:\s]+):\s*(.*)$/.exec(l); if (m && !(m[1].toLowerCase() in headers)) headers[m[1].toLowerCase()] = m[2]; });
  return { headers: headers, body: body };
}
function diParam(h, name) { const m = new RegExp(name + '\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))', "i").exec(h || ""); return m ? (m[1] !== undefined ? m[1] : m[2]) : null; }

function diWalkMime(raw, out) {
  const ent = diParseMimeEntity(raw);
  const type = (ent.headers["content-type"] || "text/plain").toLowerCase();
  const disp = ent.headers["content-disposition"] || "";
  const fname = diParam(disp, "filename") || diParam(ent.headers["content-type"], "name");
  if (/^multipart\//.test(type)) {
    const boundary = diParam(ent.headers["content-type"], "boundary");
    if (!boundary) return;
    const esc = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    ent.body.split(new RegExp("--" + esc + "(?:--)?\\r?\\n?")).slice(1).forEach(part => { if (part.trim()) diWalkMime(part.replace(/\r?\n$/, ""), out); });
    return;
  }
  const data = diDecodeTransfer(ent.body, ent.headers["content-transfer-encoding"]);
  if (fname || (!/^text\/(plain|html)/.test(type) && !/^message\//.test(type))) {
    out.attachments.push({ name: fname || "attachment", mime: type.split(";")[0], bytes: data });
  } else if (/^text\/plain/.test(type)) out.plain.push(new TextDecoder("utf-8").decode(data));
  else if (/^text\/html/.test(type)) out.html.push(diStripHtml(new TextDecoder("utf-8").decode(data)));
}

function diExtractEml(bytes) {
  const raw = diDecodeText(bytes);
  const head = diParseMimeEntity(raw);
  const out = { plain: [], html: [], attachments: [] };
  diWalkMime(raw, out);
  const h = head.headers;
  const lines = ["From: " + (h.from || ""), "To: " + (h.to || ""), "Subject: " + (h.subject || ""), "Date: " + (h.date || "")].filter(l => !/:\s*$/.test(l));
  const body = (out.plain.join("\n\n") || out.html.join("\n\n")).trim();
  return { text: lines.join("\n") + "\n\n" + body, tables: [], pages: [], notes: [], attachments: out.attachments };
}

function diWText(node) {
  let s = "";
  Array.prototype.forEach.call(node.getElementsByTagName("*"), n => {
    if (n.nodeName === "w:t") s += n.textContent;
    else if (n.nodeName === "w:tab") s += " ";
    else if (n.nodeName === "w:br") s += "\n";
  });
  return s;
}

async function diExtractDocx(bytes) {
  const zip = diReadZipDirectory(bytes);
  const doc = await diZipXml(zip, "word/document.xml");
  const body = doc.getElementsByTagName("w:body")[0];
  if (!body) throw new Error("the document has no body");
  const parts = [], tables = [];
  Array.prototype.forEach.call(body.childNodes, n => {
    if (n.nodeName === "w:p") { const t = diWText(n).trim(); if (t) parts.push(t); }
    else if (n.nodeName === "w:tbl") {
      const rows = diKids(n, "w:tr").map(tr => diKids(tr, "w:tc").map(tc => Array.prototype.map.call(tc.getElementsByTagName("w:p"), p => diWText(p)).join(" ").trim()));
      tables.push({ name: "Table " + (tables.length + 1), rows: rows });
      parts.push(diTableToText(rows));
    }
  });
  return { text: parts.join("\n"), tables: tables, pages: [], notes: [] };
}

function diColIndex(ref) { const m = /^([A-Z]+)/.exec(ref || ""); if (!m) return 0; let n = 0; for (const c of m[1]) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; }

async function diExtractXlsx(bytes) {
  const zip = diReadZipDirectory(bytes);
  const shared = [];
  const sst = await diZipXml(zip, "xl/sharedStrings.xml");
  if (sst) Array.prototype.forEach.call(sst.getElementsByTagName("si"), si => shared.push(Array.prototype.map.call(si.getElementsByTagName("t"), t => t.textContent).join("")));
  const wb = await diZipXml(zip, "xl/workbook.xml");
  const sheetNames = wb ? Array.prototype.map.call(wb.getElementsByTagName("sheet"), s => s.getAttribute("name")) : [];
  const sheetFiles = Object.keys(zip.entries).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/(\d+)\.xml/)[1], 10) - parseInt(b.match(/(\d+)\.xml/)[1], 10));
  const tables = [], parts = [], pages = [];
  for (let i = 0; i < sheetFiles.length; i++) {
    const xml = await diZipXml(zip, sheetFiles[i]);
    const rows = [];
    Array.prototype.forEach.call(xml.getElementsByTagName("row"), r => {
      const row = [];
      Array.prototype.forEach.call(r.getElementsByTagName("c"), c => {
        const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0];
        let val = "";
        if (t === "s" && v) val = shared[parseInt(v.textContent, 10)] || "";
        else if (t === "inlineStr") val = Array.prototype.map.call(c.getElementsByTagName("t"), x => x.textContent).join("");
        else if (v) val = v.textContent;
        row[diColIndex(c.getAttribute("r"))] = val;
      });
      for (let k = 0; k < row.length; k++) if (row[k] === undefined) row[k] = "";
      rows.push(row);
    });
    const name = sheetNames[i] || "Sheet " + (i + 1);
    const text = diTableToText(rows);
    tables.push({ name: name, rows: rows });
    pages.push({ page: i + 1, label: name, text: text });
    parts.push(text);
  }
  return { text: parts.join("\n"), tables: tables, pages: pages, notes: sheetFiles.length > 1 ? [sheetFiles.length + " sheets read"] : [] };
}

async function diExtractPptx(bytes) {
  const zip = diReadZipDirectory(bytes);
  const slides = Object.keys(zip.entries).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/(\d+)\.xml/)[1], 10) - parseInt(b.match(/(\d+)\.xml/)[1], 10));
  const pages = [], tables = [];
  for (let i = 0; i < slides.length; i++) {
    const xml = await diZipXml(zip, slides[i]);
    const lines = [];
    Array.prototype.forEach.call(xml.getElementsByTagName("a:tbl"), tbl => {
      const rows = Array.prototype.map.call(tbl.getElementsByTagName("a:tr"), tr => Array.prototype.map.call(tr.getElementsByTagName("a:tc"), tc => Array.prototype.map.call(tc.getElementsByTagName("a:t"), t => t.textContent).join(" ").trim()));
      tables.push({ name: "Slide " + (i + 1) + " table", rows: rows });
      lines.push(diTableToText(rows));
    });
    Array.prototype.forEach.call(xml.getElementsByTagName("a:p"), p => {
      if (p.parentNode && p.parentNode.nodeName === "a:txBody" && p.parentNode.parentNode && p.parentNode.parentNode.nodeName === "a:tc") return;
      const t = Array.prototype.map.call(p.getElementsByTagName("a:t"), x => x.textContent).join("").trim();
      if (t) lines.push(t);
    });
    pages.push({ page: i + 1, label: "Slide " + (i + 1), text: lines.join("\n") });
  }
  return { text: pages.map(p => p.text).join("\n"), tables: tables, pages: pages, notes: [slides.length + " slide(s) read"] };
}

function diPdfString(s) {
  return s.replace(/\\(\r\n|\r|\n)/g, "").replace(/\\([nrtbf()\\])|\\([0-7]{1,3})/g, (m, c, o) => {
    if (o) return String.fromCharCode(parseInt(o, 8) & 0xFF);
    return { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" }[c];
  });
}
function diPdfHex(h) {
  h = h.replace(/\s+/g, ""); if (h.length % 2) h += "0";
  const bytes = []; for (let i = 0; i < h.length; i += 2) bytes.push(parseInt(h.substr(i, 2), 16));
  if (bytes.length >= 2 && bytes.length % 2 === 0 && bytes.filter((b, i) => i % 2 === 0 && b === 0).length >= bytes.length / 2 - 1) return bytes.filter((b, i) => i % 2 === 1).map(b => String.fromCharCode(b)).join("");
  return bytes.map(b => String.fromCharCode(b)).join("");
}

function diPdfContentText(content) {
  let out = "";
  const re = /\[((?:[^\]\\]|\\[\s\S])*)\]\s*TJ|(\((?:[^()\\]|\\[\s\S]|\((?:[^()\\]|\\[\s\S])*\))*\))\s*(?:Tj|'|")|<([0-9A-Fa-f\s]+)>\s*Tj|(-?[\d.]+)\s+(-?[\d.]+)\s+T[dD]|\bT\*|\bET\b/g;
  const blocks = content.match(/BT[\s\S]*?ET/g) || [];
  blocks.forEach(b => {
    let m; re.lastIndex = 0;
    while ((m = re.exec(b)) !== null) {
      if (m[1] !== undefined) {
        const arr = /\((?:[^()\\]|\\[\s\S])*\)|<[0-9A-Fa-f\s]+>|-?[\d.]+/g; let t;
        while ((t = arr.exec(m[1])) !== null) {
          if (t[0][0] === "(") out += diPdfString(t[0].slice(1, -1));
          else if (t[0][0] === "<") out += diPdfHex(t[0].slice(1, -1));
          else if (parseFloat(t[0]) < -200) out += " ";
        }
      } else if (m[2] !== undefined) out += diPdfString(m[2].slice(1, -1));
      else if (m[3] !== undefined) out += diPdfHex(m[3]);
      else if (m[4] !== undefined) { if (Math.abs(parseFloat(m[5])) > 0.5) out += "\n"; else out += " "; }
      else if (m[0] === "T*") out += "\n";
    }
    out += "\n";
  });
  return out;
}

async function diExtractPdf(bytes) {
  const str = new TextDecoder("windows-1252").decode(bytes);
  const re = /<<((?:[^<>]|<<[^<>]*>>)*)>>\s*stream\r?\n/g;
  const pages = []; const notes = []; let images = 0, m, unreadable = 0;
  while ((m = re.exec(str)) !== null) {
    const dict = m[1], start = re.lastIndex, end = str.indexOf("endstream", start);
    if (end < 0) break;
    if (/\/Subtype\s*\/Image/.test(dict)) { images++; continue; }
    if (/\/Type\s*\/(?:ObjStm|XRef|Metadata)|\/FontFile|\/Length1/.test(dict)) continue;
    let data = bytes.subarray(start, end);
    if (/\/FlateDecode/.test(dict)) {
      // The stream is usually followed by an end-of-line before "endstream"; that byte is not part of the compressed data.
      let inflated = null;
      for (let trim = 0; trim <= 2 && !inflated; trim++) { try { inflated = await diInflate(data.subarray(0, data.length - trim), "deflate"); } catch (e) { inflated = null; } }
      if (!inflated) { unreadable++; continue; }
      data = inflated;
    } else if (/\/Filter/.test(dict)) { unreadable++; continue; }
    const content = new TextDecoder("windows-1252").decode(data);
    if (!/\bBT\b/.test(content) || !/T[jJ]|['"]\s/.test(content)) continue;
    const text = diPdfContentText(content).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (text) pages.push({ page: pages.length + 1, text: text });
  }
  const all = pages.map(p => p.text).join("\n");
  const printable = all.length ? (all.match(/[\x20-\x7E\n\t]/g) || []).length / all.length : 0;
  if (all.replace(/\s/g, "").length < 20 || printable < 0.85) {
    return { text: "", tables: [], pages: [], notes: [images ? "The PDF holds page images and no readable text layer (a scan)" : (all ? "The PDF text uses encoded fonts that cannot be read without OCR" : "No text layer was found")], scanned: true, unreadable: unreadable };
  }
  if (unreadable) notes.push(unreadable + " content stream(s) could not be decoded");
  notes.push("Page numbers follow the order of the page content in the file");
  return { text: all, tables: [], pages: pages, notes: notes };
}

// ----------------------------------------------------------------------------
// 4. PROCESS ONE FILE -> a result record (and the results of any email attachments)
// ----------------------------------------------------------------------------
function diMethodLabel(kind) {
  return { pdf: "PDF text extraction", docx: "Document parser (DOCX)", xlsx: "Spreadsheet parser (XLSX)", pptx: "Slide parser (PPTX)", eml: "Email parser", json: "Structured-data parser (JSON)", csv: "Direct text and table parsing", txt: "Direct text parsing" }[kind] || "OCR service";
}

function diResultShell(name, size, mime, parent) {
  return { name: name, size: size, mime: mime || "", parent: parent || null, kind: "unknown", label: "", ext: diExt(name), status: "failed", method: "", text: "", tables: [], pages: [], notes: [], confidence: null, extractedAt: new Date().toISOString() };
}

async function diProcessFile(name, mime, bytes, parent, depth) {
  const r = diResultShell(name, bytes.length, mime, parent);
  depth = depth || 0;
  const out = [r];
  if (bytes.length === 0) { r.status = "rejected"; r.notes.push("The file is empty."); return out; }
  if (bytes.length > DI_MAX_FILE_BYTES) { r.status = "rejected"; r.notes.push("The file is " + diBytes(bytes.length) + "; the limit is " + diBytes(DI_MAX_FILE_BYTES) + "."); return out; }
  if (diIsExecutable(bytes, name)) { r.kind = "unknown"; r.label = "Program or script"; r.status = "rejected"; r.notes.push("Programs and scripts are not accepted as documents."); return out; }
  const info = diDetectType(bytes, name);
  try {
    if (info.kind === "zip") {
      info.kind = diResolveZipKind(diReadZipDirectory(bytes).entries);
      info.label = (DI_KIND_INFO[info.kind] || DI_KIND_INFO.unknown).label;
      info.supported = DI_SUPPORTED_KINDS.indexOf(info.kind) > -1;
    }
  } catch (e) { info.kind = "unknown"; info.label = DI_KIND_INFO.unknown.label; info.supported = false; r.notes.push("The archive could not be opened: " + e.message); }
  diCheckExtension(info);
  r.kind = info.kind; r.label = info.label;
  if (info.mismatch) { r.status = "rejected"; r.notes.push(info.note); return out; }
  if (!info.supported) {
    r.status = "unsupported";
    r.notes.push("No safe converter is available for " + info.label + ". The file was kept as received. Ask the sender for a PDF, Word, Excel, CSV or email (EML) copy.");
    return out;
  }
  try {
    let res;
    r.method = diMethodLabel(info.kind);
    if (DI_IMAGE_KINDS.indexOf(info.kind) > -1) res = { text: "", scanned: true, notes: [] };
    else if (info.kind === "pdf") res = await diExtractPdf(bytes);
    else if (info.kind === "docx") res = await diExtractDocx(bytes);
    else if (info.kind === "xlsx") res = await diExtractXlsx(bytes);
    else if (info.kind === "pptx") res = await diExtractPptx(bytes);
    else if (info.kind === "eml") res = diExtractEml(bytes);
    else if (info.kind === "json") res = diExtractJson(bytes);
    else res = diExtractPlainText(bytes, info.kind);

    if (res.scanned) {
      const provider = window.DOCUMENT_OCR_PROVIDER;
      if (typeof provider === "function") {
        r.method = "OCR (connected service)";
        const o = await provider(name, bytes, info.kind);
        res = { text: String((o && o.text) || ""), tables: (o && o.tables) || [], pages: (o && o.pages) || [], notes: [], confidence: o && typeof o.confidence === "number" ? o.confidence : null };
      } else {
        r.status = "needs_ocr"; r.method = "OCR required";
        r.notes = (res.notes || []).concat(["No OCR service is connected, so nothing was read from this file. Connect one (Textract, OCI Document Understanding, Azure Document Intelligence or Tesseract) or ask the sender for a text-based copy."]);
        return out;
      }
    }
    r.text = (res.text || "").slice(0, DI_MAX_TEXT_CHARS);
    r.tables = res.tables || []; r.pages = res.pages || []; r.notes = (res.notes || []).slice(); r.confidence = res.confidence === undefined ? null : res.confidence;
    r.status = r.text.replace(/\s/g, "").length ? "extracted" : "empty";
    if (r.status === "empty") r.notes.push("The file was read but holds no text.");
    if (info.kind === "eml" && res.attachments && res.attachments.length) {
      if (depth >= DI_MAX_EML_DEPTH) r.notes.push(res.attachments.length + " nested attachment(s) were not opened (nesting limit).");
      else for (const a of res.attachments) { const sub = await diProcessFile(a.name, a.mime, a.bytes, name, depth + 1); sub.forEach(x => out.push(x)); }
      r.notes.push(res.attachments.length + " attachment(s) found in the email");
    }
  } catch (e) {
    r.status = "failed"; r.notes.push("The file could not be read: " + e.message);
  }
  return out;
}

function diBase64ToBytes(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }

/** Quick check used when a file is attached: size and type only, no extraction. */
async function diPrecheckFile(file) {
  if (file.size === 0) return { ok: false, reason: "is empty" };
  if (file.size > DI_MAX_FILE_BYTES) return { ok: false, reason: "is " + diBytes(file.size) + " (limit " + diBytes(DI_MAX_FILE_BYTES) + ")" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (diIsExecutable(bytes, file.name)) return { ok: false, reason: "is a program or script; only documents are accepted" };
  const info = diDetectType(bytes, file.name);
  if (info.kind === "zip") { try { info.kind = diResolveZipKind(diReadZipDirectory(bytes).entries); info.label = DI_KIND_INFO[info.kind].label; info.supported = DI_SUPPORTED_KINDS.indexOf(info.kind) > -1; } catch (e) { info.kind = "unknown"; info.supported = false; } }
  diCheckExtension(info);
  if (info.mismatch) return { ok: false, reason: "was refused: " + info.note, info: info };
  return { ok: true, info: info };
}

// ----------------------------------------------------------------------------
// 5. NORMALIZE: independent extraction per document, then one consolidated draft
// ----------------------------------------------------------------------------
var DI_SCALAR_KEYS = ["insured", "fein", "dot", "mcNumber", "broker", "email", "exposureVal", "address", "effectiveDate", "expirationDate", "policyType", "program", "priorPolicyPeriod", "assignedUnderwriter", "primaryCommodity"];
var DI_FIELD_LABELS = { insured: "Named Insured", fein: "FEIN / Tax ID", dot: "DOT Number", mcNumber: "MC Number", broker: "Broker / Agency", email: "Contact Email", exposureVal: "Requested Limit / TIV", address: "Address", effectiveDate: "Effective Date", expirationDate: "Expiration Date", policyType: "Policy Type", program: "Program", priorPolicyPeriod: "Prior Policy Period", assignedUnderwriter: "Assigned Underwriter", primaryCommodity: "Primary Commodity" };

function diNorm(v) { return String(v === null || v === undefined ? "" : v).toLowerCase().replace(/[^a-z0-9]/g, ""); }

function diFindLocation(doc, value) {
  if (value === null || value === undefined || value === "") return { page: null, snippet: "" };
  const needle = String(value).toLowerCase();
  const lineOf = t => (t.split(/\n/).filter(l => l.toLowerCase().indexOf(needle) > -1)[0] || "").trim().slice(0, 140);
  for (const p of (doc.pages || [])) { const s = lineOf(p.text || ""); if (s) return { page: p.label || p.page, snippet: s }; }
  return { page: null, snippet: lineOf(doc.text || "") };
}

/** The insurance company a loss run belongs to: only what the document itself states, never taken from the file name. */
function diDetectCarrier(text) {
  const head = String(text || "").split(/\n/).slice(0, 40).join("\n");
  const labelled = /(?:Insurance\s+Company|Insurance\s+Carrier|Insurer|Carrier|Issuing\s+Company|Company\s+Name)\s*:\s*([^\n;|]+)/i.exec(head);
  if (labelled && labelled[1].trim().length > 1) return labelled[1].trim().slice(0, 80);
  const lines = head.split(/\n/).slice(0, 10);
  for (const l of lines) {
    if (/\b(?:Insurance|Assurance|Indemnity|Casualty|Mutual|Underwriters|Surety)\b/i.test(l) && l.trim().length < 120 && !/:/.test(l)) {
      return l.replace(/\s*[-\u2013\u2014]?\s*(?:currently\s+valued|loss\s+runs?|claims?\s+(?:history|report)).*$/i, "").trim().slice(0, 80) || null;
    }
  }
  return null;
}

// ----------------------------------------------------------------------------
// Vehicle and driver schedules (and statements of values) arrive as tables, or as one line per unit.
// ----------------------------------------------------------------------------
function diHeaderKey(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function diMoney(s) { const m = /-?[\d,]+(?:\.\d+)?/.exec(String(s === null || s === undefined ? "" : s).replace(/\s/g, "")); const n = m ? parseFloat(m[0].replace(/,/g, "")) : NaN; return isNaN(n) ? null : n; }

/** Finds the header row of a table and maps its columns to field names. cols: { field: [regexes on the normalised header] } */
function diMapColumns(rows, cols, mustHave) {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const map = {};
    (rows[i] || []).forEach((h, idx) => { const k = diHeaderKey(h); Object.keys(cols).forEach(f => { if (map[f] === undefined && cols[f].some(re => re.test(k))) map[f] = idx; }); });
    if (mustHave(map)) return { header: i, map: map };
  }
  return null;
}

var DI_VEHICLE_COLS = {
  year: [/^(?:modelyear|vehicleyear|year|yr|myr)$/],
  make: [/^(?:make|manufacturer|vehiclemake)$/],
  model: [/^(?:model|vehiclemodel|modeldescription|description|vehicledescription)$/],
  makeModel: [/^(?:makemodel|makeandmodel|makeormodel|vehicle|unitdescription|vehiclemakemodel)$/],
  vin: [/^(?:vin|vinnumber|vehicleidentificationnumber|serialno|serialnumber|serial)$/],
  value: [/(?:statedvalue|insuredvalue|vehiclevalue|statedamount|actualcashvalue|^acv$|costnew|presentvalue|totalinsuredvalue|^tiv$|^value$|^valueamount$|^amount$|^values$)/],
  type: [/^(?:type|vehicletype|bodytype|body|unittype|class)$/],
  driver: [/(?:assigneddriver|^driver$)/],
  plate: [/^(?:licenseplate|licenceplate|plate|plateno|platenumber|plateid|tag|tagnumber)$/],
  plateState: [/^(?:platestate|registrationstate|regstate|plateregstate|stateofregistration)$/],
  dashcam: [/^(?:dashcam|dashcams|dashcaminstalled|dashcamsinstalled|hasdashcam|dashcamyn|dashcamfitted|camera|cameras|dashcamequipped)$/]
};

/** "Yes" / "Installed" / "Y" -> true; "No" / "None" -> false; anything else -> not stated (null). */
function diYesNo(s) {
  const t = String(s === null || s === undefined ? "" : s).trim().toLowerCase();
  if (/^(y|yes|true|installed|fitted|1)(?![a-z])/.test(t)) return true;
  if (/^(n|no|false|none|not installed|0)(?![a-z])/.test(t)) return false;
  return null;
}

function diVehiclesFromTables(tables) {
  const out = [];
  (tables || []).forEach(t => {
    const rows = t.rows || [];
    const m = diMapColumns(rows, DI_VEHICLE_COLS, mp => mp.year !== undefined && (mp.make !== undefined || mp.model !== undefined || mp.makeModel !== undefined || mp.vin !== undefined));
    if (!m) return;
    rows.slice(m.header + 1).forEach(r => {
      const cell = f => (m.map[f] === undefined ? "" : String(r[m.map[f]] === undefined ? "" : r[m.map[f]]).trim());
      if (/^total/i.test(String(r[0] || "").trim())) return;
      const year = /\b(?:19|20)\d{2}\b/.exec(cell("year"));
      if (!year && !cell("vin")) return;
      let make = cell("make"), model = cell("model");
      if (!make && !model && cell("makeModel")) { const parts = cell("makeModel").split(/\s+/); make = parts[0]; model = parts.slice(1).join(" "); }
      out.push({ year: year ? parseInt(year[0], 10) : null, make: make, model: model, vin: cell("vin") || null, vehicle_type: cell("type") || extractVehicleTypeFromModel(model), stated_value: diMoney(cell("value")), assigned_driver: cell("driver") || null, plate: cell("plate") || null, dashcam: diYesNo(cell("dashcam")), plateState: cell("plateState") ? cell("plateState").toUpperCase().slice(0, 2) : null });
    });
  });
  return out;
}

function diLooksLikeVehicleSchedule(src) {
  return /vehicle\s+schedule|schedule\s+of\s+(?:vehicles|values)|statement\s+of\s+values|\bSOV\b|fleet\s+schedule|unit\s+schedule|power\s+units/i.test(src.name + "\n" + String(src.text || "").split(/\n/).slice(0, 40).join("\n"));
}

/** One vehicle per line: "2022 Volvo VNL 760 VIN 4V4NC9EH5NN123456 $125,000". */
function diVehiclesFromLines(text) {
  const out = [];
  String(text || "").split(/\n/).map(l => l.trim()).filter(Boolean).forEach(line => {
    if (/^total/i.test(line) || !/\b(?:19|20)\d{2}\b/.test(line)) return;
    const vin = /\b[A-HJ-NPR-Z0-9]{17}\b/.exec(line);
    const money = /\$\s*([\d,]+(?:\.\d+)?)/.exec(line);
    const bare = line.replace(/\bVIN\s*[:#]?\s*/i, "").replace(vin ? vin[0] : "\u0000", "").replace(/\$\s*[\d,]+(?:\.\d+)?/g, "").replace(/\bstated\s+value\b\s*[:\-]?/i, "").replace(/\s{2,}/g, " ").trim();
    const parsed = parseVehicleLineDetails(bare);
    if (parsed && parsed.make) { parsed.vin = vin ? vin[0] : null; if (parsed.dashcam === undefined) delete parsed.dashcam; parsed.stated_value = money ? parseFloat(money[1].replace(/,/g, "")) : null; out.push(parsed); }
  });
  return out;
}

var DI_DRIVER_COLS = {
  name: [/^(?:drivername|name|fullname|driver)$/],
  first: [/^(?:firstname|givenname)$/],
  last: [/^(?:lastname|surname|familyname)$/],
  dob: [/^(?:dob|dateofbirth|birthdate|birthday|drivergdob|driverdob|dateborn)$/],
  age: [/^(?:age|driverage|ageyears)$/],
  dobAge: [/^(?:dobage|ageordob|dobandage|dateofbirthage|dobsage|dobage)$/],
  sex: [/^(?:sex|gender)$/],
  license: [/^(?:licen[sc]e(?:number|no|num|id|nbr)?|dl(?:number|no|num|id|nbr)?|driverslicen[sc]e(?:number|no|num)?|cdl(?:number|no)?|driverlicen[sc]e(?:number|no)?)$/],
  state: [/^(?:licen[sc]estate|state|dlstate|issuingstate|stateofissue|licen[sc]est|stateissued)$/],
  cls: [/^(?:licenseclass|class|cdlclass|licensetype)$/],
  experience: [/^(?:experience|yearsexperience|cdlexperience|yearsofexperience|yearscdl)$/],
  violations: [/^(?:violations|mvrviolations|movingviolations)$/],
  history: [/(?:drivinghistory|historyreported|violationsreported|mvrhistory)/],
  mvrStatus: [/^(?:verificationstatus|mvrstatus|mvrverification)$/]
};

var DI_STATES = { alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY" };
/** "TX", "Ohio (OH)", "Texas" -> a two-letter state code; anything else is left as written. */
function diStateCode(s) {
  const t = String(s || "").trim();
  const paren = /\(([A-Za-z]{2})\)/.exec(t); if (paren) return paren[1].toUpperCase();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return DI_STATES[t.toLowerCase()] || t;
}
/** A reported history in words: "No violations reported" -> 0, "One minor violation reported" -> 1, "2 violations" -> 2; unclear -> null. */
function diViolationCount(s) {
  const t = String(s || "").toLowerCase();
  if (/\bno\b[^.]*\b(?:violations?|accidents?|incidents?)\b|\bclean\b|\bnone\b/.test(t)) return 0;
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const m = /\b(\d+|one|two|three|four|five)\b[^.]*\b(?:violations?|accidents?|tickets?)\b/.exec(t);
  return m ? (words[m[1]] !== undefined ? words[m[1]] : parseInt(m[1], 10)) : null;
}

function diDriversFromTables(tables) {
  const out = [], extras = {};
  // A second table, headed by the driver's name, can carry the reported driving history and MVR status; it is joined to the driver by name.
  (tables || []).forEach(t => {
    const rows = t.rows || [];
    const h = diMapColumns(rows, DI_DRIVER_COLS, mp => mp.name !== undefined && (mp.history !== undefined || mp.mvrStatus !== undefined) && mp.license === undefined && mp.dob === undefined);
    if (!h) return;
    rows.slice(h.header + 1).forEach(r => {
      const nm = String(r[h.map.name] || "").trim().toLowerCase(); if (!nm) return;
      const e = extras[nm] = extras[nm] || {};
      if (h.map.history !== undefined) { const v = diViolationCount(r[h.map.history]); if (v !== null) e.violations = v; }
      if (h.map.mvrStatus !== undefined && r[h.map.mvrStatus]) e.mvrStatus = String(r[h.map.mvrStatus]).trim();
    });
  });
  (tables || []).forEach(t => {
    const rows = t.rows || [];
    const m = diMapColumns(rows, DI_DRIVER_COLS, mp => (mp.name !== undefined || (mp.first !== undefined && mp.last !== undefined)) && (mp.dob !== undefined || mp.license !== undefined || mp.age !== undefined || mp.dobAge !== undefined));
    if (!m) return;
    rows.slice(m.header + 1).forEach(r => {
      const cell = f => (m.map[f] === undefined ? "" : String(r[m.map[f]] === undefined ? "" : r[m.map[f]]).trim());
      const name = cell("name") || (cell("first") + " " + cell("last")).trim();
      if (!name || /^total/i.test(name)) return;
      const d = { name: name };
      if (cell("age") && !isNaN(parseFloat(cell("age")))) d.age = parseFloat(cell("age"));
      if (cell("dob")) d.dob = cell("dob");
      if (cell("dobAge")) { const v = cell("dobAge"); if (/\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}/.test(v) || /[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}/.test(v)) d.dob = d.dob || v; else if (!isNaN(parseFloat(v))) d.age = d.age === undefined ? parseFloat(v) : d.age; }
      if (cell("sex")) d.sex = /^m/i.test(cell("sex")) ? "M" : "F";
      if (cell("license")) d.licenseNumber = cell("license").toUpperCase();
      if (cell("state")) d.licensestate = diStateCode(cell("state"));
      if (cell("cls")) d.licenseclasstype = /^class/i.test(cell("cls")) || !/^[A-D]$/i.test(cell("cls")) ? cell("cls") : "Class " + cell("cls").toUpperCase();
      if (cell("experience") && !isNaN(parseFloat(cell("experience")))) d.experience = parseFloat(cell("experience")) + " Years";
      if (cell("violations") && !isNaN(parseInt(cell("violations"), 10))) d.violations = parseInt(cell("violations"), 10);
      const e = extras[name.toLowerCase()];
      if (e) { if (d.violations === undefined && e.violations !== undefined) d.violations = e.violations; if (e.mvrStatus) d.mvrStatus = e.mvrStatus; }
      out.push(d);
    });
  });
  return out;
}

/** A list that names people and gives licences is worth more than one of the same length that only has ages. */
function diRichness(list) { return list.length * 1000 + list.reduce((s, x) => s + Object.keys(x).filter(k => x[k] !== null && x[k] !== undefined && x[k] !== "").length, 0); }

function diListToUnits(list) { const o = {}; list.forEach((v, i) => { o[i + 1] = v; }); return o; }

/** Vehicles for one document: the unit-line format first, then a table, then one-line-per-vehicle in a document that is a schedule. */
function diVehiclesOf(d) {
  const fromTables = diVehiclesFromTables(d.src.tables);
  if (fromTables.length) return fromTables;
  const fromLines = diLooksLikeVehicleSchedule(d.src) ? diVehiclesFromLines(d.src.text) : [];
  if (fromLines.length) return fromLines;
  return Object.keys(d.draft.vehicleDetails || {}).map(k => d.draft.vehicleDetails[k]);
}
function diDriversOf(d) {
  const fromTables = diDriversFromTables(d.src.tables);
  if (fromTables.length) return fromTables;
  return Object.keys(d.draft.driverDetails || {}).map(k => d.draft.driverDetails[k]);
}

/** Vehicles from every document in one schedule: the fullest schedule is the base; vehicles with a VIN it lacks are added from the others. */
function diCombineVehicles(perDoc) {
  const lists = perDoc.map(d => ({ doc: d.src, list: diVehiclesOf(d) })).filter(x => x.list.length);
  if (!lists.length) return { rows: [], docs: [] };
  lists.sort((a, b) => diRichness(b.list) - diRichness(a.list));
  const rows = lists[0].list.map(v => Object.assign({}, v, { sourceDocument: lists[0].doc.name }));
  const vins = {}; rows.forEach(v => { if (v.vin) vins[diNorm(v.vin)] = true; });
  lists.slice(1).forEach(x => x.list.forEach(v => { if (v.vin && !vins[diNorm(v.vin)]) { vins[diNorm(v.vin)] = true; rows.push(Object.assign({}, v, { sourceDocument: x.doc.name })); } }));
  return { rows: rows, docs: lists.map(x => x.doc.name) };
}

function diLooksLikeLossRun(src) {
  return /loss\s*-?\s*run|claims?\s+(?:history|report)|currently\s+valued/i.test(src.name + "\n" + String(src.text || "").split(/\n/).slice(0, 40).join("\n"));
}

/** Claim rows from a loss run laid out one claim per line, either as "Label: value; Label: value" (spreadsheets) or as running text with a year and an amount. */
function diParseLossRunLines(text) {
  const rows = [];
  const yearOf = s => { const m = /\b(?:19|20)\d{2}\b/.exec(s || ""); return m ? m[0] : null; };
  String(text || "").split(/\n/).map(l => l.trim()).filter(Boolean).forEach(line => {
    if (/^total\b/i.test(line) || /^(?:policy\s+year|year)\s*[;|]/i.test(line)) return;
    const pairs = {};
    line.split(/\s*;\s*/).forEach(seg => { const m = /^([A-Za-z #./]+?)\s*:\s*(.+)$/.exec(seg); if (m) pairs[m[1].toLowerCase().replace(/[^a-z]/g, "")] = m[2].trim(); });
    const pick = (...keys) => { for (const k of keys) if (pairs[k]) return pairs[k]; return null; };
    if (Object.keys(pairs).length >= 3) {
      const year = yearOf(pick("policyyear", "year", "dateofloss", "lossdate", "claimdate", "date"));
      const incurred = pick("totalincurred", "incurred", "incurredamount", "amount");
      if (!year || !incurred) return;
      const amt = /\$?\s*([\d,]+(?:\.\d+)?)/.exec(incurred);
      const row = { year: year, desc: pick("descriptionofloss", "lossdescription", "description", "claimtype", "cause", "type") || "No description provided", status: (pick("status", "claimstatus") || "").replace(/^\w/, c => c.toUpperCase()) || "Closed", incurred: amt ? "$" + amt[1] : "$0" };
      const no = pick("claimnumber", "claimno", "claim", "claimid"); if (no) row.claimNo = no;
      rows.push(row);
      return;
    }
    if (yearOf(line) && /\$\s*[\d,]+/.test(line)) {
      const row = parseLossLineDetails(line);
      if (row) rows.push(row);
    }
  });
  return rows;
}

/** Every claim from every loss run document, in one list; each row says which company and which document it came from. */
function diCombineLosses(perDoc) {
  const rows = [], seen = {}; let duplicates = 0;
  perDoc.forEach(d => {
    const carrier = diDetectCarrier(d.src.text);
    const claims = (d.draft.lossHistory && d.draft.lossHistory.length) ? d.draft.lossHistory : (diLooksLikeLossRun(d.src) ? diParseLossRunLines(d.src.text) : []);
    d.lossClaims = claims.length;
    claims.forEach(l => {
      const row = Object.assign({}, l, { carrier: carrier, sourceDocument: d.src.name });
      const key = [diNorm(carrier), diNorm(l.claimNo), diNorm(l.year), diNorm(l.desc), diNorm(l.incurred)].join("|");
      if (seen[key]) { duplicates++; return; }
      seen[key] = true; rows.push(row);
    });
  });
  rows.sort((a, b) => (parseInt(String(b.year).slice(-4), 10) || 0) - (parseInt(String(a.year).slice(-4), 10) || 0));
  return { rows: rows, duplicates: duplicates };
}

function diVehicleCount(text) {
  const m = /Vehicle\s*Count\s*[:\-]\s*(\d+)/i.exec(text) || /(?:number\s+of|total)\s+(?:vehicles|power\s+units|units)\s*[:\-]?\s*(\d+)/i.exec(text);
  return m ? parseInt(m[1], 10) : null;
}

/** sources: [{ name, method, text, pages, kind, status }]. Reads each independently, then consolidates with the email body first. */
function diConsolidate(sub, sources) {
  const perDoc = sources.map(s => ({ src: s, draft: buildLocalNormalizationDraft({ rawEmailText: s.text, lobKey: sub.lobKey, id: sub.id }), vehicleCount: diVehicleCount(s.text) }));
  const draft = perDoc.length ? Object.assign({}, perDoc[0].draft) : Object.assign({}, buildLocalNormalizationDraft({ rawEmailText: "", lobKey: sub.lobKey, id: sub.id }));
  const fieldSources = {}, conflicts = [];

  DI_SCALAR_KEYS.forEach(key => {
    const cands = [];
    perDoc.forEach(d => { const v = d.draft[key]; if (v !== null && v !== undefined && v !== "") cands.push({ value: v, doc: d.src }); });
    draft[key] = cands.length ? cands[0].value : null;
    if (cands.length) {
      const loc = diFindLocation(cands[0].doc, cands[0].value);
      fieldSources[key] = { document: cands[0].doc.name, method: cands[0].doc.method, page: loc.page, snippet: loc.snippet };
      const differing = cands.filter(c => diNorm(c.value) !== diNorm(cands[0].value));
      if (differing.length) conflicts.push({ field: key, label: DI_FIELD_LABELS[key] || key, kept: { value: cands[0].value, document: cands[0].doc.name }, others: differing.map(c => ({ value: c.value, document: c.doc.name })) });
    }
  });

  const combined = diCombineLosses(perDoc);
  const veh = diCombineVehicles(perDoc);
  const drvDoc = perDoc.map(d => ({ doc: d.src, list: diDriversOf(d) })).filter(x => x.list.length).sort((a, b) => diRichness(b.list) - diRichness(a.list))[0];
  draft.driverDetails = drvDoc ? diListToUnits(drvDoc.list) : {};
  draft.vehicleDetails = diListToUnits(veh.rows);
  draft.lossHistory = combined.rows;
  if (drvDoc) fieldSources.drivers = { document: drvDoc.doc.name, method: drvDoc.doc.method };
  if (veh.rows.length) fieldSources.vehicles = { document: veh.docs.join(", "), method: perDoc[0].src.method };
  const lossDocs = perDoc.filter(d => d.lossClaims);
  if (lossDocs.length) fieldSources.losses = { document: lossDocs.map(d => d.src.name).join(", "), method: lossDocs[0].src.method };

  draft.operationsProfile = {};
  perDoc.forEach(d => {
    Object.keys(d.draft.operationsProfile || {}).forEach(k => {
      const v = d.draft.operationsProfile[k];
      if (!(k in draft.operationsProfile)) { draft.operationsProfile[k] = v; fieldSources["ops." + k] = { document: d.src.name, method: d.src.method }; }
      else if (diNorm(JSON.stringify(v)) !== diNorm(JSON.stringify(draft.operationsProfile[k]))) conflicts.push({ field: "ops." + k, label: diHumanKey(k), kept: { value: draft.operationsProfile[k], document: fieldSources["ops." + k].document }, others: [{ value: v, document: d.src.name }] });
    });
  });
  const vcSrc = perDoc.filter(d => d.vehicleCount !== null)[0];
  draft.vehicleCount = vcSrc ? vcSrc.vehicleCount : null;
  if (vcSrc) fieldSources.vehicleCount = { document: vcSrc.src.name, method: vcSrc.src.method };

  draft.channelType = draft.broker ? "broker" : "direct";
  const byCompany = {};
  draft.lossHistory.forEach(l => { const k = l.carrier || "company not stated"; byCompany[k] = (byCompany[k] || 0) + 1; });
  draft.lossHistorySummary = draft.lossHistory.length ? `${draft.lossHistory.length} claim(s) from ${Object.keys(byCompany).length} compan${Object.keys(byCompany).length === 1 ? "y" : "ies"}: ` + Object.keys(byCompany).map(k => `${k} ${byCompany[k]}`).join(", ") : null;
  draft.lossDuplicatesSkipped = combined.duplicates;
  draft.fields_confidence = {};
  DI_SCALAR_KEYS.forEach(k => { if (draft[k] !== null && draft[k] !== undefined) draft.fields_confidence[k] = "medium"; });
  Object.keys(draft.fields_confidence).forEach(k => {
    const src = fieldSources[k]; const doc = src && sources.filter(s => s.name === src.document)[0];
    if (doc && typeof doc.confidence === "number") draft.fields_confidence[k] = doc.confidence >= 0.95 ? "high" : doc.confidence >= 0.8 ? "medium" : "low";
  });
  draft.missing_critical_fields = ["insured", "fein"].filter(k => !draft[k]);
  if ((sub.lobKey || draft.lobKey) === "trucking" && !draft.dot) draft.missing_critical_fields.push("dot");

  draft.sourceDocuments = sources.map(s => ({ name: s.name, kind: s.kind, label: s.label, method: s.method, status: s.status, notes: s.notes || [], parent: s.parent || null }));
  draft.fieldSources = fieldSources;
  draft.conflicts = conflicts;
  draft.validation = diValidate(draft, draft);
  draft.documentProblems = (sub.documentExtractions || []).filter(d => d.status !== "extracted" && d.status !== "empty").map(d => ({ name: d.name, status: d.status }));
  delete draft._localFallback;
  draft.review_reasons = diReviewReasons(draft, draft);
  draft.needs_review = draft.review_reasons.length > 0;
  return draft;
}

/**
 * What is still unresolved on this extraction: a file that could not be read, a disagreement between documents, a
 * required value that is missing, a value read by OCR with low confidence, or a blocking validation error.
 * Reminders such as a missing vehicle value are shown in the review and the completeness check but do not flag the case.
 */
function diReviewReasons(draft, values) {
  const v = k => (values[k] === null || values[k] === undefined) ? "" : String(values[k]).trim();
  const reasons = [];
  (draft.documentProblems || []).forEach(d => reasons.push(`${d.name}: ${d.status === "needs_ocr" ? "needs OCR (no OCR service connected)" : d.status === "unsupported" ? "unsupported format" : d.status === "rejected" ? "refused" : "could not be read"}`));
  (draft.conflicts || []).forEach(c => reasons.push(`${c.label} differs between documents`));
  ["insured", "fein"].concat(draft.lobKey === "trucking" || !draft.lobKey ? ["dot"] : []).forEach(k => { if (!v(k)) reasons.push(`${DI_FIELD_LABELS[k] || k} is missing`); });
  DI_SCALAR_KEYS.forEach(k => { if (draft.fields_confidence && draft.fields_confidence[k] === "low" && v(k)) reasons.push(`${DI_FIELD_LABELS[k] || k} was read with low confidence`); });
  diValidate(values, draft).filter(x => x.level === "error").forEach(x => reasons.push(x.text));
  return reasons.slice(0, 8);
}

// ----------------------------------------------------------------------------
// 6. VALIDATE (runs on the draft, and again on the values in the review form)
// ----------------------------------------------------------------------------
function diValidate(values, draft) {
  const out = [];
  const add = (level, text) => out.push({ level: level, text: text });
  const v = k => (values[k] === null || values[k] === undefined) ? "" : String(values[k]).trim();
  if (v("fein") && v("fein") !== "PENDING" && !/^\d{2}-?\d{7}$/.test(v("fein"))) add("error", "FEIN must be 9 digits (for example 74-9842109).");
  if (v("dot") && !/^\d{5,8}$/.test(v("dot"))) add("warn", "DOT number should be 5 to 8 digits.");
  if (v("email") && !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(v("email"))) add("warn", "Contact email does not look like an email address.");
  if (v("exposureVal") && !(parseFloat(v("exposureVal").replace(/[^0-9.]/g, "")) > 0)) add("warn", "Requested limit is not a positive amount.");
  const eff = Date.parse(v("effectiveDate")), exp = Date.parse(v("expirationDate"));
  if (v("effectiveDate") && isNaN(eff)) add("warn", "Effective date is not a recognisable date.");
  if (!isNaN(eff) && !isNaN(exp) && exp <= eff) add("error", "Expiration date is not after the effective date.");
  const nVeh = Object.keys(draft.vehicleDetails || {}).length;
  if (draft.vehicleCount !== null && draft.vehicleCount !== undefined && nVeh && draft.vehicleCount !== nVeh) add("warn", `The documents state ${draft.vehicleCount} vehicle(s) but ${nVeh} are listed in the schedule.`);
  if (draft.vehicleCount && !nVeh) add("warn", `The documents state ${draft.vehicleCount} vehicle(s) but no vehicle schedule was found.`);
  const units = Object.keys(draft.vehicleDetails || {}).map(k => draft.vehicleDetails[k]);
  const noValue = units.filter(v => v.stated_value === null || v.stated_value === undefined).length;
  if (noValue) add("warn", `${noValue} vehicle(s) in the schedule have no stated value.`);
  const noYearMake = units.filter(v => !v.year || !v.make).length;
  if (noYearMake) add("warn", `${noYearMake} vehicle(s) in the schedule are missing the year or make.`);
  const noCarrier = (draft.lossHistory || []).filter(l => !l.carrier).length;
  if (noCarrier) add("warn", `${noCarrier} claim(s) come from a loss run that does not name its insurance company.`);
  if (draft.lossDuplicatesSkipped) add("warn", `${draft.lossDuplicatesSkipped} identical claim(s) appeared in more than one document and were listed once.`);
  return out;
}

// ----------------------------------------------------------------------------
// 7. RUN FOR A SUBMISSION, AND DISPLAY
// ----------------------------------------------------------------------------
var diRunning = {};

async function diRunForSubmission(sub) {
  const results = [];
  for (const a of (sub.rawAttachments || [])) {
    if (!a.base64) {   // the original was not kept in browser storage (size limit), so it cannot be read again
      const gone = diResultShell(a.name, a.size || 0, a.type, null);
      gone.status = "failed"; gone.method = "Not available"; gone.notes.push("The original file is no longer held in the browser (storage limit). Attach it again to read it.");
      results.push(gone);
      continue;
    }
    const rs = await diProcessFile(a.name, a.type, diBase64ToBytes(a.base64), null, 0);
    rs.forEach(x => results.push(x));
  }
  sub.documentExtractions = results.map(r => ({ hasVehicleTable: diVehiclesFromTables(r.tables).length > 0, hasDriverTable: diDriversFromTables(r.tables).length > 0, name: r.name, parent: r.parent, size: r.size, kind: r.kind, label: r.label, status: r.status, method: r.method, notes: r.notes, confidence: r.confidence, pages: r.pages.map(p => ({ page: p.label || p.page, text: String(p.text || "").slice(0, 4000) })), tables: r.tables.length, textExcerpt: r.text.slice(0, DI_MAX_STORED_TEXT), extractedAt: r.extractedAt }));
  const sources = [];
  if (sub.rawEmailText) sources.push({ name: "Email text", kind: "txt", label: "Pasted email text", method: "Direct text parsing", status: "extracted", text: sub.rawEmailText, pages: [], notes: [] });
  results.filter(r => r.status === "extracted").forEach(r => sources.push({ name: r.name, kind: r.kind, label: r.label, method: r.method, status: r.status, text: r.text, pages: r.pages, tables: r.tables, notes: r.notes, parent: r.parent, confidence: r.confidence }));
  const draft = diConsolidate(sub, sources);
  results.filter(r => r.status !== "extracted").forEach(r => draft.sourceDocuments.push({ name: r.name, kind: r.kind, label: r.label, method: r.method, status: r.status, notes: r.notes, parent: r.parent }));
  (sub.docs || []).forEach(d => {
    const r = results.filter(x => x.name === d.name && !x.parent)[0];
    if (r) d.desc = `Raw Upload (${diBytes(r.size)}) • ${r.label} • ${diStatusText(r.status)}`;
  });
  return draft;
}

function diStatusText(s) { return { extracted: "Read", empty: "Read, no text", needs_ocr: "Needs OCR", unsupported: "Unsupported", rejected: "Refused", failed: "Could not be read" }[s] || s; }
function diStatusBadge(s) { const cls = { extracted: "badge-success", empty: "badge-warning", needs_ocr: "badge-warning", unsupported: "badge-danger", rejected: "badge-danger", failed: "badge-danger" }[s] || "badge-light"; return `<span class="badge ${cls}">${diEsc(diStatusText(s))}</span>`; }

/** One Loss Run History table for the whole submission, whatever number of companies supplied loss runs. */
function diLossTableHtml(losses) {
  if (!losses.length) return "";
  const total = losses.reduce((s, l) => s + (parseFloat(String(l.incurred || "0").replace(/[^0-9.]/g, "")) || 0), 0);
  const rows = losses.map(l => `<tr><td>${diEsc(l.carrier || "Not stated")}</td><td>${diEsc(l.sourceDocument || "")}</td><td>${diEsc(l.year)}</td><td>${diEsc(l.claimNo || "—")}</td><td>${diEsc(l.desc)}</td><td>${diEsc(l.status)}</td><td class="font-mono">${diEsc(l.incurred)}</td></tr>`).join("");
  return `<div style="margin-top:12px;"><div class="email-digest-section-title"><i class="ph ph-file-text"></i> Loss Run History (${losses.length} claim${losses.length === 1 ? "" : "s"}, all companies combined)</div>
    <table class="data-table"><thead><tr><th>Insurance company</th><th>Source document</th><th>Policy year</th><th>Claim no.</th><th>Description</th><th>Status</th><th>Incurred</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td colspan="6"><strong>Total incurred, all companies</strong></td><td class="font-mono"><strong>$${total.toLocaleString()}</strong></td></tr></tfoot></table></div>`;
}

/** The vehicle schedule exactly as extracted, with the document each unit came from. */
function diVehicleTableHtml(vehicleDetails) {
  const units = Object.keys(vehicleDetails || {}).map(k => vehicleDetails[k]);
  if (!units.length) return "";
  const total = units.reduce((s, v) => s + (v.stated_value || 0), 0);
  const rows = units.map((v, i) => `<tr><td>${i + 1}</td><td>${diEsc(v.year || "—")}</td><td>${diEsc(v.make || "—")}</td><td>${diEsc(v.model || "—")}</td><td class="font-mono">${diEsc(v.vin || "—")}</td><td class="font-mono">${v.stated_value === null || v.stated_value === undefined ? "Not stated" : "$" + Number(v.stated_value).toLocaleString()}</td><td class="text-xs">${diEsc(v.sourceDocument || "")}</td></tr>`).join("");
  return `<div style="margin-top:12px;"><div class="email-digest-section-title"><i class="ph ph-truck"></i> Vehicle schedule (${units.length} unit${units.length === 1 ? "" : "s"})</div>
    <table class="data-table"><thead><tr><th>#</th><th>Year</th><th>Make</th><th>Model</th><th>VIN</th><th>Stated value</th><th>Source document</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td colspan="5"><strong>Total stated value</strong></td><td class="font-mono"><strong>$${total.toLocaleString()}</strong></td><td></td></tr></tfoot></table></div>`;
}

function diSourcePanelHtml(draft) {
  const docs = draft.sourceDocuments || [];
  const rows = docs.map(d => `<tr><td>${d.parent ? "↳ " : ""}${diEsc(d.name)}</td><td>${diEsc(d.label || "")}</td><td>${diEsc(d.method || "")}</td><td>${diStatusBadge(d.status)}</td><td class="text-xs">${diEsc((d.notes || []).join(" "))}</td></tr>`).join("");
  const val = (draft.validation || []).map(v => `<li><span class="badge ${v.level === "error" ? "badge-danger" : "badge-warning"}">${v.level === "error" ? "Fix before applying" : "Check"}</span> ${diEsc(v.text)}</li>`).join("");
  const conf = (draft.conflicts || []).map(c => `<li><strong>${diEsc(c.label)}</strong>: kept <em>${diEsc(c.kept.value)}</em> (${diEsc(c.kept.document)}); also found ${c.others.map(o => `<em>${diEsc(o.value)}</em> (${diEsc(o.document)})`).join(", ")}</li>`).join("");
  return `<div class="email-digest-section" id="diSourcePanel">
    <div class="email-digest-section-title"><i class="ph ph-files"></i> Source documents and checks</div>
    ${docs.length ? `<table class="data-table"><thead><tr><th>Document</th><th>Detected as</th><th>Read with</th><th>Result</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="text-sm text-muted">No documents were attached. Values come from the pasted email text only.</p>`}
    ${diVehicleTableHtml(draft.vehicleDetails)}
    ${diLossTableHtml(draft.lossHistory || [])}
    ${conf ? `<div class="email-digest-needs-review-flag" style="margin-top:10px;"><div class="email-digest-flag-title"><i class="ph ph-git-diff"></i> Conflicts between documents</div><ul class="email-digest-flag-list">${conf}</ul></div>` : ""}
    <div id="diValidationBox" style="margin-top:10px;">${val ? `<ul class="email-digest-flag-list" style="list-style:none;padding-left:0;">${val}</ul>` : `<div class="email-digest-clean-flag"><i class="ph ph-check-circle"></i> The extracted values pass the format checks.</div>`}</div>
    <p class="text-xs text-muted" style="margin-top:8px;">The original files are kept unchanged. Nothing here is applied until you confirm; a value that was not found is left blank, never guessed.</p>
  </div>`;
}

function diDecorateReview(subId, draft) {
  const box = document.getElementById("emailDigestReviewContainer");
  if (!box) return;
  const old = document.getElementById("diSourcePanel"); if (old) old.remove();
  const toolbar = box.querySelector(".email-digest-toolbar");
  const html = diSourcePanelHtml(draft);
  if (toolbar) toolbar.insertAdjacentHTML("beforebegin", html); else box.insertAdjacentHTML("afterbegin", html);
  Object.keys(draft.fieldSources || {}).forEach(k => {
    const badge = document.getElementById("confBadge_" + k);
    if (!badge || !badge.parentNode) return;
    const s = draft.fieldSources[k];
    const tag = document.createElement("span");
    tag.className = "text-xs text-muted"; tag.style.marginLeft = "6px";
    tag.title = (s.snippet ? "“" + s.snippet + "”\n" : "") + "Read with: " + (s.method || "");
    tag.textContent = "from " + s.document + (s.page ? " (" + s.page + ")" : "");
    badge.parentNode.appendChild(tag);
  });
}

function diCurrentValues(draft) {
  const out = {};
  DI_SCALAR_KEYS.forEach(k => { const el = document.getElementById("normField_" + k); out[k] = el ? el.value : draft[k]; });
  return out;
}

function diRefreshValidation(subId) {
  const draft = emailIngestionDraftBySubId[subId]; const box = document.getElementById("diValidationBox");
  if (!draft || !box) return;
  const list = diValidate(diCurrentValues(draft), draft);
  box.innerHTML = list.length ? `<ul class="email-digest-flag-list" style="list-style:none;padding-left:0;">${list.map(v => `<li><span class="badge ${v.level === "error" ? "badge-danger" : "badge-warning"}">${v.level === "error" ? "Fix before applying" : "Check"}</span> ${diEsc(v.text)}</li>`).join("")}</ul>` : `<div class="email-digest-clean-flag"><i class="ph ph-check-circle"></i> The extracted values pass the format checks.</div>`;
}

// ----------------------------------------------------------------------------
// 8. CANONICAL SUBMISSION RECORD (written when a person confirms)
// ----------------------------------------------------------------------------
function diBuildCanonicalRecord(sub, draft, validatedBy) {
  const nz = v => (v === undefined || v === "" ? null : v);
  const ops = sub.operationsProfile || {};
  const veh = sub.vehicles || [];
  return {
    business: { name: nz(sub.insured), fein: nz(sub.fein), dotNumber: nz(sub.dot), mcNumber: nz(sub.mcNumber), address: nz(sub.address), businessType: nz(ops.business_type), yearsInBusiness: nz(ops.years_in_business) },
    contact: { broker: nz(sub.broker), email: nz(sub.email) },
    coverage: { requestedLimit: nz(sub.exposureVal) || null, effectiveDate: nz(sub.effectiveDate), expirationDate: nz(sub.expirationDate), policyType: nz(draft.policyType) },
    vehicles: { vehicleCount: draft.vehicleCount !== undefined && draft.vehicleCount !== null ? draft.vehicleCount : (veh.length || null), annualMileage: nz(ops.annual_mileage), mileageUnit: ops.annual_mileage ? "miles" : null, units: veh.length },
    drivers: { count: (sub.drivers || []).length || null },
    losses: { count: (sub.losses || []).length || null },
    source: {
      documents: (draft.sourceDocuments || []).map(d => ({ documentName: d.name, detectedType: d.label, extractionMethod: d.method, status: d.status })),
      fieldSources: draft.fieldSources || {},
      conflicts: draft.conflicts || [],
      missing: DI_SCALAR_KEYS.filter(k => draft[k] === null || draft[k] === undefined || draft[k] === ""),
      status: "validated_by_user", validatedBy: validatedBy, validatedAt: new Date().toISOString()
    }
  };
}

// ----------------------------------------------------------------------------
// 8b. COMPLETENESS: what the attached documents themselves contain
// ----------------------------------------------------------------------------
/** Name of the first extracted document whose content shows the item (an application, loss runs, a vehicle or driver schedule), else null. */
function diDocumentEvidence(sub, id) {
  const docs = (sub.documentExtractions || []).filter(d => d.status === "extracted");
  const head = d => String(d.textExcerpt || "").slice(0, 3000);
  let hit = null;
  if (id === "doc_lossruns") hit = docs.filter(d => diLooksLikeLossRun({ name: d.name, text: d.textExcerpt }))[0];
  else if (id === "doc_vehicles" || id === "doc_sov") hit = docs.filter(d => d.hasVehicleTable || diLooksLikeVehicleSchedule({ name: d.name, text: d.textExcerpt }))[0];
  else if (id === "doc_drivers") hit = docs.filter(d => d.hasDriverTable || /driver\s+(?:list|schedule)|\bMVR\b|motor\s+vehicle\s+record/i.test(d.name + "\n" + head(d)))[0];
  return hit ? hit.name : null;
}

/** Writes a value onto a record only where nothing meaningful is there yet. */
function diIsBlank(v) { return v === null || v === undefined || v === "" || v === 0 || /^\((?:pending|see raw)/i.test(String(v)) || /^(?:pending|not provided|unnamed entity)/i.test(String(v)); }

var diFetchTried = {};

/**
 * Reads the submission's attached documents again and fills what is still empty on the case: vehicles, drivers,
 * loss history and blank header fields. Anything already entered is left alone; every filled item is logged with
 * the document it came from.
 */
async function diFetchMissingFromDocuments(sub, announce) {
  if (!(sub.rawAttachments || []).length) { if (announce) showToast("This case has no attached documents to read.", "info"); return null; }
  if (diRunning["fetch:" + sub.id]) return null;
  diRunning["fetch:" + sub.id] = true;
  if (announce) showToast("Reading the attached documents…", "info");
  try {
    const draft = await diRunForSubmission(sub);
    const filled = [];
    const src = k => (draft.fieldSources[k] || {}).document || "the documents";
    const veh = Object.keys(draft.vehicleDetails || {}).map(k => draft.vehicleDetails[k]);
    if (veh.length) {
      if (!sub.vehicles) sub.vehicles = [];
      let n = 0;
      veh.forEach((v, i) => {
        const rec = sub.vehicles[i] || (sub.vehicles[i] = { id: Date.now() + i, xid: i + 1 });
        [["year", v.year], ["make", v.make], ["model", v.model], ["vin", v.vin], ["vehicle_type", v.vehicle_type], ["stated_value", v.stated_value], ["assigned_driver", v.assigned_driver], ["plate", v.plate], ["plateState", v.plateState], ["dashcam", v.dashcam]].forEach(([f, val]) => {
          if (val !== null && val !== undefined && val !== "" && diIsBlank(rec[f])) { rec[f] = val; n++; }
        });
        if (v.sourceDocument && !rec.sourceDocument) rec.sourceDocument = v.sourceDocument;
      });
      if (n) filled.push(`vehicle schedule (${veh.length} unit${veh.length === 1 ? "" : "s"}) from ${src("vehicles")}`);
    }
    const drv = Object.keys(draft.driverDetails || {}).map(k => draft.driverDetails[k]);
    let driversFilled = false;
    if (drv.length) {
      if (!sub.drivers) sub.drivers = [];
      let n = 0;
      drv.forEach((d, i) => {
        // Match the document's driver to the one already on the case by licence number; otherwise take the same position when that record has no licence yet.
        let at = d.licenseNumber ? sub.drivers.findIndex(x => x && x.licenseNumber && diNorm(x.licenseNumber) === diNorm(d.licenseNumber)) : -1;
        if (at < 0) at = (sub.drivers[i] && !sub.drivers[i].licenseNumber) || !sub.drivers[i] ? i : sub.drivers.length;
        const rec = sub.drivers[at] || (sub.drivers[at] = { id: `DRV-${at + 1}`, given_name: null, last_name: null, age: null, dob: null, sex: null, licenseNumber: null, licensestate: null, licenseclasstype: null, experience: null, tenure: null, status: "Pending Verification", driver_factor: null });
        if (d.name && diIsBlank(rec.given_name)) { const parts = d.name.trim().split(/\s+/); rec.given_name = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0]; rec.last_name = parts.length > 1 ? parts[parts.length - 1] : ""; n++; }
        ["age", "dob", "sex", "licenseNumber", "licensestate", "licenseclasstype", "experience", "violations"].forEach(f => { if (d[f] !== undefined && d[f] !== null && d[f] !== "" && diIsBlank(rec[f])) { rec[f] = d[f]; n++; } });
      });
      driversFilled = n > 0;
      if (n) { filled.push(`driver list (${drv.length} driver${drv.length === 1 ? "" : "s"}) from ${src("drivers")}`); sub.driverAgeGuardrail = undefined; }
    }
    if ((draft.lossHistory || []).length && !(sub.losses || []).length) { sub.losses = draft.lossHistory; filled.push(`loss history (${draft.lossHistory.length} claim${draft.lossHistory.length === 1 ? "" : "s"}) from ${src("losses")}`); }
    const header = [["address", "address"], ["email", "email"], ["dot", "dot"], ["mcNumber", "mcNumber"], ["broker", "broker"], ["effectiveDate", "effectiveDate"], ["expirationDate", "expirationDate"], ["insured", "insured"]];
    header.forEach(([f, k]) => {
      if (draft[k] && diIsBlank(sub[f])) { sub[f] = draft[k]; filled.push(`${DI_FIELD_LABELS[k] || k} from ${src(k)}`); }
    });
    if (draft.fein && /^\d{2}-?\d{7}$/.test(draft.fein) && !/^\d{2}-?\d{7}$/.test(String(sub.fein || ""))) { sub.fein = draft.fein; filled.push(`FEIN from ${src("fein")}`); }
    if (draft.exposureVal && !(Number(sub.exposureVal) > 0)) { const n = parseFloat(String(draft.exposureVal).replace(/[^0-9.]/g, "")); if (n > 0) { sub.exposureVal = n; sub.exposure = "$" + n.toLocaleString(); filled.push(`Requested limit from ${src("exposureVal")}`); } }
    if (draft.operationsProfile && Object.keys(draft.operationsProfile).length) {
      sub.operationsProfile = Object.assign({}, draft.operationsProfile, sub.operationsProfile || {});
    }
    sub.completeness = sub.completeness || { waivers: [], lastSnapshot: null };
    sub.completeness.fetchedAt = new Date().toISOString();
    diFetchTried[sub.id] = (sub.rawAttachments || []).length;
    if (filled.length && typeof completenessLog === "function") {
      completenessLog(sub, "completeness_fetched", "Read from the attached documents (not yet reviewed line by line): " + filled.join("; ") + ".");
      sub.fetchedFromDocuments = (sub.fetchedFromDocuments || []).concat([{ at: new Date().toISOString(), by: (USER_ROLES_CONFIG[currentUserRole] || {}).name || currentUserRole, items: filled }]);
    }
    // Appetite rows are named per driver; rebuild them so they carry the names just read (unless someone has overridden a rule).
    const product = window.ACTIVE_INSURANCE_PRODUCT || null;
    if (driversFilled && product && typeof buildProductAppetiteRules === "function" && !(sub.appetiteRules || []).some(x => x.manualPassOverride)) sub.appetiteRules = buildProductAppetiteRules(product, sub);
    const r = typeof runCompletenessCheck === "function" ? runCompletenessCheck(sub, "documents read") : null;
    if (typeof persistAppState === "function") persistAppState();
    // The two cards this fetch exists to correct are refreshed first, so a problem elsewhere on the page cannot leave them stale.
    if (activeSubmissionId === sub.id) {
      if (typeof renderVehicleEnrichment === "function") renderVehicleEnrichment(sub);
      if (typeof renderDriverLicenseVerification === "function") renderDriverLicenseVerification(sub);
      try { if (typeof selectSubmission === "function") selectSubmission(sub.id, false); } catch (e) { console.warn("Page refresh after reading documents failed:", e); }
    }
    if (typeof renderCompletenessCard === "function") renderCompletenessCard(sub);
    if (announce || filled.length) {
      showToast(filled.length
        ? `📄 Read from the attached documents: ${filled.join("; ")}.${r && r.status !== "complete" ? ` Still missing: ${r.missingRequired.map(i => i.label).join("; ")}.` : " The required items are now present; please review them before continuing."}`
        : "Nothing more could be read from the attached documents for the missing items.", filled.length ? "success" : "warning");
    }
    return { filled: filled, draft: draft };
  } catch (e) {
    showToast("❌ Could not read the attached documents: " + e.message, "danger");
    return null;
  } finally { diRunning["fetch:" + sub.id] = false; }
}

/** True when the case has attachments that have not been searched and its vehicles or drivers are missing, or lack VINs, years, makes, names or licences. */
function diNeedsRead(sub) {
  const n = (sub.rawAttachments || []).length;
  if (!n || diFetchTried[sub.id] === n || diRunning["fetch:" + sub.id]) return false;
  const v = sub.vehicles || [], d = sub.drivers || [];
  return !v.length || !d.length || v.some(x => !x.vin || !x.year || !x.make) || d.some(x => !(x.given_name || x.last_name) || !x.licenseNumber);
}

/** Called when the Step 1 gate blocks: look in the attachments once per set of attachments. Returns true if a search started. */
function diAutoFetchForCompleteness(sub) {
  const n = (sub.rawAttachments || []).length;
  if (!n || diFetchTried[sub.id] === n || diRunning["fetch:" + sub.id]) return false;
  diFetchTried[sub.id] = n;
  diFetchMissingFromDocuments(sub, false);
  return true;
}

// ----------------------------------------------------------------------------
// 9. PIPELINE CARD (Step 1): shows what actually happened to this case's files
// ----------------------------------------------------------------------------
function diRenderPipelineCard(sub) {
  const card = document.getElementById("ocrPipelineCard");
  if (!card || !sub) return;
  const steps = card.querySelectorAll(".ocr-step");
  const badge = card.querySelector(".card-header .badge");
  const files = (sub.rawAttachments || []).length;
  const ex = sub.documentExtractions || [];
  const ok = ex.filter(d => d.status === "extracted").length;
  const ocr = ex.filter(d => d.status === "needs_ocr").length;
  const bad = ex.filter(d => ["unsupported", "rejected", "failed", "empty"].indexOf(d.status) > -1).length;
  const normalized = sub.normalizationStatus === "normalized" || sub.normalizationStatus === "needs_review";
  const set = (i, label, state, text) => { if (!steps[i]) return; steps[i].classList.toggle("done", state === "done"); const l = steps[i].querySelector(".ocr-step-label"), s = steps[i].querySelector(".ocr-step-status"); if (l) l.textContent = label; if (s) s.textContent = text; };
  set(0, "File intake and validation", files ? "done" : "idle", files ? `${files} file(s) stored unchanged` : "No files attached");
  set(1, "Content extraction", ex.length ? (ok === ex.length ? "done" : "idle") : "idle", ex.length ? `${ok} read${ocr ? `, ${ocr} need OCR` : ""}${bad ? `, ${bad} not usable` : ""}` : (files ? "Not run yet" : "Nothing to read"));
  set(2, "Canonical record", normalized ? "done" : "idle", normalized ? (sub.canonicalJson && sub.canonicalJson.canonical_submission_record ? "Validated by a person" : "Applied") : "Pending validation");
  if (badge) badge.innerHTML = normalized ? '<i class="ph ph-check-circle"></i> Validated by a person' : (ex.length ? `<i class="ph ph-hourglass"></i> ${ok} of ${ex.length} file(s) read` : '<i class="ph ph-info"></i> No documents ingested');
}

// ----------------------------------------------------------------------------
// 10. WIRING INTO THE EXISTING INTAKE FLOW
// ----------------------------------------------------------------------------
(function diWire() {
  // Attachment staging: refuse files that are empty, too large, or not what their name says.
  window.handleEmailDigestFileSelect = async function (event) {
    const files = Array.from((event.target && event.target.files) || []);
    if (event.target) event.target.value = "";
    for (const f of files) {
      let chk;
      try { chk = await diPrecheckFile(f); } catch (e) { chk = { ok: false, reason: "could not be read: " + e.message }; }
      if (!chk.ok) { showToast(`⛔ ${f.name} ${chk.reason}`, "danger"); continue; }
      if (!chk.info.supported) showToast(`⚠️ ${f.name} is ${chk.info.label}; it will be kept as received but cannot be read (no safe converter).`, "warning");
      emailDigestAttachedFiles.push(f);
    }
    renderEmailDigestFileList();
  };

  const origReview = window.renderIngestionReviewDirect;
  window.renderIngestionReviewDirect = function (sub, box) {
    if (emailIngestionDraftBySubId[sub.id]) return origReview.call(this, sub, box);
    if (diRunning[sub.id]) return;
    diRunning[sub.id] = true;
    box.innerHTML = `<div class="card"><div class="card-body"><i class="ph ph-circle-notch ph-spin"></i> Reading ${(sub.rawAttachments || []).length} document(s)…</div></div>`;
    diRunForSubmission(sub).then(draft => {
      emailIngestionDraftBySubId[sub.id] = draft;
      diRunning[sub.id] = false;
      const target = document.getElementById("rawEmailCaptureContainer") || box;
      if (activeSubmissionId === sub.id) origReview.call(window, sub, target);
      diRenderPipelineCard(sub);
      if (typeof persistAppState === "function") persistAppState();
    }).catch(e => { diRunning[sub.id] = false; box.innerHTML = `<div class="card"><div class="card-body text-danger">Document ingestion failed: ${diEsc(e.message)}</div></div>`; });
  };

  const origNorm = window.renderNormalizationReview;
  window.renderNormalizationReview = function (subId, draft) {
    origNorm.call(this, subId, draft);
    diDecorateReview(subId, draft);
  };

  const origEdit = window.handleNormFieldEdit;
  window.handleNormFieldEdit = function (key, el) {
    origEdit.call(this, key, el);
    diRefreshValidation(activeSubmissionId);
  };

  const origApply = window.applyNormalizedDataToSubmission;
  window.applyNormalizedDataToSubmission = function (subId) {
    const sub = SUBMISSIONS_DATASET.find(s => s.id === subId), draft = emailIngestionDraftBySubId[subId];
    if (!sub || !draft) return;
    const errors = diValidate(diCurrentValues(draft), draft).filter(v => v.level === "error");
    if (errors.length) { showToast("⛔ Fix before applying: " + errors.map(e => e.text).join(" "), "danger"); diRefreshValidation(subId); return; }
    draft.review_reasons = diReviewReasons(draft, diCurrentValues(draft));
    draft.needs_review = draft.review_reasons.length > 0;
    const who = (USER_ROLES_CONFIG[currentUserRole] || {}).name || currentUserRole;
    const fieldSources = draft.fieldSources || {};
    origApply.call(this, subId);
    Object.keys(draft.vehicleDetails || {}).forEach(k => {
      const v = draft.vehicleDetails[k], rec = (sub.vehicles || [])[parseInt(k, 10) - 1];
      if (!rec) return;
      if (v.vin) rec.vin = v.vin;
      if (v.plate) rec.plate = v.plate;
      if (v.dashcam !== undefined && v.dashcam !== null) rec.dashcam = v.dashcam;
      if (v.plateState) rec.plateState = v.plateState;
      if (v.sourceDocument) rec.sourceDocument = v.sourceDocument;
    });
    const fresh = diBuildCanonicalRecord(sub, draft, who);
    sub.canonicalJson = Object.assign({}, sub.canonicalJson, { canonical_submission_record: fresh });
    sub.ocrFields = (sub.ocrFields || []).filter(f => !/^Email Extraction:/.test(f.key));
    Object.keys(fieldSources).filter(k => DI_FIELD_LABELS[k]).forEach(k => {
      const v = sub[k === "exposureVal" ? "exposureVal" : k];
      if (v === undefined || v === null || v === "") return;
      sub.ocrFields.unshift({ key: DI_FIELD_LABELS[k], val: String(v), conf: "Rule-based read, confirmed by " + who, source: fieldSources[k].document });
    });
    diRenderPipelineCard(sub);
    if (typeof renderOCRFields === "function") renderOCRFields(sub.ocrFields, sub.docs);
    if (typeof persistAppState === "function") persistAppState();
    // Anything the review did not carry across (VINs, plates, driver names and licences) is read from the attached documents now.
    if (diNeedsRead(sub)) diAutoFetchForCompleteness(sub);
  };

  // Vehicle Data Enrichment, Driver License Verification and Submission Completeness read the attached documents when they find gaps.
  const pending = '<div class="text-xs text-muted" style="margin-bottom:8px;"><i class="ph ph-circle-notch ph-spin"></i> Reading the attached documents for missing vehicle and driver details…</div>';
  [["renderVehicleEnrichment", "screen4VehicleEnrichmentContainer"], ["renderDriverLicenseVerification", "screen4DriverLicenseContainer"]].forEach(([fn, boxId]) => {
    const orig = window[fn];
    if (typeof orig !== "function") return;
    window[fn] = function (sub) {
      const r = orig.apply(this, arguments);
      if (sub && diNeedsRead(sub)) {
        diAutoFetchForCompleteness(sub);
        const box = document.getElementById(boxId); if (box) box.insertAdjacentHTML("afterbegin", pending);
      }
      return r;
    };
  });
  const origCard = window.renderCompletenessCard;
  if (typeof origCard === "function") {
    window.renderCompletenessCard = function (sub) {
      const r = origCard.apply(this, arguments);
      if (sub && diNeedsRead(sub) && evaluateCompleteness(sub).status === "incomplete") diAutoFetchForCompleteness(sub);
      return r;
    };
  }

  const origOcr = window.renderOCRFields;
  window.renderOCRFields = function (fields, docs) {
    origOcr.call(this, fields, docs);
    diRenderPipelineCard(SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId));
  };
})();
