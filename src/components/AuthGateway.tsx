import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { AuthLinkRequestedDto, AuthSessionDto } from "../../packages/domain/src";
import brandMark from "../../app/static/img/brand-icon.gif";
import background from "../../app/static/img/background.png";

type AuthMode = "HOME" | "LOGIN" | "REGISTER" | "CHECK_EMAIL" | "VERIFY";

async function responseError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: { message?: string } };
    return body.error?.message ?? `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

function localDemoHeaders(): HeadersInit | undefined {
  const params = new URLSearchParams(window.location.search);
  return ["localhost", "127.0.0.1"].includes(window.location.hostname) && params.get("signedout") !== "1"
    ? { "x-demo-user": "demo-user" }
    : undefined;
}

function SignedOutHome({ authAvailable, initialMode }: { authAvailable: boolean; initialMode: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [developmentUrl, setDevelopmentUrl] = useState<string>();
  const authCard = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mode === "HOME" || !window.matchMedia("(max-width: 900px)").matches) return;
    const frame = window.requestAnimationFrame(() => authCard.current?.scrollIntoView({ block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [mode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode !== "LOGIN" && mode !== "REGISTER") return;
    setBusy(true);
    setError(undefined);
    setDevelopmentUrl(undefined);
    try {
      const response = await fetch(`/api/auth/${mode === "REGISTER" ? "register" : "login"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "REGISTER" ? { email, username, displayName } : { email }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const result = await response.json() as AuthLinkRequestedDto;
      setDevelopmentUrl(result.developmentVerificationUrl);
      setMode("CHECK_EMAIL");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Command access could not be requested.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEmail() {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/auth/verify", { method: "POST" });
      if (!response.ok) throw new Error(await responseError(response));
      const localSignedOut = new URLSearchParams(window.location.search).get("signedout") === "1";
      window.location.assign(localSignedOut ? "/?auth=verified&signedout=1" : "/?auth=verified");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This access link could not be confirmed.");
      setBusy(false);
    }
  }

  return (
    <main className="public-shell" style={{ "--public-background": `url(${background})` } as CSSProperties}>
      <header className="public-header">
        <a className="public-brand" href="/" aria-label="Corinth's Plight home">
          <img src={brandMark} alt="" />
          <span><small>PERSISTENT COOPERATIVE WARGAME</small><strong>CORINTH'S PLIGHT</strong></span>
        </a>
        <div className="public-actions">
          <button onClick={() => { setMode("LOGIN"); setError(undefined); }}>SIGN IN</button>
          <button className="primary" onClick={() => { setMode("REGISTER"); setError(undefined); }}>ENLIST</button>
        </div>
      </header>

      <section className="public-hero">
        <div className="public-hero-copy">
          <span className="eyebrow">THE WAR FOR CORINTH PERSISTS</span>
          <h1>Every unit has a name.<br />Every order has a cost.</h1>
          <p>Build a force with other commanders, carry its scars between operations, and fight a living cooperative campaign from orbit to the battlefield.</p>
          <div className="public-hero-actions">
            <button className="primary" onClick={() => setMode("REGISTER")}>JOIN THE EXPEDITION</button>
            <button onClick={() => setMode("LOGIN")}>RETURN TO COMMAND</button>
          </div>
          <dl className="public-signal-grid">
            <div><dt>PERSISTENT</dt><dd>Veteran units, equipment, damage and history survive the battle.</dd></div>
            <div><dt>COOPERATIVE</dt><dd>Organise Battalions, Battlegroups and Task Forces with real players.</dd></div>
            <div><dt>ASYNCHRONOUS</dt><dd>Plan together, lock intentions, then resolve deterministic rounds.</dd></div>
          </dl>
        </div>

        {mode !== "HOME" && (
          <aside ref={authCard} className="auth-card" aria-labelledby="auth-title">
            {mode === "VERIFY" ? (
              <div className="auth-confirmation">
                <span className="auth-status-mark">→</span>
                <span className="eyebrow">EMAIL VERIFICATION</span>
                <h2 id="auth-title">Confirm command access</h2>
                <p>Complete this final browser confirmation to verify your email and create the secure session.</p>
                {error && <p className="auth-error" role="alert">{error}</p>}
                <button className="primary" disabled={busy} onClick={() => void confirmEmail()}>{busy ? "CONFIRMING…" : "CONFIRM EMAIL"}</button>
              </div>
            ) : mode === "CHECK_EMAIL" ? (
              <div className="auth-confirmation" role="status">
                <span className="auth-status-mark">✓</span>
                <span className="eyebrow">SECURE LINK REQUESTED</span>
                <h2 id="auth-title">Check your email</h2>
                <p>If the address is eligible, Resend has delivered a one-time command access link. It expires in 15 minutes.</p>
                {developmentUrl && <a className="development-auth-link" href={developmentUrl}>OPEN LOCAL VERIFICATION LINK</a>}
                <button onClick={() => setMode("LOGIN")}>REQUEST ANOTHER LINK</button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <span className="eyebrow">{mode === "REGISTER" ? "NEW COMMANDER" : "SECURE ACCESS"}</span>
                <h2 id="auth-title">{mode === "REGISTER" ? "Join the expedition" : "Return to command"}</h2>
                <p>No password to remember. We’ll email a single-use access link.</p>
                {mode === "REGISTER" && (
                  <>
                    <label htmlFor="display-name">DISPLAY NAME</label>
                    <input id="display-name" name="displayName" autoComplete="name" minLength={2} maxLength={48} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
                    <label htmlFor="username">USERNAME</label>
                    <input id="username" name="username" autoComplete="username" pattern={"[a-z0-9][a-z0-9_\\-]{2,23}"} required value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} aria-describedby="username-help" />
                    <small id="username-help">3–24 lowercase letters, numbers, hyphens or underscores.</small>
                  </>
                )}
                <label htmlFor="auth-email">EMAIL</label>
                <input id="auth-email" name="email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} />
                {error && <p className="auth-error" role="alert">{error}</p>}
                {!authAvailable && <p className="auth-error" role="status">Production email access is being configured. No account data has been submitted.</p>}
                <button className="primary auth-submit" type="submit" disabled={busy || !authAvailable}>{busy ? "REQUESTING…" : "EMAIL SECURE LINK"}</button>
                <button className="auth-switch" type="button" onClick={() => { setMode(mode === "REGISTER" ? "LOGIN" : "REGISTER"); setError(undefined); }}>
                  {mode === "REGISTER" ? "ALREADY ENLISTED? SIGN IN" : "NEW COMMANDER? ENLIST"}
                </button>
              </form>
            )}
          </aside>
        )}
      </section>

      <section className="public-proof" aria-label="Game layers">
        <article><span>01</span><h2>Command the war</h2><p>Read the strategic map, assign formations and support active operations.</p></article>
        <article><span>02</span><h2>Prepare the force</h2><p>Own named units, fit equipment, organise lift and commit deployment plans.</p></article>
        <article><span>03</span><h2>Fight the round</h2><p>Submit simultaneous intentions into a transparent, deterministic rules engine.</p></article>
      </section>
    </main>
  );
}

