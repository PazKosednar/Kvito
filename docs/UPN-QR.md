# UPN QR – povzetek uradnih pravil (za implementacijo v Kviti)

Viri (uradni dokumenti ZBS, prebrani 31. 10. 2026 iz `objava_dokumentacije_UPN_QR-2016-12-15.zip` in
`Sifrant_kod_namenov_placil_javen.zip` z https://www.zbs-giz.si/placilni-promet/):

- *Struktura zapisa QR na obrazcu UPN QR* (priloga 7.3, potrjeno na 2. korespondenčni seji Odbora za plačilni promet 23. 6. 2016)
- *UPN QR tehnični standard ver. 1.1, november 2016* (priloga 7.1)
- *Navodila za izpolnjevanje posameznih polj …* (priloga 7.2)
- *Navodilo o obliki, vsebini in uporabi UPN QR* (15. 12. 2016)
- *Pravila za oblikovanje in uporabo standardiziranih referenc SI in RF* (priloga 7.4, december 2016)
- *Šifrant kod namenov* (`Skrajsani nazivi kode namena za spletno banko 2019.08.07.xlsx`)

Spletni naslovi `upn-qr.si/uploads/...` vračajo 404; domena `upn-qr.si` ni več uradna stran.

## Simbol QR
- QR **verzija 15**, **binarni način**, **ECC M**, **ECI ISO-8859-2** (ECI 4).
- Kapaciteta zapisa: **411 znakov**.

## Podatki – 20 polj, **za vsakim poljem (1–20) ločilo LF** (`\n`); prazno polje = samo ločilo
| # | Polje | Maks. | Pravilo |
|---|---|---|---|
| 1 | Vodilni slog | 5 | konstanta `UPNQR` |
| 2 | IBAN plačnika | 19 | brez presledkov (pri nas prazno) |
| 3 | Polog | 1 | `X` ali prazno |
| 4 | Dvig | 1 | `X` ali prazno |
| 5 | Referenca plačnika | 26 | model + sklic brez presledkov |
| 6 | Ime plačnika | 33 | ISO 8859-2, brez vodilnih/sledečih presledkov |
| 7 | Ulica in št. plačnika | 33 | 〃 |
| 8 | Kraj plačnika | 33 | 〃 |
| 9 | Znesek | 11 | samo številke, vodilne ničle, znesek × 100 (`00000126874`) |
| 10 | Datum plačila | 10 | `DD.MM.LLLL` |
| 11 | Nujno | 1 | `X` ali prazno |
| 12 | Koda namena | 4 | velike črke A–Z, po šifrantu |
| 13 | Namen plačila | 42 | ISO 8859-2 |
| 14 | Rok plačila | 10 | `DD.MM.LLLL` |
| 15 | IBAN prejemnika | 34 | SEPA IBAN brez presledkov |
| 16 | Referenca prejemnika | 26 | (4+22) model in sklic brez presledkov |
| 17 | Ime prejemnika | 33 | ISO 8859-2 |
| 18 | Ulica in št. prejemnika | 33 | 〃 |
| 19 | Kraj prejemnika | 33 | 〃 |
| 20 | Kontrolna vsota | 3 | `strlen(N1+'\n') + … + strlen(N19+'\n')`, vodilne ničle |
| – | Rezerva | – | prazno ali presledki, brez ločila (do 411 znakov skupaj) |

**Obvezno za »Nalog za plačilo obveznosti«**: ime, ulica in kraj plačnika; znesek; koda namena; namen; IBAN, ime, ulica in kraj prejemnika.
Referenca prejemnika je neobvezna (obvezna le za JFP).

## Reference
- **RF (ISO 11649)** – priporočena; `RF` + 2 kontrolni števki + do 21 alfanumeričnih znakov.
  Kontrolna števka: nizu (5.–25. mesto) dodamo desno `RF00`, črke pretvorimo v števila (A=10 … Z=35),
  `98 − (n mod 97)`, dvomestno. Primera iz pravil: `RF712348231`, `RF45SBO2010`.
- **SI** – modeli 00–99; model 12: P1 z mod 11 kontrolno števko, največ 13 znakov.
- **Kvita uporablja RF**: `RF{kk}{številka deleža obveznosti, 8 mest}` – omogoča kasnejše samodejno ujemanje z izpiskom.

## Kode namena (iz uradnega šifranta 2019-08-07), ki jih uporablja Kvita
| Strošek | Koda | Naziv v šifrantu |
|---|---|---|
| Najemnina | `RENT` | Najemnina |
| Varščina | `DEPT` | Depozit |
| Elektrika | `ELEC` | Račun za elektriko |
| Voda | `WTER` | Račun za vodo/vodarina |
| Plin | `GASB` | Račun za plin |
| Ogrevanje | `ENRG` | Energetika |
| Internet/telefon | `PHON` | Račun za telefon |
| TV | `CBTV` | Račun za kabelsko TV |
| Odpadki | `UBIL` | Povezane komunalne storitve |
| Rezervni sklad, upravnik, čiščenje | `BLDM` | Vzdrževanje zgradb |
| Drugo | `OTHR` | Drugo |

Preslikava je privzeta; najemodajalec lahko kodo spremeni pri obveznosti.

## Registracija
*Navodilo o obliki, vsebini in uporabi UPN QR*: »Izdajatelj UPN QR je lahko vsak uporabnik plačilnih storitev.«
Registracija in predhodno preverjanje veljata za **registrirane izdajatelje** (poseben tip naloga z olajšavami) in za **tiskarne** obrazcev.

`TODO(preveri)`:
- dokumenti so iz leta 2016 – preveri, ali obstaja novejša različica standarda;
- standard opisuje tiskan obrazec – ali za prikaz kode QR na zaslonu / v PDF veljajo dodatne zahteve;
- ročni preizkus kod v bančnih aplikacijah (testna stran `/upn-test`).
