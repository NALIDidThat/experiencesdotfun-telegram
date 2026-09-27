import { CheckCircle2, Heart } from "lucide-react";
import "./_group.css";

const encouragements = [
  "Keep going",
  "Nearly there",
  "Proud of you",
  "Let’s do this",
  "Want to join me?",
];

export function Current() {
  return (
    <main className="accountability-current-screen">
      <section className="accountability-current-card" aria-label="Accountability partner">
        <div className="accountability-current-profile">
          <div className="accountability-current-avatar" aria-hidden="true">N</div>
          <div className="accountability-current-copy">
            <div className="accountability-current-eyebrow">Your accountability partner</div>
            <div className="accountability-current-name">NALI @ Experiences</div>
            <div className="accountability-current-meta">@naaify · Since 27 Sept</div>
          </div>
          <div className="accountability-current-status">
            <CheckCircle2 size={13} aria-hidden="true" />
            Active
          </div>
        </div>

        <div className="accountability-current-reassurance">
          <strong>Support, not surveillance</strong>
          <p>Check-ins are self-reported unless your partner confirms them. Manual check-ins never award XP.</p>
        </div>

        <div className="accountability-current-encouragement">
          <div className="accountability-current-section-title">Send a little encouragement</div>
          <div className="accountability-current-actions">
            {encouragements.map((label) => (
              <button key={label} className="accountability-current-action" type="button">
                <Heart size={14} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <button className="accountability-current-end" type="button">End partnership</button>
      </section>
      <style>{`
        .accountability-current-screen {
          min-height: 100vh;
          padding: 8px 10px 20px;
          background: var(--accountability-muted);
          color: var(--accountability-foreground);
          font-family: Inter, Arial, sans-serif;
        }
        .accountability-current-card {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 18px;
          border: 1px solid var(--accountability-border);
          border-radius: 18px;
          background: var(--accountability-background);
          box-shadow: 0 2px 8px rgba(17, 17, 17, .025);
        }
        .accountability-current-profile {
          display: flex;
          align-items: center;
          gap: 13px;
        }
        .accountability-current-avatar {
          display: grid;
          flex: 0 0 58px;
          width: 58px;
          height: 58px;
          place-items: center;
          border-radius: 50%;
          background: rgba(242, 7, 137, .09);
          color: var(--accountability-primary);
          font-size: 18px;
          font-weight: 700;
        }
        .accountability-current-copy { flex: 1; min-width: 0; }
        .accountability-current-eyebrow {
          color: var(--accountability-muted-foreground);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .6px;
          line-height: 15px;
          text-transform: uppercase;
        }
        .accountability-current-name {
          margin-top: 4px;
          font-size: 18px;
          font-weight: 700;
          line-height: 21px;
          overflow-wrap: anywhere;
        }
        .accountability-current-meta {
          margin-top: 2px;
          color: var(--accountability-muted-foreground);
          font-size: 12px;
          line-height: 16px;
        }
        .accountability-current-status {
          display: flex;
          flex: 0 0 auto;
          align-items: center;
          gap: 5px;
          padding: 6px 9px;
          border-radius: 20px;
          background: rgba(5, 114, 125, .09);
          color: var(--accountability-success);
          font-size: 11px;
          font-weight: 700;
        }
        .accountability-current-reassurance {
          padding: 14px;
          border-radius: 12px;
          background: var(--accountability-muted);
        }
        .accountability-current-reassurance strong,
        .accountability-current-section-title {
          font-size: 13px;
          font-weight: 700;
          line-height: 18px;
        }
        .accountability-current-reassurance p {
          margin: 5px 0 0;
          color: var(--accountability-muted-foreground);
          font-size: 13px;
          line-height: 19px;
        }
        .accountability-current-encouragement {
          display: flex;
          flex-direction: column;
          gap: 13px;
          padding: 15px;
          border-radius: 16px;
          background: var(--accountability-muted);
        }
        .accountability-current-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
        }
        .accountability-current-action {
          display: flex;
          flex: 1 1 47%;
          min-width: 0;
          min-height: 46px;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border: 1px solid var(--accountability-border);
          border-radius: 12px;
          background: var(--accountability-background);
          color: var(--accountability-foreground);
          font: 600 12px/16px Inter, Arial, sans-serif;
          text-align: left;
        }
        .accountability-current-action svg { flex: 0 0 auto; color: var(--accountability-primary); }
        .accountability-current-end {
          align-self: flex-start;
          padding: 4px 0;
          border: 0;
          background: transparent;
          color: var(--accountability-destructive);
          font: 600 12px/18px Inter, Arial, sans-serif;
          text-align: left;
        }
      `}</style>
    </main>
  );
}