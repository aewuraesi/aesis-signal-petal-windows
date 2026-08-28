import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { accountData } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { isValidPayload } from "../../backup";

export const dynamic = "force-dynamic";

const unauthorised = () => Response.json({ error: "Sign in with ChatGPT to use cloud sync." }, { status: 401 });

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return unauthorised();
  const [row] = await getDb().select().from(accountData).where(eq(accountData.userId, user.userId)).limit(1);
  const account = { email: user.email, displayName: user.displayName };
  if (!row) return Response.json({ payload: null, revision: 0, updatedAt: null, account });
  try {
    return Response.json({ payload: JSON.parse(row.payload), revision: row.revision, updatedAt: row.updatedAt.toISOString(), account });
  } catch {
    return Response.json({ error: "Cloud data is unreadable." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorised();
  const body = await request.json().catch(() => null) as { payload?: unknown; revision?: unknown } | null;
  if (!body || !isValidPayload(body.payload)) return Response.json({ error: "Invalid sync payload." }, { status: 400 });
  const expectedRevision = Number.isInteger(body.revision) ? Number(body.revision) : 0;
  const db = getDb();
  const [existing] = await db.select().from(accountData).where(eq(accountData.userId, user.userId)).limit(1);
  if (existing && existing.revision !== expectedRevision) {
    return Response.json({ payload: JSON.parse(existing.payload), revision: existing.revision, updatedAt: existing.updatedAt.toISOString() }, { status: 409 });
  }
  const now = new Date();
  const revision = (existing?.revision ?? 0) + 1;
  await db.insert(accountData).values({ userId: user.userId, payload: JSON.stringify(body.payload), revision, createdAt: existing?.createdAt ?? now, updatedAt: now })
    .onConflictDoUpdate({ target: accountData.userId, set: { payload: JSON.stringify(body.payload), revision, updatedAt: now } });
  return Response.json({ revision, updatedAt: now.toISOString() });
}

export async function DELETE() {
  const user = await getChatGPTUser();
  if (!user) return unauthorised();
  await getDb().delete(accountData).where(eq(accountData.userId, user.userId));
  return Response.json({ deleted: true });
}
