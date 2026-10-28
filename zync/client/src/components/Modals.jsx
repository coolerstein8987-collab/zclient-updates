import { useEffect, useMemo, useState } from 'react';
import {
  Camera, ChevronLeft, Hash, Volume2, Copy, RefreshCw, Trash2, Crown, Shield, ArrowUp, ArrowDown, Search, Check, Link as LinkIcon, Globe, Users,
} from 'lucide-react';
import {
  useStore, closeModal, openServer, run, toast, openDmWith, sendMessage, openChannel,
} from '../lib/store.js';
import { api } from '../lib/api.js';
import { cx, copyText, hashColor } from '../lib/format.js';
import { Modal, Field, Switch, Spinner } from './ui.jsx';
import { Avatar, ServerIcon, NameTag, CroppedImage } from './Avatar.jsx';
import { ImageCropper, pickFile } from './ImageCropper.jsx';
import { memberMenu } from './MembersPanel.jsx';
import { RolesSettings, TagSettings, MemberRolesModal } from './RolesSettings.jsx';
import { socialModal } from './Social.jsx';
import { StoryComposer } from './Stories.jsx';
import { AiAssist, AiSummary } from './Ai.jsx';
import { DiscordBridgeSection } from './Discord.jsx';
import { PollModal, GiveawayModal, ScheduleModal, ScheduledListModal, LeaderboardModal, HelpersSettings } from './Helpers.jsx';
import { PERMS, permsOf } from '../lib/perm.js';

const TEMPLATES = [
  { id: 'blank', emoji: '✨', name: 'Eigener Server', desc: 'Starte mit einer leeren Leinwand' },
  { id: 'friends', emoji: '💜', name: 'Freunde', desc: 'Chillen, Memes und Calls' },
  { id: 'gaming', emoji: '🎮', name: 'Gaming', desc: 'Squads, Clips und LFG' },
  { id: 'anime', emoji: '🍥', name: 'Anime-Fanclub', desc: 'HxH, Seasonals & Watch Partys' },
  { id: 'community', emoji: '🌍', name: 'Community', desc: 'Regeln, Vorstellen, Kunst' },
  { id: 'study', emoji: '📚', name: 'Lerngruppe', desc: 'Hausaufgaben und Lernräume' },
];

function ConfirmModal({ title, text, confirm = 'OK', danger, onConfirm }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal onClose={closeModal} title={title} width={440}>
      <p className="confirm-text">{text}</p>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={closeModal}>Abbrechen</button>
        <button
          type="button"
          autoFocus
          className={cx('btn', danger ? 'danger' : 'primary')}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try { await onConfirm(); closeModal(); } catch { setBusy(false); }
          }}
        >{busy ? <Spinner size={16} /> : confirm}</button>
      </div>
    </Modal>
  );
}

function IconPicker({ value, crop, onChange, size = 88, label = 'Bild' }) {
  const [file, setFile] = useState(null);
  return (
    <>
      <button type="button" className="icon-picker" style={{ width: size, height: size }} onClick={async () => { const f = await pickFile(); if (f) setFile(f); }}>
        {value ? <CroppedImage src={value} crop={crop} /> : <><Camera size={24} /><span>{label}</span></>}
        <span className="ip-plus">+</span>
      </button>
      {file && <ImageCropper file={file} aspect={1} shape="circle" title="Servericon anpassen" onCancel={() => setFile(null)} onDone={({ url, crop: c }) => { setFile(null); onChange(url, c); }} />}
    </>
  );
}

