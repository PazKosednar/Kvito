# Kvito – specifikacija MVP

Spletna aplikacija + PWA **Kvito** za komunikacijo in obveznosti med najemodajalcem in najemnikom v Sloveniji (dolgoročni in srednjeročni najem). Kasneje jo zapakiramo s Capacitorjem za iOS in Android, zato je arhitektura API-first in brez odvisnosti od funkcij, ki obstajajo samo v brskalniku.

Jezik: koda, imena v bazi in komentarji v angleščini; uporabniški vmesnik v slovenščini (i18n pripravljen za `sl` in `en`).

## 1. Znamka
- Ime: **Kvito** (iz »biti kvit« = vse je poravnano). Ime se v kodi in vmesniku piše vedno točno tako.
- Ton: topel, preprost, brez pravniškega jezika. Kratki stavki, tikanje.
- Barve: mirna zelena ali modrozelena kot primarna barva, ki vzbuja zaupanje, a ne deluje bančno. Vse barve so design tokens na enem mestu (CSS spremenljivke + Tailwind/shadcn tema), enostavno zamenljive. Svetla in temna tema.
- Logotip: začasen SVG (kljukica + ključ); iz njega se generirajo PWA ikone in favicon.
- Mikrobesedila: ko ima najemno razmerje vse obveznosti potrjene, se prikaže stanje »Kvito ✓«. Prazna stanja in obvestila so prijazna, ne birokratska.
- PWA manifest: `name` in `short_name` = »Kvito«, `lang` = »sl«.
- Bundle ID za kasnejši Capacitor: `TODO(preveri)` – predlog `si.kvita.app`, potrditev, ko bo domena urejena.

## 2. Produkt
Vse med najemodajalcem in najemnikom na enem mestu: obveznosti (najemnina, položnice) s plačilom prek UPN QR v najemnikovi banki, sporočila, okvare, števci, dokumenti in digitalni zapisnik ob vselitvi in izselitvi.

**Ni v obsegu:** Airbnb/kratkoročni najem, kartična plačila ali kakršno koli zbiranje denarja v aplikaciji, generiranje pogodb, davčni izračuni, e-podpis, nativne aplikacije.

## 3. Vloge in dostop
- **Najemodajalec:** nepremičnine, enote, najemna razmerja, objava obveznosti, potrjevanje plačil.
- **Najemnik:** vidi svoje obveznosti, plača v svoji banki, javi plačilo, piše sporočila, prijavlja okvare, vnaša števce.
- En uporabnik ima lahko obe vlogi (preklop v vmesniku).
- Najemnik vidi SAMO svoje najemno razmerje, najemodajalec SAMO svoje nepremičnine. Dostop se preverja na strežniku pri vsakem zahtevku.

## 4. Funkcije MVP
1. **Prijava brez gesla:** enkratna koda po e-pošti → JWT (kratkoživ access + refresh v httpOnly piškotku), omejitev poskusov. V razvoju se koda izpiše v konzolo strežnika.
2. **Nepremičnina → enota → najemno razmerje:** začetek in konec, najemnina, dan zapadlosti, varščina, IBAN prejemnika, katere stroške krije najemnik in kako se delijo (enako, %, po osebah). Brez vgrajenih zakonskih privzetkov o tem, kdo plača kaj – to nastavi najemodajalec.
3. **Povabilo najemnika:** povezava + QR koda; najemnik se pridruži brez namestitve aplikacije.
4. **Obveznosti (Charge):**
   - najemnina se ustvari samodejno vsak mesec (cron, idempotentno),
   - položnica: najemodajalec naloži PDF ali sliko; če ima UPN QR, ga aplikacija prebere in predizpolni znesek, rok, IBAN in sklic,
   - delitev med sostanovalce (ChargeShare),
   - statusi: `OPEN` → `REPORTED_PAID` (najemnik javi plačilo, neobvezno dokazilo) → `CONFIRMED` (najemodajalec); poleg tega `OVERDUE` in `DISPUTED`,
   - plačilo: (a) najemodajalcu prek UPN QR, ki ga ustvari aplikacija, ali (b) neposredno dobavitelju s podatki z originalne položnice.
5. **Plačilni podatki na telefonu:** QR kode na istem zaslonu ni mogoče skenirati, zato so vedno prikazani tudi gumbi »Kopiraj« (IBAN, znesek, sklic, namen) in »Shrani QR kot sliko«; QR se pošlje tudi po e-pošti.
6. **Sporočila:** pogovor na najemno razmerje, priponke (slike, PDF), oznaka prebrano, sistemska sporočila ob dogodkih; sporočilo je lahko vezano na obveznost ali okvaro.
7. **Okvare:** kategorija, opis, fotke, nujnost; `NEW` → `IN_PROGRESS` → `RESOLVED`; komentarji.
8. **Števci:** odčitek + fotka (elektrika, voda, plin, toplota), zgodovina po enoti.
9. **Primopredaja (vselitev in izselitev):** prostori in oprema s fotkami, stanje števcev, ključi; potrdita obe strani; PDF zapisnik z logotipom Kvito.
10. **Dokumenti:** pogodba, aneksi, hišni red, navodila naprav; nastavljiva vidnost.
11. **Opomniki:** 3 dni pred rokom, na dan roka in po zamudi; najemodajalcu tedenski povzetek. Web Push, e-pošta kot rezerva. E-poštne predloge v slogu znamke Kvito.
12. **Pregled za najemodajalca:** odprto in zamujeno po enotah; letni izvoz prejetih plačil v CSV/PDF (brez davčnih izračunov).
13. **Revizijska sled:** vsaka sprememba zneska ali statusa se zabeleži (kdo, kdaj, prej/potem); samo mehko brisanje.

