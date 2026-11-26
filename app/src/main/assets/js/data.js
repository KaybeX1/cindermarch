'use strict';
/* ===== game data: every table from the design document (schemes 1–15) ===== */
const rnd = Math.random;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const pick = a => a[Math.floor(rnd() * a.length)];
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : String(Math.round(n));

// ---------- elements (Schéma 1, Zbraně a elementy) ----------
const ELS = ['phys', 'fire', 'cold', 'light', 'chaos'];
const EL = {
  phys:  { name: 'Fyzické', col: '#c9ccd4', rgb: [0.85, 0.87, 0.92], res: 'Zuřivost', desc: 'Boj zblízka, útoky i za chůze, skoky a údery do země. Ignoruje část armouru.' },
  fire:  { name: 'Oheň', col: '#ff7a30', rgb: [1, 0.48, 0.18], res: 'Žár', desc: 'Výbuchy a hořící zem, odměňuje stání na místě. Zapaluje.' },
  cold:  { name: 'Led', col: '#7cd0ff', rgb: [0.5, 0.82, 1], res: 'Krystaly', desc: 'Ovládání pole: zpomalování, zmrazování a roztříštění.' },
  light: { name: 'Blesk', col: '#ffe14a', rgb: [1, 0.9, 0.3], res: 'Náboj', desc: 'Tempo, krity a přeskakování; se dvěma hůlkami 6 skillů.' },
  chaos: { name: 'Chaos', col: '#b46cff', rgb: [0.72, 0.42, 1], res: 'Esence', desc: 'Trpělivost: jed se vrství, šíří a prokletí ho zesilují.' },
};

// ---------- equipment (Schéma 1) ----------
// order of the skill rotation (Schéma 7): weapon, offhand, body, helmet, gloves, boots
const SLOTS = ['weapon', 'offhand', 'helmet', 'body', 'gloves', 'boots', 'ring1', 'ring2', 'amulet'];
const SLOT = {
  weapon:  { name: 'Zbraň', socket: 'skill', icon: '⚔' },
  offhand: { name: 'Štít / druhá hůlka', socket: 'stat', icon: '🛡' },
  helmet:  { name: 'Helma', socket: 'skill', icon: '⛑', stat: 'hp', base: 30 },
  body:    { name: 'Zbroj', socket: 'skill', icon: '🥋', stat: 'armour', base: 20 },
  gloves:  { name: 'Rukavice', socket: 'skill', icon: '🧤', stat: 'as', base: 4 },
  boots:   { name: 'Boty', socket: 'skill', icon: '👢', stat: 'hp', base: 30 },
  ring1:   { name: 'Prsten', socket: 'stat', icon: '💍', stat: ['dmg', 'hp'], base: { dmg: 2.5, hp: 22 } },
  ring2:   { name: 'Prsten', socket: 'stat', icon: '💍', stat: ['dmg', 'hp'], base: { dmg: 2.5, hp: 22 } },
  amulet:  { name: 'Amulet', socket: 'stat', icon: '📿', stat: ['dmg', 'as'], base: { dmg: 3.5, as: 5 } },
};
const ROTATION = ['weapon', 'offhand', 'body', 'helmet', 'gloves', 'boots'];
const WEAPONS = {
  sword:  { name: 'Meč', el: 'phys', hands: 2, dmg: 10, model: 'w_sword2', melee: true },
  mace:   { name: 'Palcát', el: 'phys', hands: 1, dmg: 8, model: 'w_mace', melee: true },
  fstaff: { name: 'Ohnivá hůl', el: 'fire', hands: 2, dmg: 10, model: 'w_staff_fire' },
  cstaff: { name: 'Ledová hůl', el: 'cold', hands: 2, dmg: 10, model: 'w_staff_cold' },
  wand:   { name: 'Hůlka', el: 'light', hands: 1, dmg: 8.5, model: 'w_wand' },
  bow:    { name: 'Luk', el: 'chaos', hands: 2, dmg: 10, model: 'w_bow' },
};
const SHIELD = { name: 'Štít', base: 20, model: 'w_shield' };
const RARITY = [
  { name: 'Normal', mult: 1, col: '#d8d2c4', cost: 1, sell: 10 },
  { name: 'Magic', mult: 1.3, col: '#6f9bff', cost: 1.5, sell: 30 },
  { name: 'Rare', mult: 1.7, col: '#ffd54a', cost: 2.5, sell: 100 },
  { name: 'Unique', mult: 2, col: '#ff8a3c', cost: 4, sell: 400 },
];
const ITEM_GROWTH = 1.05;
const itemScale = L => Math.pow(ITEM_GROWTH, L - 1);
// gloves / amulet attack speed grows slowly so it never breaks the 1 s rotation
const asScale = L => 1 + 0.02 * (L - 1);
const upgradeCost = (L, rar) => Math.round(50 * Math.pow(1.05, L - 1) * RARITY[rar].cost);  // Schéma 10
const sellValue = it => Math.round(RARITY[it.rar].sell + 0.8 * (it.spent || 0));
const mergeCost = tier => 100 * tier * tier;
const gemLevelFromItem = L => clamp(Math.ceil(L / 5), 1, 20);                                 // Schéma 3
const UNIQUE_NAMES = { weapon: 'Popelavé ostří', offhand: 'Žhnoucí bašta', helmet: 'Koruna uhlíků', body: 'Plášť pochodu', gloves: 'Spálené dlaně', boots: 'Kroky popela', ring1: 'Kruh žáru', ring2: 'Kruh žáru', amulet: 'Srdce výhně' };

