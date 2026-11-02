import { useState } from "react";
import { Bell, Heart, LogOut, Pencil, Target, UsersRound, UserRound, MoreHorizontal, X } from "lucide-react";
import "./_group.css";

const communityItems = [
  { label: "Notifications", icon: Bell, badge: 3 },
  { label: "My Connections", icon: UsersRound },
  { label: "Accountability Partner", icon: Target },
  { label: "My contributions", icon: Heart },
];

const accountItems = [
  { label: "Accounts Centre", icon: UsersRound },
  { label: "Edit profile", icon: Pencil },
];

export function Refresh() {
  const [menuOpen, setMenuOpen] = useState(true);

  return (
    <main className="profile-menu-scope" aria-label="Refined profile menu design">
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
          {menuOpen
            ? <X aria-hidden="true" size={20} strokeWidth={2} />
            : <MoreHorizontal aria-hidden="true" size={24} strokeWidth={2} />}
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

      {menuOpen ? <nav className="profile-menu-refresh-popover" aria-label="Profile actions">
        <div className="profile-menu-identity">
          <span className="profile-menu-avatar">
            <UserRound aria-hidden="true" size={20} strokeWidth={1.8} />
          </span>
          <span className="profile-menu-identity-copy">
            <span className="profile-menu-identity-title">Your profile</span>
            <span className="profile-menu-identity-subtitle">Participant account</span>
          </span>
        </div>

        <p className="profile-menu-section-label">Community</p>
        {communityItems.map(({ label, icon: Icon, badge }) => (
          <button className="profile-menu-refresh-item" key={label} type="button" onClick={() => setMenuOpen(false)}>
            <span className="profile-menu-icon-tile">
              <Icon aria-hidden="true" className="menu-icon" />
            </span>
            <span className="profile-menu-refresh-label">{label}</span>
            {badge ? <span className="profile-menu-refresh-badge">{badge}</span> : null}
          </button>
        ))}

        <p className="profile-menu-section-label">Account</p>
        {accountItems.map(({ label, icon: Icon }) => (
          <button className="profile-menu-refresh-item" key={label} type="button" onClick={() => setMenuOpen(false)}>
            <span className="profile-menu-icon-tile">
              <Icon aria-hidden="true" className="menu-icon" />
            </span>
            <span className="profile-menu-refresh-label">{label}</span>
          </button>
        ))}

        <div className="profile-menu-refresh-divider" />
        <button className="profile-menu-refresh-item destructive" type="button" onClick={() => setMenuOpen(false)}>
          <span className="profile-menu-icon-tile">
            <LogOut aria-hidden="true" className="menu-icon" />
          </span>
          <span className="profile-menu-refresh-label">Sign out</span>
        </button>
      </nav> : null}
    </main>
  );
}
