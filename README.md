# Mail-Befund

Ein Werkzeug, das eine verdächtige E-Mail auf die Muster prüft, die bei Phishing
immer wieder auftauchen — und **jeden einzelnen Befund begründet**, statt nur eine
Zahl auszuwerfen. Denn nützlich ist nicht die Punktzahl, sondern dass man beim
nächsten Mal selbst sieht, woran man es erkennt.

Geprüft werden vier Ebenen:

| Ebene | Was untersucht wird |
| --- | --- |
| **Absender** | Anzeigename gegen echte Adresse, Tippfehler- und Sonderzeichen-Domains, Markenname nur in der Subdomain, Freemail statt Firmendomain, Wegwerfadressen |
| **Technische Herkunft** | SPF, DKIM und DMARC, Zustellweg über die `Received`-Kette, Ursprungs-IP, abweichende `Reply-To`-, `Return-Path`- und `Sender`-Domains, Versand über gekaperte Webserver |
| **Links** | Sichtbarer Text gegen echtes Linkziel, `@`-Trick, rohe IP-Adressen, Punycode, Kurzlinks, ungewöhnliche Ports, Weiterleitungsketten, Formulare und Passwortfelder direkt in der Mail, unsichtbarer Text |
| **Inhalt und Anhänge** | Zeitdruck, Drohungen, Frage nach TAN/PIN/Passwort, geänderte Bankverbindung, Chefmasche, unpersönliche Anrede, QR-Codes, ausführbare und doppelt benannte Anhänge, passwortgeschützte Archive |

Dazu kommt eine fünfte Prüfart für **Webseiten** — gedacht für Anlage-, Krypto- und
Verdienstseiten, die mit schnellem Geld locken:

| Ebene | Was untersucht wird |
| --- | --- |
| **Adresse** | Köderwörter im Namen (cash, profit, rendite …), billige Wegwerf-Endungen, fremde Marke im Domainnamen, fehlende Verschlüsselung — plus alle Linkregeln von oben |
| **Seitentext** (optional eingefügt) | Garantierte oder tägliche Rendite, „erst einzahlen, dann verdienen", Auszahlungsgebühren, Provision fürs Anwerben (Schneeball), Einzahlung per USDT oder Guthabenkarte, Promi-Werbung, „persönlicher Broker" mit AnyDesk, künstliche Knappheit, fehlendes Impressum, behauptete BaFin-Aufsicht |

Alles läuft **lokal**. Weder die Browser- noch die Kommandozeilenfassung stellt
eine Netzwerkverbindung her. Eine Mail, in der es um dein Konto geht, gehört
nicht in ein fremdes Online-Formular.

---

## Benutzen

### Im Browser

`dist/phishing-check.html` herunterladen und doppelklicken. Eine einzelne Datei,
keine Installation, kein Server. Die Mail lässt sich einfügen oder als `.eml`-Datei
in das Textfeld ziehen.

### Auf der Kommandozeile

```bash
node bin/cli.js beispiele/phishing-bank.eml     # Datei prüfen
cat verdaechtig.eml | node bin/cli.js           # aus der Standardeingabe
node bin/cli.js verdaechtig.eml --json          # maschinenlesbar
```

Webseiten:

```bash
node bin/cli.js --url cashconnect.online                         # nur die Adresse
node bin/cli.js --url https://x.online --seite seitentext.txt    # samt kopiertem Seitentext
```

Die Seite wird dabei **nicht aufgerufen**. Den Seitentext holst du dir selbst: Seite
öffnen, <kbd>Strg</kbd>+<kbd>A</kbd>, <kbd>Strg</kbd>+<kbd>C</kbd>, in eine Datei
einfügen. Im Browser gibt es dafür den Reiter „Webseite".

Der Rückgabewert eignet sich für Skripte: `0` unauffällig, `1` verdächtig,
`2` sehr wahrscheinlich Betrug.

### Als Bibliothek

```js
import { analysiere, analysiereAdresse } from './src/analyzer.js';

const bericht = analysiere(rohtextDerMail);
console.log(bericht.stufe);        // 'rot' | 'gelb' | 'gruen'
console.log(bericht.punkte);       // 0-100
console.log(bericht.sicherheit);   // wie belastbar das Urteil ist
for (const b of bericht.befunde) {
  console.log(b.schwere, b.titel, b.beweis, b.rat);
}

const seite = analysiereAdresse('cashconnect.online', kopierterSeitentext);
```