// ---------- skill gems (Skill gemy podle elementů + 25 exkluzivních ze stromu) ----------
// group → unlock tier by zone (Schéma 11): 1 = from chapter 1, 2 = zone 2, 3 = zone 3, 4 = zone 4, 0 = tree only
const GROUP_TIER = { 'útok': 1, 'kouzlo': 1, 'šíp': 1, 'pohyb': 1, 'slam': 2, 'plošné': 2, 'zóna': 2, 'vodič': 2, 'prokletí': 2, 'jen se štítem': 2, 'spouštěč': 3, 'trvalé': 3, 'finisher': 4 };
const SK_RAW = {
  phys: [
    ['cleave', 'Cleave', 'útok', 'široký sek před sebe'],
    ['double_strike', 'Double Strike', 'útok', 'dvě rychlé rány do jednoho cíle, +2 Zuřivost'],
    ['blade_flurry', 'Blade Flurry', 'útok', 'série seků, čím déle u cíle, tím rychlejší'],
    ['crushing_blow', 'Crushing Blow', 'útok', 'pomalá těžká rána, přidává Rozdrcení'],
    ['flicker_strike', 'Flicker Strike', 'pohyb', 'teleport k náhodnému nepříteli a rána; při plné Zuřivosti 3 skoky za sebou'],
    ['leap_slam', 'Leap Slam', 'pohyb', 'skok do skupiny, dopad omráčí a nechá Trhlinu'],
    ['ground_slam', 'Ground Slam', 'slam', 'kužel před sebe, Trhlina po celé délce'],
    ['sunder', 'Sunder', 'slam', 'vlna po zemi, která se při zásahu větví'],
    ['rock_spikes', 'Rock Spikes', 'slam', 'z Trhlin vyrazí kamenné hroty'],
    ['aftershock', 'Aftershock', 'spouštěč', 'každý slam se po 1 s otřese znovu (50 %)'],
    ['rampage', 'Rampage', 'spouštěč', 'zabití dává Zuřivost a zrychlení; každé 10. zabití vybuchne'],
    ['war_cry', 'War Cry', 'spouštěč', 'každých 8 s výkřik, přitáhne a omráčí okolí, +Zuřivost za zasažené'],
    ['whirlwind', 'Whirlwind', 'trvalé', 'točíš se při chůzi a zasahuješ vše kolem; víc Zuřivosti = větší okruh'],
    ['blood_rage', 'Blood Rage', 'trvalé', 'trvale rychlejší útok za cenu životů za sekundu; Zuřivost nevyprchává'],
    ['earthquake', 'Earthquake', 'finisher', 'rána a po 1,5 s otřesy, které odpálí všechny Trhliny v okolí'],
    ['execute', 'Execute', 'finisher', 'obří rána nepříteli pod 30 % HP nebo omráčenému, stojí 5 Zuřivosti'],
    ['titans_fall', "Titan's Fall", 'finisher', 'skok vysoko a po 1 s obří slam; spotřebuje veškerou Zuřivost, síla podle ní'],
    ['shield_slam', 'Shield Slam', 'jen se štítem', 'rána štítem, omráčí, síla podle armouru'],
    ['shield_charge', 'Shield Charge', 'jen se štítem', 'rozběh skrz nepřátele, odhazuje je (pohyb)'],
    ['reckoning', 'Reckoning', 'jen se štítem', 'když tě něco zasáhne, protiútok kolem dokola'],
  ],
  fire: [
    ['fireball', 'Fireball', 'kouzlo', 'střela, která při zásahu vybuchne'],
    ['flamethrower', 'Flamethrower', 'kouzlo', 'kužel plamenů zblízka, rychle sbírá Žár'],
    ['searing_ray', 'Searing Ray', 'kouzlo', 'paprsek, který sílí, čím déle drží stejný cíl'],
    ['inferno_orb', 'Inferno Orb', 'kouzlo', 'pomalá koule, která pálí vše kolem své dráhy'],
    ['fire_nova', 'Fire Nova', 'plošné', 'kruh ohně kolem tebe'],
    ['meteor', 'Meteor', 'plošné', 'dopad se zpožděním, nechá hořící zem'],
    ['ember_storm', 'Ember Storm', 'plošné', 'déšť uhlíků na náhodná místa v okolí'],
    ['flame_wall', 'Flame Wall', 'zóna', 'ohnivá zeď napříč místností, tvoje střely skrz ni hoří silněji'],
    ['fire_trap', 'Fire Trap', 'zóna', 'past, která vybuchne, když na ni nepřítel šlápne'],
    ['lava_pool', 'Lava Pool', 'zóna', 'kaluž lávy pod největší skupinou nepřátel'],
    ['living_bomb', 'Living Bomb', 'spouštěč', 'označí nepřítele, po 3 s vybuchne; když cíl zemře dřív, bomba přeskočí'],
    ['pyre', 'Pyre', 'spouštěč', 'hořící nepřítel při smrti vybuchne'],
    ['overheat', 'Overheat', 'spouštěč', 'při 10 Žáru obří výbuch, Žár spadne na 0'],
    ['ember_harvest', 'Ember Harvest', 'spouštěč', 'uhlíky se přitahují a dávají Žár a trochu života'],
    ['fire_ring', 'Fire Ring', 'trvalé', 'ohnivé koule kolem tebe'],
    ['ash_step', 'Ash Step', 'trvalé', 'kudy jdeš, zanecháváš hořící stopu'],
    ['blazing_shield', 'Blazing Shield', 'trvalé', 'ohnivý štít pohltí jeden zásah za pár sekund a při rozbití vybuchne'],
    ['flame_spirit', 'Flame Spirit', 'trvalé', 'přivolaný ohnivý duch střílí s tebou, s Žárem sílí'],
    ['combustion', 'Combustion', 'finisher', 'odpálí všechna vznícení najednou, dmg podle zbývajícího hoření'],
    ['firestorm', 'Firestorm', 'finisher', 'spotřebuje Žár a na 3 s zaplaví místnost ohnivou bouří'],
  ],
  cold: [
    ['ice_shard', 'Ice Shard', 'kouzlo', 'rychlá střela, přidává podchlazení'],
    ['frost_lance', 'Frost Lance', 'kouzlo', 'kopí, které proletí celou řadou nepřátel'],
    ['cone_of_cold', 'Cone of Cold', 'kouzlo', 'kužel mrazu zblízka, rychle sčítá podchlazení'],
    ['glacial_spike', 'Glacial Spike', 'kouzlo', 'pomalé těžké kopí, zamrzlé rovnou roztříští'],
    ['frost_nova', 'Frost Nova', 'plošné', 'kruh mrazu kolem tebe'],
    ['hailstorm', 'Hailstorm', 'plošné', 'krupobití na skupinu nepřátel'],
    ['blizzard', 'Blizzard', 'plošné', 'vánice na jednom místě, trvá 4 s'],
    ['ice_wall', 'Ice Wall', 'zóna', 'ledová zeď, blokuje cestu i střely nepřátel'],
    ['ice_mine', 'Ice Mine', 'zóna', 'mina, která po šlápnutí zmrazí okolí'],
    ['frozen_ground', 'Frozen Ground', 'zóna', 'zamrzlá zem pod skupinou nepřátel'],
    ['shatter', 'Shatter', 'spouštěč', 'roztříštění vystřelí víc a silnějších střepů'],
    ['cold_snap', 'Cold Snap', 'spouštěč', 'když nepřítel zamrzne, mráz vybuchne kolem něj'],
    ['frostbite', 'Frostbite', 'spouštěč', 'zamrzlí nepřátelé dostávají o 30 % víc dmg'],
    ['rime_harvest', 'Rime Harvest', 'spouštěč', 'střepy z roztříštěných nepřátel se mění v krystaly'],
    ['frost_orbit', 'Frost Orbit', 'trvalé', 'ledové střepy kroužící kolem tebe'],
    ['winter_aura', 'Winter Aura', 'trvalé', 'chladná aura, podchlazuje vše v blízkosti'],
    ['frost_trail', 'Frost Trail', 'trvalé', 'kudy jdeš, zamrzá zem a zpomaluje pronásledovatele'],
    ['frost_wraith', 'Frost Wraith', 'trvalé', 'přivolaný ledový duch, střílí s tebou'],
    ['absolute_zero', 'Absolute Zero', 'finisher', 'spotřebuje všechny krystaly a zmrazí celou místnost (délka podle počtu krystalů)'],
    ['avalanche', 'Avalanche', 'finisher', 'obří ledový blok na největší skupinu, za každého zamrzlého silnější'],
  ],
  light: [
    ['spark', 'Spark', 'kouzlo', 'několik jisker, které se odráží po místnosti'],
    ['lightning_bolt', 'Lightning Bolt', 'kouzlo', 'blesk z nebe přímo na cíl'],
    ['chain_lightning', 'Chain Lightning', 'kouzlo', 'přeskočí až 6×'],
    ['ball_lightning', 'Ball Lightning', 'kouzlo', 'pomalá koule, která šlehá blesky do okolí'],
    ['thunderclap', 'Thunderclap', 'plošné', 'výboj kolem tebe'],
    ['storm_call', 'Storm Call', 'plošné', 'označí místo a po 1 s do něj udeří'],
    ['static_field', 'Static Field', 'plošné', 'elektrické pole, které nepřátele opakovaně šokuje'],
    ['tesla_pylon', 'Tesla Pylon', 'vodič', 'věž střílí blesky, blesky přeskakují i mezi pylony'],
    ['lightning_rod', 'Lightning Rod', 'vodič', 'tyč přitahuje blesky a každý přeskok z ní pustí znovu'],
    ['storm_cloud', 'Storm Cloud', 'vodič', 'mrak sleduje nejsilnějšího nepřítele a bije do něj'],
    ['overcharge', 'Overcharge', 'spouštěč', 'při 10 Náboji jsou další 3 kouzla kritická'],
    ['static_discharge', 'Static Discharge', 'spouštěč', 'šokovaný nepřítel při smrti vybuchne výbojem'],
    ['feedback', 'Feedback', 'spouštěč', 'kritický zásah dá 2 Náboje navíc'],
    ['conduction', 'Conduction', 'spouštěč', 'každý přeskok dmg zvýší místo snížení'],
    ['static_shield', 'Static Shield', 'trvalé', 'kdo tě zasáhne, dostane výboj'],
    ['ion_orbit', 'Ion Orbit', 'trvalé', 'jiskry kroužící kolem tebe'],
    ['flash_step', 'Flash Step', 'trvalé', 'při chůzi krátké záblesky vpřed (rychlejší pohyb) a elektrická stopa'],
    ['storm_hawk', 'Storm Hawk', 'trvalé', 'přivolaný jestřáb, střílí s tebou'],
    ['thunderstorm', 'Thunderstorm', 'finisher', 'spotřebuje Náboj a sešle bouři s počtem úderů podle něj'],
    ['wrath_of_the_sky', 'Wrath of the Sky', 'finisher', 'obří blesk do nejsilnějšího nepřítele, za každý bod Náboje silnější'],
  ],
  chaos: [
    ['toxic_arrow', 'Toxic Arrow', 'šíp', 'šíp, který přidá 3 stupně jedu'],
    ['venom_volley', 'Venom Volley', 'šíp', 'vějíř 5 šípů'],
    ['piercing_thorn', 'Piercing Thorn', 'šíp', 'proletí celou řadou a každému přidá jed'],
    ['seeker_arrow', 'Seeker Arrow', 'šíp', 'samonaváděcí šíp, obletí i překážky'],
    ['rain_of_blight', 'Rain of Blight', 'plošné', 'déšť šípů na skupinu'],
    ['caustic_cloud', 'Caustic Cloud', 'plošné', 'kam šíp dopadne, vznikne jedovatý mrak'],
    ['plague_burst', 'Plague Burst', 'plošné', 'výbuch jedu kolem zasaženého cíle'],
    ['wither', 'Wither', 'prokletí', 'prokletý dostává každou sekundu o kus víc chaos dmg'],
    ['frailty_hex', 'Frailty Hex', 'prokletí', 'prokletý je pomalejší a útočí slaběji'],
    ['doom_mark', 'Doom Mark', 'prokletí', 'označí nejsilnějšího; když zemře, prokletí přeskočí na dalšího'],
    ['contagion', 'Contagion', 'spouštěč', 'šíření předá všechen jed, ne jen část'],
    ['virulence', 'Virulence', 'spouštěč', 'každý 10. stupeň jedu na jednom nepříteli způsobí jedový výbuch'],
    ['festering', 'Festering', 'spouštěč', 'na prokletých se jed sčítá dvakrát rychleji'],
    ['soul_siphon', 'Soul Siphon', 'spouštěč', 'sebraná esence tě vyléčí'],
    ['plague_aura', 'Plague Aura', 'trvalé', 'jedovatá aura, otravuje vše v blízkosti'],
    ['fly_swarm', 'Fly Swarm', 'trvalé', 'hejno much kolem tebe kouše nepřátele'],
    ['fade', 'Fade', 'trvalé', 'při chůzi jsi napůl neviditelný, nepřátelé tě hůř zaměří'],
    ['carrion_raven', 'Carrion Raven', 'trvalé', 'přivolaný havran, útočí s tebou a přidává jed'],
    ['plague_harvest', 'Plague Harvest', 'finisher', 'sklidí všechen jed v místnosti, promění ho v okamžitý dmg a esenci'],
    ['deaths_arrow', "Death's Arrow", 'finisher', 'obří šíp spotřebuje esenci, proletí vším, za každou esenci silnější'],
  ],
};
const SK_EX = {
  phys: [['aegis_crash', 'Aegis Crash', 'rána štítem, vlna odrazí střely a omráčí, síla podle armouru'], ['thousand_cuts', 'Thousand Cuts', 'přeskočí až 5 nepřátel a pak všechny zasažené odpálí'],
    ['warlords_banner', "Warlord's Banner", 'prapor: v okolí rychlejší útok a Zuřivost, při plné Zuřivosti výkřik omráčí'], ['maelstrom_blade', 'Maelstrom Blade', 'vír, který stahuje nepřátele k tobě; každá 3. otočka udělá Trhlinu'],
    ['worldbreaker', 'Worldbreaker', 'obří skok, dopad roztrhne místnost do kříže Trhlin a sám se ozve']],
  fire: [['solar_lance', 'Solar Lance', 'paprsek přejede místností a nechá hořící čáru'], ['ember_tide', 'Ember Tide', 'vlna uhlíků přes celou místnost, vše vznítí a sype uhlíky'],
    ['volcano', 'Volcano', '3 s chrlí lávové kameny, každý nechá kaluž lávy'], ['inferno_crown', 'Inferno Crown', 'koruna ohnivých koulí roste se Žárem, při 10 Žáru je vystřelí'],
    ['phoenix', 'Phoenix', 'fénix krouží a útočí; pod 30 % života vybuchne a vyléčí tě']],
  cold: [['frozen_orb', 'Frozen Orb', 'otáčející se koule střílí střepy do všech stran'], ['crystal_prison', 'Crystal Prison', 'uzavře nejsilnějšího do ledu; při rozbití vybuchne podle dmg, který mezitím dostal'],
    ['glacier', 'Glacier', 'obří ledová stěna se sune místností a drtí nepřátele'], ['eternal_winter', 'Eternal Winter', '5 s sněhu po celé místnosti, každou sekundu podchladí všechny a dá krystal'],
    ['winter_titan', 'Winter Titan', 'ledový obr láká nepřátele na sebe a dupe']],
  light: [['arc_runner', 'Arc Runner', 'při chůzi necháváš elektrické koule, po zastavení vybuchnou'], ['lightning_web', 'Lightning Web', 'propojí nepřátele a vodiče sítí, která pálí neustále'],
    ['roc_of_storms', 'Roc of Storms', 'obří pták přeletí místnost a shazuje blesky'], ['overload_core', 'Overload Core', 'koule nad tebou sbírá Náboj, při 10 vypustí obří kritický výboj'],
    ['tempest_form', 'Tempest Form', 'na 4 s se změníš v bouři, každý skill přidá Lightning Bolt']],
  chaos: [['hail_of_thorns', 'Hail of Thorns', 'každé 3. seslání zasype šípy celou místnost a otráví všechny'], ['malediction', 'Malediction', 'prokleje najednou všechny nepřátele v místnosti'],
    ['shadow_archer', 'Shadow Archer', 'stínový dvojník opakuje tvé šípy'], ['locust_swarm', 'Locust Swarm', 'hejno kobylek, které se s každým zabitím zvětšuje'],
    ['plague_bearer', 'Plague Bearer', 'nádoba sbírá jed z mrtvých, pak ho vypustí jako obří výbuch']],
};
const SKILLS = {};
for (const el of ELS) {
  SK_RAW[el].forEach(([id, name, group, desc]) => SKILLS[id] = { id, el, name, group, desc, tier: GROUP_TIER[group] || 1 });
  SK_EX[el].forEach(([id, name, desc]) => SKILLS[id] = { id, el, name, group: 'exkluzivní', desc, tier: 0, ex: true });
}
const STARTER = { phys: ['sword', 'cleave'], fire: ['fstaff', 'fireball'], cold: ['cstaff', 'ice_shard'], light: ['wand', 'spark'], chaos: ['bow', 'toxic_arrow'] };
const gemsUnlockedTier = zoneReached => zoneReached >= 4 ? 4 : zoneReached >= 3 ? 3 : zoneReached >= 2 ? 2 : 1;