function CreateServerModal() {
  const me = useStore((s) => s.me);
  const [step, setStep] = useState('start');
  const [template, setTemplate] = useState('friends');
  const [name, setName] = useState(`${me.displayName}s Server`);
  const [icon, setIcon] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const s = await api('/servers', { method: 'POST', body: { name, template, icon: icon?.url, iconCrop: icon?.crop } });
      closeModal();
      setTimeout(() => openServer(s.id), 50);
      toast('Dein Server ist bereit! 🚀', 'success');
    } catch (e) {
      toast(e.message, 'error');
      setBusy(false);
    }
  };
  const join = async () => {
    const c = code.trim().split('/').pop();
    if (!c) return;
    setBusy(true);
    try {
      const s = await api(`/invites/${encodeURIComponent(c)}`, { method: 'POST' });
      closeModal();
      setTimeout(() => openServer(s.id), 50);
    } catch (e) {
      toast(e.message, 'error');
      setBusy(false);
    }
  };
  if (step === 'join') {
    return (
      <Modal onClose={closeModal} title="Einem Server beitreten" subtitle="Gib unten eine Einladung ein, um einem bestehenden Server beizutreten." width={460}>
        <Field label="Einladungslink oder Code">
          <input className="input" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder={`${location.origin}/invite/hTKzmak`} onKeyDown={(e) => e.key === 'Enter' && join()} />
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={() => setStep('start')}><ChevronLeft size={16} /> Zurück</button>
          <button type="button" className="btn primary" onClick={join} disabled={!code.trim() || busy}>{busy ? <Spinner size={16} /> : 'Beitreten'}</button>
        </div>
      </Modal>
    );
  }
  if (step === 'customize') {
    return (
      <Modal onClose={closeModal} title="Passe deinen Server an" subtitle="Gib deinem Server mit Namen und Icon eine Persönlichkeit. Du kannst das später jederzeit ändern." width={460}>
        <div className="center-col">
          <IconPicker value={icon?.url} crop={icon?.crop} onChange={(url, crop) => setIcon({ url, crop })} label="Hochladen" />
        </div>
        <Field label="Servername">
          <input className="input" autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()} />
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={() => setStep('start')}><ChevronLeft size={16} /> Zurück</button>
          <button type="button" className="btn primary" onClick={create} disabled={!name.trim() || busy}>{busy ? <Spinner size={16} /> : 'Erstellen'}</button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal onClose={closeModal} title="Erstelle deinen Server" subtitle="Dein Server ist der Ort, an dem du mit deinen Freunden abhängst. Erstelle deinen eigenen und leg los." width={480}>
      <div className="template-list">
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" className="template-item" onClick={() => { setTemplate(t.id); setStep('customize'); }}>
            <span className="tpl-emoji" style={{ background: hashColor(t.id, 65, 22) }}>{t.emoji}</span>
            <span className="tpl-text"><b>{t.name}</b><span>{t.desc}</span></span>
            <ChevronLeft size={18} style={{ transform: 'rotate(180deg)' }} />
          </button>
        ))}
      </div>
      <div className="join-cta">
        <h4>Hast du schon eine Einladung?</h4>
        <button type="button" className="btn secondary block" onClick={() => setStep('join')}>Einem Server beitreten</button>
      </div>
    </Modal>
  );
}

