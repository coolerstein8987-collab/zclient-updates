import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, Gift, Clock, Bell, CalendarClock, Trophy, Plus, X, Trash2, Check, Shield, PartyPopper, UserPlus, Sparkles,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useStore, toast, openModal, closeModal, sendMessage } from '../lib/store.js';
import { can, PERMS } from '../lib/perm.js';
import { cx, formatStamp } from '../lib/format.js';
import { Modal, Field, Switch, Spinner, Section } from './ui.jsx';
import { Avatar, NameTag } from './Avatar.jsx';

const pad = (n) => String(n).padStart(2, '0');
/** Wert für <input type="datetime-local"> */
const localInput = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

const countdown = (ms) => {
  if (ms <= 0) return 'gleich';
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} Std. ${m % 60 ? `${m % 60} Min.` : ''}`.trim();
  return `${Math.round(h / 24)} Tagen`;
};

// =====================================================================
// Umfrage in einer Nachricht
// =====================================================================
export function PollCard({ msg }) {
  const me = useStore((s) => s.me);
  const p = msg.poll;
  const now = useNow(30_000);
  const [busy, setBusy] = useState(false);
  if (!p) return null;
  const ended = p.endsAt && p.endsAt < now;
  const total = new Set(p.votes.flat()).size;
  const mine = p.votes.map((v, i) => (v.includes(me.id) ? i : -1)).filter((i) => i >= 0);
  const max = Math.max(1, ...p.votes.map((v) => v.length));
  const vote = async (i) => {
    if (ended || busy) return;
    const next = p.multi ? (mine.includes(i) ? mine.filter((x) => x !== i) : [...mine, i]) : (mine.includes(i) ? [] : [i]);
    setBusy(true);
    try { await api(`/messages/${msg.id}/vote`, { method: 'PUT', body: { options: next } }); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className={cx('poll-card', ended && 'ended')}>
      <div className="poll-head"><BarChart3 size={16} /> Umfrage{p.multi && <span className="poll-multi">Mehrfachauswahl</span>}</div>
      <h4>{p.question}</h4>
      <div className="poll-options">
        {p.options.map((o, i) => {
          const n = p.votes[i].length;
          const pct = total ? Math.round((n / total) * 100) : 0;
          const lead = n === max && n > 0;
          return (
            <button key={i} type="button" className={cx('poll-opt', mine.includes(i) && 'mine', lead && ended && 'win')} onClick={() => vote(i)} disabled={ended}>
              <span className="po-bar" style={{ width: `${(mine.length || ended) ? pct : 0}%` }} />
              <span className="po-check">{mine.includes(i) ? <Check size={14} /> : null}</span>
              <span className="po-label">{o}</span>
              {(mine.length > 0 || ended) && <span className="po-pct">{pct}%</span>}
            </button>
          );
        })}
      </div>
      <div className="poll-foot">
        {total} {total === 1 ? 'Stimme' : 'Stimmen'} · {ended ? 'Beendet' : p.endsAt ? `endet in ${countdown(p.endsAt - now)}` : 'läuft'}
        {!mine.length && !ended && ' · tippe zum Abstimmen'}
      </div>
    </div>
  );
}

// =====================================================================
// Gewinnspiel in einer Nachricht
// =====================================================================
export function GiveawayCard({ msg }) {
  const me = useStore((s) => s.me);
  const g = msg.giveaway;
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  if (!g) return null;
  const inside = g.entrants.includes(me.id);
  const over = g.ended || g.endsAt <= now;
  const enter = async () => {
    setBusy(true);
    try { await api(`/messages/${msg.id}/enter`, { method: 'POST' }); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className={cx('giveaway-card', over && 'ended')}>
      <div className="gw-glow" />
      <div className="gw-icon"><Gift size={30} /></div>
      <div className="gw-main">
        <span className="gw-kicker">🎉 Gewinnspiel{g.winners > 1 ? ` · ${g.winners} Gewinner` : ''}</span>
        <h4>{g.prize}</h4>
        {g.ended ? (
          <div className="gw-result">
            {g.result.length ? <>🏆 {g.result.map((id) => <NameTag key={id} userId={id} />).reduce((a, b) => [a, ', ', b])}</> : 'Niemand hat mitgemacht 😢'}
          </div>
        ) : (
          <span className="gw-time"><Clock size={13} /> {over ? 'wird gleich ausgelost …' : `noch ${countdown(g.endsAt - now)}`} · {g.entrants.length} dabei</span>
        )}
      </div>
      {!g.ended && !over && (
        <button type="button" className={cx('btn', inside ? 'secondary' : 'primary', 'gw-btn')} onClick={enter} disabled={busy}>
          {inside ? <><Check size={15} /> Dabei</> : <><PartyPopper size={15} /> Teilnehmen</>}
        </button>
      )}
    </div>
  );
}

// =====================================================================
// Erstellen-Dialoge
// =====================================================================
export function PollModal({ channelId }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multi, setMulti] = useState(false);
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const ok = question.trim() && options.filter((o) => o.trim()).length >= 2;
  const create = async () => {
    setBusy(true);
    try {
      await api(`/channels/${channelId}/polls`, { method: 'POST', body: { question, options: options.filter((o) => o.trim()), multi, hours } });
      closeModal();
    } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };
  return (
    <Modal onClose={closeModal} title={<><BarChart3 size={20} /> Umfrage erstellen</>} width={480}>
      <Field label="Frage"><input className="input" autoFocus value={question} maxLength={200} onChange={(e) => setQuestion(e.target.value)} placeholder="z. B. Was schauen wir heute?" /></Field>
      <Field label="Antworten">
        <div className="poll-edit">
          {options.map((o, i) => (
            <div key={i} className="poll-edit-row">
              <input className="input" value={o} maxLength={80} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Antwort ${i + 1}`} />
              {options.length > 2 && <button type="button" className="icon-btn" onClick={() => setOptions(options.filter((_, j) => j !== i))} aria-label="Entfernen"><X size={16} /></button>}
            </div>
          ))}
          {options.length < 10 && <button type="button" className="btn ghost sm" onClick={() => setOptions([...options, ''])}><Plus size={14} /> Antwort hinzufügen</button>}
        </div>
      </Field>
      <Switch checked={multi} onChange={setMulti} label="Mehrere Antworten erlauben" />
      <Field label="Läuft">
        <div className="chip-row">
          {[[1, '1 Std.'], [24, '1 Tag'], [72, '3 Tage'], [168, '1 Woche'], [0, 'Ohne Ende']].map(([h, l]) => <button key={h} type="button" className={cx('chip', hours === h && 'active')} onClick={() => setHours(h)}>{l}</button>)}
        </div>
      </Field>
      <div className="modal-actions"><span className="flex-1" /><button type="button" className="btn ghost" onClick={closeModal}>Abbrechen</button><button type="button" className="btn primary" disabled={!ok || busy} onClick={create}>{busy ? <Spinner size={16} /> : 'Umfrage posten'}</button></div>
    </Modal>
  );
}

