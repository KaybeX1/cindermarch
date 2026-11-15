# Cindermarch

Akční RPG na Android inspirované žánrem Path of Exile. Vlastní kód, názvy i grafika.

- 4 třídy postav (Warden, Reaver, Stalker, Arcanist), více postav, výběr postavy s 3D náhledem podle vybavení
- pohyb joystickem (táhni prstem kdekoli po obrazovce), skilly se používají samy
- každá zóna je ohraničená mapa s minimapou a fog of war; nepřátelé reagují, až když tě uvidí, a je jich omezený počet
- na mapě jsou bedny, portál do arény bosse a na okraji teleport do další, těžší zóny s lepším lootem
- zabití nepřátelé a bedny se vrací po 10 minutách, boss po 20 minutách; vzácný Summoning Sigil přivolá bosse hned
- loot s náhodnými affixy (Normal / Magic / Rare / Unique)
- skill gemy a support gemy, obchodník s gemy s obnovou nabídky za zlato
- pasivní strom se šesti větvemi a keystony

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
  - `js/map.js` – generátor map a arény
  - `js/model.js` – 3D náhled postavy
  - `js/game.js` – herní logika
  - `js/render.js` – vykreslování a ovládání
  - `js/ui.js` – HUD a panely
- `app/src/main/java/` – Android obal (WebView)
- `.github/workflows/build.yml` – sestavení APK
