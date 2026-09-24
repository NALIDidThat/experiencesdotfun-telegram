import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Battery,
  Globe,
  Send,
  Shield,
  Users,
  Wifi,
} from 'lucide-react';
import './_group.css';

const members = [
  { initials: 'A', color: '#04ADBF' },
  { initials: 'J', color: '#6805F2' },
  { initials: 'M', color: '#F20789' },
];

export function Current() {
  const [emailOpen, setEmailOpen] = useState(false);

  return (
    <main className="welcome-screen">
      <div className="welcome-backdrop" aria-hidden="true">
        <img src="/__mockup/images/experiences-welcome-portrait.jpg" alt="" />
        <div className="welcome-overlay" />
      </div>

      {emailOpen ? (
        <section className="email-panel">
          <button className="email-back" onClick={() => setEmailOpen(false)} type="button">
            <ArrowLeft size={18} aria-hidden="true" /> Back
          </button>
          <div className="email-brand">
            <span>experiences</span><strong>.fun</strong>
          </div>
          <h1>Log in with email</h1>
          <p>Use your email account to continue to Experiences.fun.</p>
          <label htmlFor="preview-email">Email address</label>
          <input id="preview-email" type="email" placeholder="you@example.com" />
          <button className="email-submit" type="button">Continue with email</button>
        </section>
      ) : (
        <>
          <header className="welcome-header">
            <div className="device-status" aria-label="Status bar">
              <span>9:41</span>
              <div className="device-status-icons" aria-hidden="true">
                <span className="signal-bars"><i /><i /><i /><i /></span>
                <Wifi size={15} />
                <Battery size={17} />
              </div>
            </div>
            <div className="brand-row">
              <div className="brand" aria-label="Experiences dot fun">
                experiences<strong>.fun</strong>
              </div>
              <button className="skip-button" onClick={() => setEmailOpen(true)} type="button">
                Skip
              </button>
            </div>
          </header>

          <div className="hero-stage">
            <div className="handwritten">
              <span>Real</span>
              <span>People</span>
              <span>Brighter</span>
              <span>Communities</span>
              <i />
            </div>
            <div className="xp-card">
              <span className="xp-medal"><Award size={19} aria-hidden="true" /></span>
              <span className="xp-copy">
                <strong>+50 XP</strong>
                <small>Community Clean-Up</small>
              </span>
            </div>
          </div>

          <section className="welcome-content">
            <h1>Real people<br />doing <span>real things.</span></h1>
            <p className="welcome-description">
              Find small ways to make a real difference near you — and turn your experiences into lasting impact.
            </p>

            <div className="social-proof">
              <div className="member-avatars" aria-label="Community members">
                {members.map((member) => (
                  <span key={member.initials} style={{ backgroundColor: member.color }}>
                    {member.initials}
                  </span>
                ))}
              </div>
              <p>Join a growing community making change, together.</p>
            </div>

            <button className="telegram-button" type="button">
              <Send size={19} aria-hidden="true" />
              <span>Log in with Telegram</span>
              <ArrowRight size={19} aria-hidden="true" />
            </button>
            <p className="telegram-note">Your Telegram details will create your profile</p>
            <button className="email-link" onClick={() => setEmailOpen(true)} type="button">
              Log in with email
            </button>

            <div className="benefits">
              <div><Globe size={20} aria-hidden="true" /><span>Local<br />Action</span></div>
              <div><Shield size={20} aria-hidden="true" /><span>Real<br />Impact</span></div>
              <div><Users size={20} aria-hidden="true" /><span>Strong<br />Communities</span></div>
            </div>
          </section>
          <div className="home-indicator" aria-hidden="true" />
        </>
      )}

      <style>{`
        .welcome-screen {
          position: relative;
          display: flex;
          flex-direction: column;
          width: 100%;
          min-height: 100vh;
          min-height: 100dvh;
          padding: 8px 0 24px;
          overflow: hidden;
          background: var(--welcome-background);
          color: var(--welcome-foreground);
          font-family: Inter, Arial, sans-serif;
        }
        .welcome-backdrop {
          position: absolute;
          inset: 0 0 auto;
          height: min(74vh, 720px);
          overflow: hidden;
          pointer-events: none;
        }
        .welcome-backdrop img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: .96;
        }
        .welcome-overlay {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(8,11,22,.02) 0%, rgba(8,11,22,.1) 43%, rgba(8,11,22,.84) 80%, #080b16 100%),
            linear-gradient(90deg, rgba(8,11,22,.32), rgba(8,11,22,0));
        }
        .welcome-header { position: relative; z-index: 1; width: 100%; }
        .device-status {
          height: 24px;
          padding: 0 30px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: .2px;
        }
        .device-status-icons { display: flex; align-items: center; gap: 5px; }
        .signal-bars { height: 12px; display: flex; align-items: flex-end; gap: 2px; }
        .signal-bars i { width: 2px; border-radius: 1px; background: currentColor; }
        .signal-bars i:nth-child(1) { height: 4px; }
        .signal-bars i:nth-child(2) { height: 6px; }
        .signal-bars i:nth-child(3) { height: 8px; }
        .signal-bars i:nth-child(4) { height: 10px; }
        .brand-row {
          height: 44px;
          padding: 0 26px;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          position: relative;
        }
        .brand {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          white-space: nowrap;
          font-size: 16px;
          font-weight: 700;
          letter-spacing: -.7px;
        }
        .brand strong { color: var(--welcome-pink); }
        .skip-button {
          position: relative;
          z-index: 1;
          min-width: 44px;
          min-height: 44px;
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--welcome-muted);
          font: 500 12px Inter, Arial, sans-serif;
          text-align: right;
          cursor: pointer;
        }
        .hero-stage {
          height: clamp(190px, 29vh, 250px);
          margin: 0 26px;
          position: relative;
          z-index: 1;
        }
        .handwritten {
          position: absolute;
          top: 28px;
          left: 4px;
          display: flex;
          flex-direction: column;
          color: var(--welcome-muted);
          opacity: .78;
          font-size: 15px;
          line-height: 21px;
          font-style: italic;
          transform: rotate(-5deg);
        }
        .handwritten i {
          width: 38px;
          height: 1px;
          margin: 10px 0 0 12px;
          background: var(--welcome-muted);
          opacity: .5;
          transform: rotate(-12deg);
        }
        .xp-card {
          position: absolute;
          right: 0;
          bottom: 8px;
          min-height: 54px;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 7px 10px;
          border: 1px solid var(--welcome-border);
          border-radius: 15px;
          background: var(--welcome-surface);
        }
        .xp-medal {
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: var(--welcome-pink);
          color: var(--welcome-gold);
        }
        .xp-copy { display: flex; flex-direction: column; gap: 2px; }
        .xp-copy strong { font-size: 12px; line-height: 14px; }
        .xp-copy small { color: var(--welcome-muted); font-size: 8px; line-height: 11px; }
        .welcome-content {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 540px;
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 0 26px;
          margin: 0 auto;
          transform: translateY(16px);
        }
        .welcome-content h1 {
          margin: 0;
          font-size: 30px;
          line-height: 36px;
          font-weight: 700;
          letter-spacing: -.85px;
        }
        .welcome-content h1 span { color: var(--welcome-pink); }
        .welcome-description {
          margin: 9px 0 0;
          color: var(--welcome-muted);
          font-size: 14px;
          line-height: 21px;
        }
        .social-proof {
          min-height: 42px;
          display: flex;
          align-items: center;
          gap: 13px;
          margin-top: 15px;
        }
        .member-avatars { display: flex; align-items: center; padding-left: 1px; }
        .member-avatars span {
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          margin-left: -5px;
          border: 2px solid var(--welcome-background);
          border-radius: 50%;
          color: white;
          font-size: 11px;
          font-weight: 700;
        }
        .social-proof p {
          flex: 1;
          margin: 0;
          color: var(--welcome-muted);
          font-size: 11px;
          line-height: 16px;
        }
        .telegram-button {
          width: 100%;
          height: 54px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 17px;
          padding: 0 20px;
          border: 0;
          border-radius: 32px;
          background: var(--welcome-pink);
          color: white;
          font: 600 14px Inter, Arial, sans-serif;
          cursor: pointer;
        }
        .telegram-button span { flex: 1; text-align: center; }
        .telegram-note {
          align-self: center;
          margin: 8px 0 0;
          color: var(--welcome-muted);
          font-size: 10px;
          line-height: 15px;
          text-align: center;
        }
        .email-link {
          min-height: 24px;
          margin-top: 2px;
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--welcome-subdued);
          font: 500 11px Inter, Arial, sans-serif;
          cursor: pointer;
        }
        .benefits {
          min-height: 64px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: auto;
          padding-top: 11px;
          border-top: 1px solid var(--welcome-border);
        }
        .benefits > div {
          flex: 1;
          min-height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          color: var(--welcome-subdued);
        }
        .benefits span { color: var(--welcome-muted); font-size: 9px; line-height: 12px; }
        .home-indicator {
          position: relative;
          z-index: 1;
          width: 104px;
          height: 4px;
          flex: 0 0 4px;
          align-self: center;
          margin-top: 10px;
          margin-bottom: 4px;
          border-radius: 2px;
          background: var(--welcome-foreground);
          opacity: .92;
        }
        .email-panel {
          position: relative;
          z-index: 2;
          width: min(100% - 36px, 420px);
          margin: auto;
          padding: 24px;
          border: 1px solid var(--welcome-border);
          border-radius: 24px;
          background: var(--welcome-surface);
        }
        .email-back {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--welcome-muted);
          font: 500 13px Inter, Arial, sans-serif;
          cursor: pointer;
        }
        .email-brand { margin-top: 34px; font-size: 15px; font-weight: 700; }
        .email-brand strong { color: var(--welcome-pink); }
        .email-panel h1 { margin: 20px 0 8px; font-size: 24px; }
        .email-panel p { color: var(--welcome-muted); font-size: 14px; line-height: 21px; }
        .email-panel label { display: block; margin: 22px 0 8px; font-size: 12px; }
        .email-panel input {
          width: 100%;
          height: 48px;
          padding: 0 14px;
          border: 1px solid var(--welcome-border);
          border-radius: 12px;
          background: var(--welcome-background);
          color: var(--welcome-foreground);
          font: 14px Inter, Arial, sans-serif;
        }
        .email-submit {
          width: 100%;
          height: 50px;
          margin-top: 14px;
          border: 0;
          border-radius: 16px;
          background: var(--welcome-pink);
          color: white;
          font: 600 14px Inter, Arial, sans-serif;
        }
        @media (max-height: 740px) {
          .welcome-screen { padding-bottom: 14px; }
          .hero-stage { height: clamp(170px, 25vh, 210px); }
          .welcome-content h1 { font-size: 28px; line-height: 33px; }
          .social-proof { margin-top: 10px; }
          .telegram-button { margin-top: 11px; }
          .benefits { min-height: 58px; }
        }
      `}</style>
    </main>
  );
}