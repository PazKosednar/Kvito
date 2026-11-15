# Pavšal, mesečni stroški in dobroimetje – zasnova

Datum: 15. 11. 2026
Stanje: potrjena zasnova, pred izvedbenim načrtom

## Zakaj

Resničen najemodajalec vodi najem v Excelu takole:

- najemnik vsak mesec nakaže en **pavšal** (510 € = 400 € najemnina + 110 € za stroške),
- najemodajalec za vsak mesec vpiše dejanske stroške po vrstah (upravnik, elektrika, RTV),
- nekajkrat na leto naredi **obračun**: plačano proti (najemnina + stroški),
- če je najemnik v dobro, izbere: znesek ostane do naslednjega obračuna ali pa naslednji mesec plača manj.

Kvito (Faza 6) že ima akontacije, obračun za obdobje, priloge, potrditev/ugovor, doplačilo z UPN, vračilo preplačila. Manjka:

1. eno mesečno plačilo za najemnino in stroške,
2. akontacija kot en skupen znesek,
3. dejanski stroški po mesecih, vneseni sproti in vidni najemniku,
4. dobroimetje, ki se prenese ali pobota z naslednjim plačilom.

Referenčni primer (mora se iziti do centa): 9 mesecev × 510,00 = 4.590,00 plačano; 9 × 400,00 + 766,29 stroškov = 4.366,29; dobroimetje 223,71 €; naslednje plačilo ob pobotu 286,29 €.

## Odločitve

| Vprašanje | Odločitev |
|---|---|
| Eno ali dve mesečni obveznosti | Najemodajalec izbere na pogodbi. Nova razmerja privzeto »skupaj«, obstoječa ostanejo »ločeno«. |
| Dobroimetje | Najemnik ob potrditvi izbere med tremi: pusti v dobro, odštej od naslednjega plačila, vračilo. Najemodajalec lahko označi priporočilo. |
| Vnos stroškov | Sproti po mesecih; obračun se sestavi iz vnosov. Najemnik tabelo vidi sproti. |
| Skupna akontacija | Dovoljen en skupen znesek brez delitve po vrstah. Obračun primerja skupne vsote. |

## 1. Mesečni pavšal

**Model:** `Tenancy.billingMode BillingMode @default(SEPARATE)` z vrednostma `COMBINED` in `SEPARATE`. API za novo najemno razmerje privzame `COMBINED`; migracija pusti obstoječa na `SEPARATE`.

**COMBINED:** `generateMonthlyRent` ustvari eno obveznost:

- `type: RENT`, `costType: RENT`, `rentPeriod: YYYY-MM` (obstoječa idempotentnost),
- `amountCents = rentCents + vsota aktivnih CostAdvance`,
- `lines`: vrstica `RENT` z najemnino in po ena vrstica za vsako akontacijo,
- naslov »Najemnina in stroški {mesec} {leto}« (prek obstoječega mehanizma naslovov v jeziku uporabnika),
- koda namena `RENT` – `TODO(preveri)`: koda namena za skupno plačilo najemnine in stroškov.

`generateMonthlyAdvances` preskoči razmerja z `COMBINED` in `rentCents > 0`. Če razmerje nima aktivnih akontacij, je obveznost enaka današnji najemnini.

**SEPARATE:** brez spremembe.

**Skupna akontacija:** obrazec za akontacije dobi preklop »en skupen znesek«. Shrani se en `CostAdvance` s `costType: OTHER`; v vmesniku se prikaže kot »Stroški«. Strežniška shema se ne spremeni.

**Štetje akontacij:** `advancesInPeriod` po novem sešteva vrstice `ChargeLine`, kjer je `costType != RENT`, obveznost je tipa `RENT` ali `ADVANCE`, in vrstica ni pobot dobroimetja (glej 4). Tako obračun deluje tudi, če se način med letom zamenja.

## 2. Stroški po mesecih

**Model `CostEntry`:** `id`, `tenancyId`, `period` (»YYYY-MM«), `costType` (brez `RENT`), `amountCents` (≥ 0), `note?`, `createdById`, `createdAt`, `updatedAt`, `deletedAt?`. Največ en veljaven vnos na (razmerje, mesec, vrsta) – delni unikatni indeks `WHERE "deletedAt" IS NULL` v migraciji. `Attachment` dobi `costEntryId?` (vrsta `BILL`).

**API** (nov modul `server/src/modules/contract/costs.ts`):

