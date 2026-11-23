# Kvito – strategija naročnine

Stanje: testno obdobje se je končalo 22. 11. 2026; omejitve paketov veljajo vedno. Ta dokument določa, kako Kvito zaračunava, in je osnova za cenik na spletni strani (`web/public/index.html#cenik`) in za aplikacijo.

## 1. Načela

1. **Plača samo najemodajalec. Najemnik je vedno brezplačen.** Najemnik je tisti, ki ga najemodajalec povabi; vsaka ovira pri njem zmanjša vrednost za najemodajalca.
2. **Merilo je najemna enota** (stanovanje, soba, poslovni prostor – v podatkovnem modelu `Unit`), ne nepremičnina. Hiša s tremi stanovanji so tri enote. To je pošteno do lastnika enega stanovanja in raste z vrednostjo, ki jo Kvito prinaša.
3. **Vsi paketi imajo vse funkcije – razen AI pomočnika.** Paketi se razlikujejo po številu enot, prostoru za datoteke in podpori. Edina izjema je AI pomočnik »Vprašaj Kvito« (od 23. 11. 2026): na voljo je v plačljivih paketih (tudi v Kvitovem preizkusu), ker vsak odgovor stane klic API-ja. Brezplačni paket v pomočniku vidi povabilo k nadgradnji.
4. **Ena enota je za vedno brezplačna.** Večina zasebnih najemodajalcev v Sloveniji oddaja eno ali dve enoti; prva mora biti brez tveganja in brez kartice.
5. **Podatki se nikoli ne izbrišejo zaradi paketa.** Če naročnina poteče ali uporabnik preseže omejitev, enote nad omejitvijo preidejo v način samo za branje; najemniki še naprej vidijo svoj najem.

## 2. Paketi in cene

| Paket | Enote | Mesečno | Letno (2 meseca gratis) | Na mesec pri letnem | Prostor | Podpora |
|---|---|---|---|---|---|---|
| **Brezplačno** | 1 | 0,00 € | – | – | 1 GB | E-pošta |
| **Plus** ★ | do 3 | 4,99 € | 49,90 € | 4,16 € | 5 GB | E-pošta |
| **Pro** | do 10 | 11,99 € | 119,90 € | 9,99 € | 20 GB | Prednostna e-pošta |
| **Upravnik** | do 30 | 27,99 € | 279,90 € | 23,33 € | 50 GB | Prednostna e-pošta |
| Več kot 30 enot | po dogovoru | | | | | |

★ Priporočen paket na spletni strani (pokrije najpogostejšo situacijo: 2–3 stanovanja).

Cena na enoto pri polni zasedenosti paketa: Plus 1,66 €, Pro 1,20 €, Upravnik 0,93 € (mesečno plačilo). Večji portfelj plača manj na enoto, a nikoli ne pade pod ~0,8 € na enoto.

Vse cene so končne cene za uporabnika. `TODO(preveri)`: obračun DDV je odvisen od statusa izdajatelja (s.p./d.o.o., zavezanec za DDV ali ne) in od plačilnega ponudnika (glej 6). Pred objavo plačljivih paketov potrdi z računovodjo.

### Zakaj te cene

- **Domači tekmec imetje.si** (preverjeno 19. 11. 2026): prva nepremičnina brezplačna; 7,99 €/mesec za 1 nepremičnino, 19,99 €/mesec do 10, 49,99 €/mesec do 30; letno 2 meseca brezplačno. Kvito je pri vsakem koraku cenejši (4,99 € / 11,99 € / 27,99 €) in šteje enote, ne nepremičnin.
- **Tuji primerljivi** (orientacijsko, druga trga): Landlord Studio (UK) 15 £ + DDV/mesec za 3 enote + 1,20 £ na dodatno enoto, letno −20 %; TenantCloud (ZDA) od 25 $/mesec, brez brezplačnega paketa. Slovenski najemodajalec je bolj občutljiv na ceno; Kvito cilja na »manj kot kava na mesec« za tipičnega lastnika.
- **Prag plačila.** 4,99 € je cena, ki jo lastnik 2–3 stanovanj sprejme brez premisleka (najemnina enega stanovanja je stokrat višja). Brezplačna prva enota pomeni, da ta odločitev pride šele, ko uporabnik Kvito že uporablja.

## 3. Pretvorba (od brezplačnega do plačljivega)

1. Registracija brez kartice → ena enota brezplačno, vse funkcije.
2. Ko najemodajalec doda **drugo enoto**, mu Kvito ponudi **30 dni paketa Plus brezplačno, brez kartice**. Po 30 dneh izbere paket ali obdrži eno enoto (ostale samo za branje).
3. Opomnik 7 dni in 1 dan pred koncem preizkusa (obvestilo v aplikaciji in e-pošta).
4. Ob letnem plačilu jasno pokaži prihranek (»2 meseca gratis«). Letno plačilo je privzeto izbrano na strani za plačilo (glej 6 – nižji delež provizije).

## 4. Testno obdobje in ustanovni uporabniki

