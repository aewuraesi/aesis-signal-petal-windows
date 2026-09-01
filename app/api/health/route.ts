import { getDb } from "../../../db";
import { accountData } from "../../../db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    await getDb().select({ userId: accountData.userId }).from(accountData).limit(1);
    return Response.json({ status: "ok", database: "reachable", latencyMs: Date.now() - startedAt, checkedAt: new Date().toISOString() });
  } catch {
    return Response.json({ status: "degraded", database: "unreachable", checkedAt: new Date().toISOString() }, { status: 503 });
  }
}
