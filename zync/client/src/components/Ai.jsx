import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Sparkles, Plus, Phone, PhoneOff, Mic, MicOff, SendHorizontal, Square, Trash2, Copy, Volume2, Eye, EyeOff,
  MessageSquareText, Languages, Lock, Settings2, PanelLeft, Wand2, RefreshCw,
} from 'lucide-react';
import { useStore, toast, openModal, closeModal, openSettings } from '../lib/store.js';
import { api } from '../lib/api.js';
import { cx, copyText } from '../lib/format.js';
import { renderMarkdown } from '../lib/markdown.jsx';
import { can, PERMS } from '../lib/perm.js';
import {
  askAi, loadAiChats, useAiChats, newAiChat, deleteAiChat, clearAiChats, setAiPrefs, sendAiMessage, useTranslations, excerptOf,
} from '../lib/ai.js';
import { listen, speak, stopSpeaking, sttSupported, ttsSupported } from '../lib/speech.js';
import { Modal, Spinner, Switch } from './ui.jsx';
import { NameTag } from './Avatar.jsx';

const MD = { markdown: true, spoilers: 'click', resolveUser: () => null, nameOf: () => null, onMention: () => {} };

export function AiOrb({ size = 64, state = 'idle', className }) {
  return (
    <div className={cx('ai-orb', `is-${state}`, className)} style={{ '--orb': `${size}px` }} aria-hidden>
      <span className="ao-core" />
      <span className="ao-ring" />
      <span className="ao-ring r2" />
    </div>
  );
}

/** Mikrofon-Knopf: Sprache → Text (fügt Erkanntes per onText ein). */
export function DictateButton({ onText, className, size = 18 }) {
  const [on, setOn] = useState(false);
  const rec = useRef(null);
  useEffect(() => () => rec.current?.abort(), []);
  if (!sttSupported()) return null;
  const toggle = () => {
    if (on) { rec.current?.stop(); return; }
    setOn(true);
    rec.current = listen({
      onEnd: (t) => { setOn(false); if (t.trim()) onText(t.trim()); },
      onError: (m) => { setOn(false); toast(m === 'not-allowed' ? 'Mikrofon ist blockiert – erlaube es im Browser.' : `Spracherkennung: ${m}`, 'error'); },
    });
  };
  return (
    <button type="button" className={cx('dictate-btn', on && 'on', className)} onClick={toggle} data-tip={on ? 'Fertig gesprochen' : 'Sprechen statt tippen'} aria-label="Diktieren">
      {on ? <span className="dictate-wave"><i /><i /><i /></span> : <Mic size={size} />}
    </button>
  );
}

// =====================================================================
// KI-Bereich: private Chats mit der KI
// =====================================================================
const SUGGESTIONS = [
  { icon: '🧠', text: 'Erklär mir Jugendsprache: Was heißt „lost“ und „cringe“?' },
  { icon: '✍️', text: 'Hilf mir, eine liebe Nachricht an meinen besten Freund zu schreiben' },
  { icon: '🎬', text: 'Gib mir 5 Filmideen für einen gemütlichen Abend' },
  { icon: '🎮', text: 'Welche Koop-Spiele kann man zu zweit spielen?' },
];

