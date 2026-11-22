# Polar – nastavitev plačil (naročnine najemodajalcev)

Stanje: 22. 11. 2026. Strategija in cene: [NAROCNINA.md](NAROCNINA.md). Varnost webhooka: [SECURITY.md](SECURITY.md).

> **Pozor: integracija teče proti produkcijskemu okolju Polar** (`POLAR_SERVER=production`, organizacija `kvito`). Plačila so prava. Testna kartica 4242 … deluje samo v sandboxu (sandbox.polar.sh, ločen račun, žeton in izdelki).

## Datoteke

| Datoteka | Namen |
|---|---|
| `server/src/modules/billing/polar.ts` | klient Polar (lazy, en sam), preslikava izdelek → paket, `checkoutEnabled()` |
| `server/src/modules/billing/routes.ts` | `GET /api/billing`, `POST /api/billing/checkout`, `POST /api/billing/portal` |
| `server/src/modules/billing/webhook.ts` | `POST /api/webhooks/polar`: podpis, `subscription.*` → `Subscription` |
| `server/src/app.ts` | webhook pred `express.json()` z `express.raw()` |
| `server/src/config/env.ts`, `server/.env.example` | spremenljivke `POLAR_*` |
| `server/prisma/migrations/…_subscription_provider_updated_at` | `Subscription.providerUpdatedAt` |
| `server/tests/polar.test.ts` | statusi, podpis, idempotentnost, checkout, portal |
| `client/src/hooks/useBilling.ts`, `client/src/features/billing/BillingPage.tsx` | stran Naročnina |

## Spremenljivke okolja (samo imena)

`POLAR_SERVER`, `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRODUCT_PLUS_MONTHLY`, `POLAR_PRODUCT_PLUS_YEARLY`, `POLAR_PRODUCT_PRO_MONTHLY`, `POLAR_PRODUCT_PRO_YEARLY`, `POLAR_PRODUCT_MANAGER_MONTHLY`, `POLAR_PRODUCT_MANAGER_YEARLY`, `POLAR_FOUNDER_DISCOUNT_ID` (neobvezno).

Plačila so vklopljena samo, ko so nastavljeni žeton, skrivnost webhooka in vseh 6 izdelkov.

## Izdelki (produkcija)

| Paket | Mesečno | Letno |
|---|---|---|
| Plus | `9d2b312c-ef7a-4e9c-a7f5-03e7754a352f` (4,99 €) | `f84e4de7-2aa6-461a-8b7e-e2b7687eb8e7` (49,90 €) |
| Pro | `b6011973-a7af-4329-be20-ecb3d97c17c9` (11,99 €) | `98aa110c-99a0-461d-952e-3169bfc78ef4` (119,90 €) |
| Upravnik | `f34ebe91-78a1-4654-b158-a5f0c16514b1` (27,99 €) | `67873bf3-86b9-4070-a1e6-9d3f0a674169` (279,90 €) |

Webhook endpoint: **še ni registriran** (glej spodaj).

## Popravi v nadzorni plošči Polar (polar.sh/dashboard/kvito) – najdeno 22. 11. 2026

1. **Letni izdelki se obračunavajo mesečno.** Pri »Kvito Plus – letno«, »Kvito Pro – letno« in »Kvito Upravnik – letno« nastavi obračunsko obdobje na **leto** (zdaj je mesec – letna cena bi se zaračunala vsak mesec).
2. **Cena 0 USD.** Vsak izdelek ima poleg cene v EUR še ceno **0 USD**. V Settings nastavi privzeto valuto organizacije na **EUR** in pri vseh 6 izdelkih odstrani ceno v USD. (Koda pri checkoutu že zahteva `currency: "eur"`, a cena 0 ne sme ostati.)
3. **Metadata** pri »Kvito Upravnik – mesečno«: ključ `interva` popravi v `interval` (vrednost `month`).
4. **Davek**: cene so končne (z DDV) – nastavi davčno obnašanje na *inclusive*. `TODO(preveri)` z računovodjo.
5. **Organizacija** ima status `created`: oddaj podatke podjetja in račun za izplačila, sicer plačila ne delujejo. `TODO(preveri)`: registracija dejavnosti (NAROCNINA.md, točka 6).

## Webhook

V Polar → Settings → Webhooks dodaj endpoint:

- URL: `https://kvito-server-production.up.railway.app/api/webhooks/polar`
- Format: **Raw**
- Dogodki: `subscription.created`, `subscription.active`, `subscription.updated`, `subscription.canceled`, `subscription.uncanceled`, `subscription.past_due`, `subscription.revoked`

Skrivnost (`whsec_…`) vpiši v Railway kot `POLAR_WEBHOOK_SECRET` (in lokalno v `server/.env`, če testiraš lokalno prek tunela). Endpoint registriraj šele, ko je nova koda nameščena na Railway in so spremenljivke nastavljene – sicer strežnik vrača 503 in Polar endpoint po ponavljajočih napakah izklopi.

## Preveri pred vklopom

- [ ] Točke 1–5 zgoraj so popravljene.
- [ ] Koda je na Railway (push na `main`), migracija `subscription_provider_updated_at` je uveljavljena.
- [ ] Na Railway so nastavljene vse spremenljivke `POLAR_*` (`POLAR_SERVER=production`).
- [ ] Webhook je registriran; v Polar → Webhooks → Deliveries je odgovor 202.
- [ ] Za preizkus brez pravega plačila ustvari popust 100 % (once) z omejenim številom uporab, kodo vpiši na strani za plačilo; nato v Kvitu preveri paket, »Upravljaj naročnino« in preklic. Popust po preizkusu arhiviraj.
- [ ] `NEW30` (−30 %, once) in ustanovni popust (−30 %, forever → `POLAR_FOUNDER_DISCOUNT_ID`) sta ustvarjena.
- [ ] `TODO(preveri)`: DDV, pravila preklica in vračil, pogoji uporabe (pravnik, računovodja).

## Portal za stranke

Polar gosti portal za stranke in strankam sam pošlje povezavo nanj (računi, kartica, preklic). V Kvitu je poleg tega gumb »Upravljaj naročnino«, ki odpre portal prek `customer_id`.