// ---------- support gems (10 per element) ----------
const SP_RAW = {
  phys: [
    ['wide_swing', 'Wide Swing', 'cleave,ground_slam,sunder,whirlwind,maelstrom_blade', '+10 % plochy', 'zásahy míří i dozadu'],
    ['ruthless', 'Ruthless', 'double_strike,blade_flurry,crushing_blow,thousand_cuts', 'každá 3. rána omráčí a dá +20 % dmg', 'drtivá je každá 2. rána'],
    ['deep_cracks', 'Deep Cracks', 'ground_slam,leap_slam,rock_spikes,earthquake,maelstrom_blade,worldbreaker', 'Trhliny o 1 s déle, +10 % dmg', 'Trhliny zpomalují nepřátele'],
    ['seismic_echo', 'Seismic Echo', 'aftershock,earthquake,titans_fall,worldbreaker', 'ozvěna o 10 % silnější, na levelu 5 druhá ozvěna', 'ozvěny tvoří Trhliny'],
    ['momentum', 'Momentum', 'flicker_strike,leap_slam,shield_charge,worldbreaker,thousand_cuts', 'po přesunu +15 % dmg', 'po přesunu 1 s nezranitelný'],
    ['bloodlust', 'Bloodlust', 'cleave,rampage,blood_rage,warlords_banner', '+0,5 % dmg vrací jako život', 'přebytečné léčení se mění ve štít'],
    ['overwhelm', 'Overwhelm', 'whirlwind,rampage,war_cry,titans_fall,maelstrom_blade,warlords_banner', '+1 max Zuřivost, +10 % zisk Zuřivosti', 'při plné Zuřivosti +20 % rychlost útoku'],
    ['executioner', 'Executioner', 'execute,earthquake,titans_fall,thousand_cuts', 'práh Execute +4 %, na levelu 3 a 5 finisher o 1 Zuřivost levnější', 'zabití finisherem vrátí polovinu Zuřivosti'],
    ['concussion', 'Concussion', 'crushing_blow,leap_slam,war_cry,shield_slam,warlords_banner,aegis_crash', 'omráčení se plní o 12 % rychleji a trvá o 0,2 s déle', 'omráčení dostávají +25 % dmg'],
    ['bulwark', 'Bulwark', 'shield_slam,shield_charge,reckoning,aegis_crash', '+10 % armouru se přičte k dmg, Reckoning častěji', 'blok vrací nepřátelské střely'],
  ],
  fire: [
    ['volatile', 'Volatile', 'fireball,inferno_orb,meteor,volcano', 'výbuch +15 % plochy', 'výbuch se rozpadne na 3 menší'],
    ['fuel', 'Fuel', 'flamethrower,searing_ray,overheat,solar_lance,inferno_crown', 'Žár roste o 15 % rychleji', 'Žár při chůzi nechladne'],
    ['lingering_flames', 'Lingering Flames', 'meteor,flame_wall,lava_pool,ash_step,solar_lance,volcano', 'hořící zem o 1 s déle, +10 % dmg', 'hořící zem zpomaluje'],
    ['searing_heat', 'Searing Heat', 'fire_nova,fire_ring,blazing_shield,phoenix,inferno_crown', '+12 % dmg, +10 % okruh', 'Fire Nova a Fire Ring pulzují dvakrát'],
    ['wildfire', 'Wildfire', 'living_bomb,pyre,combustion,phoenix,ember_tide', 'výbuchy +10 % dmg a vznítí okolí', 'každý výbuch spustí jeden další'],
    ['ember_mastery', 'Ember Mastery', 'ember_storm,pyre,ember_harvest,ember_tide', 'o 20 % víc uhlíků', 'uhlíky samy vybuchují'],
    ['hair_trigger', 'Hair Trigger', 'flame_wall,fire_trap,lava_pool,volcano', '+10 % dmg, na levelu 3 a 5 past/zeď navíc', 'pasti se plíží k nepřátelům'],
    ['kindled_spirit', 'Kindled Spirit', 'inferno_orb,fire_ring,flame_spirit,phoenix', '+10 % dmg, na levelu 5 druhý duch', 'duch při zabití vybuchne'],
    ['conflagration', 'Conflagration', 'overheat,combustion,firestorm,inferno_crown', 'finishery +12 % dmg', 'po finisheru Žár klesne jen na polovinu'],
    ['scorch', 'Scorch', 'fireball,flamethrower,searing_ray,ember_storm,solar_lance,ember_tide', 'vznícení +15 % dmg a trvá déle', 'vznícení se sčítá dvakrát'],
  ],
  cold: [
    ['splinter', 'Splinter', 'ice_shard,frost_lance,hailstorm,frozen_orb', '+8 % dmg, na levelu 2 a 4 střela navíc', 'střely se při dopadu rozdělí'],
    ['deep_freeze', 'Deep Freeze', 'cone_of_cold,frost_nova,ice_mine,winter_aura,frozen_orb,eternal_winter', 'podchlazení o 10 % rychleji, zamrznutí o 0,2 s déle', 'zamrzlí ztrácejí život'],
    ['brittle', 'Brittle', 'glacial_spike,shatter,avalanche,glacier,crystal_prison', '+12 % dmg proti zamrzlým', 'každé roztříštění dá krystal'],
    ['permafrost', 'Permafrost', 'blizzard,ice_wall,frozen_ground,frost_trail,glacier', 'zóny o 0,5 s déle a o 10 % větší', 'nepřátelé v zónách útočí o 25 % pomaleji'],
    ['cascade', 'Cascade', 'ice_mine,shatter,cold_snap,frozen_orb', 'výbuchy mrazu +10 % plochy a dmg', 'výbuch rovnou zmrazí'],
    ['crystal_lattice', 'Crystal Lattice', 'rime_harvest,frost_orbit,absolute_zero,crystal_prison,eternal_winter', '+1 max krystal', 'krystaly střílí střepy'],
    ['heavy_ice', 'Heavy Ice', 'glacial_spike,hailstorm,avalanche,glacier,winter_titan', '+15 % dmg', 'dopad zmrazí okolí'],
    ['frost_familiar', 'Frost Familiar', 'winter_aura,frost_orbit,frost_wraith,winter_titan', '+10 % dmg, na levelu 5 druhý duch', 'zásah ducha zmrazí'],
    ['numbing_cold', 'Numbing Cold', 'ice_shard,cone_of_cold,frostbite,crystal_prison', 'Frostbite +5 % dmg navíc', 'Frostbite platí i na podchlazené'],
    ['winters_grip', "Winter's Grip", 'frost_nova,blizzard,absolute_zero,winter_titan,eternal_winter', 'zmrazení a trvání +10 %', 'Absolute Zero spotřebuje jen půlku krystalů'],
  ],
  light: [
    ['fork', 'Fork', 'spark,chain_lightning,ball_lightning,lightning_web,roc_of_storms', '+1 přeskok', 'přeskok se smí vrátit na stejný cíl'],
    ['quickcast', 'Quickcast', 'spark,lightning_bolt,thunderclap,arc_runner', '+6 % rychlost seslání', 'každé 5. seslání se zdvojí'],
    ['supercharge', 'Supercharge', 'overcharge,feedback,thunderstorm,wrath_of_the_sky,tempest_form,overload_core', '+1 max Náboj', 'Náboj mizí až po 4 s'],
    ['high_voltage', 'High Voltage', 'lightning_bolt,storm_call,wrath_of_the_sky,tempest_form', '+15 % dmg jednomu cíli', 'zásah omráčí'],
    ['grid', 'Grid', 'tesla_pylon,lightning_rod,conduction,lightning_web', '+10 % dmg, na levelu 3 a 5 vodič navíc', 'vodiče přejdou s tebou do další místnosti'],
    ['static_buildup', 'Static Buildup', 'static_field,static_discharge,static_shield,lightning_web,overload_core', 'šok o 10 % silnější a delší', 'šok se při smrti přenese'],
    ['storm_front', 'Storm Front', 'storm_call,storm_cloud,thunderstorm,tempest_form,roc_of_storms', '+10 % plochy, na levelu 5 úder navíc', 'bouře se drží u tebe'],
    ['thunderbird', 'Thunderbird', 'ball_lightning,ion_orbit,storm_hawk,roc_of_storms', '+10 % dmg, na levelu 5 druhý jestřáb', 'zásahy jestřába dávají Náboj'],
    ['blink_mastery', 'Blink Mastery', 'thunderclap,static_shield,flash_step,arc_runner', 'delší záblesky, každý pustí výboj', 'po záblesku 0,5 s nezranitelnost'],
    ['critical_arc', 'Critical Arc', 'spark,chain_lightning,feedback,conduction,arc_runner,overload_core', '+3 % šance na krit', 'krit přeskočí na 2 cíle'],
  ],
  chaos: [
    ['barbed', 'Barbed', 'toxic_arrow,piercing_thorn,seeker_arrow,hail_of_thorns,shadow_archer', '+5 % dmg, na levelu 1, 3 a 5 stupeň jedu navíc', 'šíp proletí jedním nepřítelem'],
    ['split_arrow', 'Split Arrow', 'toxic_arrow,venom_volley,rain_of_blight,hail_of_thorns', '+5 % dmg, na levelu 2 a 4 šíp navíc', 'šípy se odráží od zdí'],
    ['lingering_toxins', 'Lingering Toxins', 'rain_of_blight,caustic_cloud,plague_aura,hail_of_thorns', 'mraky a aura o 10 % větší a delší', 'mrak se plíží k nepřátelům'],
    ['potent_venom', 'Potent Venom', 'plague_burst,contagion,virulence,plague_bearer', 'jed +10 % dmg', 'jed tiká dvakrát rychleji'],
    ['hexmaster', 'Hexmaster', 'wither,frailty_hex,doom_mark,festering,malediction', 'prokletí o 10 % silnější a o 1 s delší, na levelu 5 třetí prokletí', 'prokletí se při smrti přenese'],
    ['pandemic', 'Pandemic', 'caustic_cloud,plague_burst,contagion,plague_bearer,locust_swarm', 'šíření o 15 % dál', 'šíření přeskočí na 2 cíle'],
    ['feral_bond', 'Feral Bond', 'fly_swarm,carrion_raven,locust_swarm,shadow_archer', '+10 % dmg, na levelu 5 druhý havran', 'zvířata kradou život'],
    ['soul_eater', 'Soul Eater', 'soul_siphon,plague_harvest,deaths_arrow,plague_bearer', '+10 % esence', 'esence dává i rychlost útoku'],
    ['shadow', 'Shadow', 'seeker_arrow,fade,deaths_arrow,shadow_archer', 'první šíp po pohybu +15 % dmg', 'Fade platí ještě 1 s po zastavení'],
    ['decay', 'Decay', 'virulence,festering,plague_harvest,locust_swarm,malediction', '+8 % dmg proti nepřátelům s 10+ stupni jedu', 'otrávení útočí o 20 % pomaleji'],
  ],
};
const SUPPORTS = {};
for (const el of ELS) SP_RAW[el].forEach(([id, name, gems, lvl, corr]) => SUPPORTS[id] = { id, el, name, gems: gems.split(','), lvl, corr });

