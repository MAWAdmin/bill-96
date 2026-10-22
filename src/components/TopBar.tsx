import Link from "next/link";
import { logout } from "@/app/actions";
import type { User } from "@/lib/auth";

export function TopBar({ user, toReview = 0 }: { user: User | null; toReview?: number }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href={user ? "/dashboard" : "/"} className="brand">
          <span className="brand-mark">96</span> <span className="brand-name">Bill 96 Checker</span>
        </Link>
        {user ? (
          <>
            <nav className="nav">
              <Link href="/dashboard">Sites</Link>
              <Link href="/translations">
                Translations
                {toReview > 0 && <span className="nav-count" aria-label={`${toReview} to review`}>{toReview}</span>}
              </Link>
            </nav>
            <div className="user">
              <span className="small">{user.name}</span>
              <form action={logout}>
                <button className="btn btn-sm" type="submit">Log out</button>
              </form>
            </div>
          </>
        ) : (
          <>
            <div className="spacer" />
            <Link href="/login" className="btn btn-sm">Log in</Link>
            <Link href="/signup" className="btn btn-sm btn-primary">Sign up</Link>
          </>
        )}
      </div>
    </header>
  );
}