export function GiveawayModal({ channelId }) {
  const [prize, setPrize] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [winners, setWinners] = useState(1);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      await api(`/channels/${channelId}/giveaways`, { method: 'POST', body: { prize, minutes, winners } });
      closeModal();
    } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };
  return (
    <Modal onClose={closeModal} title={<><Gift size={20} /> Gewinnspiel starten</>} subtitle="Alle können mit einem Klick mitmachen – Zync lost am Ende fair aus." width={460}>
      <Field label="Preis"><input className="input" autoFocus value={prize} maxLength={100} onChange={(e) => setPrize(e.target.value)} placeholder="z. B. Steam-Key, Rolle „VIP“, 500 🪙 …" /></Field>
      <Field label="Dauer">
        <div className="chip-row">
          {[[10, '10 Min.'], [60, '1 Std.'], [360, '6 Std.'], [1440, '1 Tag'], [10080, '1 Woche']].map(([m, l]) => <button key={m} type="button" className={cx('chip', minutes === m && 'active')} onClick={() => setMinutes(m)}>{l}</button>)}
        </div>
      </Field>
      <Field label="Anzahl Gewinner"><input className="input" type="number" min={1} max={20} value={winners} onChange={(e) => setWinners(Number(e.target.value))} /></Field>
      <div className="modal-actions"><span className="flex-1" /><button type="button" className="btn ghost" onClick={closeModal}>Abbrechen</button><button type="button" className="btn primary" disabled={!prize.trim() || busy} onClick={create}>{busy ? <Spinner size={16} /> : '🎉 Starten'}</button></div>
    </Modal>
  );
}