- Testno obdobje (brezplačno za vse, brez omejitev) se je **končalo 22. 11. 2026**. Migracija `20261122200000_end_test_period` ob deployu podeli ustanovno ceno in 30-dnevni prehod (spodaj).
- **Ustanovna cena:** kdor se registrira v testnem obdobju, ima **−30 % na izbrani paket, dokler je naročen** (Plus 3,49 €, Pro 8,39 €, Upravnik 19,59 € mesečno). To nagradi prve uporabnike, ki pomagajo pri testiranju, in zmanjša odhod ob koncu testnega obdobja.
- Ob koncu testnega obdobja vsak obstoječi uporabnik z več kot eno enoto dobi 30 dni preizkusa paketa, ki ustreza številu njegovih enot (enako kot v točki 3), z že upoštevano ustanovno ceno.

## 5. Pravila, ki jih mora upoštevati aplikacija

- **Štetje enot:** šteje se vsaka enota najemodajalca (`Unit` brez `deletedAt`). Prazna enota se šteje (vnesena je, lahko jo kadar koli oddaš); odstranjena ne.
- **Preseganje omejitve:** novih enot ni mogoče dodati; obstoječe enote nad omejitvijo (najnovejše) so samo za branje (brez novih obveznosti in sporočil), dokler najemodajalec ne nadgradi ali odstrani odvečnih enot. Najemniki teh enot še vedno vidijo zgodovino in plačilne podatke že izdanih obveznosti.
- **Prostor:** šteje se skupna velikost priponk najemodajalca in njegovih najemov. Pri 90 % opozorilo, pri 100 % novih datotek ni mogoče naložiti.
- **Najemnik** nikoli ne vidi cenika in nikoli ne dobi poziva k plačilu.
- **Preklic:** kadar koli, velja do konca plačanega obdobja; nato se račun vrne na paket Brezplačno po pravilih zgoraj. Brez vračil za delna obdobja `TODO(preveri)` – skladnost s pravili za pogodbe na daljavo (potrošniki, 14 dni) potrdi pravnik.
- **Nadgradnja:** takoj, sorazmerni obračun preostanka obdobja (to naredi plačilni ponudnik).

## 6. Plačila

Kvito še nima registriranega podjetja. Priporočilo:

1. **Najprej registracija dejavnosti** (s.p. ali d.o.o.) – `TODO(preveri)` z računovodjo: obliko, DDV status in obveznosti pri prodaji digitalnih storitev potrošnikom v EU. Brez registrirane dejavnosti plačljivih paketov ne zaženemo.
2. **Plačilni ponudnik: Polar** (polar.sh, »Merchant of Record« – ponudnik je prodajalec, obračuna in plača DDV v vseh državah EU, izda račune). **Odločeno 22. 11. 2026.** Primerjali smo še Paddle (5 % + 0,50 $ na transakcijo, preverjeno 19. 11. 2026) in Stripe Managed Payments. `TODO(preveri)`: provizija Polarja, sprejemljivost za s.p. in izplačila na slovenski račun potrdi pri ponudniku.
3. **Provizija in letno plačilo:** pri fiksnem delu provizije (npr. 0,50 $) pri 4,99 € mesečno to pomeni ~14 % provizije; pri letnih 49,90 € pa ~6 %. Zato je letno plačilo privzeto in nagrajeno z 2 mesecema.
4. Aplikacija nikoli ne prejme denarja najemnine (načelo iz CLAUDE.md ostaja) – naročnina gre izključno prek plačilnega ponudnika.

## 7. Izvedba v aplikaciji (vrstni red)

1. `Subscription` na uporabniku: `plan` (FREE, PLUS, PRO, MANAGER), `status`, `currentPeriodEnd`, `trialEndsAt`, `founder` (bool – ustanovna cena), `providerCustomerId`, `providerSubscriptionId`.
2. Funkcija `planLimits(plan)` (enote, prostor) in preverjanje na strežniku pri ustvarjanju enote, najema, obveznosti in nalaganju datotek. Napaka `PLAN_LIMIT` z jasnim sporočilom in gumbom »Poglej pakete«.
3. Stran **Naročnina** v nastavitvah najemodajalca: trenutni paket, poraba (enote, prostor), gumb za nadgradnjo (odpre stran za plačilo pri ponudniku) in za upravljanje naročnine.
4. Webhook ponudnika → posodobi `Subscription` (idempotentno, podpis preverjen).
5. Oznaka ustanovnih uporabnikov ob koncu testnega obdobja (vsi računi najemodajalcev, ustvarjeni pred datumom konca) – narejeno z migracijo `20261122200000_end_test_period`.
6. E-pošta in obvestila: konec preizkusa, neuspešno plačilo, preseganje omejitve.

Pred korakom 4 vprašaj lastnika projekta (CLAUDE.md: plačilni ponudnik) – odobreno 22. 11. 2026 (Polar).

**Stanje (20. 11. 2026):** koraki 1–3 so narejeni (`Subscription`, `server/src/modules/billing/plans.ts`, stran »Naročnina« v meniju računa). Omejitve se od 22. 11. 2026 preverjajo vedno (stikala `PLAN_LIMITS_ENABLED` ni več). Enote nad omejitvijo so samo za branje pri novih najemih in obveznostih; sporočila ostanejo odprta, da se najemnik in najemodajalec lahko vedno dogovorita. Korak 5 je narejen 22. 11. 2026, korak 6 še čaka.

