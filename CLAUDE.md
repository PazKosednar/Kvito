# Kvito – trajna pravila projekta

Spletna aplikacija + PWA za komunikacijo in obveznosti med najemodajalcem in najemnikom v Sloveniji (dolgoročni in srednjeročni najem). Kasneje Capacitor (iOS/Android), zato API-first in brez odvisnosti od funkcij, ki obstajajo samo v brskalniku.

Celotna specifikacija: [docs/SPEC.md](docs/SPEC.md).

Komunikacija z lastnikom projekta: slovenščina. Koda, imena v bazi in komentarji: angleščina. Uporabniški vmesnik: slovenščina (i18n pripravljen za `sl` in `en`).

## Znamka
- Ime: **Kvito** (iz »biti kvit« = vse je poravnano). Ime se v kodi in vmesniku piše vedno točno tako.
- Ton: topel, preprost, brez pravniškega jezika. Kratki stavki, tikanje.
- **Celostna grafična podoba (CGP) je v [files/cgp/kvita-cgp](files/cgp/kvita-cgp) in je zavezujoča** (README, tokens.json, komponente, logotipi, ilustracije). »Inženirski mir«: grafit in topel kamen, tanke linije in mreže, mono nadnaslovi, ena sama zelena (`accent`) za »poravnano«. Teme: Grafit (temna, privzeta), Kamen (svetla) in Sistemsko (sledi OS) – preklopni gumb v glavi ob zvončku (klik zamenja temo in ikono sonce/luna/monitor); `panel` sledi temi (v svetli svetla kartica z obrobo, v temni grafit); barve panela samo prek tokenov `--panel-*`, `--ink-on-panel*`, `--signal-on-panel`. Gibanje 150–200 ms, samo barva in prosojnost (izjema: okrasna animacija v mestecu, npr. avtomobili v okolici »Mesto«; ob `prefers-reduced-motion` se ustavi). Brez senc razen plavajočih plasti. Statusi vedno z besedo in ikono.
- Tokeni CGP so 1:1 v [client/src/styles/tokens.css](client/src/styles/tokens.css); komponente CGP (StatusBadge, ChargeCard, PaymentPanel, SettledBanner, Eyebrow, logotip) so v `client/src/components/brand.tsx`. Zneski »1.250,00 €«, datumi »15. 11. 2026«.
- Logotip (CGP v2): narisan napis »kvito« z malimi črkami, kjer je »v« kljukica; ikona aplikacije je velika kljukica na zeleni ploskvi (`signal`). Datoteke `kvito-*` so v `files/cgp/kvita-cgp/assets/Logos`; PWA ikone se generirajo iz `client/public/logo.svg` (ikona aplikacije iz CGP).
- Mikrobesedila: ko ima najemno razmerje vse obveznosti potrjene, prikaži stanje »Kvito ✓«. Prazna stanja in obvestila naj bodo prijazna, ne birokratska.
- PWA manifest: `name` in `short_name` = »Kvito«, `lang` = »sl«.
- Bundle ID za kasnejši Capacitor: `TODO(preveri)` – predlog `si.kvita.app`, potrdim, ko bo domena urejena.