/** Nachricht planen oder Erinnerung setzen. */
export function ScheduleModal({ channelId, kind: initialKind = 'message', content: initialContent = '', at: initialAt, title }) {
  const [kind, setKind] = useState(initialKind);
  const [content, setContent] = useState(initialContent);
  const [at, setAt] = useState(() => localInput(initialAt || Date.now() + 60 * 60_000));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api('/scheduled', { method: 'POST', body: { channelId, kind, content, at: new Date(at).getTime() } });
      toast(kind === 'reminder' ? 'Erinnerung gesetzt ⏰' : 'Nachricht geplant 📅', 'success');
      closeModal();
    } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };
  const quick = [[10, 'in 10 Min.'], [60, 'in 1 Std.'], [180, 'in 3 Std.']];
  const tomorrow9 = new Date(); tomorrow9.setDate(tomorrow9.getDate() + 1); tomorrow9.setHours(9, 0, 0, 0);
  return (
    <Modal onClose={closeModal} title={<>{kind === 'reminder' ? <Bell size={20} /> : <CalendarClock size={20} />} {title || (kind === 'reminder' ? 'Erinnerung' : 'Nachricht planen')}</>} width={470}>
      <div className="segmented full">
        <button type="button" className={cx(kind === 'message' && 'active')} onClick={() => setKind('message')}><CalendarClock size={15} /> Nachricht planen</button>
        <button type="button" className={cx(kind === 'reminder' && 'active')} onClick={() => setKind('reminder')}><Bell size={15} /> Erinnerung</button>
      </div>
      <Field label={kind === 'reminder' ? 'Woran soll Zync dich erinnern?' : 'Nachricht'}>
        <textarea className="input" rows={3} autoFocus value={content} maxLength={2000} onChange={(e) => setContent(e.target.value)} placeholder={kind === 'reminder' ? 'z. B. Terminator schauen 🍿' : 'z. B. Alles Gute zum Geburtstag! 🎂'} />
      </Field>
      <Field label="Wann?">
        <input className="input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        <div className="chip-row" style={{ marginTop: 8 }}>
          {quick.map(([m, l]) => <button key={m} type="button" className="chip" onClick={() => setAt(localInput(Date.now() + m * 60_000))}>{l}</button>)}
          <button type="button" className="chip" onClick={() => setAt(localInput(tomorrow9.getTime()))}>Morgen 9 Uhr</button>
        </div>
      </Field>
      <p className="muted small-note">{kind === 'reminder' ? 'Zync Helfer erwähnt dich zur gewählten Zeit hier im Chat.' : 'Die Nachricht wird zur gewählten Zeit in deinem Namen gesendet.'}</p>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={() => openModal('scheduledList')}><Clock size={15} /> Geplante ansehen</button>
        <span className="flex-1" />
        <button type="button" className="btn primary" disabled={!content.trim() || busy} onClick={save}>{busy ? <Spinner size={16} /> : kind === 'reminder' ? 'Erinnern' : 'Planen'}</button>
      </div>
    </Modal>
  );
}

