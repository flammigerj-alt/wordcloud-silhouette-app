/**
 * Eine Webseite mit einem echten Browser erkunden - für die Tiefenprüfung.
 *
 * Anders als der einfache Abruf (src/abruf.js) führt das hier JavaScript aus,
 * scrollt die Seite durch, schließt Cookie-Banner, besucht Unterseiten wie
 * Impressum und AGB, macht Bildschirmfotos und zieht aus Videos Einzelbilder.
 * Formulare werden nie ausgefüllt, nichts wird heruntergeladen.
 *
 * Braucht die optionale Abhängigkeit "playwright" samt Chromium:
 *   npm install && npx playwright install chromium
 */
import { isIP } from 'node:net';
import { zerlegeAdresse } from './rules/website.js';
import { BROWSER_KENNUNG, istPrivateIp, pruefeZiel } from './abruf.js';

const STANDARD = {
  zeitlimitMs: 30000,
  maxUnterseiten: 4,
  maxBildschirmfotos: 6,
  maxVideos: 3,
  bilderProVideo: 8,
  maxTextZeichen: 60000,
  maxUnterseitenText: 20000,
  erlaubePrivat: false,
};

/** Unterseiten, auf denen steht, wer hinter einem Angebot steckt und was es kostet. */
const UNTERSEITEN = /impressum|imprint|legal|kontakt|contact|agb|terms|bedingungen|about|über uns|ueber-uns|uber-uns|wer wir sind|faq|so funktioniert|how it works|team|datenschutz|privacy|risiko|risk/i;

const ANBIETER = [
  ['YouTube', /youtube(?:-nocookie)?\.com|youtu\.be/i],
  ['Vimeo', /vimeo\.com/i],
  ['Wistia', /wistia\.(?:com|net)/i],
  ['Dailymotion', /dailymotion\.com/i],
  ['Vidyard', /vidyard\.com/i],
  ['Loom', /loom\.com/i],
  ['JW Player', /jwplayer|jwplatform/i],
  ['TikTok', /tiktok\.com/i],
  ['Facebook', /facebook\.com\/plugins\/video/i],
];

async function ladePlaywright() {
  try {
    return await import('playwright');
  } catch {
    throw new Error('Für die Tiefenprüfung fehlt Playwright. Einmalig ausführen: npm install && npx playwright install chromium');
  }
}

/** Unterressourcen ins eigene Netz sperren - ohne jede einzelne per DNS aufzulösen. */
function istOffensichtlichPrivat(host) {
  const h = String(host).replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  return isIP(h) ? istPrivateIp(h) : false;
}

