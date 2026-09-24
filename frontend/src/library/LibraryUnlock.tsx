import { ActionLink, Badge } from "../app/ui";
import { Link, navigate } from "../app/navigation";
import type { LibraryTopic } from "./types";
import { unlockDemoLibrary, useDemoLibraryAccess } from "./access";

export function LockedLibraryTopic({ topic }: { topic: LibraryTopic }) {
  return (
    <main className="q-page library-page library-access-page">
      <nav className="library-breadcrumb" aria-label="Breadcrumb">
        <Link href="/library">Quantum Library</Link>
        <span aria-hidden="true">/</span>
        <span>{topic.title}</span>
      </nav>
      <section className="library-lock-preview" aria-label="Locked library topic">
        <div className="library-lock-mark" aria-hidden="true">
          <span>⌁</span>
          <strong>04—13</strong>
        </div>
        <div>
          <Badge tone="blue">DEMO-LOCKED TOPIC</Badge>
          <h1>{topic.title}</h1>
          <p>{topic.summary}</p>
          <div className="library-lock-note">
            <strong>The first three topics are free.</strong>
            <p>
              This topic is part of the complete Library demo. Continue to the
              mock checkout and unlock every remaining reviewed topic without
              entering payment details or being charged.
            </p>
          </div>
          <div className="library-lock-actions">
            <ActionLink href={`/library/unlock?topic=${topic.slug}`}>
              Continue to demo checkout
            </ActionLink>
            <ActionLink href="/library" secondary>
              Browse free topics
            </ActionLink>
          </div>
        </div>
      </section>
      <footer className="q-page-footer">
        <span>Frontend demonstration only · Not a real payment gate</span>
        <Link href="/library">Back to all topics</Link>
      </footer>
    </main>
  );
}

export default function LibraryUnlock({ target }: { target?: LibraryTopic }) {
  const unlocked = useDemoLibraryAccess();
  const destination = target ? `/library/${target.slug}` : "/library";

  if (unlocked) {
    return (
      <main className="q-page library-page library-access-page">
        <section className="library-unlock-complete">
          <span aria-hidden="true">✓</span>
          <Badge tone="success">DEMO ACCESS ACTIVE</Badge>
          <h1>Your Library is unlocked.</h1>
          <p>
            Access is saved in this browser. No Razorpay request was made and no
            money was charged.
          </p>
          <ActionLink href={destination}>
            {target ? `Read ${target.title}` : "Browse all topics"}
          </ActionLink>
        </section>
      </main>
    );
  }

  function unlock() {
    unlockDemoLibrary();
    navigate(destination);
  }

  return (
    <main className="q-page library-page library-access-page">
      <nav className="library-breadcrumb" aria-label="Breadcrumb">
        <Link href="/library">Quantum Library</Link>
        <span aria-hidden="true">/</span>
        <span>Unlock Library</span>
      </nav>
      <header className="library-unlock-header">
        <p className="q-eyebrow">LIBRARY ACCESS DEMONSTRATION</p>
        <h1>Unlock the complete Quantum Library.</h1>
        <p>
          Keep the first three foundations free, then demonstrate a one-time
          unlock for every remaining reviewed topic.
        </p>
      </header>
      <div className="library-checkout-layout">
        <section className="library-unlock-benefits" aria-label="Unlock includes">
          <Badge tone="blue">10 MORE REVIEWED TOPICS</Badge>
          <h2>Continue from foundations to interference.</h2>
          <ul>
            <li>Circuits, gates, measurement, and Hadamard</li>
            <li>Prediction, sampling, phase, and interference</li>
            <li>HZH, multi-qubit states, and knowledge checks</li>
            <li>Topic-specific source-note downloads</li>
          </ul>
          {target && (
            <p className="library-unlock-return">
              After unlocking, you will return to <strong>{target.title}</strong>.
            </p>
          )}
        </section>
        <section className="library-demo-checkout" aria-label="Demo checkout">
          <header>
            <div>
              <span>DEMO PAYMENT PORTAL</span>
              <strong>Quantum Library</strong>
            </div>
            <small>NO REAL PAYMENT</small>
          </header>
          <div className="library-demo-price">
            <span>One-time access</span>
            <strong>₹9</strong>
          </div>
          <dl>
            <div>
              <dt>Demo product</dt>
              <dd>Complete Library</dd>
            </div>
            <div>
              <dt>Amount charged</dt>
              <dd>₹0</dd>
            </div>
            <div>
              <dt>Saved to</dt>
              <dd>This browser</dd>
            </div>
          </dl>
          <p className="library-demo-disclosure">
            This screen does not contact Razorpay. It requests no card, UPI, bank,
            phone, or account information. Clicking below grants free demo access.
          </p>
          <button className="q-button q-button-primary" type="button" onClick={unlock}>
            Buy &amp; unlock — demo
          </button>
          <Link href="/library">Cancel and return to free topics</Link>
        </section>
      </div>
      <p className="library-demo-boundary">
        Demo boundary: this is a presentation prototype, not payment verification
        or secure authorization. Clearing browser site data removes the unlock.
      </p>
    </main>
  );
}