// ---------- zones and chapters (Schéma 9) ----------
const ZONES = [
  { name: 'Zelené údolí', theme: 'forest', sky: [0.42, 0.66, 0.36], fog: [0.42, 0.66, 0.36], fogd: 0, embers: 0, tint: [1, 1, 1],
    mini: { name: 'Kostěný strážce', model: 'sk_warrior', res: ['phys'], vuln: 'fire', tint: [1, 0.95, 0.85] },
    boss: { name: 'Pán údolí', model: 'barbarian', res: ['cold'], vuln: 'fire', tint: [0.85, 1, 0.8] } },
  { name: 'Podzimní hvozd', theme: 'autumn', sky: [0.55, 0.42, 0.25], fog: [0.5, 0.38, 0.24], fogd: 0.012, embers: 0, tint: [1, 0.9, 0.75],
    mini: { name: 'Šamanka hvozdu', model: 'sk_mage', res: ['chaos'], vuln: 'phys', tint: [1, 0.8, 0.6] },
    boss: { name: 'Lesní tyran', model: 'barbarian', res: ['phys', 'fire'], vuln: 'cold', tint: [1, 0.7, 0.45] } },
  { name: 'Spálené pláně', theme: 'burnt', sky: [0.23, 0.18, 0.15], fog: [0.17, 0.13, 0.1], fogd: 0.02, embers: 25, tint: [0.9, 0.78, 0.68],
    mini: { name: 'Popelavý lučištník', model: 'sk_rogue', res: ['fire'], vuln: 'cold', tint: [0.7, 0.6, 0.55] },
    boss: { name: 'Žhavý mág', model: 'mage', res: ['fire', 'light'], vuln: 'chaos', tint: [1, 0.6, 0.45] } },
  { name: 'Hlubiny', theme: 'dungeon', sky: [0.1, 0.09, 0.12], fog: [0.07, 0.06, 0.09], fogd: 0.026, embers: 10, tint: [0.78, 0.76, 0.86],
    mini: { name: 'Vězeňský kat', model: 'sk_warrior', res: ['cold'], vuln: 'light', tint: [0.7, 0.7, 0.85] },
    boss: { name: 'Král kostí', model: 'sk_warrior', res: ['phys', 'chaos'], vuln: 'light', tint: [0.75, 0.75, 1] } },
  { name: 'Popelavé srdce', theme: 'ash', sky: [0.06, 0.035, 0.035], fog: [0.05, 0.03, 0.03], fogd: 0.03, embers: 60, tint: [0.75, 0.66, 0.64],
    mini: { name: 'Plamenný rytíř', model: 'knight', res: ['light'], vuln: 'phys', tint: [1, 0.5, 0.35] },
    boss: { name: 'Cindermarch', model: 'barbarian', res: ['fire', 'cold'], vuln: 'chaos', tint: [0.6, 0.35, 0.3] } },
];
const DIFFS = ['Normal', 'Hardcore', 'Insane'];
const zoneOf = ch => Math.floor((ch - 1) / 4);                      // 0..4
const zoneResPct = z => [10, 15, 20, 25, 30][z];
const ROOMS = 50, TRADER_ROOMS = [10, 20, 30, 40], ELITE_ROOMS = [15, 35], BOSS_ROOMS = [25, 50];
// monster level: chapter 20 on Normal ends near 50, +4 during a run, harder difficulties sit higher
const monsterLevel = (ch, diff, room) => Math.round(1 + (ch - 1) * 2.55 + diff * 9 + (room - 1) / 12.25);
const chapterMult = (ch, diff) => (1 + 0.1 * (ch - 1)) * [1, 1.5, 2][diff];
// item rarity chances [N, M, R, U] in % (Drop rate rarit předmětů)
function rarityTable(ch, diff) {
  const z = zoneOf(ch), k = (ch - 1) % 4;
  if (z === 0) return [100, 0, 0, 0];
  if (z === 1) return [90 - 10 * k, 10 + 10 * k, 0, 0];
  if (z === 2) { const r = 4 + 4 * k + [0, 5, 10][diff]; return [56 - 4 * k - [0, 5, 10][diff], 40, r, 0]; }
  if (z === 3) return [[40, 38, 19, 3], [30, 40, 25, 5], [20, 40, 32, 8]][diff];
  return [[35, 38, 23, 4], [25, 40, 29, 6], [15, 38, 37, 10]][diff];
}
function rollRarity(ch, diff, boss) {
  const t = rarityTable(ch, diff); let r = rnd() * 100, i = 0;
  while (i < 3 && r >= t[i]) { r -= t[i]; i++; }
  if (boss) { const top = t[3] > 0 ? 3 : t[2] > 0 ? 2 : t[1] > 0 ? 1 : 0; i = Math.min(i + 1, top); }
  return i;
}
// diamonds per boss (Schéma 15)
const DIAMONDS_BOSS = [[10, 0, 0], [15, 0, 0], [20, 30, 40], [25, 35, 45], [30, 40, 50]];

