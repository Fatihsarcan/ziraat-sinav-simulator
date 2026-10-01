import { rawDb } from "../../../lib/server.ts";
import { exportJson } from "../../../lib/backup.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = exportJson(rawDb());
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="ziraat-export-${stamp}.json"`,
    },
  });
}
