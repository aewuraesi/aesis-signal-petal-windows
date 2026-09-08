import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { shares } from "../../../db/schema";
import { isSharedSnapshot, type SharedTask } from "../../share";
import { dateLabel } from "../../dates";
import Petal from "../../petal";

/* The page a shared link opens.

   Rendered on the server and completely static: no workspace state, no storage, no
   sync, nothing the reader can change. Whoever opens this is not a user of the app,
   so it explains itself in one line and then gets out of the way. */

export const dynamic = "force-dynamic";

async function readSnapshot(id: string) {
  /* Everything, the database call included, degrades to "this link is no longer
     available". Whoever opens this is a stranger holding a link, and a stack trace tells
     them nothing they can act on while telling them rather more than they should see. */
  try {
    const [row] = await getDb().select().from(shares).where(eq(shares.id, id)).limit(1);
    if (!row || (row.expiresAt && row.expiresAt.getTime() < Date.now())) return null;
    const parsed = JSON.parse(row.payload) as unknown;
    return isSharedSnapshot(parsed) ? parsed : null;
  } catch { return null; }
}

function TaskCard({ task }: { task: SharedTask }) {
  return <article className="shared-task">
    <header>
      <h2>{task.title}</h2>
      <span className="shared-status">{task.status}</span>
    </header>
    <dl className="shared-facts">
      <div><dt>Owner</dt><dd>{task.owner || "—"}</dd></div>
      <div><dt>{task.completedAt ? "Completed" : "Due"}</dt><dd>{task.completedAt ? dateLabel(task.completedAt) : task.expected ? dateLabel(task.expected) : "—"}</dd></div>
      {task.category && <div><dt>Category</dt><dd>{task.category}</dd></div>}
      {task.followUpPeople.length > 0 && <div><dt>Follow-up</dt><dd>{task.followUpPeople.join(", ")}</dd></div>}
    </dl>
    {task.shareable && <p className="shared-headline">{task.shareable}</p>}
    {task.details && <p className="shared-body">{task.details}</p>}
    {task.action && <p className="shared-body"><strong>Current action:</strong> {task.action}</p>}
    {task.outcome && <p className="shared-body"><strong>Outcome:</strong> {task.outcome}</p>}
    {task.links.length > 0 && <p className="shared-links">{task.links.map(href => <a key={href} href={href} target="_blank" rel="noopener noreferrer nofollow">{href}</a>)}</p>}
    {task.updates.length > 0 && <details className="shared-updates">
      <summary>{task.updates.length} update{task.updates.length === 1 ? "" : "s"}</summary>
      <ol>{task.updates.map((update, index) => <li key={index}><strong>{update.author}</strong><time>{dateLabel(update.at)}</time><p>{update.text}</p></li>)}</ol>
    </details>}
  </article>;
}

export default async function SharedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snapshot = await readSnapshot(id);

  if (!snapshot) {
    return <main className="shared-page"><div className="shared-empty">
      <span className="shared-mark"><Petal size={30}/></span>
      <h1>This link is no longer available.</h1>
      <p>It may have expired, or the person who shared it may have revoked it. Ask them for a fresh one.</p>
    </div></main>;
  }

  const done = snapshot.tasks.filter(task => task.completedAt).length;
  return <main className="shared-page">
    <header className="shared-header">
      <span className="shared-mark"><Petal size={30}/></span>
      <p className="eyebrow">SHARED WORK</p>
      <h1>{snapshot.title}</h1>
      <p className="shared-meta">{snapshot.sharedBy ? `Shared by ${snapshot.sharedBy}` : "Shared"} on {dateLabel(snapshot.sharedAt)} · {snapshot.tasks.length} task{snapshot.tasks.length === 1 ? "" : "s"}{done ? `, ${done} completed` : ""}</p>
      {snapshot.note && <p className="shared-note">{snapshot.note}</p>}
    </header>
    <div className="shared-list">{snapshot.tasks.map(task => <TaskCard key={task.id} task={task}/>)}</div>
    <footer className="shared-footer">A read-only snapshot taken when the link was made. It does not update, and nothing here can be changed from this page.</footer>
  </main>;
}
