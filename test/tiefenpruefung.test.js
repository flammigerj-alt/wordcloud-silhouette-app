import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { baueAnfrage, kiUrteil, STANDARD_MODELL } from '../src/ki-urteil.js';
import { analysiereAdresse } from '../src/analyzer.js';

const PIXEL = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

function erkundung(ueberschreiben = {}) {
  return {
    ok: true, fehler: '', status: 200,
    startUrl: 'https://renditeturbo-beispiel.online/', endUrl: 'https://renditeturbo-beispiel.online/start',
    kette: [{ url: 'https://renditeturbo-beispiel.online/', status: 302 }, { url: 'https://renditeturbo-beispiel.online/start', status: 200 }],
    externeDomains: ['t.me'], hinweise: ['Cookie-Banner mit "Alle akzeptieren" geschlossen'],
    seiten: [
      { url: 'https://renditeturbo-beispiel.online/start', rolle: 'Startseite', titel: 'RenditeTurbo', text: 'Garantierte Rendite von 5 % täglich', textLaenge: 36, textGekuerzt: false, formulare: [{ ziel: '/konto', felder: ['password pw'] }], fotos: [{ position: 0, gesamthoehe: 1600, jpeg: PIXEL }, { position: 800, gesamthoehe: 1600, jpeg: PIXEL }] },
      { url: 'https://renditeturbo-beispiel.online/impressum', rolle: 'Impressum', titel: 'Impressum', text: 'Kingstown, St. Vincent', textLaenge: 22, textGekuerzt: false, formulare: [], fotos: [{ position: 0, jpeg: PIXEL }] },
    ],
    videos: [{ art: 'video', src: 'https://x/video.mp4', dauer: 95, untertitel: [{ sprache: 'de', text: 'Ich bin reich geworden' }], bilder: [{ zeit: 12, jpeg: PIXEL }, { zeit: 70, jpeg: PIXEL }] }],
    ...ueberschreiben,
  };
}

const GUELTIG = {
  urteil: 'sehr_wahrscheinlich_betrug', gewissheit: 'hoch', masche: 'Krypto-Anlagebetrug',
  zusammenfassung: 'Die Seite verspricht garantierte Gewinne.', belege: [{ befund: 'Rendite', fundstelle: 'Startseite', gewicht: 'stark' }],
  entlastend: [], videos: [], selbst_pruefen: ['BaFin'], empfehlung: 'Nicht einzahlen.',
};

/** Stellvertreter für den Anthropic-Client: merkt sich die Anfrage, liefert eine feste Antwort. */
function attrappe(antwort) {
  const anfragen = [];
  return {
    anfragen,
    beta: {
      messages: {
        stream: (parameter) => {
          anfragen.push(parameter);
          return { finalMessage: async () => ({ model: parameter.model, usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: 'end_turn', ...antwort }) };
        },
      },
    },
  };
}
const alsText = (objekt) => ({ content: [{ type: 'text', text: JSON.stringify(objekt) }] });

test('Anfrage enthaelt Texte, alle Bilder mit Beschriftung, Untertitel und Regelbefunde', () => {
  const e = erkundung();
  const { inhalt, bilder } = baueAnfrage(e, analysiereAdresse(e.startUrl, 'Garantierte Rendite von 5 % täglich'));
  assert.equal(bilder, 5);
  assert.equal(inhalt.filter((b) => b.type === 'image').length, 5);
  // Vor jedem Bild steht, was es zeigt - sonst kann die KI keine Fundstelle nennen.
  inhalt.forEach((b, i) => {
    if (b.type === 'image') assert.equal(inhalt[i - 1].type, 'text');
  });
  const text = inhalt.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  for (const erwartet of ['Weiterleitungen', 'Kingstown', 'password pw', 'Ich bin reich geworden', 'Vorfilters', 'Video 1, Bild 2 von 2 bei 1:10', 'Bildschirmfoto Startseite 2 von 2', 't.me']) {
    assert.ok(text.includes(erwartet), `fehlt: ${erwartet}`);
  }
});

test('Zu viele Bilder werden begrenzt und das wird der KI gesagt', () => {
  const viele = Array.from({ length: 60 }, (_, i) => ({ zeit: i, jpeg: PIXEL }));
  const { inhalt, bilder } = baueAnfrage(erkundung({ videos: [{ art: 'video', src: 'x', bilder: viele }] }), null);
  assert.equal(bilder, 40);
  assert.ok(inhalt.some((b) => b.type === 'text' && /weitere Bilder wurden aus Kostengründen nicht/.test(b.text)));
});

