/**
 * Tiefenprüfung einer Webseite: echter Browser + feste Regeln + Urteil durch Claude.
 *
 *   erkundeSeite()        Seite, Unterseiten, Bildschirmfotos, Videos
 *   analysiereAdresse()   die festen Regeln auf Adresse und gesammeltem Text
 *   kiUrteil()            Claude wertet alles zusammen aus
 *
 * Nur unter Node. Fällt die KI aus, bleibt das Ergebnis der Regeln stehen -
 * und es wird deutlich gesagt, dass das Urteil dann nur darauf beruht.
 */
import { erkundeSeite } from './erkundung.js';
import { kiUrteil } from './ki-urteil.js';
import { analysiereAdresse } from './analyzer.js';

/** Die Erkundung in die Form bringen, die die Regeln vom einfachen Abruf kennen. */
function alsAbruf(erkundung) {
  return {
    ok: erkundung.ok,
    status: erkundung.status,
    endUrl: erkundung.endUrl,
    kette: erkundung.kette.map(({ url, status }) => ({ url, status })),
    fehler: erkundung.fehler,
    abgeschnitten: erkundung.seiten.some((s) => s.textGekuerzt),
    // Der Browser hat JavaScript schon ausgeführt; "nur JavaScript" gibt es hier nicht.
    skripte: 0,
    text: erkundung.seiten.map((s) => `${s.titel}\n${s.text}`).join('\n\n'),
  };
}

/** Bilder für die Anzeige, ohne sie doppelt im Bericht mitzuschleppen. */
function galerie(erkundung) {
  const bilder = [];
  erkundung.seiten.forEach((s, i) => s.fotos.forEach((f, j) => bilder.push({
    art: 'seite', titel: `${i === 0 ? 'Startseite' : s.rolle} ${s.fotos.length > 1 ? j + 1 : ''}`.trim(), jpeg: f.jpeg,
  })));
  erkundung.videos.forEach((v, i) => v.bilder.forEach((b, j) => bilder.push({
    art: 'video', titel: `Video ${i + 1}, Bild ${j + 1}${b.beschreibung ? ` (${b.beschreibung})` : ''}`, jpeg: b.jpeg,
  })));
  return bilder;
}

/**
 * @param {string} eingabe Webadresse
 * @param {object} [optionen] erkundung: Optionen für erkundeSeite; ki: Optionen für kiUrteil;
 *   ohneKi: nur Browser und Regeln
 */
export async function tiefenpruefung(eingabe, optionen = {}) {
  const melde = optionen.fortschritt || (() => {});
  melde('Seite wird im Browser geöffnet …');
  const erkundung = await erkundeSeite(eingabe, optionen.erkundung);

  const regeln = analysiereAdresse(eingabe, '', alsAbruf(erkundung));

  let ki = null;
  let kiFehler = '';
  if (!erkundung.ok && !erkundung.seiten.length) {
    kiFehler = 'Die Seite war nicht erreichbar - es gibt nichts, was die KI ansehen könnte.';
  } else if (optionen.ohneKi) {
    kiFehler = 'KI-Prüfung ausgeschaltet.';
  } else {
    melde(`KI wertet ${erkundung.seiten.length} Seite(n) und ${erkundung.videos.length} Video(s) aus …`);
    try {
      ki = await kiUrteil(erkundung, regeln, optionen.ki);
    } catch (f) {
      kiFehler = String(f.message || f);
    }
  }

  return {
    art: 'tiefenpruefung',
    adresse: eingabe,
    // Die KI hat alles gesehen, die Regeln nur Stichwörter - wenn es ein KI-Urteil gibt, zählt es.
    stufe: ki ? ki.stufe : regeln.stufe,
    urteilsquelle: ki ? 'ki' : 'regeln',
    ki,
    kiFehler,
    regeln,
    erkundung: {
      ok: erkundung.ok,
      fehler: erkundung.fehler,
      startUrl: erkundung.startUrl,
      endUrl: erkundung.endUrl,
      status: erkundung.status,
      kette: erkundung.kette,
      externeDomains: erkundung.externeDomains,
      hinweise: erkundung.hinweise,
      seiten: erkundung.seiten.map(({ fotos, text, ...rest }) => ({ ...rest, fotos: fotos.length })),
      videos: erkundung.videos.map(({ bilder, ...rest }) => ({ ...rest, bilder: bilder.length })),
    },
    bilder: galerie(erkundung),
  };
}
