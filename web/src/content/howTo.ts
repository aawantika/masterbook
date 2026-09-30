// Plain data, not JSX, so the actual "what does this app do" copy lives in
// one place and can be edited without touching component code. Rendered
// inline on the profile page (see ProfilePage.tsx) -- there's no separate
// /how-to route anymore, this is meant to be seen without a click-through.
export type HowToSubsection = { heading: string; list: string[] };

export type HowToSection = {
  heading: string;
  paragraphs?: string[];
  list?: string[];
  subsections?: HowToSubsection[];
};

export const HOW_TO_SECTIONS: HowToSection[] = [
  {
    heading: 'Adding a recipe',
    paragraphs: ['From "+ Add recipe": paste a website link and it\'ll try to fetch and structure the recipe automatically.'],
    list: [
      "Instagram and YouTube — login-gated, or don't expose the recipe as structured data.",
      'Serious Eats and Maangchi — confirmed not to hand back usable structured data either.',
      'For any of these: paste the recipe text into the box further down instead — the link still gets saved alongside it.',
      'You can also skip the link entirely and just paste recipe text directly.'
    ]
  },
  {
    heading: "What's shared vs. what's just yours",
    paragraphs: ["This is the part that trips people up, since it's not obvious from the UI alone:"],
    subsections: [
      {
        heading: "What's shared",
        list: [
          '"Needs fixing" (🛠️) — a flag on the recipe itself. Everyone sees it once anyone sets it.',
          'Ratings and cooking notes — one rating per attempt, attributed to whoever logged it. Every logged attempt also shows up on the activity log page for everyone, newest first.',
          'Recipes themselves — everyone sees everyone\'s by default. Narrow down with the "Added by" filter, or "Only me" for just your own.'
        ]
      },
      {
        heading: "What's just yours",
        list: [
          'Favorites (❤️).',
          'Queue (★, "want to try").',
          'Made / not made yet.'
        ]
      }
    ]
  }
];