// ---------- character level (Schéma 6) ----------
function runsForLevel(L) { // runs needed to go from L to L+1
  if (L < 5) return 1; if (L < 10) return 2;
  const seg = [[10, 20, 2, 4], [20, 30, 4, 6], [30, 40, 6, 9], [40, 50, 9, 12], [50, 60, 12, 16], [60, 70, 16, 20], [70, 80, 20, 25], [80, 90, 25, 35]];
  for (const [a, b, x, y] of seg) if (L < b) return x + (y - x) * (L - a) / (b - a);
  return [36, 38, 40, 42, 44, 46, 48, 50, 60, 80][L - 90] || 80;
}
const BASE_RUN_XP = 1000;
const fitChapterMult = L => chapterMult(clamp(Math.ceil(L / 2.5), 1, 20), L >= 80 ? 2 : L >= 60 ? 1 : 0);
const xpToNext = L => L >= 100 ? Infinity : Math.round(runsForLevel(L) * BASE_RUN_XP * fitChapterMult(L));
// XP of rooms in chapter 1 (sums to ~1000 per full run)
const ROOM_XP = { normal: 12, elite: 50, boss25: 100, boss50: 300 };
const ROOM_GOLD = { normal: 14, elite: 60, boss25: 120, boss50: 260 };
// in-run Stage (Schéma 5): stage 15 lands near room 40–45
const stageNeed = s => Math.round(18 + 2.6 * s);
const SOCKET_UNLOCK = { weapon: 1, offhand: 0, body: 10, boots: 25, helmet: 40, gloves: -50 };   // gloves: 50 finished runs
const STAT_SOCKET_LEVEL = 30;

