import { useEffect, useState } from 'react';
import { Sparkles, KeyRound, Bot, Copy, ExternalLink, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useStore, toast } from '../../lib/store.js';
import { refreshAiStatus } from '../../lib/ai.js';
import { copyText, cx } from '../../lib/format.js';
import { Section, Switch, Field, Spinner } from '../ui.jsx';

/** Nur für den Owner: KI-Schlüssel, Modell, Tageslimit und Discord-Zugangsdaten. */
export function AdminSettings() {
  const [d, setD] = useState(null);
  const [key, setKey] = useState('');
  const [discord, setDiscord] = useState({ clientId: '', clientSecret: '', botToken: '' });
  const [busy, setBusy] = useState('');
  const [test, setTest] = useState(null);

  useEffect(() => {
    api('/admin/settings').then((r) => {
      setD(r);
      setDiscord({ clientId: r.discord.clientId || '', clientSecret: '', botToken: '' });
    }).catch((e) => toast(e.message, 'error'));
  }, []);

  const save = async (body, what) => {
    setBusy(what);
    try {
      const r = await api('/admin/settings', { method: 'PATCH', body });
      setD(r);
      refreshAiStatus();
      useStore.setState({ discordLogin: !!(r.discord.clientId && r.discord.hasSecret) });
      toast('Gespeichert ✅', 'success');
      return true;
    } catch (e) {
      toast(e.message, 'error');
      return false;
    } finally {
      setBusy('');
    }
  };

  const runTest = async () => {
    setBusy('test');
    setTest(null);
    try {
      setTest(await api('/admin/ai/test', { method: 'POST' }));
    } catch (e) {
      setTest({ ok: false, text: e.message });
    } finally {
      setBusy('');
    }
  };

  if (!d) return <div className="center-pad"><Spinner size={22} /></div>;
  const model = d.ai.models.find((m) => m.id === d.ai.model);

  return (
    <>
      <div className="admin-hero">
        <span className="admin-crown">👑</span>
        <div>
          <h2>Zync-Verwaltung</h2>
          <p>Nur du als Owner siehst diese Seite. Schlüssel werden nie an andere Nutzer geschickt.</p>
        </div>
      </div>

      <Section title={<><Sparkles size={16} /> Zync KI (Claude)</>} desc="Die KI nutzt Claude von Anthropic. Jede Antwort kostet dort ein bisschen Guthaben – deshalb gibt es ein Tageslimit pro Person (für dich gilt keins).">
        <div className={cx('admin-status', d.ai.hasKey ? 'ok' : 'off')}>
          {d.ai.hasKey ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {d.ai.hasKey ? <>Schlüssel gespeichert ({d.ai.keyHint}){d.ai.keyFromEnv && ' – aus der Umgebungsvariable'}</> : 'Noch kein Schlüssel eingetragen'}
        </div>
        {!d.ai.keyFromEnv && (
          <Field label="Anthropic API-Schlüssel" hint="Auf console.anthropic.com → API Keys → „Create Key“. Beginnt mit sk-ant-.">
            <div className="admin-row">
              <input className="input" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={d.ai.hasKey ? 'Neuen Schlüssel eintragen …' : 'sk-ant-…'} />
              <button type="button" className="btn primary" disabled={!key.trim() || busy === 'key'} onClick={async () => { if (await save({ ai: { key: key.trim() } }, 'key')) setKey(''); }}>
                {busy === 'key' ? <Spinner size={14} /> : <KeyRound size={15} />} Speichern
              </button>
            </div>
            <a className="admin-link" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer"><ExternalLink size={13} /> Schlüssel bei Anthropic erstellen</a>
          </Field>
        )}
        <Field label="Modell">
          <div className="admin-models">
            {d.ai.models.map((m) => (
              <button key={m.id} type="button" className={cx('admin-model', d.ai.model === m.id && 'active')} onClick={() => save({ ai: { model: m.id } }, 'model')}>
                <b>{m.label}</b>
                <small>{m.note}</small>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Fragen pro Person und Tag" hint="0 = unbegrenzt (Vorsicht: dann können andere dein Guthaben aufbrauchen).">
          <div className="admin-row">
            <input className="input admin-num" type="number" min={0} max={10000} defaultValue={d.ai.limit} onBlur={(e) => Number(e.target.value) !== d.ai.limit && save({ ai: { limit: Number(e.target.value) } }, 'limit')} />
          </div>
        </Field>
        <Switch checked={d.ai.enabled} onChange={(v) => save({ ai: { enabled: v } }, 'enabled')} label="KI für alle aktiv" desc="Aus = niemand kann die KI nutzen, der Schlüssel bleibt gespeichert." />
        <div className="admin-row">
          <button type="button" className="btn secondary" disabled={!d.ai.hasKey || busy === 'test'} onClick={runTest}>
            {busy === 'test' ? <Spinner size={14} /> : <Sparkles size={15} />} Verbindung testen ({model?.label || d.ai.model})
          </button>
        </div>
        {test && <div className={cx('admin-test', test.ok ? 'ok' : 'bad')}>{test.ok ? '✅ ' : '⚠️ '}{test.text}</div>}
      </Section>

      <Section title={<><Bot size={16} /> Discord</>} desc="Für „Mit Discord anmelden“ und die Discord-Brücke. Alles optional.">
        <ol className="admin-steps">
          <li>Auf <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">discord.com/developers</a> → „New Application“ (Name z. B. Zync).</li>
          <li>Unter <b>OAuth2</b>: Client ID und Client Secret kopieren und diese Redirect-URL eintragen:
            <button type="button" className="admin-copy" onClick={() => { copyText(d.discord.redirectUri); toast('Kopiert!', 'success'); }}><code>{d.discord.redirectUri}</code> <Copy size={13} /></button>
          </li>
          <li>Nur für die Brücke: unter <b>Bot</b> „Reset Token“ → Token kopieren und <b>Message Content Intent</b> einschalten.</li>
        </ol>
        <Field label="Client ID">
          <input className="input" value={discord.clientId} onChange={(e) => setDiscord({ ...discord, clientId: e.target.value.trim() })} placeholder="z. B. 123456789012345678" />
        </Field>
        <Field label={`Client Secret${d.discord.hasSecret ? ' (gespeichert)' : ''}`}>
          <input className="input" type="password" autoComplete="off" value={discord.clientSecret} disabled={d.discord.secretFromEnv} onChange={(e) => setDiscord({ ...discord, clientSecret: e.target.value })} placeholder={d.discord.hasSecret ? '•••••• (neu eintragen zum Ändern)' : ''} />
        </Field>
        <Field label={`Bot-Token für die Brücke${d.discord.hasBotToken ? ' (gespeichert)' : ''}`}>
          <input className="input" type="password" autoComplete="off" value={discord.botToken} disabled={d.discord.botFromEnv} onChange={(e) => setDiscord({ ...discord, botToken: e.target.value })} placeholder={d.discord.hasBotToken ? '•••••• (neu eintragen zum Ändern)' : 'optional'} />
        </Field>
        <div className="admin-row">
          <button
            type="button"
            className="btn primary"
            disabled={busy === 'discord'}
            onClick={() => save({
              discord: {
                clientId: discord.clientId,
                ...(discord.clientSecret ? { clientSecret: discord.clientSecret } : {}),
                ...(discord.botToken ? { botToken: discord.botToken } : {}),
              },
            }, 'discord').then((ok) => ok && setDiscord((x) => ({ ...x, clientSecret: '', botToken: '' })))}
          >
            {busy === 'discord' ? <Spinner size={14} /> : null} Discord speichern
          </button>
          {d.discord.botInvite && d.discord.hasBotToken && (
            <a className="btn secondary" href={d.discord.botInvite} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Bot in Discord-Server einladen</a>
          )}
        </div>
      </Section>
    </>
  );
}
