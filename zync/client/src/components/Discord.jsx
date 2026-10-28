import { useEffect, useState } from 'react';
import { Link2, Unlink, Gamepad2 } from 'lucide-react';
import { api, setToken } from '../lib/api.js';
import { useStore, toast, bootstrap } from '../lib/store.js';
import { cx } from '../lib/format.js';
import { Section, Field, Spinner } from './ui.jsx';
import { NameTag } from './Avatar.jsx';

/** Kommt der Browser gerade von Discord zurück? (#discord=CODE / #discord-error=…) */
export async function handleDiscordReturn() {
  const hash = location.hash.slice(1);
  if (!hash.startsWith('discord')) return;
  history.replaceState(null, '', location.pathname + location.search);
  const params = new URLSearchParams(hash);
  if (params.get('discord-error')) {
    toast(params.get('discord-error'), 'error', 7000);
    return;
  }
  const code = params.get('discord');
  if (code === 'linked') {
    toast('Discord ist jetzt mit deinem Zync-Account verbunden ✅', 'success');
    return;
  }
  try {
    const { token } = await api('/auth/discord/finish', { method: 'POST', body: { code } });
    setToken(token);
    useStore.setState({ token });
    await bootstrap();
  } catch (e) {
    toast(e.message, 'error');
  }
}

export function DiscordLoginButton() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    api('/auth/config').then((c) => setReady(!!c.discordLogin)).catch(() => {});
  }, []);
  if (!ready) return null;
  return (
    <>
      <div className="auth-or"><span>oder</span></div>
      <a className="btn discord-btn lg block" href="/api/auth/discord/start">
        <Gamepad2 size={20} /> Mit Discord anmelden
      </a>
      <p className="auth-discord-hint">Dein Discord-Account bleibt deiner – Zync übernimmt nur Name und Bild. Danach kannst du alles hier ändern.</p>
    </>
  );
}

export function DiscordAccountSection() {
  const me = useStore((s) => s.me);
  const available = useStore((s) => s.discordLogin);
  const [busy, setBusy] = useState(false);
  if (!available && !me.discordLinked) return null;
  const link = async () => {
    setBusy(true);
    try {
      const { url } = await api('/discord/link', { method: 'POST' });
      location.href = url;
    } catch (e) {
      toast(e.message, 'error');
      setBusy(false);
    }
  };
  const unlink = async () => {
    try {
      await api('/discord/link', { method: 'DELETE' });
      toast('Discord getrennt', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  return (
    <Section title="Discord" desc="Mit verbundenem Discord kannst du dich auch über Discord anmelden. Dein Zync-Profil bleibt unabhängig – Änderungen hier landen nicht auf Discord.">
      {me.discordLinked ? (
        <div className="discord-linked">
          <span className="discord-badge"><Gamepad2 size={16} /> Verbunden</span>
          <button type="button" className="btn secondary sm" onClick={unlink} disabled={!me.hasPassword} data-tip={!me.hasPassword ? 'Lege zuerst ein Passwort fest' : undefined}><Unlink size={14} /> Trennen</button>
        </div>
      ) : (
        <button type="button" className="btn discord-btn" onClick={link} disabled={busy}>{busy ? <Spinner size={16} /> : <Link2 size={16} />} Mit Discord verbinden</button>
      )}
    </Section>
  );
}

/** Kanal-Einstellungen: Zync-Kanal mit einem Discord-Kanal verbinden (freiwillig). */
export function DiscordBridgeSection({ channel }) {
  const available = useStore((s) => s.discordBridge);
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  if (!channel || channel.type !== 'text' || !channel.serverId || (!available && !channel.bridge)) return null;
  const connect = async () => {
    setBusy(true);
    try {
      const r = await api(`/channels/${channel.id}/bridge`, { method: 'PUT', body: { discordChannelId: id.trim() } });
      toast(`Mit Discord ${r.name} verbunden 🔗`, 'success');
      setId('');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const disconnect = () => api(`/channels/${channel.id}/bridge`, { method: 'DELETE' }).then(() => toast('Brücke getrennt', 'success')).catch((e) => toast(e.message, 'error'));
  return (
    <div className="bridge-box">
      <div className="bridge-head"><Gamepad2 size={16} /> <b>Discord-Brücke</b> <span className="muted">freiwillig</span></div>
      {channel.bridge ? (
        <div className="discord-linked">
          <span className="discord-badge"><Link2 size={14} /> {channel.bridge.name || 'Discord-Kanal'}</span>
          <span className="muted">Nachrichten werden in beide Richtungen gespiegelt.</span>
          <button type="button" className="btn secondary sm" onClick={disconnect}><Unlink size={14} /> Trennen</button>
        </div>
      ) : (
        <>
          <p className="muted bridge-hint">Spiegelt diesen Kanal mit einem Discord-Kanal – deine Freunde auf Discord schreiben mit, ohne Zync zu haben. In Discord: Einstellungen → Erweitert → Entwicklermodus an, dann Rechtsklick auf den Kanal → „Kanal-ID kopieren“.</p>
          <Field label="Discord-Kanal-ID">
            <div className="admin-row">
              <input className="input" value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, ''))} placeholder="z. B. 123456789012345678" inputMode="numeric" />
              <button type="button" className="btn discord-btn" onClick={connect} disabled={busy || id.length < 15}>{busy ? <Spinner size={14} /> : <Link2 size={14} />} Verbinden</button>
            </div>
          </Field>
        </>
      )}
    </div>
  );
}

/** Systemnachricht „X hat den Kanal mit Discord verbunden/getrennt“. */
export function BridgeNote({ msg, serverId }) {
  return (
    <div className="msg system" data-id={msg.id}>
      <span className={cx('sys-icon', 'bridge-ico')}><Gamepad2 size={15} /></span>
      <span>
        <NameTag userId={msg.authorId} serverId={serverId} />{' '}
        {msg.meta?.on ? <>hat diesen Kanal mit Discord <b>{msg.meta.name}</b> verbunden – Nachrichten werden jetzt gespiegelt.</> : 'hat die Verbindung zu Discord getrennt.'}
      </span>
    </div>
  );
}