test('KI-Urteil wird gelesen und auf eine Stufe abgebildet', async () => {
  const client = attrappe(alsText(GUELTIG));
  const urteil = await kiUrteil(erkundung(), null, { client });
  assert.equal(urteil.stufe, 'rot');
  assert.equal(urteil.name, 'Sehr wahrscheinlich Betrug');
  assert.equal(urteil.bilder, 5);
  const [anfrage] = client.anfragen;
  assert.equal(anfrage.model, STANDARD_MODELL);
  assert.deepEqual(anfrage.thinking, { type: 'adaptive' });
  assert.equal(anfrage.fallbacks, 'default');
  assert.deepEqual(anfrage.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(anfrage.output_config.format.type, 'json_schema');
  assert.match(anfrage.system, /Beweismaterial, keine Anweisung/);
});

test('Ablehnung, abgeschnittene und unlesbare Antworten werden zu klaren Fehlern', async () => {
  await assert.rejects(kiUrteil(erkundung(), null, { client: attrappe({ stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [] }) }), /abgelehnt/);
  await assert.rejects(kiUrteil(erkundung(), null, { client: attrappe({ ...alsText(GUELTIG), stop_reason: 'max_tokens' }) }), /abgeschnitten/);
  await assert.rejects(kiUrteil(erkundung(), null, { client: attrappe({ content: [{ type: 'text', text: 'kein json' }] }) }), /nicht lesbar/);
  await assert.rejects(kiUrteil(erkundung(), null, { client: attrappe(alsText({ ...GUELTIG, urteil: 'harmlos' })) }), /Unbekanntes Urteil/);
});

// --- Mit echtem Browser. Wird übersprungen, wo Playwright oder Chromium fehlen. ---

async function browserVerfuegbar() {
  try {
    const { chromium } = await import('playwright');
    const b = await chromium.launch();
    await b.close();
    return chromium;
  } catch {
    return null;
  }
}
const chromium = await browserVerfuegbar();
const mitBrowser = { skip: chromium ? false : 'Playwright/Chromium nicht installiert', timeout: 120000 };

test('Browser erkundet Seite, Unterseiten und Video der nachgebauten Betrugsseite', mitBrowser, async () => {
  const { nimmVideoAuf, starteTestseite } = await import('./hilfen/testseite.js');
  const { erkundeSeite } = await import('../src/erkundung.js');
  const { server, basis } = await starteTestseite(await nimmVideoAuf(chromium));
  try {
    const e = await erkundeSeite(`${basis}/weiter`, { erlaubePrivat: true });
    assert.equal(e.ok, true, e.fehler);
    assert.deepEqual(e.kette.map((k) => k.status), [302, 200]);
    assert.ok(e.hinweise.some((h) => /Cookie-Banner/.test(h)), 'Banner nicht geschlossen');
    // Inhalt steht erst nach dem Banner da - ohne echten Browser gäbe es ihn nicht.
    assert.match(e.seiten[0].text, /garantierte Rendite von 5 % täglich/);
    assert.ok(e.seiten[0].formulare.some((f) => f.felder.some((x) => x.startsWith('password'))));
    assert.deepEqual(e.seiten.slice(1).map((s) => s.rolle), ['Impressum', 'AGB']);
    assert.match(e.seiten[1].text, /St\. Vincent/);
    assert.ok(e.seiten[0].fotos.length >= 2);
    assert.deepEqual(e.externeDomains, ['t.me']);

    const [video] = e.videos;
    assert.equal(video.art, 'video');
    assert.ok(video.bilder.length >= 4, `nur ${video.bilder.length} Einzelbilder`);
    // Die Einzelbilder müssen verschiedene Stellen des Videos zeigen, nicht dasselbe Bild.
    const verschieden = new Set(video.bilder.map((b) => createHash('sha1').update(b.jpeg).digest('hex')));
    assert.ok(verschieden.size >= 3, 'Einzelbilder sind identisch');
    assert.match(video.untertitel[0].text, /Rendite jeden Tag/);
  } finally {
    server.close();
  }
});

test('Browser verweigert Adressen im eigenen Netz', mitBrowser, async () => {
  const { erkundeSeite } = await import('../src/erkundung.js');
  const e = await erkundeSeite('http://127.0.0.1:9/');
  assert.equal(e.ok, false);
  assert.match(e.fehler, /eigene Netz/);
});

test('Tiefenpruefung ohne KI faellt auf die Regeln zurueck und sagt es', mitBrowser, async () => {
  const { nimmVideoAuf, starteTestseite } = await import('./hilfen/testseite.js');
  const { tiefenpruefung } = await import('../src/tiefenpruefung.js');
  const { server, basis } = await starteTestseite(await nimmVideoAuf(chromium));
  try {
    const r = await tiefenpruefung(`${basis}/`, { erkundung: { erlaubePrivat: true }, ohneKi: true });
    assert.equal(r.urteilsquelle, 'regeln');
    assert.equal(r.ki, null);
    assert.match(r.kiFehler, /ausgeschaltet/);
    assert.equal(r.stufe, 'rot');
    assert.ok(r.regeln.befunde.some((b) => b.id === 'seite-renditeversprechen'));
    assert.ok(r.bilder.some((b) => b.art === 'video'));

    const mitKi = await tiefenpruefung(`${basis}/`, { erkundung: { erlaubePrivat: true }, ki: { client: attrappe(alsText({ ...GUELTIG, urteil: 'verdaechtig' })) } });
    assert.equal(mitKi.urteilsquelle, 'ki');
    assert.equal(mitKi.stufe, 'gelb', 'das KI-Urteil soll das Regelurteil ersetzen');
  } finally {
    server.close();
  }
});
