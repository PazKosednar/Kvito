# Logotipi (CGP v3)

Znak je **»Dve strani«**: hiša iz dveh enakih polovic z režo med njima – najemodajalec (leva, v barvi pisave) in najemnik (desna, zelena `signal` #38E08C). Logotip je znak + narisan napis »kvito« z malimi črkami, kjer je »v« kljukica (vse poteze 7 enot pri višini 40, napis ni postavljen s pisavo).

- `kvito-app-icon.svg` — ikona aplikacije 512 × 512 (PWA, kasneje iOS/Android): kamnita ploskev #EEECE7, leva polovica #0C0C0D, desna #38E08C. Brez roba; vogale zaobli sistem. Iz nje se generira `client/public/logo.svg`.
- `kvito-app-icon-dark.svg` — nadomestna temna ikona: ploskev #0C0C0D, leva #F2F1EC, desna #38E08C.
- `kvito-mark-light.svg` / `kvito-mark-dark.svg` — samo znak brez ozadja (leva #121212 oz. #F2F1EC, desna #38E08C). Najmanj 16 px.
- `kvito-lockup-light.svg` / `kvito-lockup-dark.svg` — znak + napis. Na svetlem: črke #121212, kljukica `accent` #0A7A45; na temnem: črke #F2F1EC, kljukica #38E08C.
- `kvito-wordmark-*.svg` — samo napis (kjer znaka ni mogoče uporabiti).
- `png/` — rastrski izvozi `kvito-*` (ikona 32/180/192/512, temna 512, znaki, napisi).

Pravila: prazen prostor okoli logotipa je vsaj polovica višine črke »o«. Najmanjša velikost znaka je 16 px, logotipa 16 px višine. Leva polovica ni nikoli zelena, desna vedno je. Ne raztezaj, ne obračaj, ne dodajaj senc, mreže ali prelivov.

V aplikaciji: `KvitaMark` (znak) in `KvitaLockup` (znak + napis) v `client/src/components/brand.tsx`; barve iz `--logo-word`, `--logo-mark`, `--logo-accent` v `client/src/styles/tokens.css`.

Datoteke `kvita-*` so prva različica (»list s kljukico«, v1) in se ne uporabljajo več.