**Konec testnega obdobja (22. 11. 2026):** vsi obstoječi najemodajalci imajo `founder = true`. Kdor ima več kot eno enoto in še nima paketa, ima 30 dni Kvitovega lastnega preizkusa paketa, ki ustreza številu enot (`status = TRIALING`, `trialEndsAt`, brez `providerSubscriptionId`); po `trialEndsAt` `planOf` vrne FREE. Stran Naročnina med preizkusom pokaže datum konca. `TODO`: opomnik 7 dni in 1 dan pred koncem preizkusa (korak 6).

**Stanje (22. 11. 2026): korak 4 je narejen (Polar) in deluje v produkciji** (preizkušeno s popustom 100 %).

- Strežnik: `server/src/modules/billing/polar.ts` (klient, preslikava izdelkov), `webhook.ts` (preverjanje podpisa, posodobitev `Subscription`), `routes.ts` (`GET /api/billing`, `POST /api/billing/checkout`, `POST /api/billing/portal`). Webhook: `POST /api/webhooks/polar`.
- Webhook obdela `subscription.created|active|updated|canceled|uncanceled|past_due|revoked` iz celotnega stanja naročnine. Idempotentno; dogodek, starejši od zadnjega uporabljenega (`Subscription.providerUpdatedAt`), se zavrže. Preklic ob koncu obdobja = `CANCELED` z `currentPeriodEnd` do konca plačanega obdobja – paket velja do tega datuma. Sprememba paketa se zapiše v `AuditLog`.
- En najemodajalec = ena naročnina: kdor jo že ima, gre v portal Polar (menjava paketa, kartica, računi, preklic).
- Stran Naročnina: stikalo Mesečno/Letno (privzeto Letno), gumb »Izberi« odpre plačilo pri Polarju, po vrnitvi (`?placilo=ok`) se paket posodobi v nekaj sekundah.
- **Promocijska koda `NEW30`**: ustvari se v Polarju kot popust z veljavnostjo »once«; uporabnik jo vpiše na strani za plačilo (`allow_discount_codes`). V aplikaciji: enkratno pojavno okno (`client/src/features/billing/PromoDialog.tsx`, koda in odstotek v `PROMO` v `client/src/constants`) in trak na strani Naročnina. Vidi ju najemodajalec, ki lahko plača (`checkoutEnabled`), še nima naročnine in ni ustanovni uporabnik (ta ima −30 % za vedno, Polar pa uporabi en popust na plačilo). Po zaprtju se okno pokaže znova čez 7 dni, na napravi največ 3-krat (`PROMO.repeatAfterDays`, `PROMO.maxShows`); nova koda začne šteti od začetka.
- **Ustanovni popust** −30 % »forever«: popust v Polarju, njegov ID v `POLAR_FOUNDER_DISCOUNT_ID`; samodejno se uporabi za račune z `founder = true` (oznako nastavi korak 5).

Nastavitev in kontrolni seznam: [POLAR_SETUP.md](POLAR_SETUP.md).

Spremenljivke okolja (strežnik, vse neobvezne; plačila so vklopljena samo, ko so nastavljeni žeton, skrivnost in vseh 6 izdelkov):

| Spremenljivka | Pomen |
|---|---|
| `POLAR_SERVER` | `sandbox` (privzeto) ali `production` |
| `POLAR_ACCESS_TOKEN` | Organization Access Token |
| `POLAR_WEBHOOK_SECRET` | skrivnost webhooka (`whsec_...`) |
| `POLAR_PRODUCT_PLUS_MONTHLY`, `POLAR_PRODUCT_PLUS_YEARLY` | ID-ja izdelkov Plus |
| `POLAR_PRODUCT_PRO_MONTHLY`, `POLAR_PRODUCT_PRO_YEARLY` | ID-ja izdelkov Pro |
| `POLAR_PRODUCT_MANAGER_MONTHLY`, `POLAR_PRODUCT_MANAGER_YEARLY` | ID-ja izdelkov Upravnik |
| `POLAR_FOUNDER_DISCOUNT_ID` | popust za ustanovne uporabnike |

Izdelki v Polarju imajo v metadata `plan` (PLUS, PRO, MANAGER) in `interval` (month, year); strežnik jih uporabi kot rezervo, če ID izdelka ni v okolju.

`TODO(preveri)`: pravila preklica in vračil (pogodbe na daljavo, 14 dni) in DDV – potrdita pravnik in računovodja pred produkcijo.

## 8. Kaj spremljamo

- Delež najemodajalcev z več kot 1 enoto (kandidati za plačilo).
- Pretvorba preizkus → plačljivo (cilj ≥ 25 %).
- Delež letnih naročnin (cilj ≥ 50 %).
- Odhod mesečno (cilj < 3 %).
- Povprečno število enot na plačljiv račun – če je večina na meji paketa, preveri meje paketov.

Cene pregledamo 6 mesecev po koncu testnega obdobja.
