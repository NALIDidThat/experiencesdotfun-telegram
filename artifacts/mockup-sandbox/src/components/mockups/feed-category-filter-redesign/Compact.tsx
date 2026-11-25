import { useState } from "react";
import "./_group.css";

type Category = "personal" | "professional";

function CategoryTabs({ prefix }: { prefix: string }) {
  const [category, setCategory] = useState<Category>("personal");
  const categories: Category[] = ["personal", "professional"];

  return (
    <div
      className="feed-filter-compact"
      role="tablist"
      aria-label={`${prefix} post category`}
    >
      {categories.map((item) => (
        <button
          key={item}
          id={`${prefix}-${item}`}
          type="button"
          role="tab"
          aria-selected={category === item}
          onClick={() => setCategory(item)}
        >
          {item === "personal" ? "Personal" : "Professional"}
        </button>
      ))}
    </div>
  );
}

export function Compact() {
  return (
    <main className="feed-filter-scope" aria-label="Compact feed category filters">
      <div className="feed-filter-showcase">
        <section className="feed-filter-context">
          <p className="feed-filter-kicker">Home</p>
          <h1 className="feed-filter-title">Activity feed</h1>
          <p className="feed-filter-subtitle">Good things happening around you</p>
        </section>
        <CategoryTabs prefix="home" />
        <div className="feed-filter-divider" />
        <section className="feed-filter-context">
          <p className="feed-filter-kicker">Profile</p>
          <h2 className="feed-filter-title">Posts</h2>
          <p className="feed-filter-subtitle">Updates shared from this profile</p>
        </section>
        <CategoryTabs prefix="profile" />
      </div>
    </main>
  );
}
