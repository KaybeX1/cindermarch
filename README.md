# Cindermarch

Akční RPG na Android inspirované žánrem Path of Exile. Vlastní kód, názvy i grafika.

- pohyb joystickem (táhni prstem kdekoli po obrazovce), skilly se používají samy
- loot s náhodnými affixy (Normal / Magic / Rare / Unique)
- skill gemy a support gemy, které mění jejich chování
- pasivní strom se šesti větvemi a keystony
- zóny s bossem a portálem do těžší zóny

## Stažení APK

Každá změna ve větvi `main` spustí GitHub Actions, které sestaví APK a vydají ho v **Releases**.
Otevři v telefonu záložku Releases, stáhni `Cindermarch.apk` a nainstaluj (Android 8.0+).
Všechna sestavení jsou podepsaná stejným klíčem, takže nová verze se nainstaluje přes starou a uložená hra zůstane.

## Struktura

- `app/src/main/assets/` – samotná hra (HTML, CSS, JavaScript), jde otevřít i v prohlížeči
  - `js/data.js` – předměty, affixy, gemy, monstra, zóny, vyvážení
  - `js/tree.js` – pasivní strom
  - `js/game.js` – herní logika
  - `js/render.js` – vykreslování a ovládání
  - `js/ui.js` – HUD a panely
- `app/src/main/java/` – Android obal (WebView)
- `.github/workflows/build.yml` – sestavení APK
