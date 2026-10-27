import { Fragment, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { copyText } from './format.js';

// Sicherer Markdown-Renderer: erzeugt React-Elemente, nie rohes HTML.
const INLINE = /(`+)([\s\S]*?[^`])\1(?!`)|\|\|([\s\S]+?)\|\||\*\*([\s\S]+?)\*\*(?!\*)|__([\s\S]+?)__(?!_)|\*([^\s*][\s\S]*?)\*(?!\*)|(?<![\p{L}\p{N}])_([^\s_][\s\S]*?)_(?![\p{L}\p{N}])|~~([\s\S]+?)~~|\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])|(?<![\p{L}\p{N}_])@(everyone|[a-z0-9_.]{2,32})/u;

export function Spoiler({ children }) {
  const [shown, setShown] = useState(false);
  return (
    <span className={`spoiler ${shown ? 'shown' : ''}`} onClick={(e) => { e.stopPropagation(); setShown(true); }} role="button" tabIndex={0}>
      {children}
    </span>
  );
}

function CodeBlock({ lang, code }) {
  const [done, setDone] = useState(false);
  return (
    <div className="codeblock">
      <div className="codeblock-bar">
        <span>{lang || 'code'}</span>
        <button type="button" onClick={() => { copyText(code); setDone(true); setTimeout(() => setDone(false), 1500); }} title="Kopieren">
          {done ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

function inline(text, ctx, depth = 0) {
  const out = [];
  let rest = text;
  let key = 0;
  while (rest) {
    const m = ctx.markdown ? INLINE.exec(rest) : /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/.exec(rest);
    if (!m) { out.push(rest); break; }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const k = `${depth}-${key++}`;
    const sub = (t) => (depth > 6 ? t : inline(t, ctx, depth + 1));
    if (!ctx.markdown) {
      out.push(<a key={k} href={m[1]} target="_blank" rel="noopener noreferrer">{m[1]}</a>);
    } else if (m[2] !== undefined) out.push(<code key={k} className="inline-code">{m[2]}</code>);
    else if (m[3] !== undefined) out.push(ctx.spoilers === 'always' ? <span key={k} className="spoiler shown">{sub(m[3])}</span> : <Spoiler key={k}>{sub(m[3])}</Spoiler>);
    else if (m[4] !== undefined) out.push(<strong key={k}>{sub(m[4])}</strong>);
    else if (m[5] !== undefined) out.push(<u key={k}>{sub(m[5])}</u>);
    else if (m[6] !== undefined) out.push(<em key={k}>{sub(m[6])}</em>);
    else if (m[7] !== undefined) out.push(<em key={k}>{sub(m[7])}</em>);
    else if (m[8] !== undefined) out.push(<s key={k}>{sub(m[8])}</s>);
    else if (m[9] !== undefined) out.push(<a key={k} href={m[10]} target="_blank" rel="noopener noreferrer" title={m[10]}>{m[9]}</a>);
    else if (m[11] !== undefined) out.push(<a key={k} href={m[11]} target="_blank" rel="noopener noreferrer">{m[11]}</a>);
    else if (m[12] !== undefined) {
      const name = m[12];
      const user = name !== 'everyone' && ctx.resolveUser?.(name);
      if (name === 'everyone') out.push(<span key={k} className="mention">@everyone</span>);
      else if (user) out.push(<span key={k} className="mention" role="button" tabIndex={0} onClick={(e) => ctx.onMention?.(user.id, e)}>@{ctx.nameOf?.(user.id) || user.displayName}</span>);
      else out.push(m[0]);
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

function blocks(text, ctx) {
  const lines = text.split('\n');
  const out = [];
  let para = [];
  let quote = [];
  let list = [];
  let key = 0;
  const flushPara = () => {
    if (!para.length) return;
    para.forEach((l, i) => {
      if (i) out.push(<br key={`br${key++}`} />);
      out.push(<Fragment key={`p${key++}`}>{inline(l, ctx)}</Fragment>);
    });
    para = [];
  };
  const flushQuote = () => {
    if (!quote.length) return;
    out.push(<blockquote key={`q${key++}`}>{blocks(quote.join('\n'), { ...ctx, noQuote: true })}</blockquote>);
    quote = [];
  };
  const flushList = () => {
    if (!list.length) return;
    out.push(<ul key={`l${key++}`}>{list.map((l, i) => <li key={i}>{inline(l, ctx)}</li>)}</ul>);
    list = [];
  };
  for (const line of lines) {
    const q = !ctx.noQuote && ctx.markdown && /^>\s?(.*)$/.exec(line);
    const h = ctx.markdown && /^(#{1,3})\s+(.+)$/.exec(line);
    const li = ctx.markdown && /^\s*[-*]\s+(.+)$/.exec(line);
    if (q) { flushPara(); flushList(); quote.push(q[1]); continue; }
    flushQuote();
    if (h) {
      flushPara(); flushList();
      const Tag = `h${h[1].length + 2}`;
      out.push(<Tag key={`h${key++}`} className="md-h">{inline(h[2], ctx)}</Tag>);
      continue;
    }
    if (li) { flushPara(); list.push(li[1]); continue; }
    flushList();
    para.push(line);
  }
  flushPara();
  flushQuote();
  flushList();
  return out;
}

export function renderMarkdown(text, ctx) {
  if (!text) return null;
  const parts = [];
  const re = /```(\w{0,20})\n?([\s\S]*?)```/g;
  let last = 0;
  let m;
  let key = 0;
  while (ctx.markdown && (m = re.exec(text))) {
    if (m.index > last) parts.push(<span key={key++}>{blocks(text.slice(last, m.index).replace(/\n$/, ''), ctx)}</span>);
    parts.push(<CodeBlock key={key++} lang={m[1]} code={m[2].replace(/\n$/, '')} />);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={key++}>{blocks(text.slice(last).replace(/^\n/, ''), ctx)}</span>);
  return parts;
}