export function AuthGateway({ children }: { children: ReactNode }) {
  const params = new URLSearchParams(window.location.search);
  const authResult = params.get("auth");
  const [session, setSession] = useState<AuthSessionDto>();
  const [loadingError, setLoadingError] = useState<string>();

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { headers: localDemoHeaders() })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response));
        return response.json() as Promise<AuthSessionDto>;
      })
      .then((next) => { if (active) setSession(next); })
      .catch((error: unknown) => { if (active) setLoadingError(error instanceof Error ? error.message : "Authentication is unavailable."); });
    return () => { active = false; };
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  if (!session && !loadingError) {
    return <main className="auth-loading" aria-busy="true"><img src={brandMark} alt="" /><p>ESTABLISHING SECURE COMMAND LINK…</p></main>;
  }
  if (!session?.signedIn) {
    const initialMode: AuthMode = authResult === "confirm" ? "VERIFY" : authResult === "invalid" ? "LOGIN" : "HOME";
    return (
      <>
        {authResult === "invalid" && <div className="public-auth-alert" role="alert">That access link is invalid, expired, or already used. Request a new one.</div>}
        {loadingError && <div className="public-auth-alert" role="alert">{loadingError}</div>}
        <SignedOutHome authAvailable={session?.authAvailable ?? false} initialMode={initialMode} />
      </>
    );
  }
  return (
    <>
      {children}
      <div className="account-session-chip">
        <span><small>{session.demo ? "LOCAL DEMO" : "SIGNED IN"}</small><strong>{session.user.callsign || session.user.displayName}</strong></span>
        <button onClick={() => void signOut()}>SIGN OUT</button>
      </div>
    </>
  );
}
