import { useState } from "react";
import { Bell, Heart, LogOut, Pencil, Target, UsersRound } from "lucide-react";
import "./_group.css";

// Visual baseline extracted from Header and Profile in artifacts/mobile/app/index.tsx.
const participantItems = [
  { label: "Notifications", icon: Bell, badge: 3 },
  { label: "My Connections", icon: UsersRound },
  { label: "Accountability Partner", icon: Target },
  { label: "My contributions", icon: Heart },
  { label: "Accounts Centre", icon: UsersRound },
  { label: "Edit profile", icon: Pencil },
  { label: "Sign out", icon: LogOut },
];

export function Current() {
  const [menuOpen, setMenuOpen] = useState(true);

  return (
    <main className="profile-menu-scope" aria-label="Current profile menu design">
      <header className="profile-menu-page-header">
        <div className="profile-menu-page-copy">
          <h1 className="profile-menu-page-title">Passport</h1>
          <p className="profile-menu-page-subtitle">Participant account · Your contribution identity.</p>
        </div>
        <button
          className="profile-menu-trigger"
          type="button"
          aria-label={menuOpen ? "Close profile menu" : "Open profile menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true" style={{ display: "grid", gap: 6 }}>
            <span style={{ width: 20, height: 2, borderRadius: 1, background: "#111111" }} />
            <span style={{ width: 20, height: 2, borderRadius: 1, background: "#111111" }} />
          </span>
        </button>
      </header>

      <section className="profile-menu-backdrop-content" aria-hidden="true">
        <div className="profile-menu-backdrop-card">
          <p className="profile-menu-backdrop-label">Your contribution record</p>
          <p className="profile-menu-backdrop-value">A passport for real-world participation</p>
          <div className="profile-menu-backdrop-line" />
        </div>
        <div className="profile-menu-backdrop-card">
          <p className="profile-menu-backdrop-label">Profile details</p>
          <p className="profile-menu-backdrop-value">Build your community profile</p>
          <div className="profile-menu-backdrop-line" />
        </div>
      </section>

      {menuOpen ? (
        <nav className="profile-menu-current-popover" aria-label="Profile actions">
          {participantItems.map(({ label, icon: Icon, badge }) => (
            <button className="profile-menu-current-item" key={label} type="button" onClick={() => setMenuOpen(false)}>
              <Icon aria-hidden="true" className="menu-icon" />
              <span>{label}</span>
              {badge ? <span className="profile-menu-current-badge">{badge}</span> : null}
            </button>
          ))}
        </nav>
      ) : null}
    </main>
  );
}
