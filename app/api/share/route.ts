import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { shares } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { isSharedSnapshot, newShareId } from "../../share";

export const dynamic = "force-dynamic";

const unauthorised = () => Response.json({ error: "Sign in with ChatGPT to share work." }, { status: 401 });

/* A share is capped well below the sync payload: it is a handover, not a copy of the
   workspace, and an unbounded public document is not something to leave open. */
const MAX_SHARE_BYTES = 512 * 1024;

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return unauthorised();
  const rows = await getDb().select().from(shares).where(eq(shares.userId, user.userId));
  return Response.json({
    shares: rows
      .map(row => ({ id: row.id, title: row.title, createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt?.toISOString() ?? null }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorised();
  const body = await request.json().catch(() => null) as { snapshot?: unknown; expiresAt?: unknown } | null;
  if (!body || !isSharedSnapshot(body.snapshot)) return Response.json({ error: "That snapshot could not be read." }, { status: 400 });
  if (!body.snapshot.tasks.length) return Response.json({ error: "Choose at least one task to share." }, { status: 400 });
  const payload = JSON.stringify(body.snapshot);
  if (payload.length > MAX_SHARE_BYTES) return Response.json({ error: "That is too much to put behind one link. Share fewer tasks." }, { status: 413 });
  const expires = typeof body.expiresAt === "string" ? new Date(body.expiresAt) : null;
  const id = newShareId();
  await getDb().insert(shares).values({
    id,
    userId: user.userId,
    title: body.snapshot.title,
    payload,
    createdAt: new Date(),
    expiresAt: expires && !Number.isNaN(expires.getTime()) ? expires : null,
  });
  return Response.json({ id, path: `/share/${id}` });
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorised();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Which link?" }, { status: 400 });
  /* Scoped to the owner, so knowing an id is not enough to revoke someone else's. */
  await getDb().delete(shares).where(and(eq(shares.id, id), eq(shares.userId, user.userId)));
  return Response.json({ revoked: true });
}