// ---------- level rewards (Schéma 11) ----------
function levelReward(L) {
  const d = L % 10;
  if (d === 1 || d === 6) return { kind: 'gold', n: Math.round(150 * Math.pow(1.05, L)) };
  if (d === 2 || d === 7) return { kind: 'energy', n: 20 + Math.floor(L / 5) * 2 };
  if (d === 3 || d === 8) return { kind: 'diamonds', n: 10 + Math.floor(L / 4) * 2 };
  if (d === 4 || d === 9) return { kind: 'key', n: 1 };
  return { kind: 'gem', n: 1 };
}

// ---------- tower (Schéma 8) ----------
const TOWER = { maxEnergy: 100, regenMin: 3, cost: [10, 15, 20], floors: 25, unlock: 30, arena: 300 };
const towerCurve = f => Math.pow((f - 1) / 24, 1.4);
function towerDrop(diff, floor) {
  const c = towerCurve(floor), tv = 1 + 4 * c, lo = Math.floor(tv), frac = tv - lo;
  const tier = (lo + (rnd() < frac ? 1 : 0)) + 5 * diff;
  const second = diff === 0 ? 0 : diff === 1 ? 0.1 + 0.4 * c : 0.4 + 0.5 * c;
  let white = 0; if (diff === 1) white = floor === 25 ? 0.05 : floor === 24 ? 0.04 : 0; if (diff === 2) white = 0.06 + 0.06 * c;
  return { tier: Math.min(tier, 15), second, white };
}
const towerDiamonds = (diff, f) => Math.round([[10, 25], [25, 40], [40, 50]][diff][0] + ([[10, 25], [25, 40], [40, 50]][diff][1] - [[10, 25], [25, 40], [40, 50]][diff][0]) * (f - 1) / 24);
const towerMonsterLevel = (diff, f) => Math.round(28 + diff * 14 + (f - 1) * 1.1);