---

## Wie das Urteil zustande kommt

Jede Regel liefert einen Befund mit einer Schwere und einem Gewicht. Die Gewichte
werden **sättigend** verrechnet — nach der Gegenwahrscheinlichkeit, nicht als Summe.
Zehn schwache Signale erreichen dadurch nie das Gewicht eines eindeutigen Beweises,
und der Wert läuft nie über 100 hinaus:

```
punkte = 100 * (1 - Produkt über alle Befunde von (1 - gewicht/100))
```

Daraus wird die Stufe:

- **rot** — mindestens ein kritischer Befund, oder 60 Punkte und mehr
- **gelb** — mindestens ein hoher Befund, oder 22 Punkte und mehr
- **grün** — alles darunter

Getrennt davon steht die **Aussagekraft**. Sie sagt, wie belastbar das Urteil
überhaupt ist, und hängt daran, wie viel vom Original vorliegt:

| Aussagekraft | Grundlage |
| --- | --- |
| hoch | vollständiger Kopf mit Zustellweg *und* SPF/DKIM/DMARC-Ergebnis |
| mittel | Kopf vorhanden, aber ohne Echtheitsprüfung |
| niedrig | nur Text, kein Kopf — die aussagekräftigsten Merkmale fehlen |

Bei Webseiten gibt es höchstens **mittel** (Adresse und Seitentext): Wer die Seite
betreibt, wie alt die Domain ist und ob schon vor ihr gewarnt wird, lässt sich offline
nicht feststellen. Nur mit der Adresse bleibt es bei **niedrig** — ein Domainname wie
`cash…online` macht eine Seite verdächtig, beweist aber keinen Betrug.

Diese Trennung ist wichtig: Ein grünes Ergebnis bei niedriger Aussagekraft heißt
nicht „harmlos", sondern „hier war zu wenig zu sehen".

### Was das Werkzeug nicht kann

- Es bewertet **Merkmale, keine Absichten.** Ein sorgfältig gemachter Angriff von
  einer eigens registrierten, technisch sauber eingerichteten Domain besteht diese
  Prüfung.
- Es fragt **nichts online ab** — kein Whois, keine Domain-Alterprüfung, keine
  Sperrlisten. Das ist der Preis dafür, dass deine Mail das Gerät nicht verlässt.
- `spf=pass` heißt nur: Die Mail kam wirklich von dieser Domain. Nicht: Die Domain
  ist ehrlich.

---

## An den Originaltext kommen

Ohne Kopfzeilen fehlt die halbe Grundlage. So kommt man an sie:

| Programm | Weg |
| --- | --- |
| Gmail (Web) | Mail öffnen → die drei Punkte *in der Mail* → „Original anzeigen" |
| Outlook (Web) | Mail öffnen → drei Punkte → „Ansicht" → „Nachrichtendetails anzeigen" |
| Outlook (Windows) | Mail doppelt öffnen → „Datei" → „Eigenschaften" → „Internetkopfzeilen" |
| Apple Mail | „Darstellung" → „E-Mail" → „Alle Header" |
| Thunderbird | Mail markieren → <kbd>Strg</kbd>+<kbd>U</kbd> |
| GMX / Web.de | Mail öffnen → „Mehr" bzw. Zahnrad → „Quelltext anzeigen" |
| T-Online | Mail öffnen → drei Punkte → „Quelltext anzeigen" |

---

## Die sechs Prüfschritte ohne Werkzeug

In dieser Reihenfolge. Die ersten beiden erwischen die große Mehrheit allein.

1. **Adresse hinter dem Namen ansehen.** Der Anzeigename ist frei erfunden. Die
   Domain **von rechts nach links** lesen: Bei `sparkasse.de.login.example.top`
   zählt `example.top`.
2. **Über jeden Link fahren, ohne zu klicken.** Das echte Ziel steht unten links.
   Auf dem Handy: lange gedrückt halten.
3. **Habe ich das erwartet?** Unerwartete Rechnungen und Paketmeldungen sind der
   häufigste Aufhänger.
4. **Zeitdruck ist ein Angriffsmerkmal.** „Innerhalb von 24 Stunden", „letzte
   Mahnung". Kein seriöses Unternehmen arbeitet so.
