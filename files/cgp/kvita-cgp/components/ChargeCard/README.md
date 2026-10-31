# ChargeCard

Kartica ene obveznosti (najemnina ali položnica): kaj, koliko, do kdaj in v kakšnem stanju.

- Zgoraj `Eyebrow` (vrsta · obdobje) in `StatusBadge`, pod črto `line` naslov (`h3`), znesek v slogu `amount` (mono, tabelarne številke), spodaj rok in eno dejanje.
- `amountCents` je celo število v centih; prikaz `sl-SI` (»520,00 €«).
- `due` podaj že oblikovano: »15. 11. 2026«. Pri `overdue` se rok obarva v `warn`.
- Dejanje: najemnik »Plačaj« / »Plačal sem«, najemodajalec »Potrdi plačilo«; pri `confirmed` sekundarno (»Prikaži dokazilo«).
- Ne: senca, barvni levi rob, več kot eno dejanje.
