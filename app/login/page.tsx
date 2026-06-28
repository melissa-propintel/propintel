import Link from "next/link";
import { login, signup } from "./actions";

const inputCls =
  "w-full rounded-md border border-pi-border bg-white px-3 py-2 text-sm focus:border-pi-green-deep focus:outline-none";
const btnCls =
  "w-full rounded-lg bg-pi-green-deep px-4 py-2.5 text-sm font-medium text-white hover:bg-pi-navy-soft transition";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; mode?: string; check?: string }>;
}) {
  const { error, next, mode, check } = await searchParams;
  const isSignup = mode === "signup";

  return (
    <main className="flex flex-1 items-center justify-center bg-pi-cream px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/propintel-logo.svg" alt="PropIntel" className="mx-auto h-16 w-auto" />
        </div>

        <div className="rounded-2xl border border-pi-border bg-white p-6 shadow-sm">
          {check && (
            <p className="mb-4 rounded-md bg-pi-green-pale px-3 py-2 text-xs text-pi-green-dark">
              Check your email to confirm your account, then sign in.
            </p>
          )}
          {error && (
            <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          )}

          {isSignup ? (
            <>
              <h1 className="text-lg font-semibold text-pi-green-dark">Create a client account</h1>
              <p className="mt-1 text-xs text-pi-slate-mid">Request reports and see your finished work.</p>
              <form action={signup} className="mt-5 space-y-3">
                <input name="company" placeholder="Company (optional)" className={inputCls} />
                <input name="email" type="email" required placeholder="Work email" className={inputCls} />
                <input name="password" type="password" required minLength={8} placeholder="Password (8+ characters)" className={inputCls} />
                <button type="submit" className={btnCls}>Create account</button>
              </form>
              <p className="mt-4 text-center text-xs text-pi-slate-mid">
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-pi-green-deep hover:underline">Sign in</Link>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-pi-green-dark">Sign in</h1>
              <form action={login} className="mt-5 space-y-3">
                {next && <input type="hidden" name="next" value={next} />}
                <input name="email" type="email" required placeholder="Email" className={inputCls} />
                <input name="password" type="password" required placeholder="Password" className={inputCls} />
                <button type="submit" className={btnCls}>Sign in</button>
              </form>
              <p className="mt-4 text-center text-xs text-pi-slate-mid">
                Need a client account?{" "}
                <Link href="/login?mode=signup" className="font-medium text-pi-green-deep hover:underline">Request access</Link>
              </p>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-pi-slate-soft">
          PropIntel · Property intelligence, field-verified
        </p>
      </div>
    </main>
  );
}
