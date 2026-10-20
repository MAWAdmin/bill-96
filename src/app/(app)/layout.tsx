import { requireUser } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <TopBar user={user} />
      <main className="container">{children}</main>
    </>
  );
}
