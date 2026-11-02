import { NextResponse } from "next/server";
import { queuePosition } from "@/lib/jobs";
import { getPublicScan } from "@/lib/freeScan/store";

/** Free scan status for polling. Never includes the email or the share token. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = await getPublicScan(id);
  if (!scan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const done = scan.status === "completed";
  return NextResponse.json({
    id: scan.id,
    status: scan.status,
    position: queuePosition(scan.id),
    pagesDone: scan.pages_done,
    pagesTotal: scan.pages_total,
    siteScore: done ? scan.score : null,
    riskBand: done ? scan.summary?.riskBand ?? null : null,
    resultsUrl: `/scan/${scan.id}`,
  });
}
