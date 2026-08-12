import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { AuthLinkRequestedDto, AuthSessionDto } from "../../packages/domain/src";
import brandMark from "../../app/static/img/brand-icon.gif";
import background from "../../app/static/img/background-corinth-orbit.webp";
import campaignScreen from "../assets/home-gameplay/campaign-operations.webp";
import forcesScreen from "../assets/home-gameplay/forces-registry.webp";
import galacticScreen from "../assets/home-gameplay/galactic-operations.webp";
import { GuidedOnboarding } from "./GuidedOnboarding";

type AuthMode = "HOME" | "LOGIN" | "REGISTER" | "CHECK_EMAIL" | "VERIFY";
type ShowcaseMode = "STRATEGIC" | "TACTICAL" | "PERSISTENCE";

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

const showcaseModes: { id: ShowcaseMode; label: string; detail: string }[] = [
  { id: "STRATEGIC", label: "GALACTIC", detail: "The live theatre screen for formations, routes, supply and operations." },
  { id: "TACTICAL", label: "CAMPAIGN", detail: "The live battlefield for simultaneous routes, facing and tactical actions." },
  { id: "PERSISTENCE", label: "FORCES", detail: "The live registry for named veterans, equipment, damage and service history." },
];

function TheatreBrief() {
  return (
    <aside className="home-theatre-brief home-reveal" data-home-reveal aria-label="Current Corinth theatre briefing">
      <header><span>THEATRE SIGNAL</span><b>LIVE</b></header>
      <div className="home-brief-location">
        <small>HELION SYSTEM // CORINTH</small>
        <strong>THE LINE IS HOLDING.</strong>
        <p>For now.</p>
      </div>
      <dl>
        <div><dt>CONTROL</dt><dd className="contested">CONTESTED</dd></div>
        <div><dt>ENEMY PRESSURE</dt><dd className="danger">HIGH</dd></div>
        <div><dt>STRATEGIC ROUND</dt><dd>028</dd></div>
      </dl>
      <footer>
        <span><i /> CSV RESOLUTE</span>
        <small>CORINTH HIGH ORBIT</small>
      </footer>
    </aside>
  );
}

function GameplayShowcase({ mode }: { mode: ShowcaseMode }) {
  const screen = mode === "TACTICAL" ? campaignScreen : mode === "PERSISTENCE" ? forcesScreen : galacticScreen;
  const label = mode === "TACTICAL"
    ? "Campaign Operations tactical battlefield screen"
    : mode === "PERSISTENCE"
      ? "Persistent Force Registry screen"
      : "Galactic Operations strategic theatre screen";
  return <figure className="home-live-screen" key={mode}><img src={screen} alt={label} loading="lazy" decoding="async" /></figure>;
}