// ---------- stat gems ----------
const STATGEM = {
  red:    { name: 'Rudá perla', col: '#ff4d4d', txt: 'dmg' },
  green:  { name: 'Zelená perla', col: '#4ddb6a', txt: 'HP' },
  yellow: { name: 'Žlutá perla', col: '#ffd84a', txt: 'rychlost útoku' },
  white:  { name: 'Bílá perla', col: '#f4f1ea', txt: 'vše' },
};
// tier sets the base, gem level from the item multiplies it, quality adds up to +20 %
function statGemValue(g, gemLvl) {
  const base = g.col === 'yellow' ? 1.2 * g.tier : 2.6 * g.tier, lv = 1 + 0.035 * (gemLvl - 1), q = 1 + (g.q || 0) / 100;
  return g.col === 'white' ? base * 0.55 * lv * q : base * lv * q;
}

// ---------- world boss (Schéma 14 + Světoví bossové) ----------
const WB_BOSSES = [
  { day: 'Neděle', name: 'Popelavý Titán', model: 'barbarian', tint: [0.55, 0.4, 0.38], mech: ['slam', 'pools', 'walls', 'towers', 'clouds'], hp: 1.5, reward: 1.5 },
  { day: 'Pondělí', name: 'Ashgrom, Kovář hor', model: 'barbarian', tint: [0.85, 0.7, 0.55], mech: ['slam', 'anvils', 'shield'] },
  { day: 'Úterý', name: 'Královna Vesh', model: 'mage', tint: [1, 0.55, 0.4], mech: ['pools', 'phoenix', 'firering'] },
  { day: 'Středa', name: 'Kryon, Hlídač mrazu', model: 'knight', tint: [0.6, 0.85, 1], mech: ['walls', 'breath', 'spiral'] },
  { day: 'Čtvrtek', name: 'Roc bouře', model: 'mage', tint: [1, 0.95, 0.5], mech: ['towers', 'chain', 'dive'] },
  { day: 'Pátek', name: 'Matka hniloby', model: 'sk_mage', tint: [0.7, 1, 0.55], mech: ['clouds', 'eggs', 'curse'] },
  { day: 'Sobota', name: 'Zrcadlový rytíř', model: 'knight', tint: [0.8, 0.8, 0.95], mech: ['mirror', 'clones'] },
];
const WB_TIERS = [
  { name: 'Normal', level: 10, hp: 1, dmg: 1, gold: 1, dia: [5, 8, 10, 12, 15], item: 2 },
  { name: 'Magic', level: 40, hp: 4, dmg: 1.6, gold: 2, dia: [7, 10, 13, 16, 19], item: 2 },
  { name: 'Rare', level: 60, hp: 12, dmg: 2.5, gold: 4, dia: [8, 12, 16, 20, 24], item: 3 },
  { name: 'Unique', level: 80, hp: 35, dmg: 4, gold: 8, dia: [10, 15, 20, 25, 30], item: 3 },
];
const WB_MILES = [0.10, 0.25, 0.45, 0.70, 0.90], WB_GOLD_SHARE = [0.10, 0.15, 0.20, 0.25, 0.30];
const WB_KEYS_PER_DAY = 2, WB_TIME = 300;

