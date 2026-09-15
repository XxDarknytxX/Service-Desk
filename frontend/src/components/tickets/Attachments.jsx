/**
 * Ticket attachments — picking files to send, and showing files already sent.
 *
 *   <AttachmentPicker files onChange disabled />   chips + "Attach files" button,
 *                                                  drop files onto its area
 *   <AttachmentList ticketId attachments />        chips (thumbnails for images);
 *                                                  click opens images / PDFs,
 *                                                  downloads everything else
 *
 * Limits mirror the server (services/attachmentStorage.js): up to 5 files,
 * 10 MB each, 25 MB per message; documents, spreadsheets, presentations, PDFs,
 * text / CSV, images, email files and zip archives.
 */

import { useEffect, useRef, useState } from "react";
import { apiBlob } from "../../services/api";
import { useToast } from "../../contexts/toast";
import Icon from "../ui/Icon";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = [
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "rtf", "txt", "log", "csv",
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "heic", "msg", "eml", "zip",
];
const ACCEPT = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(",");

export function formatBytes(n) {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

const extOf = (name) => (String(name).split(".").pop() || "").toLowerCase();

function iconFor(nameOrType) {
  const ext = extOf(nameOrType);
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "heic"].includes(ext) || String(nameOrType).startsWith("image/")) return "eye";
  if (["xls", "xlsx", "ods", "csv"].includes(ext)) return "table";
  if (["zip"].includes(ext)) return "archive";
  if (["msg", "eml"].includes(ext)) return "mail";
  return "fileText";
}

/** Returns an error message for a proposed set of files, or null. */
export function checkFiles(files) {
  if (files.length > MAX_FILES) return `You can attach up to ${MAX_FILES} files.`;
  for (const f of files) {
    if (!ACCEPTED_EXTENSIONS.includes(extOf(f.name))) return `"${f.name}" isn't a supported file type.`;
    if (f.size > MAX_FILE_BYTES) return `"${f.name}" is over 10 MB.`;
    if (!f.size) return `"${f.name}" is empty.`;
  }
  if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_BYTES) return "Attachments must add up to 25 MB or less.";
  return null;
}

export function AttachmentPicker({ files, onChange, disabled, compact = false }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  function add(list) {
    const incoming = Array.from(list || []);
    if (!incoming.length) return;
    // Skip exact duplicates (same name + size) picked twice.
    const merged = [...files, ...incoming.filter((f) => !files.some((x) => x.name === f.name && x.size === f.size))];
    const problem = checkFiles(merged);
    if (problem) return toast.error(problem);
    onChange(merged);
  }

  return (
    <div
      onDragOver={(e) => { if (!disabled) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (!disabled) add(e.dataTransfer.files); }}
      className={cn("rounded-xl transition-colors", dragging && "bg-[var(--accent)]/5 ring-2 ring-[var(--accent)]/30")}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => { add(e.target.files); e.target.value = ""; }}
      />
      <div className="flex flex-wrap items-center gap-2">
        {files.map((f, i) => (
          <span
            key={`${f.name}-${f.size}-${i}`}
            className="inline-flex items-center gap-1.5 max-w-full pl-2 pr-1 py-1 rounded-lg text-xs bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--fg-secondary)]"
          >
            <Icon name={iconFor(f.name)} size={12} className="shrink-0 text-[var(--fg-muted)]" />
            <span className="truncate max-w-[12rem]" title={f.name}>{f.name}</span>
            <span className="text-[var(--fg-muted)] tabular-nums">{formatBytes(f.size)}</span>
            {!disabled && (
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="p-0.5 rounded hover:bg-[var(--bg-base)] text-[var(--fg-muted)] hover:text-rose-500"
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </span>
        ))}
        {files.length < MAX_FILES && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50",
              compact
                ? "px-2 py-1 text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)]"
                : "px-2.5 py-1.5 border border-dashed border-[var(--border-default)] text-[var(--fg-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            )}
          >
            <Icon name="paperclip" size={13} />
            {files.length ? "Add more" : "Attach files"}
          </button>
        )}
        {!compact && !files.length && (
          <span className="text-[11px] text-[var(--fg-muted)]">PDF, Word, Excel, images and more · up to 5 files, 10 MB each</span>
        )}
      </div>
    </div>
  );
}

function ImageThumb({ ticketId, attachment, onOpen }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let revoked = false;
    let objectUrl = null;
    apiBlob(`/tickets/${ticketId}/attachments/${attachment.id}`)
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => { revoked = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [ticketId, attachment.id]);

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${attachment.file_name} · ${formatBytes(attachment.file_size)}`}
      className="group relative h-20 w-28 rounded-lg overflow-hidden border border-[var(--border-default)] bg-[var(--bg-surface)] shrink-0"
    >
      {url ? (
        <img src={url} alt={attachment.file_name} className="h-full w-full object-cover" />
      ) : (
        <span className="h-full w-full flex items-center justify-center text-[var(--fg-muted)]"><Icon name="eye" size={16} /></span>
      )}
      <span className="absolute inset-x-0 bottom-0 px-1.5 py-0.5 text-[10px] text-white bg-black/55 truncate opacity-0 group-hover:opacity-100 transition-opacity">
        {attachment.file_name}
      </span>
    </button>
  );
}

export function AttachmentList({ ticketId, attachments = [], className }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  if (!attachments.length) return null;

  async function open(a) {
    setBusy(a.id);
    try {
      const blob = await apiBlob(`/tickets/${ticketId}/attachments/${a.id}`);
      const url = URL.createObjectURL(blob);
      const previewable = String(a.file_type).startsWith("image/") && a.file_type !== "image/heic" || a.file_type === "application/pdf";
      if (previewable) {
        window.open(url, "_blank", "noopener");
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = a.file_name;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(err.message || "Couldn't open the file");
    } finally {
      setBusy(null);
    }
  }

  const images = attachments.filter((a) => ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(a.file_type));
  const others = attachments.filter((a) => !images.includes(a));

  return (
    <div className={cn("space-y-2", className)}>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a) => <ImageThumb key={a.id} ticketId={ticketId} attachment={a} onOpen={() => open(a)} />)}
        </div>
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {others.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => open(a)}
              disabled={busy === a.id}
              title={`Open ${a.file_name}`}
              className="inline-flex items-center gap-2 max-w-full px-2.5 py-1.5 rounded-lg text-xs bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-[var(--accent)] text-[var(--fg-secondary)] disabled:opacity-60"
            >
              <Icon name={busy === a.id ? "refresh" : iconFor(a.file_name)} size={13} className={cn("shrink-0 text-[var(--accent)]", busy === a.id && "animate-spin")} />
              <span className="truncate max-w-[16rem] font-medium text-[var(--fg-primary)]">{a.file_name}</span>
              <span className="text-[var(--fg-muted)] tabular-nums">{formatBytes(a.file_size)}</span>
              <Icon name="download" size={12} className="shrink-0 text-[var(--fg-muted)]" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
