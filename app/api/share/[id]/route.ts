import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { shares } from "../../../../db/schema";

/* The one route in this app that answers without a signed-in user. It reads only the
   stored snapshot - never `account_data` - so there is nothing here to walk back to
   the writer's workspace. */
export const dynamic = "force-dynamic";

const gone = () => Response.json({ error: "This link is no longer available." }, { status: 404 });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  /* An expired link, a link that never existed, and a database that cannot answer all
     say the same thing: whether an id is real is not something a stranger needs to be
     able to find out, and a 500 with a query in it says far too much. */
  try {
    const [row] = await getDb().select().from(shares).where(eq(shares.id, id)).limit(1);
    if (!row || (row.expiresAt && row.expiresAt.getTime() < Date.now())) return gone();
    return Response.json({ snapshot: JSON.parse(row.payload) });
  } catch {
    return gone();
  }
}