export function AiView() {
  const me = useStore((s) => s.me);
  const ai = useStore((s) => s.ai);
  const isOwner = useStore((s) => s.isOwner);
  const { chats, activeId, prefs } = useAiChats();
  const chat = chats.find((c) => c.id === activeId);
  const [listOpen, setListOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [call, setCall] = useState(false);
  const [menu, setMenu] = useState(false);
  const abort = useRef(null);
  const scroller = useRef(null);

  useEffect(() => { loadAiChats(me.id); }, [me.id]);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat?.messages]);

  const ensureChat = () => (chat ? chat.id : newAiChat());

  const send = async (text) => {
    const t = text.trim();
    if (!t || busy) return;
    const id = ensureChat();
    setBusy(true);
    abort.current = new AbortController();
    try {
      await sendAiMessage(id, t, { signal: abort.current.signal });
    } catch (e) {
      if (!e.refusal) toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const quota = ai.remaining == null ? null : ai.remaining;
  const blocked = !ai.enabled || quota === 0;

  return (
    <div className="ai-view">
      <header className="chat-header ai-head">
        <button type="button" className="icon-btn mobile-only" onClick={() => useStore.setState({ mobilePane: 'nav' })} aria-label="Zurück"><ArrowLeft size={22} /></button>
        <button type="button" className="icon-btn ai-list-btn" onClick={() => setListOpen((o) => !o)} data-tip="Deine KI-Chats"><PanelLeft size={20} /></button>
        <AiOrb size={28} state={busy ? 'thinking' : 'idle'} />
        <div className="ai-title">
          <b>Zync KI</b>
          <span>{ai.enabled ? ai.model : 'nicht eingerichtet'}</span>
        </div>
        <div className="ch-actions">
          {quota != null && <span className={cx('ai-quota', quota <= 3 && 'low')} data-tip="So oft kannst du die KI heute noch fragen">⚡ {quota}</span>}
          <button type="button" className="icon-btn" disabled={blocked} onClick={() => { ensureChat(); setCall(true); }} data-tip="Mit der KI telefonieren"><Phone size={20} /></button>
          <button type="button" className="icon-btn" onClick={() => { newAiChat(); setListOpen(false); }} data-tip="Neuer Chat"><Plus size={20} /></button>
          <div className="ai-menu-wrap">
            <button type="button" className={cx('icon-btn', menu && 'active')} onClick={() => setMenu((m) => !m)} data-tip="Datenschutz"><Settings2 size={20} /></button>
            {menu && (
              <div className="ai-menu" onMouseLeave={() => setMenu(false)}>
                <label className="ai-menu-row">
                  <span><b>Verlauf auf diesem Gerät speichern</b><small>Aus = alles ist nach dem Neuladen weg</small></span>
                  <Switch checked={prefs.keepHistory} onChange={(v) => setAiPrefs({ keepHistory: v })} />
                </label>
                <button type="button" className="ai-menu-row danger" onClick={() => { setMenu(false); openModal('confirm', { title: 'Alle KI-Chats löschen?', text: 'Alle Unterhaltungen mit der KI auf diesem Gerät werden gelöscht.', danger: true, confirm: 'Löschen', onConfirm: clearAiChats }); }}>
                  <Trash2 size={16} /> Alle KI-Chats löschen
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="ai-body">
        <aside className={cx('ai-list', listOpen && 'open')}>
          <button type="button" className="ai-new" onClick={() => { newAiChat(); setListOpen(false); }}><Plus size={16} /> Neuer Chat</button>
          {chats.filter((c) => c.messages.length).map((c) => (
            <div key={c.id} className={cx('ai-list-item', c.id === activeId && 'active')}>
              <button type="button" onClick={() => { useAiChats.setState({ activeId: c.id }); setListOpen(false); }}>
                <MessageSquareText size={15} /> <span>{c.title}</span>
              </button>
              <button type="button" className="ai-del" onClick={() => deleteAiChat(c.id)} aria-label="Chat löschen"><Trash2 size={14} /></button>
            </div>
          ))}
          <p className="ai-list-note"><Lock size={12} /> {prefs.keepHistory ? 'Nur auf diesem Gerät gespeichert' : 'Wird nicht gespeichert'}</p>
        </aside>
        {listOpen && <div className="ai-list-backdrop" onClick={() => setListOpen(false)} />}
        <section className="ai-main">
          <div className="ai-scroll" ref={scroller}>
            {!ai.enabled ? (
              <div className="ai-welcome">
                <AiOrb size={110} />
                <h2>Zync KI ist noch nicht eingerichtet</h2>
                {isOwner ? (
                  <>
                    <p>Trag in der Zync-Verwaltung deinen Claude-Schlüssel ein – dann können alle hier die KI nutzen.</p>
                    <button type="button" className="btn primary" onClick={() => openSettings('admin')}>Zur Zync-Verwaltung</button>
                  </>
                ) : <p>Der Owner dieses Zync-Servers muss die KI zuerst einschalten.</p>}
              </div>
            ) : chat?.messages.length ? (
              <div className="ai-messages">
                {chat.messages.map((m, i) => <AiBubble key={i} m={m} />)}
              </div>
            ) : (
              <div className="ai-welcome">
                <AiOrb size={110} state="idle" />
                <h2>Hey {me.displayName}! ✨</h2>
                <p>Frag mich alles – ich erkläre Nachrichten, helfe beim Schreiben, übersetze oder quatsche einfach mit dir. Du kannst mich auch <b>anrufen</b>.</p>
                <div className="ai-suggest">
                  {SUGGESTIONS.map((s) => (
                    <button key={s.text} type="button" onClick={() => send(s.text)} disabled={blocked}><span>{s.icon}</span>{s.text}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <AiComposer onSend={send} busy={busy} onStop={() => abort.current?.abort()} disabled={blocked} placeholder={quota === 0 ? 'Für heute ist dein KI-Kontingent aufgebraucht 🌙' : 'Frag Zync KI …'} />
          <p className="ai-privacy"><Lock size={12} /> Zync speichert deine KI-Chats nicht. Zum Antworten wird der Text an Claude (Anthropic) geschickt.</p>
        </section>
      </div>
      {call && chat && <AiCall chatId={chat.id} onClose={() => setCall(false)} />}
    </div>
  );
}

function AiBubble({ m }) {
  const [reading, setReading] = useState(false);
  if (m.role === 'user') return <div className="ai-msg user"><div className="ai-text">{m.content}</div></div>;
  const read = async () => {
    if (reading) { stopSpeaking(); setReading(false); return; }
    setReading(true);
    await speak(m.content);
    setReading(false);
  };
  return (
    <div className={cx('ai-msg bot', m.error && 'error')}>
      <AiOrb size={30} state={m.streaming ? 'thinking' : 'idle'} />
      <div className="ai-text">
        {m.content ? renderMarkdown(m.content, MD) : <span className="ai-dots"><i /><i /><i /></span>}
        {m.streaming && m.content && <span className="ai-caret" />}
        {!m.streaming && !m.error && m.content && (
          <div className="ai-msg-actions">
            <button type="button" onClick={() => { copyText(m.content); toast('Kopiert!', 'success'); }} data-tip="Kopieren"><Copy size={14} /></button>
            {ttsSupported() && <button type="button" className={cx(reading && 'on')} onClick={read} data-tip={reading ? 'Stopp' : 'Vorlesen'}><Volume2 size={14} /></button>}
          </div>
        )}
      </div>
    </div>
  );
}

function AiComposer({ onSend, busy, onStop, disabled, placeholder }) {
  const [text, setText] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);
  const submit = () => {
    if (!text.trim() || busy) return;
    onSend(text);
    setText('');
  };
  return (
    <div className={cx('ai-composer', disabled && 'disabled')}>
      <textarea
        ref={ref}
        rows={1}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
      />
      {!disabled && <DictateButton onText={(t) => setText((v) => (v ? `${v} ${t}` : t))} />}
      {busy
        ? <button type="button" className="ai-send stop" onClick={onStop} aria-label="Stopp"><Square size={16} /></button>
        : <button type="button" className="ai-send" onClick={submit} disabled={disabled || !text.trim()} aria-label="Senden"><SendHorizontal size={18} /></button>}
    </div>
  );
}

// =====================================================================
// KI-Anruf: sprechen → KI antwortet mit Stimme
// =====================================================================
const PHASE_LABEL = { listening: 'Ich höre zu …', thinking: 'Denke nach …', speaking: 'Spreche …', idle: 'Tippe auf die Kugel, um zu sprechen', error: '' };

export function AiCall({ chatId, onClose }) {
  const [phase, setPhase] = useState('idle');
  const [heard, setHeard] = useState('');
  const [said, setSaid] = useState('');
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const st = useRef({ alive: true, gen: 0, rec: null, abort: null, empties: 0, muted: false });

  const stopAll = () => {
    const s = st.current;
    s.gen += 1;
    s.rec?.abort();
    s.abort?.abort();
    stopSpeaking();
  };

  const startListening = () => {
    const s = st.current;
    if (!s.alive || s.muted) { setPhase('idle'); return; }
    setPhase('listening');
    setHeard('');
    s.rec = listen({
      onText: (f, i) => setHeard(`${f} ${i}`.trim()),
      onEnd: (final) => {
        if (!s.alive) return;
        if (final.trim()) { s.empties = 0; think(final.trim()); return; }
        s.empties += 1;
        if (s.empties >= 3) { setPhase('idle'); return; }
        setTimeout(startListening, 250);
      },
      onError: (m) => {
        setError(m === 'not-allowed' ? 'Mikrofon ist blockiert – erlaube es im Browser.' : String(m));
        setPhase('error');
      },
    });
  };

  const think = async (text) => {
    const s = st.current;
    const gen = ++s.gen;
    setPhase('thinking');
    setSaid('');
    s.abort = new AbortController();
    let spoken = 0;
    let queue = Promise.resolve();
    const say = (part) => {
      queue = queue.then(() => {
        if (gen !== s.gen || !s.alive) return null;
        setPhase('speaking');
        return speak(part);
      });
    };
    try {
      const full = await sendAiMessage(chatId, text, {
        voice: true,
        signal: s.abort.signal,
        onDelta: (d, all) => {
          setSaid(all);
          for (;;) {
            const m = /^[\s\S]*?[.!?…:](\s|$)/.exec(all.slice(spoken));
            if (!m || m[0].trim().length < 2) break;
            say(m[0]);
            spoken += m[0].length;
          }
        },
      });
      if (full && full.slice(spoken).trim()) say(full.slice(spoken));
      await queue;
    } catch (e) {
      if (e.name !== 'AbortError') { setError(e.message); setPhase('error'); return; }
    }
    if (gen === s.gen && s.alive) startListening();
  };

  useEffect(() => {
    const s = st.current;
    s.alive = true;
    if (sttSupported()) startListening();
    return () => { s.alive = false; stopAll(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tapOrb = () => {
    if (phase === 'listening') { st.current.rec?.stop(); return; }
    stopAll();
    st.current.empties = 0;
    setError('');
    startListening();
  };
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    st.current.muted = next;
    if (next) { st.current.rec?.abort(); setPhase('idle'); } else if (phase !== 'thinking' && phase !== 'speaking') startListening();
  };

  return (
    <div className="ai-call" role="dialog" aria-label="KI-Anruf">
      <div className="ac-top"><Sparkles size={16} /> Anruf mit Zync KI</div>
      {!sttSupported() ? (
        <div className="ac-center">
          <AiOrb size={150} state="idle" />
          <p className="ac-status">Dein Browser kann keine Sprache erkennen. Nutze Chrome oder die Zync-App für Android.</p>
        </div>
      ) : (
        <div className="ac-center">
          <button type="button" className="ac-orb-btn" onClick={tapOrb} aria-label="Sprechen">
            <AiOrb size={170} state={phase === 'error' ? 'idle' : phase} />
          </button>
          <p className="ac-status">{phase === 'error' ? error : muted ? 'Stummgeschaltet' : PHASE_LABEL[phase]}</p>
          {heard && phase === 'listening' && <p className="ac-heard">„{heard}“</p>}
          {said && phase !== 'listening' && <div className="ac-said">{said}</div>}
        </div>
      )}
      <div className="ac-controls">
        <button type="button" className={cx('ac-btn', muted && 'on')} onClick={toggleMute} aria-label="Stumm">{muted ? <MicOff size={24} /> : <Mic size={24} />}</button>
        <button type="button" className="ac-btn hang" onClick={() => { stopAll(); onClose(); }} aria-label="Auflegen"><PhoneOff size={26} /></button>
      </div>
    </div>
  );
}

// =====================================================================
// „KI fragen (privat)“: Nachrichten erklären oder Antwort schreiben lassen
// =====================================================================
const TONES = [['locker', '😎 Locker'], ['lieb', '🥰 Lieb'], ['lustig', '😂 Lustig'], ['entschuldigend', '🙏 Sorry'], ['ernst', '😐 Ernst']];

export function AiAssist({ channelId, messageId, mode: initialMode = 'explain' }) {
  const channel = useStore((s) => s.channels[channelId]);
  const ai = useStore((s) => s.ai);
  const [mode, setMode] = useState(initialMode);
  const [withBefore, setWithBefore] = useState(!messageId);
  const [question, setQuestion] = useState('');
  const [tone, setTone] = useState('locker');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const abort = useRef(null);
  const shared = !!channel?.ai?.on;
  const excerpt = useMemo(() => excerptOf(channelId, messageId, withBefore ? 12 : 1), [channelId, messageId, withBefore]);
  useEffect(() => () => abort.current?.abort(), []);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setAnswer('');
    abort.current = new AbortController();
    try {
      await askAi({ mode, channelId: shared ? channelId : undefined, excerpt, question, tone }, {
        signal: abort.current.signal,
        onDelta: (d, full) => setAnswer(full),
      });
    } catch (e) {
      if (e.name !== 'AbortError') setAnswer(`⚠️ ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const useReply = () => {
    try { sessionStorage.setItem(`draft:${channelId}`, answer.trim()); } catch { /* egal */ }
    window.dispatchEvent(new CustomEvent('zync:draft', { detail: { channelId, text: answer.trim() } }));
    closeModal();
    toast('Steht jetzt in deinem Eingabefeld – du kannst es noch anpassen ✍️', 'success');
  };

  return (
    <Modal onClose={closeModal} className="ai-assist" title={<><Sparkles size={20} /> KI fragen <span className="ai-private"><Lock size={12} /> privat</span></>} subtitle="Nur du siehst das. Gespeichert wird nichts." width={560}>
      <div className="segmented ai-seg">
        <button type="button" className={cx(mode === 'explain' && 'active')} onClick={() => { setMode('explain'); setAnswer(''); }}>🤔 Was ist gemeint?</button>
        <button type="button" className={cx(mode === 'reply' && 'active')} onClick={() => { setMode('reply'); setAnswer(''); }}>✍️ Antwort schreiben</button>
      </div>
      <div className="aa-context">
        {shared ? (
          <p className="aa-shared"><Eye size={14} /> Die KI kennt den Chatverlauf – hier haben alle zugestimmt.</p>
        ) : (
          <>
            <div className="aa-quotes">
              {excerpt.length ? excerpt.map((m, i) => <div key={i} className="aa-quote"><b>{m.name}</b> {m.text}</div>) : <p className="muted">Noch keine Nachrichten.</p>}
            </div>
            {messageId && (
              <label className="aa-check">
                <input type="checkbox" checked={withBefore} onChange={(e) => setWithBefore(e.target.checked)} /> Auch die Nachrichten davor mitschicken (mehr Kontext)
              </label>
            )}
            <p className="aa-hint"><EyeOff size={13} /> Die KI sieht nur diese Nachrichten. {channel && !channel.serverId && 'Damit sie den ganzen Chat kennt, müssen beide oben bei 👁️ zustimmen.'}</p>
          </>
        )}
      </div>
      {mode === 'reply' && (
        <div className="chip-row">
          {TONES.map(([k, l]) => <button key={k} type="button" className={cx('chip', tone === k && 'active')} onClick={() => setTone(k)}>{l}</button>)}
        </div>
      )}
      <div className="aa-input">
        <textarea
          className="input"
          rows={2}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={mode === 'explain' ? 'z. B. Was bedeutet „Ike gehe Nikke“? Kommt er noch?' : 'Was willst du sagen? z. B. „Wir wollten Terminator 20–22 Uhr schauen, ich hab ihn nur bis morgen“'}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } }}
        />
        <DictateButton onText={(t) => setQuestion((v) => (v ? `${v} ${t}` : t))} />
      </div>
      <button type="button" className="btn primary block" onClick={run} disabled={busy || !ai.enabled || (!shared && !excerpt.length)}>
        {busy ? <Spinner size={16} /> : <Wand2 size={16} />} {mode === 'explain' ? 'Erklär’s mir' : 'Antwort vorschlagen'}
      </button>
      {(answer || busy) && (
        <div className="aa-answer">
          <div className="aa-answer-head"><Sparkles size={14} /> Zync KI {busy && <Spinner size={12} />}</div>
          <div className="aa-answer-body">{answer ? renderMarkdown(answer, MD) : <span className="ai-dots"><i /><i /><i /></span>}</div>
          {!busy && mode === 'reply' && answer && !answer.startsWith('⚠️') && (
            <div className="aa-actions">
              <button type="button" className="btn primary sm" onClick={useReply}><SendHorizontal size={14} /> Übernehmen</button>
              <button type="button" className="btn secondary sm" onClick={run}><RefreshCw size={14} /> Andere Version</button>
            </div>
          )}
        </div>
      )}
      {!ai.enabled && <p className="aa-hint">Die KI ist auf diesem Zync-Server noch nicht eingerichtet.</p>}
    </Modal>
  );
}

// =====================================================================
// „Was hab ich verpasst?“
// =====================================================================
export function AiSummary({ channelId }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    const ctrl = new AbortController();
    askAi({ mode: 'summary', channelId }, { signal: ctrl.signal, onDelta: (d, full) => setText(full) })
      .catch((e) => { if (e.name !== 'AbortError') setText(`⚠️ ${e.message}`); })
      .finally(() => setBusy(false));
    return () => ctrl.abort();
  }, [channelId]);
  return (
    <Modal onClose={closeModal} title={<><Sparkles size={20} /> Was hab ich verpasst?</>} subtitle="Die KI fasst die neuen Nachrichten für dich zusammen – nur du siehst das." width={520}>
      <div className="aa-answer summary">
        {text ? renderMarkdown(text, MD) : <span className="ai-dots"><i /><i /><i /></span>}
        {busy && text && <span className="ai-caret" />}
      </div>
    </Modal>
  );
}

// =====================================================================
// 👁️ KI-Zustimmung im Chat
// =====================================================================
function useAiState(channel) {
  const me = useStore((s) => s.me);
  const canManage = useStore((s) => (channel.serverId ? can(s, channel.serverId, PERMS.MANAGE_CHANNELS) : true));
  const ai = channel.ai || { on: false, consents: [] };
  const mine = channel.serverId ? ai.on : ai.consents?.includes(me.id);
  const others = (channel.recipients || []).filter((id) => ai.consents?.includes(id));
  return { ai, mine, others, canManage, me };
}

export function AiEyeButton({ channel }) {
  const { ai, mine, others, canManage } = useAiState(channel);
  const users = useStore((s) => s.users);
  const enabled = useStore((s) => s.ai?.enabled);
  if (!enabled || channel.type === 'voice') return null;
  if (channel.serverId && !canManage && !ai.on) return null;
  const waiting = !channel.serverId && mine && !ai.on;
  const invited = !channel.serverId && !mine && others.length > 0;
  const tip = ai.on
    ? 'Zync KI liest mit (@KI, Zusammenfassungen) – klicken zum Ausschalten'
    : waiting ? `Du hast zugestimmt – wartet noch auf ${(channel.recipients || []).filter((id) => !others.includes(id)).map((id) => users[id]?.displayName).join(', ')}`
      : invited ? 'Dein Gegenüber möchte die KI hier aktivieren – klicken zum Zustimmen'
        : 'KI im Chat erlauben (@KI, Zusammenfassungen)';
  const toggle = () => {
    if (channel.serverId && !canManage) return;
    api(`/channels/${channel.id}/ai`, { method: (channel.serverId ? ai.on : mine) ? 'DELETE' : 'PUT' }).catch((e) => toast(e.message, 'error'));
  };
  return (
    <button type="button" className={cx('icon-btn ai-eye', ai.on && 'on', waiting && 'waiting', invited && 'invited')} onClick={toggle} data-tip={tip} aria-label="KI im Chat">
      {ai.on ? <Eye size={20} /> : <EyeOff size={20} />}
      {invited && <i className="ai-eye-dot" />}
    </button>
  );
}

export function AiSummaryButton({ channel }) {
  const on = channel.ai?.on;
  const enabled = useStore((s) => s.ai?.enabled);
  if (!enabled || !on || channel.type === 'voice') return null;
  return <button type="button" className="icon-btn" onClick={() => openModal('aiSummary', { channelId: channel.id })} data-tip="Was hab ich verpasst?"><Sparkles size={20} /></button>;
}

export function AiConsentBanner({ channel }) {
  const { mine, others } = useAiState(channel);
  const users = useStore((s) => s.users);
  const enabled = useStore((s) => s.ai?.enabled);
  const [hidden, setHidden] = useState(() => sessionStorage.getItem(`ai-banner:${channel.id}`) === '1');
  if (!enabled || channel.serverId || mine || !others.length || hidden) return null;
  const names = others.map((id) => users[id]?.displayName || 'Jemand').join(', ');
  return (
    <div className="ai-banner">
      <AiOrb size={30} />
      <span><b>{names}</b> möchte, dass Zync KI in diesem Chat mitliest – für @KI, Zusammenfassungen und Hilfe mit Kontext. Gespeichert wird nichts.</span>
      <button type="button" className="btn primary sm" onClick={() => api(`/channels/${channel.id}/ai`, { method: 'PUT' }).catch((e) => toast(e.message, 'error'))}>Zustimmen</button>
      <button type="button" className="btn secondary sm" onClick={() => { sessionStorage.setItem(`ai-banner:${channel.id}`, '1'); setHidden(true); }}>Lieber nicht</button>
    </div>
  );
}

/** Systemnachricht „X hat die KI ein-/ausgeschaltet“. */
export function AiToggleNote({ msg, serverId }) {
  const on = msg.meta?.on;
  return (
    <div className="msg system ai-toggle-msg" data-id={msg.id}>
      <span className="sys-icon">{on ? <Eye size={15} /> : <EyeOff size={15} />}</span>
      <span>
        <NameTag userId={msg.authorId} serverId={serverId} /> hat die KI für diesen Chat {on ? 'eingeschaltet' : 'ausgeschaltet'}
        {on && !msg.meta?.active && ' – aktiv, sobald alle zugestimmt haben'}.
      </span>
    </div>
  );
}

/** Übersetzung unter einer Nachricht. */
export function TranslationBlock({ id }) {
  const tr = useTranslations((s) => s[id]);
  if (!tr || tr.hidden) return null;
  return (
    <div className={cx('msg-translation', tr.error && 'error')}>
      <Languages size={13} />
      <span>{tr.error ? tr.error : tr.text || 'Übersetze …'}</span>
      {!tr.loading && !tr.error && <button type="button" onClick={() => useTranslations.setState({ [id]: { ...tr, hidden: true } })}>Original</button>}
    </div>
  );
}
