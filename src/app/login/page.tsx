import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { login } from "@/app/actions";
import { TopBar } from "@/components/TopBar";
import { ActionForm, SubmitButton } from "@/components/forms";

export default async function LoginPage() {
  if (await getUser()) redirect("/dashboard");
  return (
    <>
      <TopBar user={null} />
      <main className="auth-wrap">
        <div className="card narrow" style={{ width: "100%" }}>
          <h1>Log in</h1>
          <ActionForm action={login}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <SubmitButton className="btn btn-primary" pendingText="Logging in…">Log in</SubmitButton>
          </ActionForm>
          <p className="small muted" style={{ marginTop: 16 }}>
            No account? <Link href="/signup">Sign up</Link>
          </p>
        </div>
      </main>
    </>
  );
}
