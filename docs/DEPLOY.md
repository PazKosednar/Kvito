# Kvito – namestitev na Railway (EU)

Ena storitev: Node strežnik streže tudi zgrajeni spletni odjemalec (PWA). Poleg nje potrebuješ PostgreSQL in S3-kompatibilno shrambo v EU.

## 1. Railway
1. Nov projekt → **Deploy from GitHub repo** (repozitorij Kvito). Regija: **EU (Amsterdam)**.
2. Dodaj **PostgreSQL**. `DATABASE_URL` v storitvi nastavi na referenco `${{Postgres.DATABASE_URL}}`.
3. `railway.json` že vsebuje ukaze:
   - build: `npm ci --include=dev && npm run build`
   - pred zagonom: `npm run db:deploy` (samo `prisma migrate deploy`, nikoli `migrate dev`)
   - zagon: `npm run start`, preverjanje zdravja: `/api/health`
   - `TODO(preveri)`: ob prvem deployu preveri v nadzorni plošči, da Railway prebere `preDeployCommand` v tej obliki.

## 2. Spremenljivke okolja
Vse so opisane v [server/.env.example](../server/.env.example). Obvezne v produkciji:

| Spremenljivka | Vrednost |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | iz Railway Postgresa |
| `CLIENT_ORIGIN` | javni URL, npr. `https://app.kvito.si` (brez poševnice na koncu) |
| `JWT_ACCESS_SECRET` | naključni niz (48 bajtov), glej ukaz v `.env.example` |
| `STORAGE_DRIVER=s3` + `S3_*` | shramba v EU; brez nje se datoteke ob vsakem deployu izgubijo |
| `SMTP_*`, `MAIL_FROM` | e-pošta; brez nje uporabniki ne dobijo prijavne kode |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | neobvezno; ustvari z `npm run vapid -w server` |

Strežnik se v produkciji **ne zažene**, če manjka SMTP ali S3.

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
