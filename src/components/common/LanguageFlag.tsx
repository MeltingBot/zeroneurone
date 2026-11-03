/**
 * Flag of a language. Unicode has no flag emoji for Catalonia or the Basque
 * Country (no ISO 3166-1 code): those two are drawn, the others stay emoji.
 */

const svgProps = {
  width: '1.2em',
  height: '0.86em',
  'aria-hidden': true,
  className: 'inline-block align-[-0.05em] rounded-[2px] mx-[0.05em]',
} as const;

/** Senyera: nine stripes, five gold and four red */
function Senyera() {
  return (
    <svg {...svgProps} viewBox="0 0 27 18" preserveAspectRatio="none">
      <rect width="27" height="18" fill="#FCDD09" />
      {[2, 6, 10, 14].map((y) => <rect key={y} y={y} width="27" height="2" fill="#DA121A" />)}
    </svg>
  );
}

/** Ikurriña: green saltire under a white cross, on red */
function Ikurrina() {
  return (
    <svg {...svgProps} viewBox="0 0 50 28" preserveAspectRatio="none">
      <rect width="50" height="28" fill="#D52B1E" />
      <path d="M0 0L50 28M50 0L0 28" stroke="#009B48" strokeWidth="4.4" />
      <path d="M25 0V28M0 14H50" stroke="#FFFFFF" strokeWidth="4.4" />
    </svg>
  );
}

const DRAWN: Record<string, () => React.JSX.Element> = { cat: Senyera, eus: Ikurrina };

export function LanguageFlag({ flag }: { flag: string }) {
  const Drawn = DRAWN[flag];
  return Drawn ? <Drawn /> : <>{flag}</>;
}