function InviteModal({ serverId }) {
  const server = useStore((s) => s.servers[serverId]);
  const relationships = useStore((s) => s.relationships);
  const users = useStore((s) => s.users);
  const [term, setTerm] = useState('');
  const [sent, setSent] = useState({});
  if (!server) return null;
  const link = `${location.origin}/invite/${server.invite}`;
  const friends = Object.values(relationships).filter((r) => r.type === 1 && !server.members[r.id])
    .map((r) => users[r.id]).filter((u) => u && (!term || u.username.includes(term.toLowerCase()) || u.displayName.toLowerCase().includes(term.toLowerCase())));
  const invite = async (u) => {
    try {
      const ch = await api('/dms', { method: 'POST', body: { userId: u.id } });
      useStore.setState((st) => ({ channels: { ...st.channels, [ch.id]: { ...st.channels[ch.id], ...ch } } }));
      await sendMessage(ch.id, { content: `Komm auf **${server.name}**! 🎉 ${link}` });
      setSent((x) => ({ ...x, [u.id]: true }));
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  return (
    <Modal onClose={closeModal} title={`Freunde zu ${server.name} einladen`} width={480}>
      <div className="invite-search"><Search size={16} /><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Nach Freunden suchen" /></div>
      <div className="invite-list">
        {friends.length === 0 && <div className="muted invite-empty">Keine Freunde zum Einladen gefunden.</div>}
        {friends.map((u) => (
          <div key={u.id} className="invite-row">
            <Avatar user={u} size={34} />
            <div className="ir-name"><NameTag user={u} /><span className="muted">@{u.username}</span></div>
            <button type="button" className={cx('btn sm', sent[u.id] ? 'ghost' : 'success')} disabled={sent[u.id]} onClick={() => invite(u)}>{sent[u.id] ? <><Check size={14} /> Gesendet</> : 'Einladen'}</button>
          </div>
        ))}
      </div>
      <Field label="Oder sende einen Einladungslink">
        <div className="copy-field">
          <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
          <button type="button" className="btn primary" onClick={() => { copyText(link); toast('Link kopiert!', 'success'); }}><Copy size={16} /> Kopieren</button>
        </div>
      </Field>
    </Modal>
  );
}

function JoinInviteModal({ code }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/invites/${encodeURIComponent(code)}`).then(setInfo).catch((e) => setError(e.message));
  }, [code]);
  const join = async () => {
    setBusy(true);
    try {
      const s = await api(`/invites/${encodeURIComponent(code)}`, { method: 'POST' });
      closeModal();
      setTimeout(() => openServer(s.id), 50);
    } catch (e) {
      toast(e.message, 'error');
      setBusy(false);
    }
  };
  return (
    <Modal onClose={closeModal} width={420} className="join-invite">
      {error ? <div className="center-col"><div className="empty-art">😕</div><h2>Einladung ungültig</h2><p className="muted">{error}</p><button type="button" className="btn primary" onClick={closeModal}>OK</button></div>
        : !info ? <div className="center-col"><Spinner size={28} /></div> : (
          <div className="center-col">
            <ServerIcon server={info.server} size={84} />
            <p className="muted">Du wurdest eingeladen auf</p>
            <h2>{info.server.name}</h2>
            <p className="muted inline-icon"><Users size={14} /> {info.members} {info.members === 1 ? 'Mitglied' : 'Mitglieder'}</p>
            {info.server.description && <p>{info.server.description}</p>}
            <button type="button" className="btn primary lg block" onClick={info.joined ? () => { closeModal(); openServer(info.server.id); } : join} disabled={busy}>{busy ? <Spinner size={16} /> : info.joined ? 'Öffnen' : 'Einladung annehmen'}</button>
          </div>
        )}
    </Modal>
  );
}

function ChannelModal({ serverId, channelId, category = '', categoryOnly }) {
  const channel = useStore((s) => (channelId ? s.channels[channelId] : null));
  const channels = useStore((s) => s.channels);
  const categories = useMemo(() => [...new Set(Object.values(channels).filter((c) => c.serverId === serverId).map((c) => c.category).filter(Boolean))], [channels, serverId]);
  const [type, setType] = useState(channel?.type || 'text');
  const [name, setName] = useState(channel?.name || '');
  const [topic, setTopic] = useState(channel?.topic || '');
  const [cat, setCat] = useState(channel?.category ?? category);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      if (channel) await api(`/channels/${channel.id}`, { method: 'PATCH', body: { name, topic, category: cat } });
      else {
        const c = await api(`/servers/${serverId}/channels`, { method: 'POST', body: { name, type, topic, category: cat } });
        setTimeout(() => openChannel(serverId, c.id), 50);
      }
      closeModal();
    } catch (e) {
      toast(e.message, 'error');
      setBusy(false);
    }
  };
  const del = () => run(() => api(`/channels/${channel.id}`, { method: 'DELETE' }), 'Kanal gelöscht').then(closeModal).catch(() => {});
  return (
    <Modal onClose={closeModal} title={channel ? 'Kanal bearbeiten' : categoryOnly ? 'Kategorie erstellen' : 'Kanal erstellen'} width={460}>
      {!channel && !categoryOnly && (
        <div className="type-picker">
          <button type="button" className={cx('type-opt', type === 'text' && 'active')} onClick={() => setType('text')}>
            <Hash size={22} /><span><b>Text</b><span>Nachrichten, Bilder, GIFs, Emojis & Sticker</span></span><span className="radio" />
          </button>
          <button type="button" className={cx('type-opt', type === 'voice' && 'active')} onClick={() => setType('voice')}>
            <Volume2 size={22} /><span><b>Sprache</b><span>Gemeinsam reden, Video & Bildschirm übertragen</span></span><span className="radio" />
          </button>
        </div>
      )}
      {categoryOnly && (
        <Field label="Kategoriename">
          <input className="input" autoFocus value={cat} onChange={(e) => setCat(e.target.value)} placeholder="z. B. Gaming" maxLength={40} />
        </Field>
      )}
      <Field label={categoryOnly ? 'Erster Kanal in der Kategorie' : 'Kanalname'}>
        <div className="input-icon">
          {type === 'voice' ? <Volume2 size={16} /> : <Hash size={16} />}
          <input className="input" autoFocus={!categoryOnly} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={type === 'voice' ? 'Lounge' : 'neuer-kanal'} onKeyDown={(e) => e.key === 'Enter' && name.trim() && save()} />
        </div>
      </Field>
      {type === 'text' && (
        <Field label="Thema (optional)">
          <input className="input" value={topic} maxLength={300} onChange={(e) => setTopic(e.target.value)} placeholder="Worum geht's hier?" />
        </Field>
      )}
      {!categoryOnly && (
        <Field label="Kategorie">
          <input className="input" list="zync-cats" value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Ohne Kategorie" maxLength={40} />
          <datalist id="zync-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
      )}
      {channel && <DiscordBridgeSection channel={channel} />}
      <div className="modal-actions">
        {channel && <button type="button" className="btn danger-ghost" onClick={del}><Trash2 size={16} /> Löschen</button>}
        <span className="flex-1" />
        <button type="button" className="btn ghost" onClick={closeModal}>Abbrechen</button>
        <button type="button" className="btn primary" onClick={save} disabled={!name.trim() || busy || (categoryOnly && !cat.trim())}>{busy ? <Spinner size={16} /> : channel ? 'Speichern' : 'Erstellen'}</button>
      </div>
    </Modal>
  );
}

function NicknameModal({ serverId, userId }) {
  const member = useStore((s) => s.servers[serverId]?.members[userId]);
  const user = useStore((s) => s.users[userId]);
  const [nick, setNick] = useState(member?.nickname || '');
  const save = () => run(() => api(`/servers/${serverId}/members/${userId}`, { method: 'PATCH', body: { nickname: nick } }), 'Spitzname gespeichert').then(closeModal).catch(() => {});
  return (
    <Modal onClose={closeModal} title="Spitzname ändern" subtitle="Spitznamen gelten nur auf diesem Server." width={420}>
      <Field label="Spitzname">
        <input className="input" autoFocus value={nick} maxLength={32} onChange={(e) => setNick(e.target.value)} placeholder={user?.displayName} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </Field>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={() => setNick('')}>Zurücksetzen</button>
        <button type="button" className="btn primary" onClick={save}>Speichern</button>
      </div>
    </Modal>
  );
}

const STATUS_PRESETS = ['🎮 Am Zocken', '📚 Am Lernen', '🎧 Musik hören', '🍿 Anime-Marathon', '💤 Schlafe', '🏋️ Im Gym', '💻 Am Coden', '🍕 Am Essen'];

function CustomStatusModal() {
  const me = useStore((s) => s.me);
  const [text, setText] = useState(me.customStatus || '');
  const save = (v = text) => run(() => api('/me', { method: 'PATCH', body: { customStatus: v } }), 'Status aktualisiert').then(closeModal).catch(() => {});
  return (
    <Modal onClose={closeModal} title="Status festlegen" subtitle="Was machst du gerade?" width={440}>
      <Field label="Dein Status">
        <input className="input" autoFocus value={text} maxLength={128} onChange={(e) => setText(e.target.value)} placeholder="Was geht ab? ✨" onKeyDown={(e) => e.key === 'Enter' && save()} />
      </Field>
      <div className="preset-chips">{STATUS_PRESETS.map((p) => <button key={p} type="button" className="chip" onClick={() => setText(p)}>{p}</button>)}</div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={() => save('')}>Status löschen</button>
        <button type="button" className="btn primary" onClick={() => save()}>Speichern</button>
      </div>
    </Modal>
  );
}

function NewDmModal() {
  const relationships = useStore((s) => s.relationships);
  const users = useStore((s) => s.users);
  const [term, setTerm] = useState('');
  const friends = Object.values(relationships).filter((r) => r.type === 1).map((r) => users[r.id])
    .filter((u) => u && (!term || u.username.includes(term.toLowerCase()) || u.displayName.toLowerCase().includes(term.toLowerCase())));
  return (
    <Modal onClose={closeModal} title="Neue Nachricht" subtitle="Wähle einen Freund aus." width={440}>
      <div className="invite-search"><Search size={16} /><input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Freunde durchsuchen" /></div>
      <div className="invite-list">
        {friends.length === 0 && <div className="muted invite-empty">Keine Freunde gefunden.</div>}
        {friends.map((u) => (
          <button key={u.id} type="button" className="invite-row clickable" onClick={() => { closeModal(); openDmWith(u.id); }}>
            <Avatar user={u} size={34} showStatus userId={u.id} />
            <div className="ir-name"><NameTag user={u} /><span className="muted">@{u.username}</span></div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ---------- Servereinstellungen ----------
function ServerSettingsModal({ serverId }) {
  const server = useStore((s) => s.servers[serverId]);
  const meId = useStore((s) => s.me.id);
  const channels = useStore((s) => s.channels);
  const users = useStore((s) => s.users);
  const [tab, setTab] = useState('overview');
  const [form, setForm] = useState(() => ({ name: server?.name || '', description: server?.description || '', accent: server?.accent || '#7c5cff', isPublic: !!server?.isPublic }));
  const [bannerFile, setBannerFile] = useState(null);
  const [memberTerm, setMemberTerm] = useState('');
  if (!server) return null;
  const role = server.members[meId]?.role;
  const dirty = form.name !== server.name || form.description !== server.description || (form.accent !== (server.accent || '#7c5cff')) || form.isPublic !== server.isPublic;
  const save = () => run(() => api(`/servers/${serverId}`, { method: 'PATCH', body: form }), 'Gespeichert ✅').catch(() => {});
  const patch = (body) => run(() => api(`/servers/${serverId}`, { method: 'PATCH', body })).catch(() => {});
  const list = Object.values(channels).filter((c) => c.serverId === serverId).sort((a, b) => a.position - b.position);
  const move = (idx, dir) => {
    const ids = list.map((c) => c.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    run(() => api(`/servers/${serverId}/channels/reorder`, { method: 'POST', body: { ids } })).catch(() => {});
  };
  const members = Object.values(server.members).filter((m) => {
    const u = users[m.userId];
    const t = memberTerm.toLowerCase();
    return !t || u?.username.includes(t) || u?.displayName.toLowerCase().includes(t);
  });
  const link = `${location.origin}/invite/${server.invite}`;
  const perms = permsOf(useStore.getState(), serverId, meId);
  const tabs = [
    perms & PERMS.MANAGE_SERVER && ['overview', 'Übersicht'],
    perms & PERMS.MANAGE_ROLES && ['roles', 'Rollen'],
    perms & PERMS.MANAGE_SERVER && ['tag', 'Server-Tag'],
    perms & PERMS.MANAGE_SERVER && ['helpers', 'Zync-Helfer ✨'],
    perms & PERMS.MANAGE_CHANNELS && ['channels', 'Kanäle'],
    ['members', 'Mitglieder'],
    perms & PERMS.MANAGE_SERVER && ['invites', 'Einladungen'],
  ].filter(Boolean);
  if (!tabs.some(([id]) => id === tab)) setTimeout(() => setTab(tabs[0][0]), 0);
  return (
    <Modal onClose={closeModal} title="Servereinstellungen" subtitle={server.name} width={900} className="server-settings">
      <div className="ss-layout">
        <nav className="ss-nav">
          {tabs.map(([id, label]) => <button key={id} type="button" className={cx(tab === id && 'active')} onClick={() => setTab(id)}>{label}</button>)}
        </nav>
        <div className="ss-content">
          {tab === 'overview' && (
            <>
              <div className="ss-banner-edit" onClick={async () => { const f = await pickFile(); if (f) setBannerFile(f); }} role="button" tabIndex={0}>
                {server.banner ? <CroppedImage src={server.banner} crop={server.bannerCrop} aspect={2.5} /> : <div className="ss-banner-empty" style={{ background: `linear-gradient(135deg, ${form.accent}, #000)` }}><Camera size={22} /> Banner hochladen (auch GIF)</div>}
                {server.banner && <button type="button" className="ss-banner-remove" onClick={(e) => { e.stopPropagation(); patch({ banner: null }); }}>Entfernen</button>}
              </div>
              <div className="ss-row">
                <IconPicker value={server.icon} crop={server.iconCrop} onChange={(url, crop) => patch({ icon: url, iconCrop: crop })} label="Icon" size={96} />
                <div className="flex-1">
                  <Field label="Servername"><input className="input" value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                  {server.icon && <button type="button" className="link-btn" onClick={() => patch({ icon: null })}>Icon entfernen</button>}
                </div>
              </div>
              <Field label="Beschreibung" hint="Wird in der Server-Entdeckung und bei Einladungen angezeigt.">
                <textarea className="input" rows={3} maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Worum geht es auf deinem Server?" />
              </Field>
              <Field label="Akzentfarbe">
                <div className="color-row">
                  <input type="color" value={form.accent} onChange={(e) => setForm({ ...form, accent: e.target.value })} />
                  <span className="muted">{form.accent}</span>
                </div>
              </Field>
              <Switch checked={form.isPublic} onChange={(v) => setForm({ ...form, isPublic: v })} label={<><Globe size={15} /> Öffentlich in „Entdecken“</>} desc="Jeder kann deinen Server finden und beitreten." />
              {dirty && (
                <div className="save-bar">
                  <span>Achtung – du hast ungespeicherte Änderungen!</span>
                  <button type="button" className="btn ghost sm" onClick={() => setForm({ name: server.name, description: server.description, accent: server.accent || '#7c5cff', isPublic: server.isPublic })}>Zurücksetzen</button>
                  <button type="button" className="btn success sm" onClick={save}>Speichern</button>
                </div>
              )}
              {role === 'owner' && (
                <div className="danger-zone">
                  <div><b>Server löschen</b><p className="muted">Alle Kanäle und Nachrichten werden dauerhaft gelöscht.</p></div>
                  <button type="button" className="btn danger" onClick={() => useStore.setState({ modal: { type: 'confirm', props: { title: `${server.name} löschen?`, text: 'Das kann nicht rückgängig gemacht werden. Alle Nachrichten gehen verloren.', confirm: 'Server löschen', danger: true, onConfirm: () => run(() => api(`/servers/${serverId}`, { method: 'DELETE' }), 'Server gelöscht') } } })}>Server löschen</button>
                </div>
              )}
            </>
          )}
          {tab === 'channels' && (
            <div className="ss-channels">
              {list.map((c, i) => (
                <div key={c.id} className="ss-channel">
                  {c.type === 'voice' ? <Volume2 size={16} /> : <Hash size={16} />}
                  <span className="flex-1">{c.name} {c.category && <span className="muted">· {c.category}</span>}</span>
                  <button type="button" className="icon-btn xs" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Nach oben"><ArrowUp size={15} /></button>
                  <button type="button" className="icon-btn xs" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="Nach unten"><ArrowDown size={15} /></button>
                  <button type="button" className="btn ghost sm" onClick={() => useStore.setState({ modal: { type: 'channel', props: { serverId, channelId: c.id } } })}>Bearbeiten</button>
                </div>
              ))}
              <button type="button" className="btn secondary" onClick={() => useStore.setState({ modal: { type: 'channel', props: { serverId } } })}>+ Kanal erstellen</button>
            </div>
          )}
          {tab === 'helpers' && <HelpersSettings serverId={serverId} />}
          {tab === 'members' && (
            <div className="ss-members">
              <div className="invite-search"><Search size={16} /><input value={memberTerm} onChange={(e) => setMemberTerm(e.target.value)} placeholder="Mitglieder durchsuchen" /></div>
              {members.map((m) => (
                <div key={m.userId} className="ss-member" onContextMenu={(e) => memberMenu(e, serverId, m.userId)}>
                  <Avatar userId={m.userId} size={32} />
                  <div className="flex-1"><NameTag userId={m.userId} serverId={serverId} /> <span className="muted">@{users[m.userId]?.username}</span></div>
                  {m.role === 'owner' && <span className="role-pill owner"><Crown size={12} /> Besitzer</span>}
                  {m.role === 'admin' && <span className="role-pill admin"><Shield size={12} /> Admin</span>}
                  {(m.roles || []).slice(0, 3).map((rid) => server.roles?.[rid] && <span key={rid} className="role-pill" style={{ '--rc': server.roles[rid].color || '#99aab5' }}><i className="rp-dot" />{server.roles[rid].name}</span>)}
                  <button type="button" className="btn ghost sm" onClick={(e) => memberMenu(e, serverId, m.userId)}>Verwalten</button>
                </div>
              ))}
            </div>
          )}
          {tab === 'roles' && <RolesSettings serverId={serverId} />}
          {tab === 'tag' && <TagSettings serverId={serverId} />}
          {tab === 'invites' && (
            <div>
              <Field label="Einladungslink" hint="Jeder mit diesem Link kann dem Server beitreten.">
                <div className="copy-field">
                  <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
                  <button type="button" className="btn primary" onClick={() => { copyText(link); toast('Link kopiert!', 'success'); }}><LinkIcon size={16} /> Kopieren</button>
                </div>
              </Field>
              <button type="button" className="btn secondary" onClick={() => run(() => api(`/servers/${serverId}/invite`, { method: 'POST' }), 'Neuer Link erstellt – der alte ist ungültig').catch(() => {})}><RefreshCw size={16} /> Neuen Link erstellen</button>
            </div>
          )}
        </div>
      </div>
      {bannerFile && <ImageCropper file={bannerFile} aspect={2.5} shape="rect" title="Serverbanner anpassen" onCancel={() => setBannerFile(null)} onDone={({ url, crop }) => { setBannerFile(null); patch({ banner: url, bannerCrop: crop }); }} />}
    </Modal>
  );
}