function youtubeId(src) {
  const m = String(src).match(/(?:embed\/|watch\?v=|youtu\.be\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : '';
}

const alsBild = (puffer) => puffer.toString('base64');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function warteRuhig(seite, ms = 6000) {
  await seite.waitForLoadState('networkidle', { timeout: ms }).catch(() => {});
}

/** Cookie-Banner wegklicken: Viele Seiten zeigen den Inhalt erst danach. */
async function schliesseBanner(seite) {
  const muster = /^\s*(alle\s+)?(akzeptieren|zustimmen|annehmen|einverstanden|verstanden|accept( all)?|agree|allow all|ok|got it)\s*$/i;
  for (const knopf of await seite.getByRole('button').all()) {
    const text = await knopf.innerText({ timeout: 500 }).catch(() => '');
    if (muster.test(text) && await knopf.isVisible().catch(() => false)) {
      await knopf.click({ timeout: 2000 }).catch(() => {});
      await seite.waitForTimeout(500);
      return text.trim();
    }
  }
  return '';
}

/** Langsam nach unten scrollen, damit nachgeladene Abschnitte erscheinen. */
async function scrolleDurch(seite) {
  for (let i = 0; i < 20; i++) {
    const amEnde = await seite.evaluate(() => {
      window.scrollBy(0, window.innerHeight * 0.9);
      return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 5;
    });
    await seite.waitForTimeout(350);
    if (amEnde) break;
  }
  await seite.evaluate(() => window.scrollTo(0, 0));
  await seite.waitForTimeout(300);
}

async function bildschirmfotos(seite, anzahl) {
  const hoehe = await seite.evaluate(() => document.documentElement.scrollHeight);
  const fenster = seite.viewportSize()?.height || 800;
  const positionen = [];
  for (let y = 0; y < hoehe && positionen.length < anzahl; y += fenster) positionen.push(y);
  // Bei sehr langen Seiten gleichmäßig verteilen statt nur den Anfang zu zeigen.
  if (hoehe > fenster * anzahl && anzahl > 1) {
    positionen.length = 0;
    for (let i = 0; i < anzahl; i++) positionen.push(Math.round(((hoehe - fenster) * i) / (anzahl - 1)));
  }
  const fotos = [];
  for (const y of positionen) {
    await seite.evaluate((pos) => window.scrollTo(0, pos), y);
    await seite.waitForTimeout(250);
    fotos.push({ position: y, gesamthoehe: hoehe, jpeg: alsBild(await seite.screenshot({ type: 'jpeg', quality: 60 })) });
  }
  await seite.evaluate(() => window.scrollTo(0, 0));
  return fotos;
}

async function sammleSeitendaten(seite, maxText) {
  return seite.evaluate((max) => {
    const text = (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
    const links = [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.href, text: (a.innerText || a.title || '').trim().slice(0, 80) }));
    const formulare = [...document.querySelectorAll('form, [role="form"]')].map((f) => ({
      ziel: f.getAttribute('action') || '',
      felder: [...f.querySelectorAll('input, select, textarea')]
        .filter((e) => e.type !== 'hidden')
        .map((e) => [e.type || e.tagName.toLowerCase(), e.name || e.id || '', e.placeholder || ''].filter(Boolean).join(' ')),
    }));
    // Auch lose Eingabefelder außerhalb eines <form> zählen - Single-Page-Apps verzichten oft darauf.
    const lose = [...document.querySelectorAll('input:not(form input)')].filter((e) => e.type !== 'hidden')
      .map((e) => [e.type, e.name || e.id || '', e.placeholder || ''].filter(Boolean).join(' '));
    if (lose.length) formulare.push({ ziel: '(ohne Formular)', felder: lose });
    return {
      titel: document.title,
      text: text.slice(0, max),
      textGekuerzt: text.length > max,
      textLaenge: text.length,
      links,
      formulare,
      skripte: document.scripts.length,
    };
  }, maxText);
}

/** Einzelbilder aus einem <video>: Zeitpunkte ansteuern und das Element fotografieren. */
async function bilderAusVideo(element, anzahl) {
  const info = await element.evaluate(async (v) => {
    v.muted = true;
    v.preload = 'auto';
    if (!(v.readyState >= 1)) {
      try { v.load(); } catch { /* manche Player verbieten das */ }
      await new Promise((r) => {
        const fertig = () => r();
        v.addEventListener('loadedmetadata', fertig, { once: true });
        setTimeout(fertig, 8000);
      });
    }
    const spuren = [...v.querySelectorAll('track')].map((t) => ({ src: t.src, sprache: t.srclang, art: t.kind }));
    return {
      src: v.currentSrc || v.src || (v.querySelector('source')?.src ?? ''),
      poster: v.poster || '',
      dauer: Number.isFinite(v.duration) ? v.duration : null,
      breite: v.videoWidth, hoehe: v.videoHeight,
      spuren,
    };
  });

  const bilder = [];
  await element.scrollIntoViewIfNeeded().catch(() => {});
  // Bedienleiste ausblenden, damit sie nicht über dem Bild liegt; Untertitel bleiben sichtbar.
  const hatteBedienung = await element.evaluate((v) => { const b = v.controls; v.controls = false; return b; });
  const foto = async (zeit) => {
    const puffer = await element.screenshot({ type: 'jpeg', quality: 70, timeout: 5000 }).catch(() => null);
    if (puffer) bilder.push({ zeit, jpeg: alsBild(puffer) });
  };

  // Erst gezielt springen. Das geht nur, wenn Server und Datei es erlauben -
  // deshalb prüfen, ob die Stelle wirklich erreicht wurde.
  let springenGeht = false;
  if (info.dauer && info.dauer > 0) {
    for (let i = 0; i < anzahl; i++) {
      const zeit = (info.dauer * (i + 0.5)) / anzahl;
      const erreicht = await element.evaluate((v, t) => new Promise((r) => {
        const fertig = () => r(v.currentTime);
        v.addEventListener('seeked', fertig, { once: true });
        setTimeout(fertig, 4000);
        v.currentTime = t;
      }), zeit);
      if (Math.abs(erreicht - zeit) > Math.max(0.5, info.dauer / anzahl / 2)) break;
      springenGeht = true;
      await pause(150);
      await foto(zeit);
    }
  }

  if (!springenGeht || bilder.length < Math.ceil(anzahl / 2)) {
    // Ausweichweg: stumm abspielen und in Abständen fotografieren. Lange Videos
    // schneller abspielen, damit die Prüfung nicht minutenlang dauert.
    bilder.length = 0;
    const laenge = info.dauer && info.dauer > 0 ? info.dauer : 12;
    const tempo = Math.min(16, Math.max(1, laenge / 30));
    const abstandMs = Math.max(250, ((laenge / tempo) * 1000) / anzahl);
    await element.evaluate((v, t) => { v.currentTime = 0; v.playbackRate = t; return v.play().catch(() => {}); }, tempo);
    for (let i = 0; i < anzahl; i++) {
      await pause(abstandMs);
      const zeit = await element.evaluate((v) => v.currentTime);
      if (i > 0 && bilder.length && Math.abs(bilder[bilder.length - 1].zeit - zeit) < 0.05) break;
      await foto(zeit);
      if (info.dauer && zeit >= info.dauer - 0.05) break;
    }
    await element.evaluate((v) => v.pause());
  }
  await element.evaluate((v, b) => { v.controls = b; }, hatteBedienung);
  return { ...info, bilder };
}

async function untertitel(kontext, spuren) {
  const texte = [];
  for (const spur of spuren.slice(0, 2)) {
    if (!spur.src) continue;
    const antwort = await kontext.request.get(spur.src, { timeout: 8000 }).catch(() => null);
    if (!antwort?.ok()) continue;
    const roh = await antwort.text();
    const text = roh.split('\n')
      .filter((z) => z.trim() && !/^WEBVTT|-->|^\d+$|^NOTE/.test(z.trim()))
      .join(' ').replace(/<[^>]+>/g, '').slice(0, 8000);
    if (text) texte.push({ sprache: spur.sprache, art: spur.art, text });
  }
  return texte;
}

/** Eingebettete Player: Titel und Vorschaubilder holen, wo der Anbieter sie offen anbietet. */
async function eingebettetesVideo(kontext, rahmen, anbieter, src) {
  const video = { art: 'einbettung', anbieter, src, titel: await rahmen.getAttribute('title').catch(() => '') || '', urheber: '', bilder: [] };
  const puffer = await rahmen.screenshot({ type: 'jpeg', quality: 70, timeout: 5000 }).catch(() => null);
  if (puffer) video.bilder.push({ zeit: null, beschreibung: 'Player auf der Seite', jpeg: alsBild(puffer) });

  const id = anbieter === 'YouTube' ? youtubeId(src) : '';
  if (id) {
    const oembed = await kontext.request.get(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`, { timeout: 8000 }).catch(() => null);
    if (oembed?.ok()) {
      const d = await oembed.json().catch(() => ({}));
      video.titel = d.title || video.titel;
      video.urheber = d.author_name || '';
    }
    // YouTube legt automatisch Standbilder bei etwa 25, 50 und 75 Prozent der Länge an.
    for (const [name, beschreibung] of [['hqdefault', 'Vorschaubild'], ['hq1', 'Standbild bei etwa 25 %'], ['hq2', 'Standbild bei etwa 50 %'], ['hq3', 'Standbild bei etwa 75 %']]) {
      const bild = await kontext.request.get(`https://i.ytimg.com/vi/${id}/${name}.jpg`, { timeout: 8000 }).catch(() => null);
      if (bild?.ok()) video.bilder.push({ zeit: null, beschreibung, jpeg: alsBild(await bild.body()) });
    }
  }
  return video;
}

async function findeVideos(seite, kontext, opt) {
  const videos = [];
  for (const element of (await seite.$$('video')).slice(0, opt.maxVideos)) {
    const v = await bilderAusVideo(element, opt.bilderProVideo).catch((f) => ({ fehler: String(f.message || f), bilder: [] }));
    v.art = 'video';
    v.untertitel = v.spuren?.length ? await untertitel(kontext, v.spuren) : [];
    videos.push(v);
  }
  for (const rahmen of await seite.$$('iframe[src]')) {
    if (videos.length >= opt.maxVideos + 3) break;
    const src = await rahmen.getAttribute('src');
    const treffer = ANBIETER.find(([, muster]) => muster.test(src || ''));
    if (!treffer) continue;
    videos.push(await eingebettetesVideo(kontext, rahmen, treffer[0], new URL(src, seite.url()).toString()));
  }
  return videos;
}

function waehleUnterseiten(links, startUrl, anzahl) {
  const start = new URL(startUrl);
  const gesehen = new Set([start.origin + start.pathname]);
  const auswahl = [];
  for (const link of links) {
    let ziel;
    try { ziel = new URL(link.href); } catch { continue; }
    if (!['http:', 'https:'].includes(ziel.protocol)) continue;
    if (zerlegeAdresse(ziel.href).domain !== zerlegeAdresse(startUrl).domain) continue;
    const schluessel = ziel.origin + ziel.pathname;
    if (gesehen.has(schluessel)) continue;
    if (!UNTERSEITEN.test(`${link.text} ${decodeURIComponent(ziel.pathname)}`)) continue;
    gesehen.add(schluessel);
    auswahl.push({ url: ziel.href, text: link.text });
    if (auswahl.length >= anzahl) break;
  }
  return auswahl;
}

/**
 * Seite erkunden. Wirft nur, wenn Playwright fehlt; alles andere steht im Ergebnis.
 * @returns {Promise<object>} ok, fehler, startUrl, endUrl, kette, seiten[], videos[], externeDomains[], hinweise[]
 */
export async function erkundeSeite(eingabe, optionen = {}) {
  const opt = { ...STANDARD, ...optionen };
  const start = zerlegeAdresse(eingabe);
  const ergebnis = {
    ok: false, fehler: '', startUrl: start.url, endUrl: '', status: 0, kette: [],
    seiten: [], videos: [], externeDomains: [], hinweise: [],
  };
  if (!start.gueltig) {
    ergebnis.fehler = 'Keine gültige Webadresse';
    return ergebnis;
  }
  try {
    await pruefeZiel(start.host, opt.erlaubePrivat);
  } catch (f) {
    ergebnis.fehler = f.message;
    return ergebnis;
  }

  const { chromium } = await ladePlaywright();
  const browser = await chromium.launch(opt.browserOptionen || {});
  try {
    const kontext = await browser.newContext({
      userAgent: BROWSER_KENNUNG,
      locale: 'de-DE',
      timezoneId: 'Europe/Berlin',
      viewport: { width: 1280, height: 800 },
      acceptDownloads: false,
    });
    if (!opt.erlaubePrivat) {
      await kontext.route('**/*', (route) => {
        let host = '';
        try { host = new URL(route.request().url()).hostname; } catch { /* data: und Co. */ }
        return host && istOffensichtlichPrivat(host) ? route.abort() : route.continue();
      });
    }
    const seite = await kontext.newPage();
    seite.on('dialog', (d) => d.dismiss().catch(() => {}));

    const antwort = await seite.goto(start.url, { waitUntil: 'domcontentloaded', timeout: opt.zeitlimitMs });
    await warteRuhig(seite);

    // Weiterleitungskette von hinten nach vorn zusammensetzen.
    const kette = [];
    for (let a = antwort?.request(); a; a = a.redirectedFrom()) {
      const r = await a.response().catch(() => null);
      kette.unshift({ url: a.url(), status: r?.status() ?? 0 });
    }
    ergebnis.kette = kette;
    ergebnis.status = antwort?.status() ?? 0;
    ergebnis.endUrl = seite.url();
    if (ergebnis.endUrl !== kette[kette.length - 1]?.url) {
      // Per JavaScript oder Meta-Refresh weitergeleitet.
      ergebnis.kette.push({ url: ergebnis.endUrl, status: 0, perSkript: true });
    }

    const banner = await schliesseBanner(seite);
    if (banner) ergebnis.hinweise.push(`Cookie-Banner mit "${banner}" geschlossen`);
    await scrolleDurch(seite);
    await warteRuhig(seite, 3000);

    const haupt = await sammleSeitendaten(seite, opt.maxTextZeichen);
    ergebnis.seiten.push({
      url: seite.url(), rolle: 'Startseite', ...haupt,
      fotos: await bildschirmfotos(seite, opt.maxBildschirmfotos),
    });
    ergebnis.videos = await findeVideos(seite, kontext, opt);

    const endDomain = zerlegeAdresse(ergebnis.endUrl).domain;
    ergebnis.externeDomains = [...new Set(haupt.links
      .map((l) => zerlegeAdresse(l.href))
      .filter((a) => a.gueltig && a.domain !== endDomain)
      .map((a) => a.domain))].slice(0, 40);

    for (const unter of waehleUnterseiten(haupt.links, ergebnis.endUrl, opt.maxUnterseiten)) {
      try {
        await seite.goto(unter.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await warteRuhig(seite, 4000);
        const daten = await sammleSeitendaten(seite, opt.maxUnterseitenText);
        const foto = await seite.screenshot({ type: 'jpeg', quality: 60 });
        ergebnis.seiten.push({ url: seite.url(), rolle: unter.text || 'Unterseite', ...daten, links: [], fotos: [{ position: 0, jpeg: alsBild(foto) }] });
      } catch (f) {
        ergebnis.hinweise.push(`Unterseite ${unter.url} nicht erreichbar: ${String(f.message || f).split('\n')[0]}`);
      }
    }
    for (const s of ergebnis.seiten) delete s.links;

    ergebnis.ok = ergebnis.status === 0 || (ergebnis.status >= 200 && ergebnis.status < 400);
    if (!ergebnis.ok) ergebnis.fehler = `Der Server antwortet mit Status ${ergebnis.status}`;
  } catch (f) {
    ergebnis.fehler = String(f.message || f).split('\n')[0];
  } finally {
    await browser.close();
  }
  return ergebnis;
}