function SignedOutHome({ authAvailable, initialMode }: { authAvailable: boolean; initialMode: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [showcaseMode, setShowcaseMode] = useState<ShowcaseMode>("STRATEGIC");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [developmentUrl, setDevelopmentUrl] = useState<string>();
  const authCard = useRef<HTMLElement>(null);
  const publicShell = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = publicShell.current;
    if (!root) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealElements = Array.from(root.querySelectorAll<HTMLElement>("[data-home-reveal]"));
    const motionSections = Array.from(root.querySelectorAll<HTMLElement>("[data-motion-section]"));
    if (reducedMotion || !("IntersectionObserver" in window)) {
      revealElements.forEach((element) => element.classList.add("is-visible"));
      motionSections.forEach((element) => element.classList.add("is-motion-active"));
      return;
    }
    root.classList.add("home-motion-ready");
    const revealObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      (entry.target as HTMLElement).classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    }), { threshold: 0.14 });
    const motionObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
      entry.target.classList.toggle("is-motion-active", entry.isIntersecting);
    }), { threshold: 0.05 });
    revealElements.forEach((element) => revealObserver.observe(element));
    motionSections.forEach((element) => motionObserver.observe(element));
    return () => { revealObserver.disconnect(); motionObserver.disconnect(); };
  }, []);

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
    <main ref={publicShell} className="public-shell" style={{ "--public-background": `url(${background})` } as CSSProperties}>
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

      <section className="public-hero" data-motion-section>
        <div className="public-hero-copy home-reveal" data-home-reveal>
          <span className="eyebrow">FIELD TRANSMISSION // CORINTH HIGH ORBIT</span>
          <h1>Corinth is not lost.<br />Not yet.</h1>
          <p>The fleet holds above a contested world. Below, Battalions fight for airfields, supply roads and cities—one simultaneous round at a time. Your orders become part of that history.</p>
          <div className="public-hero-actions">
            <button className="primary" onClick={() => setMode("REGISTER")}>ENLIST FOR CORINTH</button>
            <a className="home-text-link" href="#gameplay">SEE THE WAR ROOM <span aria-hidden="true">↓</span></a>
          </div>
          <dl className="public-signal-grid">
            <div><dt>YOUR FORCE</dt><dd>Raise named units. Equip them. Carry their damage and victories forward.</dd></div>
            <div><dt>YOUR BATTALION</dt><dd>Coordinate players, ships, Battlegroups and scarce supply.</dd></div>
            <div><dt>YOUR ORDERS</dt><dd>Plan together. Lock intentions. Resolve the whole battlefield at once.</dd></div>
          </dl>
        </div>

        {mode === "HOME" ? <TheatreBrief /> : (
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

      <section className="home-transmission" data-motion-section aria-label="Current theatre transmission">
        <div><span>STRATEGIC ROUND 028</span><b>CSV RESOLUTE // CORINTH HIGH ORBIT</b><span>BUG PRESSURE: HIGH</span><b>OPERATION IRON RAIN // MUSTERING</b><span>KESTREL RIDGE: CONTESTED</span></div>
      </section>

      <section id="gameplay" className="home-gameplay" data-motion-section>
        <header className="home-section-heading home-reveal" data-home-reveal>
          <div><span className="eyebrow">THE COMMAND EXPERIENCE</span><h2>The war is bigger than one battle.</h2></div>
          <p>Move across the theatre, commit a persistent force, then issue precise orders on the ground. These views mirror the systems already playable in the current build.</p>
        </header>
        <div className="home-showcase-controls home-reveal" data-home-reveal aria-label="Gameplay example views">
          {showcaseModes.map((item, index) => <button key={item.id} type="button" aria-pressed={showcaseMode === item.id} className={showcaseMode === item.id ? "active" : ""} onClick={() => setShowcaseMode(item.id)}><span>0{index + 1}</span><b>{item.label}</b><small>{item.detail}</small></button>)}
        </div>
        <div className="home-gameplay-frame home-reveal" data-home-reveal>
          <header><span>CURRENT BUILD CAPTURE</span><b>{showcaseMode} VIEW</b><small>ACTUAL GAME SCREEN</small></header>
          <GameplayShowcase mode={showcaseMode} />
        </div>
      </section>

      <section className="home-campaign-loop" data-motion-section>
        <header className="home-section-heading home-reveal" data-home-reveal><div><span className="eyebrow">A LIVING CAMPAIGN</span><h2>What survives changes what comes next.</h2></div></header>
        <div className="home-loop-grid">
          <article className="home-reveal" data-home-reveal><span>01 // MUSTER</span><h3>Join the expedition.</h3><p>Enter a player Battalion, crew its ship and build a persistent combined-arms force.</p><small>CORINTH HIGH ORBIT</small></article>
          <article className="home-reveal" data-home-reveal><span>02 // COMMIT</span><h3>Choose where to bleed.</h3><p>Strategic control, logistics and operation outcomes decide which roads and fronts open.</p><small>THE CORINTH EXPEDITION</small></article>
          <article className="home-reveal" data-home-reveal><span>03 // COMMAND</span><h3>Make intentions visible.</h3><p>Allies coordinate routes, facing, targets and support before the simultaneous lock.</p><small>TACTICAL ROUND</small></article>
          <article className="home-reveal" data-home-reveal><span>04 // ENDURE</span><h3>Bring home who remains.</h3><p>Veterans retain service history, equipment, ammunition and damage. The dead stay named.</p><small>PERSISTENT FORCE REGISTRY</small></article>
        </div>
      </section>

      <section className="home-final-call home-reveal" data-home-reveal>
        <span className="eyebrow">THE 33RD IS STILL TAKING NAMES</span>
        <h2>There is another round to plan.</h2>
        <p>Corinth does not need a hero. It needs a commander who will still be here when the consequences arrive.</p>
        <div><button className="primary" onClick={() => setMode("REGISTER")}>JOIN THE EXPEDITION</button><button onClick={() => setMode("LOGIN")}>RETURN TO COMMAND</button></div>
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
      <GuidedOnboarding user={session.user} demo={session.demo}>{children}</GuidedOnboarding>
      <div className="account-session-chip">
        <span><small>{session.demo ? "LOCAL DEMO" : "SIGNED IN"}</small><strong>{session.user.callsign || session.user.displayName}</strong></span>
        <button onClick={() => void signOut()}>SIGN OUT</button>
      </div>
    </>
  );
}
