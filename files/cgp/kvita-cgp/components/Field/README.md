# Field

Vnosno polje z oznako nad njim in pomožnim besedilom ali napako pod njim.

- Višina 48 px (`control-lg`), rob `line-strong` na `surface-raised`, fokus = obroč `focus`.
- `mono` za IBAN, sklic in kode (Geist Mono).
- Napaka: `error` zamenja `hint`, rob in besedilo v `danger`, polje dobi `aria-invalid`. Napaka pove, kako popraviti: »IBAN mora imeti 19 znakov (SI).«
- Oznaka je vedno vidna – placeholder ni oznaka.
- Zneski: vejica kot decimalno ločilo (`520,00`).
- Uporabnik poda: `label`, po potrebi `hint`, `error`, `mono` in vse običajne atribute `input`.
