import { Link } from 'react-router-dom';

export function HowToPage() {
  return (
    <div className="detail-panel">
      <h1>How this works</h1>

      <h2 className="field-section-heading">Adding a recipe</h2>
      <p>
        From "+ Add recipe": paste a website link and it'll try to fetch and structure the recipe automatically.
        Instagram, YouTube, Serious Eats, and Maangchi links can't be auto-fetched (they're either login-gated, or
        just don't hand back usable structured data) — paste the recipe text into the box further down instead, and
        the link still gets saved alongside it. You can also just paste recipe text directly with no link at all.
      </p>

      <h2 className="field-section-heading">What's shared vs. what's just yours</h2>
      <p>This is the part that trips people up, since it's not obvious from the UI alone:</p>
      <ul className="howto-list">
        <li>
          <strong>Per-person (just you):</strong> Favorites (♥) and your queue (★, "want to try"). Everyone sees
          their own set — favoriting a recipe doesn't favorite it for anyone else.
        </li>
        <li>
          <strong>Shared (everyone sees the same thing):</strong> "Needs fixing" (🔧) is a flag on the recipe itself
          — if you mark something as needing fixing, everyone sees that. Ratings and cooking notes logged from the
          activity log are also shared/global, not per-person — one rating per attempt, visible to everyone,
          attributed to whoever logged it.
        </li>
        <li>
          <strong>Recipes themselves</strong> are shared — everyone sees everyone's recipes by default. Use the
          "Added by" filter to narrow down to one or more specific people.
        </li>
      </ul>

      <h2 className="field-section-heading">Activity log</h2>
      <p>
        Every time you log a cooking attempt (rating + notes) on a recipe, it shows up on the{' '}
        <Link to="/activity">activity log</Link> page for everyone, with your name attached, newest first.
      </p>

      <h2 className="field-section-heading">Your profile</h2>
      <p>
        From your <Link to="/profile">profile page</Link>, you can change your display name (what shows up in
        "added by" and the activity log), add a profile picture, and send yourself a password reset email.
      </p>
    </div>
  );
}
