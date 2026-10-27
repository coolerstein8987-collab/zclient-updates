// "Zynci" – das Maskottchen als eingebautes, animiertes Sticker-Pack (reines SVG, gestochen scharf in jeder Größe).
export const STICKERS = [
  { id: 'hi', name: 'Hallo!', colors: ['#8b5cf6', '#06b6d4'], eyes: 'dot', mouth: 'smile', extras: ['wave', 'blush'], anim: 'wiggle' },
  { id: 'love', name: 'Verliebt', colors: ['#f472b6', '#fb7185'], eyes: 'heart', mouth: 'smile', extras: ['hearts', 'blush'], anim: 'pulse' },
  { id: 'lol', name: 'LOL', colors: ['#facc15', '#fb923c'], eyes: 'happy', mouth: 'open', extras: ['joy'], anim: 'shake' },
  { id: 'cry', name: 'Traurig', colors: ['#60a5fa', '#6366f1'], eyes: 'closed', mouth: 'wail', extras: ['tears'], anim: 'bob' },
  { id: 'angry', name: 'Wütend', colors: ['#ef4444', '#b91c1c'], eyes: 'angry', mouth: 'grit', extras: ['steam'], anim: 'shake' },
  { id: 'cool', name: 'Cool', colors: ['#22d3ee', '#3b82f6'], eyes: 'none', mouth: 'smirk', extras: ['shades'], anim: 'float' },
  { id: 'sleepy', name: 'Müde', colors: ['#a78bfa', '#4c1d95'], eyes: 'closed', mouth: 'o-small', extras: ['zzz'], anim: 'bob' },
  { id: 'party', name: 'Party', colors: ['#34d399', '#06b6d4'], eyes: 'happy', mouth: 'open', extras: ['hat', 'confetti'], anim: 'bounce' },
  { id: 'shock', name: 'Schock', colors: ['#fde047', '#f59e0b'], eyes: 'wide', mouth: 'o', extras: ['sweat'], anim: 'shake' },
  { id: 'gg', name: 'GG', colors: ['#10b981', '#059669'], eyes: 'happy', mouth: 'smile', extras: ['gg'], anim: 'bounce' },
  { id: 'hype', name: 'Hype', colors: ['#f97316', '#ec4899'], eyes: 'star', mouth: 'open', extras: ['sparkles'], anim: 'pulse' },
  { id: 'thanks', name: 'Danke', colors: ['#fb7185', '#f472b6'], eyes: 'happy', mouth: 'w', extras: ['blush', 'danke'], anim: 'wiggle' },
  { id: 'sus', name: 'Sus', colors: ['#64748b', '#334155'], eyes: 'side', mouth: 'flat', extras: [], anim: 'float' },
  { id: 'uwu', name: 'UwU', colors: ['#f9a8d4', '#c084fc'], eyes: 'closed', mouth: 'w', extras: ['blush', 'sparkles'], anim: 'pulse' },
  { id: 'think', name: 'Hmm…', colors: ['#38bdf8', '#818cf8'], eyes: 'up', mouth: 'flat', extras: ['question'], anim: 'float' },
  { id: 'dead', name: 'RIP', colors: ['#94a3b8', '#475569'], eyes: 'x', mouth: 'wobble', extras: ['ghost'], anim: 'bob' },
];

const INK = '#1b1530';

