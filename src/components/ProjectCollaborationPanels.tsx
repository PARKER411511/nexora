"use client";

import { Download, FileUp, MessageCircle, RefreshCw, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProjectAttachment, ReviewComment } from "@/lib/types";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProjectAttachmentsPanel({ projectId }: { projectId: string }) {
  const [attachments, setAttachments] = useState<ProjectAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/attachments`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load private files.");
      setAttachments((data.attachments ?? []) as ProjectAttachment[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load private files.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [projectId]);

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`/api/projects/${projectId}/attachments`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not upload private file.");
      setAttachments((items) => [data.attachment as ProjectAttachment, ...items]);
      setMessage("Private file uploaded.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not upload private file.");
    } finally {
      setBusy(false);
    }
  }

  async function download(attachment: ProjectAttachment) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/attachments?attachmentId=${encodeURIComponent(attachment.id)}`);
      const data = await response.json();
      if (!response.ok || !data.downloadUrl) throw new Error(data.error || "Could not create a download link.");
      window.location.assign(data.downloadUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not download private file.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(attachment: ProjectAttachment) {
    if (!window.confirm(`Remove ${attachment.originalName}?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/attachments`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ attachmentId: attachment.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not remove private file.");
      setAttachments((items) => items.filter((item) => item.id !== attachment.id));
      setMessage("Private file removed.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove private file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card project-files-panel" aria-labelledby="project-files-title">
      <div className="change-panel-heading">
        <div><div className="section-kicker">Private project files</div><h2 id="project-files-title">Attachments</h2></div>
        <button aria-label="Refresh private files" className="icon-button" disabled={busy || loading} onClick={() => void refresh()} type="button"><RefreshCw size={14} /></button>
      </div>
      <p className="muted-copy">Files are stored privately with this project. Download links expire after one minute.</p>
      <label className="button-secondary file-upload-button"><FileUp size={14} /> {busy ? "Working…" : "Upload file"}<input accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,text/markdown,application/zip" disabled={busy} onChange={upload} type="file" /></label>
      {loading ? <p className="empty-history">Loading private files…</p> : attachments.length ? <div className="project-file-list">{attachments.map((attachment) => <div className="project-file-row" key={attachment.id}><div><strong>{attachment.originalName}</strong><span>{attachment.mimeType} · {formatBytes(attachment.byteSize)}</span></div><div className="project-file-actions"><button aria-label={`Download ${attachment.originalName}`} className="icon-button" disabled={busy} onClick={() => void download(attachment)} type="button"><Download size={14} /></button><button aria-label={`Remove ${attachment.originalName}`} className="icon-button" disabled={busy} onClick={() => void remove(attachment)} type="button"><Trash2 size={14} /></button></div></div>)}</div> : <p className="empty-history">No private files attached yet.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status">{message}</p>}
    </section>
  );
}

type ThreadComment = ReviewComment & { parentId?: number | null };
type ReviewPayload = { comments?: ThreadComment[] };

export function ProjectCommentsPanel({ reviewToken }: { reviewToken?: string }) {
  const [comments, setComments] = useState<ThreadComment[]>([]);
  const [replyParent, setReplyParent] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [mentions, setMentions] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    if (!reviewToken) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/review/${reviewToken}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load review comments.");
      setComments(((data.review as ReviewPayload)?.comments ?? []) as ThreadComment[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load review comments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [reviewToken]);

  async function post() {
    if (!reviewToken || !comment.trim()) { setError("Write a note before sending it."); return; }
    setLoading(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/review/${reviewToken}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reply", comment, parentId: replyParent, mentions: mentions.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 10) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save review note.");
      setComments(((data.review as ReviewPayload)?.comments ?? []) as ThreadComment[]);
      setComment(""); setMentions(""); setReplyParent(null); setMessage("Review note saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save review note.");
    } finally {
      setLoading(false);
    }
  }

  if (!reviewToken) return null;
  return (
    <section className="card project-comments-panel" aria-labelledby="project-comments-title">
      <div className="change-panel-heading"><div><div className="section-kicker">Review conversation</div><h2 id="project-comments-title"><MessageCircle size={17} /> Comments & mentions</h2></div><button aria-label="Refresh review comments" className="icon-button" disabled={loading} onClick={() => void refresh()} type="button"><RefreshCw size={14} /></button></div>
      <p className="muted-copy">Reply in the review thread or mention confirmed collaborators and invited reviewers by email.</p>
      <div className="project-comment-form"><textarea aria-label="Review note" maxLength={4000} onChange={(event) => setComment(event.target.value)} placeholder={replyParent ? `Reply to response #${replyParent}` : "Write a note for the review thread…"} value={comment} /><input aria-label="Mention collaborators" onChange={(event) => setMentions(event.target.value)} placeholder="Mention confirmed emails, comma separated" value={mentions} /><div className="editor-bottom"><span className="field-hint">{replyParent ? <button className="button-quiet" onClick={() => setReplyParent(null)} type="button">Cancel reply</button> : "Up to 4,000 characters"}</span><button className="button-primary" disabled={loading || !comment.trim()} onClick={() => void post()} type="button"><Send size={13} /> {loading ? "Saving…" : replyParent ? "Reply" : "Add note"}</button></div></div>
      {comments.length ? <div className="project-comment-list">{comments.map((item) => <article className={`project-comment ${item.parentId ? "project-comment-reply" : ""}`} key={item.id}><div><strong>{item.name || "Workspace collaborator"}</strong><span>{new Date(item.createdAt).toLocaleString()}</span></div><p>{item.comment}</p><button className="button-quiet" onClick={() => setReplyParent(item.id)} type="button">Reply in thread</button></article>)}</div> : <p className="empty-history">No comments on this snapshot yet.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status">{message}</p>}
    </section>
  );
}
