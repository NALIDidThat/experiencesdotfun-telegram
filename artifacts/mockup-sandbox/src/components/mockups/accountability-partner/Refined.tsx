import { ArrowRight, CheckCircle2, EyeOff, Heart, UsersRound, XCircle } from "lucide-react";
import "./_group.css";

const encouragements = [
  "Keep going",
  "Nearly there",
  "Proud of you",
  "Let’s do this",
];

export function Refined() {
  return (
    <main className="accountability-refined-screen">
      <section className="accountability-refined-card" aria-label="Accountability partner">
        <div className="accountability-refined-heading">
          <div className="accountability-refined-eyebrow">Your accountability partner</div>
          <div className="accountability-refined-status">
            <CheckCircle2 size={14} aria-hidden="true" />
            Active
          </div>
        </div>

        <div className="accountability-refined-profile">
          <div className="accountability-refined-avatar" aria-hidden="true">N</div>
          <div className="accountability-refined-copy">
            <div className="accountability-refined-name">NALI @ Experiences</div>
            <div className="accountability-refined-meta">@naaify <span>·</span> Since 27 Sept</div>
          </div>
        </div>

        <div className="accountability-refined-reassurance">
          <div className="accountability-refined-reassurance-icon"><EyeOff size={16} aria-hidden="true" /></div>
          <div>
            <strong>Support, not surveillance</strong>
            <p>Check-ins are self-reported unless your partner confirms them. Manual check-ins never award XP.</p>
          </div>
        </div>

        <div className="accountability-refined-encouragement">
          <div className="accountability-refined-section-heading">
            <div className="accountability-refined-heart"><Heart size={17} aria-hidden="true" /></div>
            <div>
              <strong>Send a little encouragement</strong>
              <p>Small support can help with their next step.</p>
            </div>
          </div>
          <div className="accountability-refined-actions">
            {encouragements.map((label) => (
              <button key={label} className="accountability-refined-action" type="button">
                <Heart size={14} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
            <button className="accountability-refined-join" type="button">
              <UsersRound size={16} aria-hidden="true" />
              <span>Want to join me?</span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        <button className="accountability-refined-end" type="button">
          <XCircle size={15} aria-hidden="true" />
          End partnership
        </button>
      </section>
      <style>{`
        .accountability-refined-screen {
          min-height: 100vh;
          padding: 8px 10px 20px;
          background: var(--accountability-muted);
          color: var(--accountability-foreground);
          font-family: Inter, Arial, sans-serif;
        }
        .accountability-refined-card {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 18px;
          border: 1px solid var(--accountability-border);
          border-radius: 18px;
          background: var(--accountability-background);
          box-shadow: 0 4px 14px rgba(17, 17, 17, .045);
        }
        .accountability-refined-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .accountability-refined-eyebrow {
          color: var(--accountability-muted-foreground);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .85px;
          line-height: 14px;
          text-transform: uppercase;
        }
        .accountability-refined-status {
          display: flex;
          min-height: 30px;
          flex: 0 0 auto;
          align-items: center;
          gap: 5px;
          padding: 0 10px;
          border-radius: 20px;
          background: rgba(5, 114, 125, .09);
          color: var(--accountability-success);
          font-size: 11px;
          font-weight: 700;
        }
        .accountability-refined-profile {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: -5px;
        }
        .accountability-refined-avatar {
          display: grid;
          flex: 0 0 54px;
          width: 54px;
          height: 54px;
          place-items: center;
          border: 3px solid #fff;
          border-radius: 50%;
          background: rgba(242, 7, 137, .11);
          box-shadow: 0 0 0 1px rgba(242, 7, 137, .16);
          color: var(--accountability-primary);
          font-size: 18px;
          font-weight: 700;
        }
        .accountability-refined-copy { flex: 1; min-width: 0; }
        .accountability-refined-name {
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -.3px;
          line-height: 22px;
          overflow-wrap: anywhere;
        }
        .accountability-refined-meta {
          display: flex;
          gap: 5px;
          margin-top: 3px;
          color: var(--accountability-muted-foreground);
          font-size: 12px;
          line-height: 16px;
        }
        .accountability-refined-reassurance {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px;
          border: 1px solid rgba(104, 5, 242, .1);
          border-radius: 13px;
          background: rgba(104, 5, 242, .035);
        }
        .accountability-refined-reassurance-icon {
          display: grid;
          flex: 0 0 30px;
          width: 30px;
          height: 30px;
          place-items: center;
          border-radius: 10px;
          background: rgba(104, 5, 242, .09);
          color: var(--accountability-secondary);
        }
        .accountability-refined-reassurance strong {
          display: block;
          font-size: 13px;
          font-weight: 700;
          line-height: 17px;
        }
        .accountability-refined-reassurance p {
          margin: 3px 0 0;
          color: var(--accountability-muted-foreground);
          font-size: 12px;
          line-height: 17px;
        }
        .accountability-refined-encouragement {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding-top: 2px;
        }
        .accountability-refined-section-heading {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .accountability-refined-heart {
          display: grid;
          flex: 0 0 36px;
          width: 36px;
          height: 36px;
          place-items: center;
          border-radius: 12px;
          background: rgba(242, 7, 137, .09);
          color: var(--accountability-primary);
        }
        .accountability-refined-section-heading strong {
          display: block;
          font-size: 14px;
          font-weight: 700;
          line-height: 18px;
        }
        .accountability-refined-section-heading p {
          margin: 2px 0 0;
          color: var(--accountability-muted-foreground);
          font-size: 11px;
          line-height: 15px;
        }
        .accountability-refined-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .accountability-refined-action {
          display: flex;
          min-width: 0;
          min-height: 44px;
          align-items: center;
          gap: 7px;
          padding: 8px 10px;
          border: 1px solid rgba(242, 7, 137, .13);
          border-radius: 12px;
          background: rgba(242, 7, 137, .035);
          color: var(--accountability-foreground);
          font: 600 11px/15px Inter, Arial, sans-serif;
          text-align: left;
        }
        .accountability-refined-action svg { flex: 0 0 auto; color: var(--accountability-primary); }
        .accountability-refined-join {
          display: flex;
          grid-column: 1 / -1;
          min-height: 46px;
          align-items: center;
          gap: 9px;
          padding: 0 13px;
          border: 0;
          border-radius: 13px;
          background: var(--accountability-primary);
          color: #fff;
          font: 700 12px/16px Inter, Arial, sans-serif;
          text-align: left;
        }
        .accountability-refined-join span { flex: 1; }
        .accountability-refined-end {
          display: flex;
          min-height: 44px;
          align-items: center;
          gap: 8px;
          align-self: stretch;
          margin-top: -4px;
          padding: 8px 0 0;
          border: 0;
          border-top: 1px solid var(--accountability-border);
          background: transparent;
          color: var(--accountability-destructive);
          font: 600 12px/16px Inter, Arial, sans-serif;
          text-align: left;
        }
      `}</style>
    </main>
  );
}