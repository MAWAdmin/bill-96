import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { signup } from "@/app/actions";
import { TopBar } from "@/components/TopBar";
import { ActionForm, SubmitButton } from "@/components/forms";

export default async function SignupPage() {
  if (await getUser()) redirect("/dashboard");
  return (
    <>
      <TopBar user={null} />
      <main className="auth-wrap">
        <div className="card narrow" style={{ width: "100%" }}>
          <h1>Create your account</h1>
          <ActionForm action={signup}>
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" type="text" autoComplete="name" required />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
              <div className="hint">At least 8 characters.</div>
            </div>
            <SubmitButton className="btn btn-primary" pendingText="Creating…">Create account</SubmitButton>
          </ActionForm>
          <p className="small muted" style={{ marginTop: 16 }}>
            Already have an account? <Link href="/login">Log in</Link>
          </p>
        </div>
      </main>
    </>
  );
}