// ---------- shop (Schéma 12) ----------
const SHOP = { chest: 200, refresh: 50, gemRuns: 5, uniqueRuns: 10, rareRuns: 3 };
const START_DIAMONDS = 100;

// ---------- skill tree labels ----------
const TREE_STAT = {
  lifePct: '% max. života', dmgPct: '% dmg', atkSpeed: '% rychlost útoku', armourPct: '% armouru', crit: '% šance na krit', critMulti: '% násobek kritu',
  moveSpeed: '% rychlost pohybu', dodge: '% šance na úhyb', physDmg: '% fyzického dmg', rageGain: '% zisk Zuřivosti', fissureDur: '% trvání Trhlin',
  stunBuild: '% plnění omráčení', armourPen: '% průraz armouru', fireDmg: '% ohnivého dmg', heatGain: '% zisk Žáru', igniteDmg: '% dmg vznícení',
  burnGroundDur: '% trvání hořící země', areaPct: '% plochy', coldDmg: '% ledového dmg', chillBuild: '% podchlazení', freezeDur: '% trvání zmrazení',
  shatterDmg: '% dmg roztříštění', zoneDur: '% trvání ledových zón', lightDmg: '% dmg blesku', chargeGain: '% zisk Náboje', shockEff: '% síla šoku',
  castSpeed: '% rychlost skillů', chaosDmg: '% chaos dmg', poisonDmg: '% dmg jedu', poisonDur: '% trvání jedu', curseEff: '% síla prokletí', essenceGain: '% zisk Esence',
};
const KEYSTONES = {
  'Unbreakable': '+40 % armour, armour snižuje i elementální dmg napůl, −15 % rychlost útoku',
  'Berserker': 'Zuřivost nevyprchá, +3 % dmg za bod, při plné Zuřivosti −1 % HP/s',
  'Pyromaniac': 'Vznícení +100 % dmg, přímé ohnivé zásahy −30 %',
  'Living Furnace': 'Žár nechladne, na maximu −1 % HP/s',
  'Frozen Heart': 'Zmražení nepřátelé nemohou útočit, pohyb −15 %',
  'Ice Fortress': 'Krystaly dorůstají samy každé 2 s, skilly o 20 % pomalejší',
  'Overload': 'Kritické zásahy +100 %, nekritické −40 %',
  'Static Body': 'Náboj nevyprchá, ale max 5',
  'Plague Lord': 'Jed bez limitu stupňů, přímé zásahy −50 %',
  'Pact of Rot': 'Kletby 2× rychleji a po smrti nepřítele se šíří, −20 % max HP',
  'Searing Steel': 'Fyzické zásahy zapalují',
  'Thermal Shock': 'Hořící nepřítel, který zchladne, exploduje (i obráceně)',
  'Superconductor': 'Každý zmražený nepřítel přidá řetězu blesku skok navíc',
  'Corrupted Current': 'Šokovaní nepřátelé jsou i otrávení',
  'Rending Venom': 'Fyzické zásahy přidají stupeň jedu',
};
const AREA_EL = { physical: 'phys', fire: 'fire', cold: 'cold', lightning: 'light', chaos: 'chaos' };
