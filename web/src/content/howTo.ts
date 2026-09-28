// Plain data, not JSX, so the actual "what does this app do" copy lives in
// one place and can be edited without touching component code. Rendered
// inline on the profile page (see ProfilePage.tsx) -- there's no separate
// /how-to route anymore, this is meant to be seen without a click-through.
export type HowToSection = {
  heading: string;
  paragraphs?: string[];
  list?: string[];
};

export const HOW_TO_SECTIONS: HowToSection[] = [
  {
    heading: 'Adding a recipe',
    paragraphs: [
      'From "+ Add recipe": paste a website link and it\'ll try to fetch and structure the recipe automatically. Instagram, YouTube, Serious Eats, and Maangchi links can\'t be auto-fetched (they\'re either login-gated, or just don\'t hand back usable structured data) -- paste the recipe text into the box further down instead, and the link still gets saved alongside it. You can also just paste recipe text directly with no link at all.'
    ]
  },
  {
    heading: "What's shared vs. what's just yours",
    paragraphs: ["This is the part that trips people up, since it's not obvious from the UI alone:"],
    list: [
      'Per-person (just you): favorites (❤️), your queue (★, "want to try"), and made / not made yet. Everyone sees their own set -- favoriting or marking something made doesn\'t affect anyone else\'s view of it.',
      'Shared (everyone sees the same thing): "Needs fixing" (🛠️) is a flag on the recipe itself -- if you mark something as needing fixing, everyone sees that. Ratings and cooking notes logged from the activity log are also shared/global, not per-person -- one rating per attempt, visible to everyone, attributed to whoever logged it.',
      'Recipes themselves are shared -- everyone sees everyone\'s recipes by default. Use the "Added by" filter to narrow down to one or more specific people, or "Only me" to jump straight to your own.'
    ]
  },
  {
    heading: 'Activity log',
    paragraphs: [
      'Every time you log a cooking attempt (rating + notes) on a recipe, it shows up on the activity log page for everyone, with your name attached, newest first.'
    ]
  },
  {
    heading: 'Your profile',
    paragraphs: [
      'Right here: change your display name (what shows up in "added by" and the activity log), add a profile picture, and send yourself a password reset email.'
    ]
  }
];
