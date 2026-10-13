/**
 * ============================================================================
 * DOCUMENT VIEWER (Add-On)
 * ----------------------------------------------------------------------------
 * Shows the file that was actually attached to a case. It replaces the earlier previews, which drew a made-up ACORD form, loss run,
 * statement of values or handwritten note from the case's fields and presented it as the document.
 *
 *   PDF                      the file itself, in the browser's PDF viewer
 *   image                    the image itself
 *   text, CSV, JSON, email   the text
 *   Word, Excel, PowerPoint  what the document parser reads: its text and tables
 *
 * When the original is not held (it was left out of the saved session by the storage limit, or the entry has no file), the viewer
 * says so and shows nothing else. It never builds a stand-in.
 * ============================================================================
 */

var DV_TOKEN = 0;
var DV_URLS = [];

function dvFindAttachment(sub, doc) {
  return ((sub && sub.rawAttachments) || []).filter(a => a.name === doc.name)[0] || null;
}

function dvRevokeUrls() { DV_URLS.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} }); DV_URLS = []; }
function dvUrl(bytes, type) { const u = URL.createObjectURL(new Blob([bytes], { type: type })); DV_URLS.push(u); return u; }

function dvTableHtml(rows) {
  const body = rows.map((r, i) => `<tr>${r.map(c => i === 0 ? `<th>${diEsc(c)}</th>` : `<td>${diEsc(c)}</td>`).join("")}</tr>`).join("");
  return `<div class="table-responsive"><table class="data-table"><tbody>${body}</tbody></table></div>`;
}

function dvNotice(icon, text) {
  return `<div class="empty-state"><i class="ph ${icon} empty-state-icon"></i><div class="empty-state-body">${diEsc(text)}</div></div>`;
}

/** The viewer's content for one document, as HTML. Async: parsing an Office file takes a moment. */
async function dvBuildHtml(sub, doc) {
  const att = dvFindAttachment(sub, doc);
  if (!att) return dvNotice("ph-file-dashed", "No file is stored with this entry, so there is nothing to show.");
  if (!att.base64) return dvNotice("ph-file-dashed", "The original file is no longer held in the browser (the saved session was too large to keep it). Attach it again to view it.");
  const bytes = diBase64ToBytes(att.base64);
  const info = diDetectType(bytes, att.name);
  if (info.kind === "zip") { try { info.kind = diResolveZipKind(diReadZipDirectory(bytes).entries); } catch (e) { info.kind = "unknown"; } }
  if (diIsExecutable(bytes, att.name)) return dvNotice("ph-prohibit", "This file is a program or script and is not shown.");
  if (info.kind === "pdf") return `<iframe title="${diEsc(att.name)}" src="${dvUrl(bytes, "application/pdf")}" style="width:100%;height:68vh;border:1px solid #e2e8f0;border-radius:6px;background:#fff;"></iframe>`;
  if (info.kind === "png" || info.kind === "jpeg") return `<div style="text-align:center;"><img alt="${diEsc(att.name)}" src="${dvUrl(bytes, info.kind === "png" ? "image/png" : "image/jpeg")}" style="max-width:100%;max-height:68vh;border:1px solid #e2e8f0;border-radius:6px;"></div>`;
  const results = await diProcessFile(att.name, att.type, bytes, null, 0);
  const r = results[0];
  if (r.status === "needs_ocr") return dvNotice("ph-scan", "This is an image or scan with no text layer, and no OCR service is connected. It can be downloaded, but it cannot be read here.");
  if (r.status !== "extracted") return dvNotice("ph-warning", (r.notes || []).join(" ") || "The file could not be read.");
  if (r.kind === "txt" || r.kind === "json" || r.kind === "eml") return `<pre style="white-space:pre-wrap;max-height:68vh;overflow:auto;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px;font-size:12.5px;">${diEsc(r.text)}</pre>`;
  const parts = [];
  if (r.kind === "csv" || r.kind === "xlsx" || r.kind === "docx" || r.kind === "pptx") {
    if (r.kind === "docx" || r.kind === "pptx") parts.push(`<div style="white-space:pre-wrap;font-size:13px;">${diEsc(r.text)}</div>`);
    (r.tables || []).forEach(t => parts.push(`<div class="text-xs text-muted" style="margin-top:10px;">${diEsc(t.name || "Table")}</div>${dvTableHtml(t.rows || [])}`));
    if (!parts.length) parts.push(`<pre style="white-space:pre-wrap;">${diEsc(r.text)}</pre>`);
  }
  const note = `<div class="text-xs text-muted" style="margin-bottom:8px;"><i class="ph ph-info"></i> ${diEsc(r.label)}, read with the ${diEsc(r.method.toLowerCase())}. This is the text and tables in the file, not its page layout.</div>`;
  return `<div style="max-height:68vh;overflow:auto;">${note}${parts.join("")}</div>`;
}

/** Fills a container with the document; a later call (another document chosen) cancels this one. */
function dvRenderInto(container, sub, doc) {
  if (!container) return;
  const token = ++DV_TOKEN;
  dvRevokeUrls();
  container.innerHTML = `<div class="text-sm text-muted" style="padding:16px;"><i class="ph ph-circle-notch ph-spin"></i> Opening ${diEsc(doc.name)}…</div>`;
  dvBuildHtml(sub, doc).then(html => { if (token === DV_TOKEN) container.innerHTML = html; })
    .catch(e => { if (token === DV_TOKEN) container.innerHTML = dvNotice("ph-warning", "The file could not be shown: " + e.message); });
}

/** The status line for a document: what was found when it was read, not a claim. */
function dvStatusText(sub, doc) {
  const ex = ((sub && sub.documentExtractions) || []).filter(d => d.name === doc.name && !d.parent)[0];
  return ex ? `${ex.label || "File"} • ${diStatusText(ex.status)}` : "Not read yet";
}

function dvDownload(sub, doc) {
  const att = dvFindAttachment(sub, doc);
  if (!att || !att.base64) { showToast("⚠️ The original file is not held in the browser, so it cannot be downloaded.", "warning"); return false; }
  const a = document.createElement("a");
  a.href = dvUrl(diBase64ToBytes(att.base64), att.type || "application/octet-stream"); a.download = att.name;
  document.body.appendChild(a); a.click(); a.remove();
  return true;
}

window.dvRenderInto = dvRenderInto; window.dvDownload = dvDownload; window.dvStatusText = dvStatusText;
