# Kvita – trajna pravila projekta

Spletna aplikacija + PWA za komunikacijo in obveznosti med najemodajalcem in najemnikom v Sloveniji (dolgoročni in srednjeročni najem). Kasneje Capacitor (iOS/Android), zato API-first in brez odvisnosti od funkcij, ki obstajajo samo v brskalniku.

Celotna specifikacija: [docs/SPEC.md](docs/SPEC.md).

Komunikacija z lastnikom projekta: slovenščina. Koda, imena v bazi in komentarji: angleščina. Uporabniški vmesnik: slovenščina (i18n pripravljen za `sl` in `en`).

## Znamka
- Ime: **Kvita** (iz »biti kvit« = vse je poravnano). Ime se v kodi in vmesniku piše vedno točno tako.
- Ton: topel, preprost, brez pravniškega jezika. Kratki stavki, tikanje.
- Barve (odločitev lastnika, okt. 2026 – zamenjala prvotno modrozeleno): vijolično črnilo žiga `#4E40A0` kot primarna barva, papirnato bela ozadja, lososova barva položnice UPN (`--slip`) za vse, kar je povezano s plačilom, opečnata za zamude, mahovno zelena za potrjeno. Vse barve so design tokens na enem mestu ([client/src/styles/tokens.css](client/src/styles/tokens.css)). Podpri svetlo in temno temo; plačilni listek in žig ostaneta svetla v obeh.
- Vizualni jezik: »Kvita ✓« je žig (`KvitaStamp`), plačilni podatki so listek z okenci kot na UPN. Pisava Schibsted Grotesk (self-hosted). Brez napisov z velikimi črkami, brez enakih kartic za vse, brez dekorativnih gradientov; animacija samo ena (žig).
- Logotip: začasen SVG (kljukica + ključ); iz njega generiraj PWA ikone in favicon.
- Mikrobesedila: ko ima najemno razmerje vse obveznosti potrjene, prikaži stanje »Kvita ✓«. Prazna stanja in obvestila naj bodo prijazna, ne birokratska.
- PWA manifest: `name` in `short_name` = »Kvita«, `lang` = »sl«.
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
