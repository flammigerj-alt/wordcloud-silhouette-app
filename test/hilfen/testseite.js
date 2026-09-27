/**
 * Nachgebaute Betrugsseite für die Tests der Tiefenprüfung - mit echtem Video,
 * Untertiteln, Cookie-Banner und Impressum. Läuft nur auf 127.0.0.1.
 */
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Ein kurzes Video aufnehmen, in dem nacheinander drei Botschaften stehen. */
export async function nimmVideoAuf(chromium) {
  const ordner = mkdtempSync(join(tmpdir(), 'mail-befund-video-'));
  const browser = await chromium.launch();
  try {
    const kontext = await browser.newContext({ viewport: { width: 640, height: 360 }, recordVideo: { dir: ordner, size: { width: 640, height: 360 } } });
    const seite = await kontext.newPage();
    for (const [farbe, text] of [['#1a5', 'MIT KI REICH'], ['#c30', '5% RENDITE TÄGLICH'], ['#036', 'JETZT 250 € EINZAHLEN']]) {
      await seite.setContent(`<body style="margin:0;background:${farbe};color:#fff;font:bold 48px sans-serif;display:grid;place-items:center;height:100vh">${text}</body>`);
      await seite.waitForTimeout(1200);
    }
    await kontext.close();
    const datei = readdirSync(ordner).find((n) => n.endsWith('.webm'));
    return readFileSync(join(ordner, datei));
  } finally {
    await browser.close();
    rmSync(ordner, { recursive: true, force: true });
  }
}

const STARTSEITE = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>RenditeTurbo – Ihr KI-Vermögen</title></head>
<body style="font-family:sans-serif;max-width:900px;margin:auto">
<div id="banner" style="position:fixed;bottom:0;left:0;right:0;background:#222;color:#fff;padding:20px">
  Wir verwenden Cookies. <button onclick="document.getElementById('banner').remove();document.getElementById('inhalt').style.display='block'">Alle akzeptieren</button>
</div>
<div id="inhalt" style="display:none">
<h1>Mit KI zur finanziellen Freiheit</h1>
<p>Unsere KI handelt für Sie – garantierte Rendite von 5 % täglich, völlig risikofrei.</p>
<video id="v" width="640" height="360" controls preload="auto" src="/video.webm">
  <track kind="subtitles" srclang="de" src="/untertitel.vtt" default>
</video>
<div style="height:1400px"></div>
<form action="/konto"><input name="email" placeholder="E-Mail"><input type="password" name="pw"><input name="telefon" placeholder="Telefon"><button>Jetzt starten</button></form>
<p><a href="/impressum">Impressum</a> · <a href="/agb">AGB</a> · <a href="https://t.me/renditeturbo">Telegram</a></p>
</div>
<script>/* Inhalt erst nach dem Banner sichtbar - wie auf vielen echten Seiten. */</script>
</body></html>`;

const IMPRESSUM = `<!doctype html><html><head><meta charset="utf-8"><title>Impressum</title></head><body>
<h1>Impressum</h1><p>RenditeTurbo Ltd., Suite 305, Griffith Corporate Centre, Kingstown, St. Vincent und die Grenadinen. Kontakt nur per E-Mail.</p></body></html>`;

const UNTERTITEL = `WEBVTT

00:00.000 --> 00:01.200
Ich bin reich geworden mit dieser KI.

00:01.200 --> 00:02.400
Fünf Prozent Rendite jeden Tag, garantiert.
`;

export async function starteTestseite(video) {
  const routen = {
    '/': ['text/html; charset=utf-8', STARTSEITE],
    '/impressum': ['text/html; charset=utf-8', IMPRESSUM],
    '/agb': ['text/html; charset=utf-8', '<!doctype html><title>AGB</title><p>Auszahlungen erst nach Zahlung einer Bearbeitungsgebühr von 15 %.</p>'],
    '/untertitel.vtt': ['text/vtt; charset=utf-8', UNTERTITEL],
    '/video.webm': ['video/webm', video],
    '/weiter': null,
  };
  const server = createServer((anfrage, antwort) => {
    const pfad = anfrage.url.split('?')[0];
    if (pfad === '/weiter') {
      antwort.writeHead(302, { location: '/' });
      antwort.end();
      return;
    }
    const route = routen[pfad];
    if (!route) {
      antwort.writeHead(404);
      antwort.end();
      return;
    }
    antwort.writeHead(200, { 'content-type': route[0], 'accept-ranges': 'none' });
    antwort.end(route[1]);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, basis: `http://127.0.0.1:${server.address().port}` };
}