## Pravila dela
- Okolje: Windows + PowerShell v VS Code. Vsi ukazi in skripte morajo delovati v PowerShellu (ne bash sintaksa). `start.ps1` zažene client in server.
- Lokalna baza: lokalni PostgreSQL 17 (Windows storitev `postgresql-x64-17`, nameščen z wingetom); `createdb`/`psql` nista v PATH – bazo ustvari `prisma migrate dev`. Testi uporabljajo ločeno bazo `kvita_test` (`DATABASE_URL_TEST`). Navodila v README.
- Prisma 7: seed ukaz je v `server/prisma.config.ts` (`migrations.seed`), ker Prisma 7 ne bere več `package.json#prisma.seed`. Generirani klient je v `server/src/generated/prisma` (ni v gitu).
- Monorepo `/client` in `/server` (ime repozitorija: `kvita`). V clientu ločeno: `types`, `constants`, `contexts`, `hooks` (vsa poslovna logika v custom hookih), `components`, `layout`, `auth`, `pages`, `features`.
- Seed (`npm run db:seed`, idempotenten): 1 najemodajalec, 2 enoti, 3 najemniki, obveznosti v vseh statusih.
- Vsak `.ps1` shrani kot UTF-8 **z BOM** (Windows PowerShell 5.1 sicer pokvari šumnike).
- Pazi na konflikte imen ikon lucide-react s tipi (npr. `User`) – ikone uvažaj z aliasom (npr. `User as UserIcon`).
- Pred vsako večjo spremembo najprej preberi obstoječe datoteke; ne prepisuj delujoče kode brez razloga.
- Po vsaki zaključeni nalogi zaženi `tsc --noEmit` (strict) za client in server ter produkcijski build. Napake popravi, preden nadaljuješ.
- Unit testi: UPN QR, delitev stroškov, prehodi statusov; smoke test glavnega toka.
- Git: smiseln `.gitignore`, commit po vsaki zaključeni fazi s kratkim opisom v slovenščini.
- Brez destruktivnih ukazov (brisanje baze, `git reset --hard`, prepis migracij) brez izrecnega dovoljenja.
- Pred namestitvijo večjega paketa, zamenjavo sklada ali dodajanjem plačilnega ponudnika vprašaj.
- Ne izmišljuj pravnih, davčnih ali bančnih pravil. Kjer je treba preveriti, pusti `TODO(preveri): …` in na to opozori v povzetku.
- UX: mobile-first, velike tipke, preprost jezik; najemnik pride do plačilnih podatkov v največ dveh dotikih.
- Po vsaki fazi se ustavi in daj kratek povzetek: kaj je narejeno, kako preizkusim (konkretni koraki), odprti TODO-ji. Nato počakaj na potrditev.

## Tehnični sklad
- Frontend: React + TypeScript + Vite, Zustand, shadcn/ui, lucide-react, vite-plugin-pwa (namestljiva aplikacija, offline branje zadnjih podatkov).
- Backend: Node.js + Express + TypeScript, Prisma, PostgreSQL, validacija z zod.
- Sporočila v realnem času: Socket.IO (fallback polling).
- Push: Web Push (VAPID) z lastnega strežnika, za skupnim vmesnikom, da kasneje dodamo FCM/APNs prek Capacitorja. Na iOS push za PWA deluje le, če je dodana na začetni zaslon → v onboardingu prikaži navodilo.
- Datoteke: v razvoju mapa `uploads` (ustvari se ob zagonu strežnika), v produkciji S3-kompatibilna hramba v EU; dostop samo s podpisanimi URL-ji.
- Cron za najemnine in opomnike (idempotentno).
- Deploy na Railway (EU regija), koda na GitHubu.
- Podatkovni model (izhodišče): User, Property, Unit, Tenancy, TenancyMember, Invitation, Charge, ChargeShare, PaymentReport, Message, Attachment, Issue, IssueComment, Document, MeterReading, Handover, HandoverItem, Notification, PushSubscription, AuditLog. Zneski v centih (integer, EUR). Datumi v UTC, prikaz v Europe/Ljubljana.

## Varnost
- Minimalni podatki: brez EMŠO in kopij osebnih dokumentov.
- Avtorizacija na strežniku za vsak vir, rate limiting, validacija vseh vhodov.
- Skrivnosti samo v `.env` (v `.gitignore`); v repozitoriju le `.env.example`.
- Izvoz in izbris podatkov uporabnika; pravila hrambe.
- Pogoji uporabe in politika zasebnosti: `TODO(pravnik)`.
- Aplikacija nikoli ne prejme ali posreduje denarja.
- Stanje varnosti in odprte točke: [docs/SECURITY.md](docs/SECURITY.md). Dostopni žeton se vedno preverja z `verifySession` (ne samo podpis).
