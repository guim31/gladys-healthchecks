# Healthchecks

[Healthchecks](https://healthchecks.io/) überwacht deine geplanten Aufgaben: Ein
Cronjob, ein Backup, eine Zertifikatserneuerung oder ein beliebiges Skript
„pingt“ eine Adresse, wenn es läuft, und Healthchecks schlägt Alarm, wenn der
Ping ausbleibt. Diese Integration holt die Checks eines Healthchecks-Projekts
nach Gladys, ob du healthchecks.io oder deinen eigenen Server nutzt: Jeder Check
wird ein Gerät mit seinem Zustand, seinem letzten Ping und dem nächsten
erwarteten. Szenen können reagieren, wenn **irgendein** Check ausfällt, sich
verspätet oder wieder läuft, ein Widget zeigt die ausgefallenen Checks zuerst,
und Szenen können einen Check pausieren, fortsetzen oder anpingen.

Getestet mit einem echten, selbst gehosteten Healthchecks v4.4 (Docker); noch
nicht auf healthchecks.io selbst: Rückmeldungen sind willkommen in
[den Issues](https://github.com/guim31/gladys-healthchecks/issues).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Ein Healthchecks-Projekt: auf [healthchecks.io](https://healthchecks.io/)
  (auch im kostenlosen Tarif) oder auf deinem eigenen Healthchecks-Server,
  erreichbar vom Gladys-Rechner.
- Einen API-Schlüssel des Projekts. Der **schreibgeschützte** Schlüssel reicht,
  um den Checks zu folgen; der **vollständige** erlaubt auch Pausieren,
  Fortsetzen und „Ping senden“.

Die Integration stellt eine Anfrage pro Aktualisierungsintervall (standardmäßig
eine Minute): weit unter dem, was healthchecks.io annimmt.

## Erste Schritte

### 1. Einen API-Schlüssel erstellen

Öffne in Healthchecks dein Projekt, dann **Settings** → **API Access** →
**Create API Keys**. Zwei Schlüssel erscheinen: der vollständige („API key“)
und der schreibgeschützte. Kopiere den gewünschten: Healthchecks zeigt ihn
später wieder an, aber behalte ihn für dich.

### 2. Die Integration konfigurieren

Öffne in Gladys **Integrationen → Healthchecks → Konfiguration**:

- **Healthchecks-Adresse**: `https://healthchecks.io` (Standard) oder die
  Adresse deines Servers, die seiner Einstellung `SITE_ROOT` (zum Beispiel
  `http://192.168.1.2:8000`).
- **API-Schlüssel**: der oben kopierte Schlüssel.
- **Aktualisierungsintervall**: von 30 Sekunden bis 5 Minuten.
- **Sprache der Namen**: Sprache der Funktionsnamen, der Zustände und der
  Szenen-Ergebnisse (standardmäßig Französisch).

Speichere und klicke auf **Verbindung testen**: Das Ergebnis nennt die Zahl der
Checks, die ausgefallenen oder verspäteten, und meldet einen schreibgeschützten
Schlüssel.

### 3. Die Checks anlegen

Öffne den Tab **Entdecken**: Ein Gerät „Healthchecks“ fasst das Projekt
zusammen, und jeder Check wird mit seinem Namen vorgeschlagen. Lege die an, die
du in Gladys sehen willst. Die Szenen-Auslöser gelten für alle Checks, angelegt
oder nicht.

## Die Geräte

Jeder Check wird ein Gerät mit:

- **Zustand**: Pünktlich, Verspätet, Ausgefallen, Läuft, Pausiert oder Neu, als
  Text.
- **Funktioniert**: Ja (grün), solange der Check pünktlich, verspätet oder
  laufend ist, Nein (rot), wenn er ausgefallen ist. Nichts, solange er neu oder
  pausiert ist. Praktisch als Szenen-Bedingung.
- **Letzter Ping**: Tag/Monat und Uhrzeit des letzten Pings.
- **Nächster Ping erwartet**: wann der Check ohne neuen Ping verspätet ist; „-“,
  wenn nichts erwartet wird (ausgefallener, pausierter oder neuer Check).
- **Empfangene Pings**: der Zähler von Healthchecks.
- **Dauer des letzten Laufs**: in Sekunden, zwischen den Signalen „start“ und
  „success“, für Checks, die ein Startsignal senden (`/start`).

Das Gerät **Healthchecks** des Projekts zählt die **Ausgefallene Checks**, die
**Verspätete Checks** und die **Checks insgesamt**.

Letzter Ping, nächster Ping, Pings und Dauer werden höchstens alle 5 Minuten pro
Check gesendet (sofort, wenn sich der Zustand ändert), um in den Grenzen von
Gladys zu bleiben.

## Dashboard

Das Widget **Healthchecks** zeigt drei Kacheln (ausgefallen, verspätet,
pünktlich), dann eine Zeile pro Check: erst die ausgefallenen, dann die
verspäteten, dann laufende, neue, pausierte und pünktliche, mit Zustand und
letztem Ping. Höchstens zehn Zeilen; der Rest wird gezählt. Wähle in den
Widget-Einstellungen einzelne Checks, um nur sie zu zeigen (in Gladys angelegte
Geräte). Die Schaltfläche **Aktualisieren** liest Healthchecks neu.

## Szenen

### Auslöser

- **Ein Check fällt aus**: kein Ping vor Ende der Kulanzzeit oder ein
  Fehlersignal (`/fail`). Variablen: Name des Checks, Tags, letzter Ping.
- **Ein Check läuft wieder**: Ein ausgefallener Check empfängt wieder einen
  Ping. Variablen: dieselben, plus die Dauer des Ausfalls in Minuten.
- **Ein Check ist verspätet**: Der erwartete Ping kam nicht und die Kulanzzeit
  beginnt: noch Zeit zu handeln, bevor der Check ausfällt.

Jeder Auslöser lässt sich auf einzelne Checks beschränken (leer: alle). Der
Zustand wird im Volume `/data` gespeichert: Ein Check, der während eines
Neustarts von Gladys oder der Integration ausgefallen ist, wird beim nächsten
Lesen einmal gemeldet. Beim ersten Lesen wird nichts gemeldet, ebenso wenig für
einen pausierten, fortgesetzten oder laufenden Check.

### Aktionen

- **Zustand eines Checks**: liefert `down` (ja/nein), den Zustand in Worten
  (`state`), den Namen (`name`), den letzten Ping (`last_ping`) und einen
  fertigen Satz (`sentence`), zum Beispiel „Backup: Ausgefallen, letzter Ping
  14.10. 03:12.“.
- **Ausgefallene Checks zählen**: ausgefallen, verspätet, insgesamt, und die
  Namen der ausgefallenen Checks.
- **Check pausieren** und **Check fortsetzen**: für eine geplante Wartung
  (vollständiger API-Schlüssel). Ein fortgesetzter Check wartet auf seinen
  nächsten Ping.
- **Ping senden**: sendet das Erfolgssignal eines Checks (vollständiger
  API-Schlüssel), damit eine Gladys-Szene selbst meldet, dass sie gelaufen ist.

### Szenen-Ideen

- Wenn **Ein Check fällt aus** mit dem Tag `backup`, eine Telegram-Nachricht
  senden: „Das Backup ist nicht gelaufen, letzter Ping {{last_ping}}“.
- Jeden Morgen um 8:00 **Ausgefallene Checks zählen** und, wenn es mindestens
  einen gibt, die Namen auf dem Lautsprecher vorlesen.
- In einer nächtlichen Gladys-Szene (Bewässerung, Heizplan…) zum Schluss **Ping
  senden** an einen eigenen Check: Healthchecks warnt dich, wenn Gladys selbst
  sie nicht mehr ausführt.
- Bevor du das NAS zur Wartung ausschaltest, **Check pausieren** für das
  Backup, und **Check fortsetzen**, wenn es wieder läuft.

## Fehlerbehebung

- **API-Schlüssel abgelehnt**: Kopiere den Schlüssel erneut unter Settings →
  API Access des richtigen Projekts; jedes Projekt hat eigene Schlüssel.
- **Kein Healthchecks unter dieser Adresse**: Prüfe die Adresse; für deinen
  eigenen Server ist es die von `SITE_ROOT`, mit Unterpfad, falls vorhanden.
- **Die Adresse leitet um**: Gib die endgültige Adresse ein, meist mit
  `https://`. Die Integration folgt keinen Umleitungen, damit der Schlüssel nie
  woanders hingeht.
- **Zertifikat abgelehnt**: Ein selbstsigniertes Zertifikat wird nicht
  akzeptiert; nutze die `http://`-Adresse im lokalen Netz oder ein
  vertrauenswürdiges Zertifikat.
- **Dafür ist der vollständige API-Schlüssel nötig**: Pausieren, Fortsetzen und
  Ping brauchen den vollständigen Schlüssel, nicht den schreibgeschützten.
- **Ping senden schlägt auf einem selbst gehosteten Server fehl**: Die
  Ping-Adresse baut Healthchecks aus seiner Einstellung `PING_ENDPOINT` (oder
  `SITE_ROOT`); Gladys muss sie erreichen können.

## Grenzen

- Ein Projekt pro Konfiguration (ein API-Schlüssel = ein Projekt).
- Die Integration liest Healthchecks: Ein Check wird nicht aus Gladys angelegt
  oder bearbeitet.
- Ein kurzer Ausfall zwischen zwei Lesevorgängen kann in den Gerätezuständen
  unbemerkt bleiben; Healthchecks behält den ganzen Verlauf.
- „Läuft“ (ein Startsignal ohne Ende) ändert nicht den Zustand, dem die
  Auslöser folgen.
- Ohne Zugang zu einem healthchecks.io-Konto entwickelt: getestet mit dem selbst
  gehosteten Server (dieselbe API). Rückmeldungen sind willkommen.