- `GET /tenancies/:id/costs?from=YYYY-MM&to=YYYY-MM` – najemodajalec in najemnik. Vrne mesece z `advanceCents` (akontacije z zapadlostjo v tem mesecu), stroški po vrstah, vsoto, priloge; in `running`: stanje od konca zadnjega poslanega obračuna (ali začetka najema) do danes.
- `PUT /tenancies/:id/costs/:period/:costType` – najemodajalec; vpiše ali popravi znesek in opombo.
- `DELETE /tenancies/:id/costs/:period/:costType` – najemodajalec.
- `POST|DELETE …/attachments` – računi k vnosu, po vzoru prilog obračuna.

**Zaklep:** vnosa v mesecu, ki ga pokriva obračun v stanju `SENT`, `ACCEPTED` ali `CLOSED`, ni mogoče spreminjati (`COST_ENTRY_LOCKED`). `DRAFT` in `DISPUTED` ne zaklepata. Zato poslani obračun ne potrebuje kopije vnosov.

Vsaka sprememba gre v revizijsko sled in sproži `tenancy.changed` (`what: "contract"`). Brez potisnih obvestil za posamezen vnos.

**Čista logika** v `server/src/lib/costs.ts`: sestava mesečne matrike in vsot iz vnosov in akontacij (unit testi).

## 3. Obračun

- Ob ustvarjanju osnutka, ob vsaki spremembi obdobja in ob pošiljanju se `SettlementLine.actualCents` izračuna iz `CostEntry` v mesecih obdobja (po vzoru `refreshAdvances`). Vrstice nastanejo za vsako vrsto, ki ima vnos ali akontacijo.
- `PATCH /settlements/:id` ne sprejema več `actualCents`; pri vrsticah ostane samo opomba. Zneski se popravljajo v mesečnih vnosih.
- DTO obračuna dobi `months` (ista matrika kot pri `GET costs`) in `carriedInCents`.
- Obstoječi poslani ali zaključeni obračuni brez mesečnih vnosov ostanejo nespremenjeni; vmesnik zanje pokaže dosedanji povzetek po vrstah.
- Stanje: `balanceCents = actual − advance − carriedIn`. Prehodi statusov ostanejo, dodata se dve izbiri pri potrditvi (glej 4).

## 4. Dobroimetje

**Model:** `CostSettlement` dobi

- `recommendedChoice CreditChoice?` – priporočilo najemodajalca (nastavi v osnutku),
- `creditChoice CreditChoice?` – izbira najemnika,
- `creditRemainingCents Int @default(0)` – še neporabljeno dobroimetje,
- `carriedInCents Int @default(0)` – dobroimetje, preneseno iz prejšnjih obračunov.

`enum CreditChoice { CARRY_OVER, OFFSET_NEXT, REFUND }`.
`ChargeLine` dobi `creditSettlementId String?`: vrstica z nastavljenim poljem je pobot (negativen znesek) in se ne šteje med akontacije.

**Potrditev** (`POST /settlements/:id/accept`): pri `balanceCents < 0` je `creditChoice` obvezen.

- `REFUND` – kot danes: `ACCEPTED` → najemodajalec zabeleži vračilo → `CLOSED`.
- `CARRY_OVER` – takoj `CLOSED`, `creditRemainingCents = −balance`.
- `OFFSET_NEXT` – takoj `CLOSED`, `creditRemainingCents = −balance`; porabi ga mesečno opravilo.

Izbira se zapiše v revizijsko sled in v sistemsko sporočilo v pogovoru.

**Pobot z naslednjim plačilom:** ko mesečno opravilo ustvarja obveznost (skupno, ali pri ločenem načinu najprej akontacijo, nato najemnino), za razmerje poišče obračune z `creditChoice = OFFSET_NEXT` in `creditRemainingCents > 0`. Obveznosti doda negativno vrstico »Dobroimetje iz obračuna« v višini `min(preostanek, znesek obveznosti)`, zmanjša `amountCents` in `creditRemainingCents` – vse v isti transakciji kot nastanek obveznosti, zato ostane idempotentno. Deleži najemnikov se računajo iz zmanjšanega zneska. Če pobot pokrije celotno obveznost, nastane obveznost z zneskom 0, ki jo sistem takoj označi kot poravnano. Ostanek počaka na naslednji mesec.