function Eyes({ type }) {
  const at = [[58, 78], [102, 78]];
  switch (type) {
    case 'none': return null;
    case 'happy': return at.map(([x, y]) => <path key={x} d={`M${x - 9} ${y + 3} Q${x} ${y - 9} ${x + 9} ${y + 3}`} stroke={INK} strokeWidth="6" fill="none" strokeLinecap="round" />);
    case 'closed': return at.map(([x, y]) => <path key={x} d={`M${x - 9} ${y} Q${x} ${y + 8} ${x + 9} ${y}`} stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" />);
    case 'heart': return at.map(([x, y]) => <path key={x} transform={`translate(${x - 11} ${y - 11}) scale(1.1)`} d="M10 18 C-4 8 2 -2 10 4 C18 -2 24 8 10 18Z" fill="#ff2d6f" />);
    case 'star': return at.map(([x, y]) => <path key={x} transform={`translate(${x} ${y})`} d="M0 -12 L3.5 -4 L12 -3.5 L5.5 2 L7.5 11 L0 6 L-7.5 11 L-5.5 2 L-12 -3.5 L-3.5 -4Z" fill="#fff59d" stroke="#f59e0b" strokeWidth="1.5" />);
    case 'wide': return at.map(([x, y]) => <g key={x}><circle cx={x} cy={y} r="12" fill="#fff" /><circle cx={x} cy={y} r="5" fill={INK} /></g>);
    case 'angry': return at.map(([x, y], i) => (
      <g key={x}>
        <ellipse cx={x} cy={y + 3} rx="6" ry="7" fill={INK} />
        <path d={i === 0 ? `M${x - 12} ${y - 12} L${x + 8} ${y - 4}` : `M${x + 12} ${y - 12} L${x - 8} ${y - 4}`} stroke={INK} strokeWidth="5" strokeLinecap="round" />
      </g>
    ));
    case 'side': return at.map(([x, y]) => (
      <g key={x}>
        <ellipse cx={x} cy={y} rx="11" ry="9" fill="#fff" />
        <circle cx={x + 5} cy={y + 2} r="5" fill={INK} />
        <path d={`M${x - 12} ${y - 2} L${x + 12} ${y - 2}`} stroke={INK} strokeWidth="4" strokeLinecap="round" />
      </g>
    ));
    case 'up': return at.map(([x, y]) => <g key={x}><ellipse cx={x} cy={y} rx="7" ry="9" fill={INK} /><circle cx={x + 2} cy={y - 5} r="2.6" fill="#fff" /></g>);
    case 'x': return at.map(([x, y]) => <path key={x} d={`M${x - 7} ${y - 7} L${x + 7} ${y + 7} M${x + 7} ${y - 7} L${x - 7} ${y + 7}`} stroke={INK} strokeWidth="5" strokeLinecap="round" />);
    default: return at.map(([x, y]) => <g key={x}><ellipse cx={x} cy={y} rx="7" ry="9" fill={INK} /><circle cx={x + 2.5} cy={y - 3} r="2.6" fill="#fff" /></g>);
  }
}

function Mouth({ type }) {
  switch (type) {
    case 'open': return <g><path d="M62 98 Q80 128 98 98 Z" fill={INK} /><path d="M70 110 Q80 122 90 110 Q80 106 70 110Z" fill="#ff7aa2" /></g>;
    case 'o': return <ellipse cx="80" cy="108" rx="9" ry="12" fill={INK} />;
    case 'o-small': return <ellipse cx="80" cy="106" rx="5" ry="6" fill={INK} />;
    case 'flat': return <path d="M68 106 L92 106" stroke={INK} strokeWidth="5" strokeLinecap="round" />;
    case 'smirk': return <path d="M66 106 Q84 112 96 98" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" />;
    case 'w': return <path d="M66 102 Q73 110 80 102 Q87 110 94 102" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />;
    case 'wail': return <path d="M64 114 Q80 92 96 114 Z" fill={INK} />;
    case 'grit': return <g><rect x="64" y="98" width="32" height="14" rx="5" fill="#fff" stroke={INK} strokeWidth="4" /><path d="M72 98 V112 M80 98 V112 M88 98 V112" stroke={INK} strokeWidth="2.5" /></g>;
    case 'wobble': return <path d="M64 106 Q70 100 76 106 T88 106 T98 104" stroke={INK} strokeWidth="4.5" fill="none" strokeLinecap="round" />;
    default: return <path d="M64 100 Q80 116 96 100" stroke={INK} strokeWidth="5.5" fill="none" strokeLinecap="round" />;
  }
}

function Extra({ type }) {
  switch (type) {
    case 'blush': return <g opacity=".55"><ellipse cx="44" cy="96" rx="10" ry="6" fill="#ff6b9a" /><ellipse cx="116" cy="96" rx="10" ry="6" fill="#ff6b9a" /></g>;
    case 'wave': return <g className="stk-hand"><ellipse cx="140" cy="62" rx="14" ry="16" fill="#ffd166" stroke={INK} strokeWidth="3" /><path d="M132 52 L130 40 M140 48 L140 34 M148 52 L151 40" stroke={INK} strokeWidth="3" strokeLinecap="round" /></g>;
    case 'hearts': return <g className="stk-float">{[[22, 40, 1], [132, 30, 0.8], [140, 120, 0.7]].map(([x, y, s]) => <path key={x} transform={`translate(${x} ${y}) scale(${s})`} d="M10 18 C-4 8 2 -2 10 4 C18 -2 24 8 10 18Z" fill="#ff2d6f" />)}</g>;
    case 'joy': return <g fill="#7dd3fc"><path d="M40 82 Q30 100 38 108 Q46 100 40 82Z" /><path d="M120 82 Q130 100 122 108 Q114 100 120 82Z" /></g>;
    case 'tears': return <g className="stk-tears" fill="#7dd3fc"><path d="M52 86 Q46 110 52 132 Q60 110 52 86Z" /><path d="M108 86 Q102 110 108 132 Q116 110 108 86Z" /></g>;
    case 'steam': return <g className="stk-float" fill="#fff" opacity=".9"><circle cx="30" cy="34" r="9" /><circle cx="22" cy="24" r="6" /><circle cx="130" cy="34" r="9" /><circle cx="138" cy="24" r="6" /></g>;
    case 'shades': return <g><path d="M38 70 H122 V76 Q122 94 104 94 Q90 94 86 78 H74 Q70 94 56 94 Q38 94 38 76Z" fill={INK} /><path d="M46 74 L56 74" stroke="#fff" strokeWidth="3" opacity=".6" strokeLinecap="round" /><path d="M92 74 L102 74" stroke="#fff" strokeWidth="3" opacity=".6" strokeLinecap="round" /></g>;
    case 'zzz': return <g className="stk-float" fill={INK} fontFamily="Arial Black, sans-serif" fontWeight="900"><text x="112" y="40" fontSize="22">Z</text><text x="132" y="24" fontSize="16">z</text><text x="146" y="12" fontSize="11">z</text></g>;
    case 'hat': return <g><path d="M60 24 L80 -6 L100 24Z" fill="#facc15" stroke={INK} strokeWidth="3" strokeLinejoin="round" /><circle cx="80" cy="-6" r="6" fill="#f472b6" /><path d="M66 16 L94 16" stroke="#ec4899" strokeWidth="4" /></g>;
    case 'confetti': return <g className="stk-confetti">{[[20, 30, '#f472b6'], [140, 40, '#22d3ee'], [28, 130, '#facc15'], [136, 120, '#a78bfa'], [10, 80, '#34d399'], [150, 84, '#fb923c']].map(([x, y, c], i) => <rect key={i} x={x} y={y} width="8" height="4" rx="1" fill={c} transform={`rotate(${i * 37} ${x} ${y})`} />)}</g>;
    case 'gg': return <g><rect x="44" y="124" width="72" height="34" rx="10" fill="#fff" stroke={INK} strokeWidth="3" /><text x="80" y="149" textAnchor="middle" fontSize="24" fontWeight="900" fontFamily="Arial Black, sans-serif" fill="#059669">GG</text></g>;
    case 'sparkles': return <g className="stk-twinkle" fill="#fff59d">{[[22, 30, 1], [140, 28, 0.8], [146, 110, 0.6], [16, 112, 0.7]].map(([x, y, s]) => <path key={x} transform={`translate(${x} ${y}) scale(${s})`} d="M0 -12 Q2 -2 12 0 Q2 2 0 12 Q-2 2 -12 0 Q-2 -2 0 -12Z" />)}</g>;
    case 'danke': return <g><rect x="38" y="126" width="84" height="30" rx="10" fill="#fff" stroke={INK} strokeWidth="3" /><text x="80" y="147" textAnchor="middle" fontSize="17" fontWeight="900" fontFamily="Arial Black, sans-serif" fill="#e11d48">DANKE</text></g>;
    case 'question': return <text className="stk-float" x="128" y="44" fontSize="40" fontWeight="900" fontFamily="Arial Black, sans-serif" fill={INK}>?</text>;
    case 'sweat': return <path d="M128 50 Q120 66 128 72 Q136 66 128 50Z" fill="#7dd3fc" />;
    case 'ghost': return <g className="stk-float" opacity=".85"><path d="M118 40 Q118 18 136 18 Q154 18 154 40 V58 L148 52 L142 58 L136 52 L130 58 L124 52 L118 58Z" fill="#fff" stroke={INK} strokeWidth="2.5" /><circle cx="130" cy="36" r="2.5" fill={INK} /><circle cx="142" cy="36" r="2.5" fill={INK} /></g>;
    default: return null;
  }
}

export function StickerArt({ sticker, size = 160, animate = true }) {
  const s = typeof sticker === 'string' ? STICKERS.find((x) => x.id === sticker) : sticker;
  if (!s) return null;
  const gid = `stk-${s.id}`;
  return (
    <svg className={animate ? `sticker-svg anim-${s.anim}` : 'sticker-svg'} width={size} height={size} viewBox="-6 -14 172 180" role="img" aria-label={s.name}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={s.colors[0]} />
          <stop offset="1" stopColor={s.colors[1]} />
        </linearGradient>
        <radialGradient id={`${gid}-h`} cx=".3" cy=".2" r=".7">
          <stop offset="0" stopColor="#fff" stopOpacity=".45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="stk-body">
        <path d="M80 30 Q84 14 96 10" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />
        <circle cx="98" cy="9" r="7" fill={s.colors[1]} stroke={INK} strokeWidth="3" />
        <path d="M80 26 C122 26 148 52 148 90 C148 128 120 150 80 150 C40 150 12 128 12 90 C12 52 38 26 80 26Z" fill={`url(#${gid})`} stroke={INK} strokeWidth="4" />
        <path d="M80 26 C122 26 148 52 148 90 C148 128 120 150 80 150 C40 150 12 128 12 90 C12 52 38 26 80 26Z" fill={`url(#${gid}-h)`} />
        <Eyes type={s.eyes} />
        <Mouth type={s.mouth} />
        {s.extras.map((e) => <Extra key={e} type={e} />)}
      </g>
    </svg>
  );
}

export function stickerFromRef(ref) {
  if (!ref) return null;
  if (ref.startsWith('builtin:')) return { builtin: STICKERS.find((s) => s.id === ref.slice(8)) };
  return { url: ref };
}
