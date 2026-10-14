// Small set of line icons for the recipe-detail quick actions, replacing
// the emoji glyphs (🤍/★/🛠️) there -- emoji render inconsistently across
// platforms/fonts and read a bit informal for an action button. Plain
// inline SVG rather than pulling in an icon library dependency for three
// shapes; paths use currentColor so active/hover states are just CSS.
type IconProps = { size?: number; filled?: boolean; className?: string };

function Icon({ path, size = 16, filled = false, className }: IconProps & { path: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 1.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const HEART_PATH =
  'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z';

// filled distinguishes favorited vs. not -- same outline-vs-filled pattern
// the emoji version used (🤍 vs ❤️).
export function HeartIcon(props: IconProps) {
  return <Icon path={HEART_PATH} {...props} />;
}

const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z';

// filled distinguishes "in queue" vs. not (☆ vs ★).
export function StarIcon(props: IconProps) {
  return <Icon path={STAR_PATH} {...props} />;
}

const WRENCH_PATH =
  'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z';

// No outline/filled distinction -- needs-fixing has no "empty wrench"
// equivalent, same as the emoji version (🛠️ was a single glyph regardless
// of state too; see the active-state background-tint it still uses).
export function WrenchIcon(props: IconProps) {
  return <Icon path={WRENCH_PATH} {...props} />;
}
