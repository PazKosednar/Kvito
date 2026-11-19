# Kvito – namestitev na Railway (EU)

Ena storitev: Node strežnik streže tudi zgrajeni spletni odjemalec (PWA). Poleg nje potrebuješ PostgreSQL in S3-kompatibilno shrambo v EU.

## 1. Railway
1. Nov projekt → **Deploy from GitHub repo** (repozitorij Kvito). Regija: **EU (Amsterdam)**.
2. Dodaj **PostgreSQL**. `DATABASE_URL` v storitvi nastavi na referenco `${{Postgres.DATABASE_URL}}`.
   Build deluje tudi brez nje (`prisma generate` ne potrebuje baze), migracija pred zagonom in strežnik pa jo potrebujeta.
   Railway pri monorepu z npm workspaces sam predlaga dve storitvi (`@kvita/client`, `@kvita/server`). Potrebna je **samo ena** (koren repozitorija): strežnik streže tudi odjemalca.
3. V **Settings → Networking** ustvari domeno (`*.up.railway.app` ali lastno) in njen URL vpiši v `CLIENT_ORIGIN`.
4. `railway.json` že vsebuje ukaze:
   - build: `npm run build` (odvisnosti, tudi dev, namesti Railpack sam z `npm ci`; ne dodajaj `npm ci` v build, ker Railpack v `node_modules/.vite` priklopi predpomnilnik in `npm ci` pade z `EBUSY`; ne nastavljaj `RAILPACK_PRUNE_DEPS`, ker `prisma` iz devDependencies potrebuje migracija pred zagonom)
   - pred zagonom: `npm run db:deploy` (samo `prisma migrate deploy`, nikoli `migrate dev`)
   - zagon: `node server/dist/index.js` (neposredno, brez npm, da strežnik ob redeployu dobi SIGTERM in se lepo zapre), preverjanje zdravja: `/api/health`
   - `TODO(preveri)`: ob prvem deployu preveri v nadzorni plošči, da Railway prebere `preDeployCommand` v tej obliki.

## 2. Spremenljivke okolja
Vse so opisane v [server/.env.example](../server/.env.example). Obvezne v produkciji:

| Spremenljivka | Vrednost |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | iz Railway Postgresa |
| `CLIENT_ORIGIN` | javni URL, npr. `https://app.kvito.si` (brez poševnice na koncu) |
| `JWT_ACCESS_SECRET` | naključni niz (48 bajtov), glej ukaz v `.env.example` |
| `STORAGE_DRIVER=s3` + `S3_*` | shramba v EU; brez nje se datoteke ob vsakem deployu izgubijo. Možnost: Railway **Bucket** (S3-kompatibilen) – `TODO(preveri)`: ali je bucket v EU regiji |
| `SMTP_*`, `MAIL_FROM` | e-pošta; brez nje uporabniki ne dobijo prijavne kode |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | neobvezno; ustvari z `npm run vapid -w server` |

Strežnik se v produkciji **ne zažene**, če manjka SMTP ali S3.

### Trenutna testna postavitev (projekt `eloquent-dream`)
- Storitev `@kvita/server` (EU, `europe-west4`), domena `https://kvito-server-production.up.railway.app`, `PORT=8080`.
- `Postgres` (EU, volumen 5 GB) → `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
- Bucket `kvito-files` (regija `ams`) → `S3_*` kot reference `${{kvito-files.*}}`, `S3_FORCE_PATH_STYLE=false`.
- `EMAIL_CONSOLE_IN_PRODUCTION=true`: brez SMTP gredo e-poštna sporočila (npr. koda za pozabljeno geslo) v dnevnik (Railway → Deploy Logs). **Izklopi, preden se prijavijo pravi uporabniki**, in nastavi `SMTP_*`.
- `SKIP_EMAIL_VERIFICATION=true`: registracija brez kode – nov račun je takoj prijavljen, e-naslov ostane nepotrjen. Ponovna registracija na že uporabljen e-naslov ni mogoča. **Izklopi skupaj z zgornjim**, ko bo SMTP urejen (obstoječi nepotrjeni računi bodo ob prijavi dobili kodo).

## 3. Po prvem deployu
- Odpri `/api/health` (mora vrniti `{"ok":true}`).
- Prijavi se (koda pride po e-pošti), dodaj nepremičnino in naloži datoteko: preveri, da se pojavi v S3.
- Push: v Obvestila → Vklopi. Na iPhonu deluje samo, če je aplikacija dodana na začetni zaslon.
- Seed (`npm run db:seed`) ne poganjaj v produkciji.

## 4. Odprto (`TODO(preveri)`)
- Izbira ponudnika SMTP (EU) in S3 (EU) ter domena `kvito.si` (e-poštna domena: SPF/DKIM).
- Bundle ID za Capacitor (predlog `si.kvita.app`; ime znamke je zdaj Kvito, zato morda `si.kvito.app`).
- Varnostne kopije baze (Railway) in načrt obnove.
- `TODO(pravnik)`: pogoji uporabe, politika zasebnosti, roki hrambe ([RETENTION.md](RETENTION.md)).