## 5. UPN QR (ključno)
- Implementacija po tehničnem standardu UPN QR Združenja bank Slovenije (dokumentacija na zbs-giz.si in upn-qr.si). Preveriti zadnjo različico standarda, pravila za reference (SI/RF) in seznam kod namenov – nič na pamet. Če dokumentacije ni mogoče prebrati, jo priloži lastnik projekta.
- Referenci: odprtokodni implementaciji Python `upnqr` in PHP `datalinx/php-upn-qr-generator`; v Node preverjena knjižnica ali lasten modul z unit testi.
- Sklic se tvori tako, da kasneje omogoča samodejno ujemanje z bančnim izpiskom (vsebuje ID obveznosti).
- `TODO(preveri)`: ali generiranje UPN QR v aplikaciji zahteva registracijo ali preverjanje pri upn-qr.si.
- Testna stran z vzorčnimi QR kodami za ročni preizkus v več slovenskih bančnih aplikacijah.
- Aplikacija nikoli ne prejme ali posreduje denarja.

## 6. Tehnični sklad
- **Frontend:** React + TypeScript + Vite, Zustand, shadcn/ui, lucide-react, vite-plugin-pwa (namestljiva aplikacija, offline branje zadnjih podatkov).
- **Backend:** Node.js + Express + TypeScript, Prisma, PostgreSQL, validacija z zod.
- **Realni čas:** Socket.IO (fallback polling).
- **Push:** Web Push (VAPID) z lastnega strežnika, za skupnim vmesnikom, da kasneje dodamo FCM/APNs prek Capacitorja. Na iOS push za PWA deluje le, če je dodana na začetni zaslon → v onboardingu navodilo.
- **Datoteke:** v razvoju mapa `uploads` (ustvari se ob zagonu strežnika), v produkciji S3-kompatibilna hramba v EU; dostop samo s podpisanimi URL-ji.
- **Cron** za najemnine in opomnike (idempotentno).
- **Deploy:** Railway (EU regija), koda na GitHubu.
- **Podatkovni model (izhodišče):** User, Property, Unit, Tenancy, TenancyMember, Invitation, Charge, ChargeShare, PaymentReport, Message, Attachment, Issue, IssueComment, Document, MeterReading, Handover, HandoverItem, Notification, PushSubscription, AuditLog. Zneski v centih (integer, EUR). Datumi v UTC, prikaz v Europe/Ljubljana.

## 7. Varnost
- Minimalni podatki: brez EMŠO in kopij osebnih dokumentov.
- Avtorizacija na strežniku za vsak vir, rate limiting, validacija vseh vhodov.
- Skrivnosti samo v `.env` (v `.gitignore`); v repozitoriju le `.env.example`.
- Izvoz in izbris podatkov uporabnika; pravila hrambe.
- Pogoji uporabe in politika zasebnosti: `TODO(pravnik)`.

## 8. Pravila dela
- Okolje: Windows + PowerShell v VS Code. Vsi ukazi in skripte delujejo v PowerShellu. `start.ps1` zažene client in server.
- Lokalna baza: `createdb` ni v PATH; način (lokalni PostgreSQL ali Docker) se dogovori v Fazi 0 in opiše v README.
- Monorepo `/client` in `/server` (repozitorij `kvita`). V clientu ločeno: types, constants, contexts, hooks (vsa poslovna logika v custom hookih), components, layout, auth, pages, features.
- `prisma.seed` v `server/package.json`; seed: 1 najemodajalec, 2 enoti, 3 najemniki, obveznosti v vseh statusih.
- Pozor na konflikte imen ikon lucide-react s tipi (npr. `User`).
- Pred večjo spremembo preberi obstoječe datoteke; ne prepisuj delujoče kode brez razloga.
- Po vsaki nalogi `tsc --noEmit` (strict) za client in server ter produkcijski build; napake popravi pred nadaljevanjem.
- Unit testi: UPN QR, delitev stroškov, prehodi statusov; smoke test glavnega toka.
- Git: commit po vsaki fazi s kratkim opisom v slovenščini.
- Brez destruktivnih ukazov (brisanje baze, `git reset --hard`, prepis migracij) brez izrecnega dovoljenja.
- Pred večjim paketom, zamenjavo sklada ali plačilnim ponudnikom vprašaj.
- Ne izmišljuj pravnih, davčnih ali bančnih pravil → `TODO(preveri): …` + opozorilo v povzetku.
- UX: mobile-first, velike tipke, preprost jezik; najemnik pride do plačilnih podatkov v največ dveh dotikih.

## 9. Faze
Po vsaki fazi: kratek povzetek (kaj je narejeno, kako preizkusiti s konkretnimi koraki, odprti TODO-ji), nato čakanje na potrditev.

0. Ogrodje monorepa, design tokens in začasni logotip Kvito, prijava z enkratno kodo, vloge, seed, `start.ps1`, README.
1. Nepremičnine, enote, najemna razmerja, povabila.
2. Obveznosti, mesečna najemnina, položnice, UPN QR, javljanje in potrjevanje plačil, stanje »Kvito ✓«.
3. Sporočila, priponke, okvare.
4. Števci, primopredaja s PDF, dokumenti.
5. Opomniki in push, pregled za najemodajalca, izvoz, revizijska sled, priprava za deploy na Railway.

**Pozneje (ne zdaj):** Capacitor (iOS/Android), uvoz bančnega izpiska za samodejno ujemanje po sklicu, OCR za položnice brez QR, vloga upravljavca (agencije, podjetja), dodatni jeziki (hr, de).
