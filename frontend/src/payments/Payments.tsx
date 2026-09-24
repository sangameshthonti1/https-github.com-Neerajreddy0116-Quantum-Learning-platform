import { ActionLink, Badge, Icon } from "../app/ui";
import {
  freeLibraryTopicCount,
  resetDemoLibraryAccess,
  useDemoLibraryAccess,
  useDemoLibraryReceipt,
} from "../library/access";
import "./payments.css";

function formatRecordedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function Payments() {
  const unlocked = useDemoLibraryAccess();
  const receipt = useDemoLibraryReceipt();

  return (
    <main className="q-page payments-page">
      <header className="q-page-heading payments-heading">
        <p className="q-eyebrow">DEMO BILLING</p>
        <h1>Payments &amp; billing.</h1>
        <p>
          Review this browser’s Quantum Library demo access. No payment provider,
          account, or backend billing service is connected.
        </p>
      </header>

      <section className="payments-access" aria-label="Library access summary">
        <div className="payments-access-copy">
          <Badge tone={unlocked ? "success" : "blue"}>
            {unlocked ? "DEMO ACCESS ACTIVE" : "FREE ACCESS"}
          </Badge>
          <h2>
            {unlocked
              ? "Complete Library demo access"
              : "Free Library access"}
          </h2>
          <p>
            {unlocked
              ? "All 13 reviewed Library topics are available in this browser. This is a presentation unlock, not a purchase."
              : `${freeLibraryTopicCount} reviewed topics are available now. The remaining 10 can be enabled through the free demonstration checkout.`}
          </p>
          <div className="payments-actions">
            <ActionLink href={unlocked ? "/library" : "/library/unlock"}>
              {unlocked ? "Open complete Library" : "Open demo checkout"}
            </ActionLink>
            {unlocked ? (
              <button
                className="q-button q-button-secondary"
                type="button"
                onClick={resetDemoLibraryAccess}
                aria-describedby="payments-reset-note"
              >
                Reset demo access
              </button>
            ) : (
              <ActionLink href="/library" secondary>
                Browse free topics
              </ActionLink>
            )}
          </div>
          {unlocked && (
            <p id="payments-reset-note" className="payments-reset-note">
              Resetting removes only the local demo unlock and its demo receipt.
            </p>
          )}
        </div>

        <aside className="payments-price-card" aria-label="Demo price details">
          <p className="payments-price-label">DISPLAYED DEMO PRICE</p>
          <div className="payments-price">
            <strong>₹9</strong>
            <span>one-time Library access</span>
          </div>
          <dl>
            <div>
              <dt>Amount charged</dt>
              <dd>₹0</dd>
            </div>
            <div>
              <dt>Payment provider</dt>
              <dd>Not connected</dd>
            </div>
            <div>
              <dt>Access storage</dt>
              <dd>This browser only</dd>
            </div>
          </dl>
          <p className="payments-zero-charge">
            <span aria-hidden="true">✓</span>
            No card, UPI, bank, phone, or account details requested
          </p>
        </aside>
      </section>

      <section className="payments-history" aria-labelledby="payments-history-title">
        <header>
          <div>
            <p className="q-eyebrow">BROWSER-LOCAL RECORD</p>
            <h2 id="payments-history-title">Demo billing history</h2>
          </div>
          <Badge>NOT AN INVOICE</Badge>
        </header>

        {unlocked ? (
          <article className="payments-receipt" aria-label="Demo receipt">
            <div className="payments-receipt-icon">
              <Icon name="payments" size={26} />
            </div>
            <div className="payments-receipt-main">
              <span>DEMO RECEIPT</span>
              <h3>Complete Quantum Library enabled</h3>
              <p>
                Browser-local access was enabled without contacting a payment
                provider.
              </p>
            </div>
            <dl className="payments-receipt-meta">
              <div>
                <dt>Recorded</dt>
                <dd>
                  {receipt ? (
                    <time dateTime={receipt.unlockedAt}>
                      {formatRecordedAt(receipt.unlockedAt)}
                    </time>
                  ) : (
                    "Time unavailable"
                  )}
                </dd>
              </div>
              <div>
                <dt>Displayed price</dt>
                <dd>₹9</dd>
              </div>
              <div>
                <dt>Amount charged</dt>
                <dd>₹0</dd>
              </div>
            </dl>
            <p className="payments-receipt-disclosure">
              This demo receipt is a UI record only. It is not a legal invoice,
              transaction confirmation, proof of payment, or refund record.
            </p>
          </article>
        ) : (
          <div className="payments-history-empty">
            <span aria-hidden="true">
              <Icon name="payments" size={29} />
            </span>
            <div>
              <h3>No demo unlock recorded.</h3>
              <p>
                If you run the free Library checkout, its time and ₹0 charged
                amount will appear here on this browser.
              </p>
            </div>
          </div>
        )}
      </section>

      <aside className="payments-boundary" aria-label="Demo billing boundary">
        <strong>Demo boundary</strong>
        <p>
          This frontend-only feature does not process money or securely authorize
          content. Clearing browser site data removes the unlock and its local
          record.
        </p>
      </aside>

      <footer className="q-page-footer">
        <span>Frontend demonstration only · ₹0 charged</span>
        <span>No payment provider or billing API connected</span>
      </footer>
    </main>
  );
}
