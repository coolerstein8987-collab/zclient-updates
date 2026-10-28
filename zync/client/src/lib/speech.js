// Sprache ↔ Text: Browser-Spracherkennung (Chrome, Edge, Safari) bzw. die Plugins der Android-App.
const nativeStt = () => window.Capacitor?.Plugins?.SpeechRecognition;
const nativeTts = () => window.Capacitor?.Plugins?.TextToSpeech;
const WebRec = () => window.SpeechRecognition || window.webkitSpeechRecognition;

export const sttSupported = () => !!(WebRec() || nativeStt());
export const ttsSupported = () => !!(nativeTts() || window.speechSynthesis);

/**
 * Spracherkennung starten. `onText(final, interim)` liefert den erkannten Text.
 * `continuous` hört weiter zu, bis stop() kommt; sonst endet sie nach einer Pause.
 */
export function listen({ lang = 'de-DE', continuous = false, onText, onEnd, onError } = {}) {
  const Rec = WebRec();
  if (Rec) {
    const rec = new Rec();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = continuous;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += `${finalText ? ' ' : ''}${r[0].transcript.trim()}`;
        else interim += r[0].transcript;
      }
      onText?.(finalText, interim.trim());
    };
    rec.onerror = (e) => { if (e.error !== 'aborted' && e.error !== 'no-speech') onError?.(e.error); };
    rec.onend = () => onEnd?.(finalText);
    try { rec.start(); } catch (e) { onError?.(e.message); }
    return { stop: () => { try { rec.stop(); } catch { /* schon aus */ } }, abort: () => { try { rec.abort(); } catch { /* schon aus */ } } };
  }
  const plugin = nativeStt();
  if (plugin) {
    let finalText = '';
    let stopped = false;
    const handles = [];
    const finish = () => {
      if (stopped) return;
      stopped = true;
      handles.forEach((h) => h.remove?.());
      onText?.(finalText, '');
      onEnd?.(finalText);
    };
    (async () => {
      try {
        const perm = await plugin.requestPermissions?.();
        if (perm?.speechRecognition && perm.speechRecognition !== 'granted') throw new Error('Mikrofon nicht erlaubt');
        handles.push(await plugin.addListener('partialResults', (d) => {
          finalText = d.matches?.[0] || finalText;
          onText?.('', finalText);
        }));
        handles.push(await plugin.addListener('listeningState', (d) => { if (d.status === 'stopped') finish(); }));
        await plugin.start({ language: lang, maxResults: 1, partialResults: true, popup: false });
      } catch (e) {
        onError?.(e.message);
        finish();
      }
    })();
    const stop = () => {
      plugin.stop?.().catch(() => {});
      finish();
    };
    return { stop, abort: stop };
  }
  onError?.('Dein Gerät kann hier keine Sprache erkennen – probier Chrome oder die Zync-App.');
  return { stop() {}, abort() {} };
}

let speaking = null;

/** Text vorlesen; das Promise erfüllt sich, wenn fertig gesprochen wurde. */
export function speak(text, { lang = 'de-DE', rate = 1.05 } = {}) {
  const clean = text.replace(/[*_`#>~|]/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/\p{Extended_Pictographic}/gu, '').trim();
  if (!clean) return Promise.resolve();
  const plugin = nativeTts();
  if (plugin) return plugin.speak({ text: clean, lang, rate, pitch: 1, volume: 1 }).catch(() => {});
  const synth = window.speechSynthesis;
  if (!synth) return Promise.resolve();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = lang;
    u.rate = rate;
    const voice = synth.getVoices().find((v) => v.lang?.startsWith(lang.slice(0, 2)) && /google|natural|neural|anna|markus|helena/i.test(v.name))
      || synth.getVoices().find((v) => v.lang?.startsWith(lang.slice(0, 2)));
    if (voice) u.voice = voice;
    u.onend = resolve;
    u.onerror = resolve;
    speaking = u;
    synth.speak(u);
  });
}

export function stopSpeaking() {
  nativeTts()?.stop?.().catch(() => {});
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  speaking = null;
}

export const isSpeaking = () => !!speaking && !!window.speechSynthesis?.speaking;
