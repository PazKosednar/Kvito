# Button

Gumb za eno jasno dejanje; **primary** (polnilo `accent`) največ enkrat na zaslon – za tisto, zaradi česar zaslon obstaja (»Plačal sem«, »Potrdi plačilo«).

- **Variante:** `primary` (accent + `on-accent`), `secondary` (rob `line-strong` na `surface-raised`), `ghost` (samo besedilo, za »Prekliči«).
- **Velikosti:** `sm` 32 px (Kopiraj v vrsticah), `md` 40 px (namizje), `lg` 48 px (telefon – najmanjša tarča za dotik).
- **Besedilo:** glagol najprej, stavčne velike črke, brez pike: »Plačaj«, »Pošlji opomnik«. Ne »KLIKNI TUKAJ« ali »OK«.
- **Ikona:** neobvezna, lucide-react 16 px, pred besedilom.
- **Ne:** zaobljeni »pill« gumbi, sence, dva primarna gumba drug ob drugem, rdeč gumb za običajna dejanja (danger samo za nepovratna).
- Uporabnik poda: `children` (napis), `onClick`, po potrebi `variant`, `size`, `icon`, `disabled`.
