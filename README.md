# Cindermarch

Akční RPG na Android inspirované žánrem Path of Exile. Vlastní kód, názvy i grafika.

Hraje se ve stylu Archero:

- run = kapitola o 20 místnostech, každá 5. místnost je boss; vyčištěná místnost otevře dveře nahoře
- postava útočí jen když stojí, pohyb slouží k uhýbání (vířící čepele Whirling Steel se točí i v pohybu)
- na začátku runu, při každém level-upu runu a po každém bossovi výběr 1 ze 3 schopností (bývalé support gemy a další), platí do konce runu
- smrt ukončí run; předměty, zlato, gemy a level postavy zůstávají
- mezi runy tábor: výběr kapitoly, předměty s affixy, skill gemy, pasivní strom, obchod s gemy
- 4 třídy postav (Warden, Reaver, Stalker, Arcanist), více postav, 3D náhled postavy podle vybavení

## Stažení APK

Každá změna ve větvi `main` spustí GitHub Actions, které sestaví APK a vydají ho v **Releases**.
Otevři v telefonu záložku Releases, stáhni `Cindermarch.apk` a nainstaluj (Android 8.0+).
Všechna sestavení jsou podepsaná stejným klíčem, takže nová verze se nainstaluje přes starou a uložená hra zůstane.

## Verze a aktualizace

První vydání je 1.0.0 a každé další úspěšné sestavení zvýší verzi o 0.0.1.
Hra při spuštění zkontroluje poslední vydání na GitHubu, novější APK si stáhne a nabídne instalaci.
Dokud je repozitář soukromý, potřebuje k tomu token jen pro čtení uložený jako secret `UPDATE_TOKEN`; u veřejného repozitáře není potřeba nic.

## Struktura

- `app/src/main/assets/` – samotná hra (HTML, CSS, JavaScript), jde otevřít i v prohlížeči
  - `js/data.js` – předměty, affixy, gemy, monstra, zóny, vyvážení
  - `js/tree.js` – pasivní strom
  - `js/room.js` – generátor místností
  - `js/model.js` – 3D náhled postavy
  - `js/game.js` – herní logika
  - `js/render.js` – vykreslování a ovládání
  - `js/ui.js` – HUD a panely
- `app/src/main/java/` – Android obal (WebView)
- `.github/workflows/build.yml` – sestavení APK