export function ScheduledListModal() {
  const channels = useStore((s) => s.channels);
  const users = useStore((s) => s.users);
  const [items, setItems] = useState(null);
  useEffect(() => { api('/scheduled').then(setItems).catch((e) => toast(e.message, 'error')); }, []);
  const where = (cid) => {
    const c = channels[cid];
    if (!c) return 'Unbekannter Chat';
    if (c.type === 'dm') return `@${users[c.recipients?.[0]]?.displayName || 'DM'}`;
    return `#${c.name}`;
  };
  const del = async (id) => {
    await api(`/scheduled/${id}`, { method: 'DELETE' }).catch(() => {});
    setItems((l) => l.filter((x) => x.id !== id));
  };
  return (
    <Modal onClose={closeModal} title={<><Clock size={20} /> Geplant</>} subtitle="Deine geplanten Nachrichten und Erinnerungen" width={520}>
      {!items ? <div className="center-pad"><Spinner /></div> : !items.length ? <div className="empty-state small">Nichts geplant 🌙</div> : (
        <div className="sched-list">
          {items.map((it) => (
            <div key={it.id} className="sched-item">
              <span className="sched-icon">{it.kind === 'reminder' ? '⏰' : '📅'}</span>
              <div className="sched-main">
                <b>{formatStamp(it.at)}</b>
                <span className="muted">{where(it.channelId)}</span>
                <p>{it.content}</p>
              </div>
              <button type="button" className="icon-btn danger" onClick={() => del(it.id)} aria-label="Löschen"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// =====================================================================
// Slash-Befehle im Eingabefeld
// =====================================================================
export function slashCommands(channel) {
  const s = useStore.getState();
  const inServer = !!channel.serverId;
  const manager = inServer && can(s, channel.serverId, PERMS.MANAGE_SERVER);
  const roll = () => sendMessage(channel.id, { content: `🎲 hat eine **${1 + Math.floor(Math.random() * 6)}** gewürfelt!` });
  const coin = () => sendMessage(channel.id, { content: `🪙 Münzwurf: **${Math.random() < 0.5 ? 'Kopf' : 'Zahl'}**!` });
  return [
    { name: 'umfrage', hint: 'Umfrage erstellen', icon: '📊', run: () => openModal('poll', { channelId: channel.id }) },
    manager && { name: 'gewinnspiel', hint: 'Gewinnspiel starten', icon: '🎁', run: () => openModal('giveaway', { channelId: channel.id }) },
    { name: 'erinnere', hint: 'Erinnerung setzen', icon: '⏰', run: () => openModal('schedule', { channelId: channel.id, kind: 'reminder' }) },
    { name: 'planen', hint: 'Nachricht später senden', icon: '📅', run: () => openModal('schedule', { channelId: channel.id, kind: 'message' }) },
    s.ai?.enabled && { name: 'ki', hint: 'KI-Antwort-Helfer (privat)', icon: '✨', run: () => openModal('aiAssist', { channelId: channel.id, mode: 'reply' }) },
    inServer && { name: 'rangliste', hint: 'Level-Rangliste anzeigen', icon: '🏆', run: () => openModal('leaderboard', { serverId: channel.serverId }) },
    { name: 'würfel', hint: 'Einen Würfel werfen', icon: '🎲', run: roll },
    { name: 'münze', hint: 'Kopf oder Zahl', icon: '🪙', run: coin },
  ].filter(Boolean);
}

// =====================================================================
// Rangliste
// =====================================================================
export function LeaderboardModal({ serverId }) {
  const server = useStore((s) => s.servers[serverId]);
  const [d, setD] = useState(null);
  useEffect(() => { api(`/servers/${serverId}/leaderboard`).then(setD).catch((e) => toast(e.message, 'error')); }, [serverId]);
  return (
    <Modal onClose={closeModal} title={<><Trophy size={20} /> Rangliste</>} subtitle={server?.name} width={520}>
      {!d ? <div className="center-pad"><Spinner /></div> : !d.enabled && !d.entries.length ? (
        <div className="empty-state small">Level sind auf diesem Server aus – Admins können sie unter Servereinstellungen → Zync-Helfer einschalten.</div>
      ) : !d.entries.length ? <div className="empty-state small">Noch niemand hat XP gesammelt – schreibt los! 💬</div> : (
        <div className="lb-list">
          {d.entries.map((e) => {
            const pct = Math.min(100, Math.round(((e.xp - e.prev) / Math.max(1, e.next - e.prev)) * 100));
            return (
              <div key={e.userId} className={cx('lb-row', e.rank <= 3 && `top${e.rank}`)}>
                <span className="lb-rank">{e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : `#${e.rank}`}</span>
                <Avatar userId={e.userId} size={36} />
                <div className="lb-main">
                  <NameTag userId={e.userId} serverId={serverId} />
                  <div className="lb-bar"><span style={{ width: `${pct}%` }} /></div>
                </div>
                <div className="lb-level"><b>Lvl {e.level}</b><small>{e.xp} XP</small></div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// =====================================================================
// Servereinstellungen → Zync-Helfer
// =====================================================================
export function HelpersSettings({ serverId }) {
  const server = useStore((s) => s.servers[serverId]);
  const channels = useStore((s) => s.channels);
  const [cfg, setCfg] = useState(null);
  const [word, setWord] = useState('');
  const textChannels = useMemo(() => Object.values(channels).filter((c) => c.serverId === serverId && c.type === 'text').sort((a, b) => a.position - b.position), [channels, serverId]);
  const roles = Object.values(server?.roles || {}).filter((r) => !(r.permissions & PERMS.ADMIN)).sort((a, b) => b.position - a.position);
  useEffect(() => { api(`/servers/${serverId}/helpers`).then(setCfg).catch((e) => toast(e.message, 'error')); }, [serverId]);
  const save = async (part) => {
    const next = { ...cfg, ...part };
    setCfg(next);
    try { setCfg(await api(`/servers/${serverId}/helpers`, { method: 'PATCH', body: part })); } catch (e) { toast(e.message, 'error'); }
  };
  if (!cfg) return <div className="center-pad"><Spinner /></div>;
  const ChannelSelect = ({ value, onChange, empty }) => (
    <select className="input" value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{empty}</option>
      {textChannels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
    </select>
  );
  return (
    <div className="helpers-settings">
      <div className="helpers-hero"><Sparkles size={20} /> Alles, wofür man auf Discord Bots braucht – direkt eingebaut. Keine Einladungen, keine Abos.</div>
      <Section title={<><UserPlus size={16} /> Willkommen</>}>
        <Switch checked={cfg.welcome.on} onChange={(v) => save({ welcome: { ...cfg.welcome, on: v } })} label="Neue Mitglieder begrüßen" desc="Zync Helfer schreibt eine Nachricht, wenn jemand beitritt." />
        {cfg.welcome.on && (
          <>
            <Field label="Kanal"><ChannelSelect value={cfg.welcome.channelId} onChange={(v) => save({ welcome: { ...cfg.welcome, channelId: v } })} empty="Erster Textkanal" /></Field>
            <Field label="Nachricht" hint="{user} = neues Mitglied, {server} = Servername">
              <textarea className="input" rows={2} defaultValue={cfg.welcome.text} maxLength={500} onBlur={(e) => e.target.value !== cfg.welcome.text && save({ welcome: { ...cfg.welcome, text: e.target.value } })} />
            </Field>
          </>
        )}
        <Switch checked={cfg.autoRole.on} onChange={(v) => save({ autoRole: { ...cfg.autoRole, on: v, roleId: cfg.autoRole.roleId || roles[0]?.id || null } })} label="Rolle automatisch vergeben" desc={roles.length ? 'Jedes neue Mitglied bekommt diese Rolle.' : 'Erstelle zuerst unter „Rollen“ eine Rolle.'} />
        {cfg.autoRole.on && roles.length > 0 && (
          <Field label="Rolle">
            <select className="input" value={cfg.autoRole.roleId || ''} onChange={(e) => save({ autoRole: { on: true, roleId: e.target.value } })}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        )}
      </Section>
      <Section title={<><Trophy size={16} /> Level & XP</>}>
        <Switch checked={cfg.levels.on} onChange={(v) => save({ levels: { ...cfg.levels, on: v } })} label="Level-System" desc="Wer schreibt, sammelt XP (höchstens einmal pro Minute – Spammen bringt nichts) und steigt im Level auf." />
        {cfg.levels.on && (
          <>
            <Field label="Level-Ups ankündigen in"><ChannelSelect value={cfg.levels.channelId} onChange={(v) => save({ levels: { ...cfg.levels, channelId: v } })} empty="Dem Kanal, in dem geschrieben wurde" /></Field>
            <button type="button" className="btn secondary sm" onClick={() => openModal('leaderboard', { serverId })}><Trophy size={14} /> Rangliste ansehen</button>
          </>
        )}
      </Section>
      <Section title={<><Shield size={16} /> Filter & Schutz</>}>
        <Switch checked={cfg.filter.on} onChange={(v) => save({ filter: { ...cfg.filter, on: v } })} label="Auto-Moderation" desc="Gilt nicht für Leute mit dem Recht „Nachrichten verwalten“." />
        {cfg.filter.on && (
          <>
            <Field label="Verbotene Wörter">
              <div className="word-chips">
                {cfg.filter.words.map((w) => <span key={w} className="word-chip">{w}<button type="button" onClick={() => save({ filter: { ...cfg.filter, words: cfg.filter.words.filter((x) => x !== w) } })} aria-label="Entfernen"><X size={12} /></button></span>)}
                <input className="input word-input" value={word} onChange={(e) => setWord(e.target.value)} placeholder="Wort + Enter" onKeyDown={(e) => { if (e.key === 'Enter' && word.trim()) { e.preventDefault(); save({ filter: { ...cfg.filter, words: [...cfg.filter.words, word.trim().toLowerCase()] } }); setWord(''); } }} />
              </div>
            </Field>
            <Switch checked={cfg.filter.links} onChange={(v) => save({ filter: { ...cfg.filter, links: v } })} label="Links blockieren" />
            <Switch checked={cfg.filter.spam} onChange={(v) => save({ filter: { ...cfg.filter, spam: v } })} label="Spamschutz" desc="Die gleiche Nachricht mehrmals hintereinander wird blockiert." />
          </>
        )}
      </Section>
      <Section title={<><BarChart3 size={16} /> Befehle im Chat</>} desc="Tippe / im Eingabefeld: /umfrage, /gewinnspiel, /erinnere, /planen, /rangliste, /würfel, /münze." />
    </div>
  );
}
