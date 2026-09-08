import { useEffect, useMemo, useState } from "react";
import { buildSnapshot, shareableIssues, expiryFrom, SHARE_WINDOWS } from "../share";
import { dateLabel } from "../dates";
import { isCompleteStatus } from "../tasks";
import type { Issue } from "../backup";

/* Making a read-only link out of chosen work.

   Everything here is opt-in, one task at a time. There is no "share everything"
   button on purpose: a link is the permission, and the moment it is easier to share
   the lot than to choose, people share the lot. Personal work is not on the list at
   all - `app/share.ts` decides that, and this only shows what it allows. */

type ShareRecord = { id: string; title: string; createdAt: string; expiresAt: string | null };
type ShareLinksProps = { issues: Issue[]; sharedBy: string };

export default function ShareLinks({ issues, sharedBy }: ShareLinksProps) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [window_, setWindow] = useState<string>("30");
  const [links, setLinks] = useState<ShareRecord[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [signedOut, setSignedOut] = useState(false);

  const offered = useMemo(() => {
    const open = shareableIssues(issues);
    /* Unfinished work first: a handover is nearly always about what is still running. */
    return [...open].sort((a, b) => Number(isCompleteStatus(a.status)) - Number(isCompleteStatus(b.status)));
  }, [issues]);

  async function loadLinks() {
    try {
      const response = await fetch("/api/share", { cache: "no-store" });
      if (response.status === 401) { setSignedOut(true); return; }
      const result = await response.json() as { shares?: ShareRecord[] };
      setLinks(result.shares ?? []);
    } catch { /* Offline is not an error worth shouting about here. */ }
  }

  useEffect(() => { void loadLinks(); }, []);

  async function createLink() {
    if (!chosen.length) return;
    setBusy(true);
    setMessage("");
    try {
      const snapshot = buildSnapshot(issues, chosen, { title: title || "Shared work", sharedBy, note });
      const response = await fetch("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshot, expiresAt: expiryFrom(window_)?.toISOString() ?? null }),
      });
      const result = await response.json() as { path?: string; error?: string };
      if (!response.ok || !result.path) { setMessage(result.error ?? "That link could not be made."); return; }
      const url = `${location.origin}${result.path}`;
      try {
        await navigator.clipboard.writeText(url);
        setMessage(`Link copied. ${url}`);
      } catch { setMessage(`Link ready: ${url}`); }
      setChosen([]);
      setTitle("");
      setNote("");
      await loadLinks();
    } catch { setMessage("That link could not be made. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/share?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setMessage("That link stops working straight away.");
      await loadLinks();
    } catch { setMessage("That link could not be revoked just now."); }
    finally { setBusy(false); }
  }

  if (signedOut) {
    return <div className="share-links"><div><strong>Share a read-only link</strong><small>Sign in with ChatGPT to make a link someone else can open. Everything else in the app works without it.</small></div></div>;
  }

  return <div className="share-links">
    <div><strong>Share a read-only link</strong><small>Pick the work to include and get an address you can send. It shows a snapshot taken at that moment — it never updates, nobody can change anything through it, and your diary and personal work are never in it.</small></div>

    <div className="share-picker" role="group" aria-label="Work to share">
      {offered.length === 0 && <p className="share-empty">There is no professional work to share yet.</p>}
      {offered.map(issue => <label key={issue.id} className={chosen.includes(issue.id) ? "is-chosen" : ""}>
        <input type="checkbox" checked={chosen.includes(issue.id)} onChange={() => setChosen(current => current.includes(issue.id) ? current.filter(id => id !== issue.id) : [...current, issue.id])}/>
        <span><strong>{issue.title}</strong><small>{issue.status} · {issue.owner || "no owner"}{issue.expected ? ` · due ${dateLabel(issue.expected)}` : ""}</small></span>
      </label>)}
    </div>

    <div className="share-settings">
      <label>Call it<input value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. On-call handover, week of the 8th"/></label>
      <label>Link lasts<select value={window_} onChange={event => setWindow(event.target.value)}>{SHARE_WINDOWS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label className="share-note">A line for whoever opens it <small>optional</small><input value={note} onChange={event => setNote(event.target.value)} placeholder="What they should do with this…"/></label>
    </div>

    <div className="share-actions">
      <small>{chosen.length ? `${chosen.length} task${chosen.length === 1 ? "" : "s"} chosen.` : "Nothing chosen yet."} Anyone with the link can open it, so send it the way you would send the work itself.</small>
      <button className="primary" type="button" disabled={!chosen.length || busy} onClick={createLink}>{busy ? "Working…" : "Make the link"}</button>
    </div>
    {message && <p className="share-message" role="status">{message}</p>}

    {links.length > 0 && <div className="share-existing">
      <p className="eyebrow">LINKS YOU HAVE MADE</p>
      <ul>{links.map(link => <li key={link.id}>
        <span><strong>{link.title}</strong><small>Made {dateLabel(link.createdAt)} · {link.expiresAt ? `expires ${dateLabel(link.expiresAt)}` : "no expiry"}</small></span>
        <span className="share-row-actions">
          <a href={`/share/${link.id}`} target="_blank" rel="noopener noreferrer">Open</a>
          <button type="button" className="delete" disabled={busy} onClick={() => revoke(link.id)}>Revoke</button>
        </span>
      </li>)}</ul>
    </div>}
  </div>;
}