export function ModalHost() {
  const modal = useStore((s) => s.modal);
  if (!modal) return null;
  const p = modal.props || {};
  switch (modal.type) {
    case 'confirm': return <ConfirmModal {...p} />;
    case 'createServer': return <CreateServerModal />;
    case 'invite': return <InviteModal {...p} />;
    case 'joinInvite': return <JoinInviteModal {...p} />;
    case 'channel': return <ChannelModal key={p.channelId || 'new'} {...p} />;
    case 'nickname': return <NicknameModal {...p} />;
    case 'customStatus': return <CustomStatusModal />;
    case 'newDm': return <NewDmModal />;
    case 'serverSettings': return <ServerSettingsModal {...p} />;
    case 'memberRoles': return <MemberRolesModal {...p} />;
    case 'storyComposer': return <StoryComposer {...p} />;
    case 'aiAssist': return <AiAssist key={p.messageId || 'composer'} {...p} />;
    case 'aiSummary': return <AiSummary {...p} />;
    case 'poll': return <PollModal {...p} />;
    case 'giveaway': return <GiveawayModal {...p} />;
    case 'schedule': return <ScheduleModal {...p} />;
    case 'scheduledList': return <ScheduledListModal />;
    case 'leaderboard': return <LeaderboardModal {...p} />;
    default: return socialModal(modal);
  }
}