5. **Niemand fragt per Mail nach PIN, TAN oder Passwort.** Ohne Ausnahme.
6. **Geht es um Geld oder Zugang: Seite selbst aufrufen**, nicht über den Link.

---

## Wenn es schon passiert ist

Der Reihe nach, sofort:

1. **Bank anrufen.** Sperr-Notruf **116 116** (rund um die Uhr, kostenlos, aus dem
   Ausland `+49 116 116`) sperrt Karten und Online-Banking. Zusätzlich die eigene
   Bank direkt anrufen — ein *Überweisungsrückruf* gelingt nur in einem sehr
   kurzen Zeitfenster.
2. **Passwörter ändern**, von einem Gerät aus, dem du vertraust: erst der
   betroffene Dienst, dann das Mailkonto, dann überall mit demselben Passwort.
3. **Strafanzeige erstatten**, bei der Polizei oder online über die Internetwache
   des Bundeslands. Das Aktenzeichen brauchst du gegenüber der Bank.
4. **Beweise sichern, bevor du löschst**: Mail als Datei speichern, Screenshots,
   Belege, Uhrzeiten. Ohne Kopfzeilen ist die Mail als Beweis wenig wert.
5. **Melden**: Mail *als Anhang* an `phishing@verbraucherzentrale.nrw` — nur als
   Anhang bleiben die Kopfzeilen erhalten.

**Zur Erstattung** kommt es auf eine Unterscheidung an: Bei einer *nicht
autorisierten* Zahlung — jemand zahlt mit erbeuteten Daten, ohne dass du eine TAN
freigegeben hast — muss die Bank nach § 675u BGB unverzüglich erstatten. Hast du
selbst eine TAN freigegeben, weil du getäuscht wurdest, ist es eine *autorisierte*
Zahlung und die Bank prüft grobe Fahrlässigkeit (§ 675v BGB). Aussichtslos ist
auch das nicht. Lass dich beraten, bevor du etwas unterschreibst — die
Verbraucherzentrale bietet dafür eine günstige Rechtsberatung an. Dieses Projekt
ersetzt keine Rechtsberatung.

---

## Entwicklung

```bash
npm test          # 37 Tests, ohne externe Abhängigkeiten
npm run build     # baut dist/ aus src/ und web/vorlage.html neu
```

### Aufbau

```
src/
  parse-eml.js       MIME- und Header-Parser (fehlertolerant, ohne Abhängigkeiten)
  data.js            Wissensbasis: Marken, Freemailer, Dateitypen, Signalwörter
  utils.js           Linkextraktion, Homoglyphen, Levenshtein, Markenabgleich
  rules/*.js         die vier Regelgruppen für Mails, dazu website.js für Webadressen
  analyzer.js        Bewertung, Stufen, Handlungsempfehlung
bin/cli.js           Kommandozeilenfassung
web/vorlage.html     Oberfläche mit Platzhaltern für den Prüfkern
build.mjs            bündelt src/ + Vorlage zu einer einzelnen HTML-Datei
beispiele/           drei Mails (zwei Betrugsfälle, eine echte) und eine erfundene Anlagebetrugs-Seite
```

Es gibt bewusst **keine Laufzeit-Abhängigkeiten**. Der Parser, die
Linkextraktion und die Bündelung sind selbst geschrieben — bei einem Werkzeug,
dem man private Post anvertraut, ist die überschaubare Angriffsfläche mehr wert
als die gesparten Zeilen.

### Eine Regel hinzufügen

Signalwörter kommen nach `src/data.js` in `CONTENT_SIGNALS` (Mails) bzw.
`WEBSITE_SIGNALS` (Webseiten) — mit `titel`,
`erklaerung` (*warum* das ein Signal ist) und `rat` (*was* zu tun ist). Struktur-
oder Header-Regeln kommen in die passende Datei unter `src/rules/`. Jeder Befund
braucht alle drei Textfelder; ein Test wacht darüber.

Bei Markennamen unbedingt `enthaeltMarkenname()` benutzen und **keinen
Teilstring-Vergleich**: „ing" steckt sonst in jeder „Holding", „o2" in jedem
„Duo24". Zwei Regressionstests halten das fest.

---

## Lizenz

MIT.
