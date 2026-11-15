# Logotipi (CGP v2)

Logotip je narisan napis »kvito« z malimi črkami. Črka »v« je kljukica – vse je poravnano. Vse poteze so enako debele (7 enot pri višini 40), napis ni postavljen s pisavo. Ikona aplikacije je ista kljukica, povečana čez rob zelene ploskve.

- `kvito-wordmark-light.svg` — napis za svetle površine (`surface`, `surface-raised`). Črke #121212, kljukica `accent` #0A7A45.
- `kvito-wordmark-dark.svg` — napis za `panel` in temno temo. Črke #F2F1EC, kljukica `signal` #38E08C.
- `kvito-wordmark-ink.svg` / `kvito-wordmark-paper.svg` — enobarvni napis, #121212 oz. #F2F1EC (tisk v eni barvi, zelena podlaga).
- `kvito-app-icon.svg` — ikona aplikacije 512 × 512 (PWA, kasneje iOS/Android): polna ploskev `signal` #38E08C, kljukica #0C0C0D. Brez roba; vogale zaobli sistem.
- `kvito-app-icon-dark.svg` — nadomestna temna ikona: ploskev #0C0C0D, kljukica #38E08C.
- `kvito-mark-light.svg` / `kvito-mark-dark.svg` — znak za majhne prostore v vmesniku (zaobljena ploščica s kljukico).
- `png/` — rastrski izvozi (napis, znak, ikona 32/180/192/512).

Pravila: prazen prostor okoli napisa je vsaj polovica višine črke »o«. Najmanjša velikost napisa na zaslonu je 16 px višine, znaka 16 px. Napisa ne raztezaj, ne obračaj, ne dodajaj senc in ne spreminjaj barve kljukice. Svetlo zelene kljukice (`signal`) ne uporabljaj na svetlih površinah – tam je `accent`. Na zeleni podlagi je napis vedno enobarven v grafitu.

V aplikaciji: `KvitaLockup` (napis) in `KvitaMark` (znak) v `client/src/components/brand.tsx`; barve iz `--logo-word`, `--logo-accent`, `--logo-sheet`, `--logo-check` v `client/src/styles/tokens.css`.

Datoteke `kvita-*` v tej mapi so prejšnja različica (»list s kljukico«, v1) in se ne uporabljajo več.