**Prenos v naslednji obračun:** ob pošiljanju obračuna se `carriedInCents` nastavi na vsoto `creditRemainingCents` vseh prejšnjih zaključenih obračunov razmerja (ne glede na izbiro, torej tudi neporabljen ostanek pobota), ti pa se postavijo na 0. Osnutek kaže predogled istega zneska. Ob ugovoru in ponovnem pošiljanju se že preneseni znesek ohrani.

**Konec najema:** zaključek najema pokaže neporabljeno dobroimetje. Najemodajalec vračilo zabeleži z obstoječim `POST /settlements/:id/refunded`, ki je po novem dovoljen tudi za `CLOSED` obračun s `creditRemainingCents > 0` in ga postavi na 0.

**Čista logika** v `server/src/lib/credit.ts`: izračun pobota (koliko se odšteje, koliko ostane) in prenosa (unit testi). `server/src/lib/settlement.ts` dobi `carriedIn` v vsotah in izbiro v prehodih.

`TODO(preveri)`: ali pobot dobroimetja z najemnino zahteva posebno obliko soglasja. Kvito zabeleži najemnikovo izrecno izbiro.

## 5. Vmesnik

Vse v zavihku Pogodba, besedila v `sl.json` in `en.json`, komponente in tokeni CGP.

- **Najemnina in stroški** (nastavitve pogodbe): izbira »Eno plačilo na mesec« / »Ločeno«; pri akontacijah preklop »en skupen znesek«.
- **Stroški po mesecih** (nova stran `features/contract/CostsPage.tsx`, logika v `hooks/useCosts.ts`): na telefonu seznam mesecev kot kartice (vrste stroškov, vsota, plačana akontacija, razlika), na širokem zaslonu tabela mesec × vrsta. Najemodajalec tapne polje, vpiše znesek, po želji pripne račun. Zaklenjeni meseci imajo oznako z besedo in ikono. Na vrhu tekoče stanje: »Trenutno imaš 223,71 € v dobro« oziroma »Trenutno si 12,40 € v minusu« z dodatkom, da je znesek informativen do obračuna.
- **Obračun** (`SettlementPage.tsx`): tabela po mesecih, vrstica »Preneseno iz prejšnjega obračuna«, povzetek. Najemodajalec v osnutku izbere priporočilo. Najemnik pri dobroimetju pred potrditvijo izbere eno od treh velikih tipk; pri pobotu je izpisan izračun naslednjega plačila (»Decembra plačaš 286,29 € namesto 510,00 €«).
- **Obveznost** (`ChargePage.tsx`): razčlenitev skupnega plačila in vrstica pobota.
- **Pregled pogodbe** (`ContractTab.tsx`): preostalo dobroimetje in kaj se bo z njim zgodilo.

Najemnik do plačilnih podatkov še vedno pride v največ dveh dotikih.

## 6. Napake in robni primeri

- Sprememba vnosa v zaklenjenem mesecu → `COST_ENTRY_LOCKED`, vmesnik pove, kateri obračun ga zaklepa.
- Potrditev dobroimetja brez izbire → `CREDIT_CHOICE_REQUIRED`.
- Zamenjava načina plačila sredi meseca velja od naslednje ustvarjene obveznosti; že ustvarjene se ne spreminjajo.
- Več najemnikov: pobot zmanjša skupni znesek pred delitvijo; vračilo se deli kot danes.
- Obveznost s pobotom, ki jo najemodajalec izbriše: dobroimetje se vrne v `creditRemainingCents` izvornega obračuna.

## 7. Testi

Unit:

- matrika mesečnih stroškov in vsote (`costs.ts`), vključno z referenčnim primerom → 223,71 €,
- pobot (`credit.ts`): delni, celoten, večji od obveznosti, več obračunov z ostankom; referenčni primer → 286,29 €,
- vsote obračuna s prenosom in prehodi statusov z izbiro (`settlement.ts`).

Integracijski (`server/tests`):

- skupna obveznost: en zapis na mesec, pravilne vrstice, idempotentnost; akontacije se ne podvojijo,
- zaklep vnosov po pošiljanju in odklep ob ugovoru,
- potrditev z vsako od treh izbir; pobot v naslednjem mesecu; prenos v naslednji obračun,
- avtorizacija: najemnik ne more pisati stroškov, tujec ne vidi ničesar.

Seed: tretje najemno razmerje po referenčnem primeru (skupno plačilo, 9 mesecev vnosov, poslan obračun z dobroimetjem).

## Izven obsega

- Uvoz stroškov iz Excela ali samodejno branje računov.
- Samodejno predlaganje višine akontacije.
- Sprememba najemnikove izbire po potrditvi.
