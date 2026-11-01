# Kvito

Najemnina, položnice, sporočila, okvare in primopredaja med najemodajalcem in najemnikom – na enem mestu.
Spletna aplikacija + PWA (kasneje iOS/Android prek Capacitorja).

- Specifikacija: [docs/SPEC.md](docs/SPEC.md)
- Pravila projekta: [CLAUDE.md](CLAUDE.md)

## Sklad

| Del | Tehnologija |
| --- | --- |
| `client/` | React 19, TypeScript, Vite, Tailwind 4 + shadcn/ui, Zustand, react-router, i18next, vite-plugin-pwa |
| `server/` | Node.js, Express 5, TypeScript, Prisma 7 (PostgreSQL), zod, jose (JWT) |
| Baza | PostgreSQL 17 (lokalno nameščen, Windows storitev) |

## Prvi zagon (Windows + PowerShell)

### 1. Predpogoji

- **Node.js 22+** (`node -v`)
- **PostgreSQL 17** kot Windows storitev. Če ga še nimaš:

  ```powershell
  winget install --id PostgreSQL.PostgreSQL.17 -e
  ```

  Namestitveni program vpraša za geslo uporabnika `postgres` – zapomni si ga.
  `createdb` ni potreben: bazo ustvari Prisma ob prvi migraciji.

  Preveri, da storitev teče:

  ```powershell
  Get-Service postgresql-x64-17
  Start-Service postgresql-x64-17   # če ne teče (morda potrebuje skrbniške pravice)
  ```

  `psql` ni v PATH; po potrebi ga kliči s polno potjo:
  `& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost`

### 2. Okoljske spremenljivke

```powershell
Copy-Item server\.env.example server\.env
```

V `server\.env` nastavi:

- `DATABASE_URL` in `DATABASE_URL_TEST` – zamenjaj `CHANGE_ME` z geslom uporabnika `postgres` (posebne znake URL-kodiraj),
- `JWT_ACCESS_SECRET` in `OTP_PEPPER` – dve različni naključni vrednosti:

  ```powershell
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```

`.env` ni v gitu. V repozitoriju je samo `.env.example`.

### 3. Namestitev, baza in zagon

```powershell
npm install
.\start.ps1 -Seed     # prvič: migracije + razvojni podatki + zagon
.\start.ps1           # vsakič potem
```

- Aplikacija: <http://localhost:5180>
- API: <http://localhost:4180/api/health>

> Če PowerShell zavrne skripto (»running scripts is disabled«), jo enkrat dovoli za trenutnega uporabnika:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## Prijava v razvoju

Prijava je brez gesla: vpišeš e-naslov, dobiš 6-mestno kodo. **V razvoju se e-pošta ne pošilja – koda se izpiše v konzoli strežnika** (vrstica `[server]` v oknu, kjer teče `start.ps1`).

Testni uporabniki iz seeda:

| E-pošta | Vloga | Opomba |
| --- | --- | --- |
| `najemodajalec@kvita.test` | najemodajalec | lastnik »Hiša na Trnovem« (2 enoti) |
| `ana@kvita.test` | najemnica | Stanovanje A, obveznosti v vseh statusih |
| `luka@kvita.test` | najemnik | Stanovanje B, delitev 60 % |
| `nina@kvita.test` | najemnica | Stanovanje B, delitev 40 % |

Nov e-naslov ustvari nov račun; ob prvi prijavi izbereš vlogo. Vlogo zamenjaš v meniju (ikona osebe zgoraj desno).

## Ukazi

Vsi ukazi se poženejo iz korena repozitorija.

| Ukaz | Kaj naredi |
| --- | --- |
| `npm run dev` | zažene server in client (brez preverjanj iz `start.ps1`) |
| `npm run typecheck` | `tsc --noEmit` (strict) za server in client |
| `npm run build` | produkcijski build obeh delov |
| `npm test` | unit + smoke testi (server uporablja bazo `kvita_test`) |
| `npm run db:migrate` | nova migracija iz `server/prisma/schema.prisma` (razvoj) |
| `npm run db:deploy` | uporabi migracije (produkcija, Railway) |
| `npm run vapid -w server` | ustvari ključe za Web Push |
| `npm run db:seed` | razvojni podatki (idempotentno, varno za ponovitev) |
| `npm run db:studio -w server` | Prisma Studio (pregled baze v brskalniku) |
| `npm run icons -w client` | ponovno generira favicon in PWA ikone iz `client/public/logo.svg` |

## Struktura

```
client/src/
  auth/        prijava, zaščitene poti, auth store
  components/  skupne komponente (ui/ = shadcn)
  constants/   konstante (poti, ključi, jeziki)
  contexts/    React konteksti (tema)
  features/    funkcionalnosti po fazah
  hooks/       VSA poslovna logika (custom hooki)
  i18n/        prevodi sl / en
  layout/      ogrodje aplikacije
  lib/         API klient, shramba, pomožne funkcije
  pages/       strani
  styles/      tokens.css – edino mesto za barve
  types/       TypeScript tipi
server/
  prisma/      shema, migracije, seed
  src/config   okolje (validacija z zod)
  src/middleware  avtentikacija, validacija, rate limit, napake
  src/modules  auth, users, access (preverjanje dostopa)
  src/services e-pošta (vmesnik; v razvoju izpis v konzolo)
  tests/       smoke testi
```

## Barve in znamka

Vse barve so v [client/src/styles/tokens.css](client/src/styles/tokens.css) (svetla in temna tema):
vijolično črnilo žiga (primarna), papirnato bela, lososova barva položnice UPN za plačila.
Ob menjavi barv popravi še mesta, ki ne morejo brati CSS spremenljivk: `THEME_COLOR` v `client/vite.config.ts`,
`theme-color` v `client/index.html`, barvo ozadja v `client/public/logo.svg` in `client/pwa-assets.config.ts`
ter `BRAND` v `server/src/services/email/templates.ts`.
Pisava: Schibsted Grotesk (`@fontsource-variable/schibsted-grotesk`, deluje tudi brez povezave).
Začasni logotip: `client/public/logo.svg` (+ `KvitaLogo.tsx`); nato `npm run icons -w client`.

## Namestitev in podatki
- Produkcija (Railway, EU): [docs/DEPLOY.md](docs/DEPLOY.md)
- Hramba, izvoz in izbris podatkov: [docs/RETENTION.md](docs/RETENTION.md)
- Obvestila: brez VAPID ključev gredo opomniki po e-pošti; ključe ustvariš z `npm run vapid -w server`. V razvoju je storitveni delavec izklopljen, zato push preizkusiš z `npm run build` in `SERVE_CLIENT=true`.
