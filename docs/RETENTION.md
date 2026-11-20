# Kvito – hramba, izvoz in izbris podatkov

Kvito hrani čim manj podatkov: brez EMŠO, brez kopij osebnih dokumentov.

## Kaj uporabnik lahko naredi sam
- **Izvoz:** `GET /api/privacy/export` vrne vse podatke o njem v JSON (profil, najemi, plačila, sporočila, okvare, odčitki, dokumenti – samo imena datotek, obvestila, naprave, dnevnik dejanj).
- **Izbris računa:** `DELETE /api/privacy/account` z vpisom lastnega e-poštnega naslova.
  - Najemodajalec z aktivnim najemom računa ne more izbrisati (`ACCOUNT_HAS_ACTIVE_TENANCIES`): najprej zaključi najem.
  - Izbrišejo se: ime, e-pošta, telefon, seje, naprave za push, obvestila, prijavne kode in nepotrjena povabila.
  - Ostanejo: obveznosti, potrjena plačila, sporočila in dnevnik sprememb, ker jih potrebuje druga stran. Prikazana so kot »Izbrisan uporabnik«.
- V aplikaciji: meni računa → Zasebnost.

## Samodejno čiščenje (`services/jobs/retention.ts`)
| Podatek | Rok |
|---|---|
| Prijavne kode | 1 dan po poteku |
| Seje (refresh žetoni) | 30 dni po poteku ali preklicu |
| Prebrana obvestila | 180 dni |
| Neprebrana obvestila | 365 dni |
| Neuporabljena povabila | 90 dni po poteku ali preklicu |
| Naložena datoteka, ki ni nikjer pripeta (opuščen obrazec) | po 7 dneh se šteje za izbrisano |
| Izbrisane datoteke (vsebina v hrambi S3 oz. na disku) | 30 dni po izbrisu; zapis v bazi ostane z oznako `purgedAt` |

Finančnih zapisov (obveznosti, plačila) in dnevnika sprememb (`AuditLog`) se ne briše samodejno.

## Odprto
- `TODO(pravnik)`: zakonski roki hrambe za računovodske zapise in dnevnik; po potrebi popravi tabelo in dodaj čiščenje.
- `TODO(pravnik)`: pogoji uporabe in politika zasebnosti.
- Datoteke izbrisanega računa, ki jih potrebuje druga stran (npr. dokazila o plačilu), ostanejo vezane na njene zapise. Fotografije nepremičnin ter stroški najemodajalca s prilogami se ob izbrisu računa izbrišejo in po 30 dneh odstranijo iz hrambe.
- `TODO(pravnik)`: potrdi 30-dnevni rok za izbrisane datoteke.
