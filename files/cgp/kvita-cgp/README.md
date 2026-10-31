Kvita povezuje najemodajalca in najemnika: obveznosti, plačila z UPN QR, sporočila, okvare in dokumenti na enem mestu. Znamka je **inženirski mir** – natančna kot tehnično orodje, a topla v jeziku. Vizualno: grafit in topel kamen, tanke linije in mreže, mono nadnaslovi in ena sama zelena barva, ki pomeni »poravnano«.

## Vsebina in glas

- **Tikaj** in piši kratke stavke. »Plačaj v svoji banki, nato tapni Plačal sem.« – ne »Spoštovani uporabnik, prosimo, da …«.
- **Stavčne velike črke** v naslovih in gumbih (»Pošlji opomnik«). VELIKE ČRKE samo v slogu `eyebrow` in v značkah.
- **Brez pravniškega jezika**, brez groženj ob zamudi. Zamuda je dejstvo: »Rok je potekel pred 3 dnevi.« – ne »Kršite pogodbo!«.
- **Brez emoji** v vmesniku. Edini znak je ✓ v stanju »Kvita ✓«.
- **Številke:** zneski »1.250,00 €« (tisočice s piko, decimalke z vejico, € za zneskom), datumi »15. 11. 2026«, obdobja »nov 2026« v nadnaslovih.
- **Pozitiven zaključek:** ko je vse potrjeno, aplikacija reče »Kvita ✓« (`SettledBanner`). Tega ne uporabljaj za delno plačane mesece.

## Barve

- Ena sama poudarjena barva: `accent` (zelena). Uporabi jo za primarno dejanje, aktivno stanje, povezave in »Poravnano«. Vse ostalo je nevtralno.
- Ozadje strani je `surface`; kartice, obrazci in polja so `surface-raised` z robom `line`; vgreznjena področja `surface-sunken`.
- `panel` je vedno temen (tudi v svetli temi) – za hero, povzetke in »Kvita ✓«. Na njem pisava `ink-on-panel` in `ink-on-panel-muted`, poudarki v `signal`.
- `signal` (#38E08C) je svetla zelena znaka in ilustracij. Nikoli kot besedilo na svetlih površinah – tam je `accent`.
- Stanja: `warn` (zamuda), `danger` (spor, napaka), vsako z `-soft` ozadjem. Vedno z besedo in ikono, nikoli samo barva – zelena in rdeča se ločita le po odtenku.
- Besedilo: `ink` za glavno, `ink-muted` za sekundarno, `ink-faint` za mono nadnaslove. Vsi pari ≥ 4,5 : 1 v obeh temah; `accent` kot besedilo ne na `surface-sunken` v svetli temi.
- Teme: **Kamen** (svetla, privzeta) in **Grafit** (temna). Preklop prek `data-theme`.

## Tipografija

- **Geist** (sans) za vse besedilo in naslove, **Geist Mono** za nadnaslove, zneske, IBAN, sklice in kode. Obe z Google Fonts (`wght` 400/500/600, mono 400/500), podpirata č, š, ž.
- Lestvica: `display` 64 (hero), `h1` 40, `h2` 28 (naslov zaslona na telefonu), `h3` 20 (kartice), `body-lg` 18, `body` 16 (privzeto), `body-sm` 14, `label` 14/500, `eyebrow` 11 mono VELIKE, `mono` 13, `amount` 24 mono.
- Naslovi so tesni (negativen razmik črk), poravnani levo. Nikoli centrirani odstavki.
- Zneski vedno v `amount` ali `mono` s tabelarnimi številkami, da se stolpci poravnajo.

## Prostor, mreža in oblike

- Osnova 4 px. Razmiki iz `space-*`: 16 px robovi zaslona na telefonu (`space-4`), 24 px notranji odmik kartic na namizju (`space-6`), 32 px med sklopi (`space-8`).
- Okrasna mreža `grid` s korakom 24 px v ozadju hero sekcij, praznih stanj in panelov (razred `kv-grid-bg`). Samo okras.
- **Robovi, ne sence.** Kartice imajo 1 px `line` in brez sence. `shadow-overlay` samo za menije, modalna okna in toaste.
- Radiji so majhni: `radius-sm` 4 px (gumbi, polja), `radius-md` 6 px (kartice, paneli), `radius-xs` 2 px (značke). `radius-pill` samo za statusne pike in preklopnike – gumbi nikoli niso pill.
- Tarče za dotik na telefonu najmanj `control-lg` (48 px).

## Ikone in slike

- **lucide-react**, debelina poteze 1,5, velikosti 16 px (v gumbih in značkah) in 20 px (navigacija). Barva `currentColor`.
- Ilustracije: izometrični žični modeli v 1 px linijah, ena poudarjena ploskev v `signal` (glej skupino Ilustracije). Brez fotografij ljudi, maskot, prelivov in 3D senčenja.
- Logotip: `kvita-lockup-light.svg` na svetlem, `kvita-lockup-dark.svg` na `panel`. Pravila v skupini Logotipi.

## Stanja in gibanje

- Fokus: 2 px poln obroč `focus` z 2 px odmikom na vseh interaktivnih elementih.
- Hover: sekundarni gumb potemni rob na `ink`, ghost dobi `surface-sunken`. Onemogočeno: 45 % prosojnost, kazalec not-allowed.
- Gibanje kratko in mirno: 150–200 ms, ease-out, samo barva in prosojnost. Ob `prefers-reduced-motion` brez animacij. Nobenih poskakovanj ali konfetov – tudi »Kvita ✓« se samo pokaže.

## Plačila

- Plačilni podatki vedno v `PaymentPanel`: QR + vrstice »Kopiraj« (na telefonu QR-ja na istem zaslonu ni mogoče skenirati).
- QR koda ima čisto belo ozadje in tih rob – edina izjema od tokenov. QR v knjižnici je vzorec; v aplikaciji je prava UPN QR koda.

## Komponente

`window.Kvita` (React 18): `Button`, `Eyebrow`, `StatusBadge`, `Field`, `ChargeCard`, `PaymentPanel`, `SettledBanner`. Razredi imajo predpono `kv-`; vrednosti berejo iz CSS spremenljivk tokenov. Pisavi naloži z Google Fonts:
`https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap`
