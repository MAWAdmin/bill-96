import { requireUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { TopBar } from "@/components/TopBar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const open = await queryOne<{ n: string }>(
    `SELECT count(*) AS n FROM translation_items t JOIN sites s ON s.id = t.site_id
     WHERE s.user_id = $1 AND t.status IN ('pending','draft')`,
    [user.id]
  );
  return (
    <>
      <TopBar user={user} toReview={Number(open?.n ?? 0)} />
      <main className="container">{children}</main>
    </>
  );
}
