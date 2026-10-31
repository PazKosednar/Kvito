# PaymentPanel

Plačilni podatki za eno obveznost: QR za skeniranje z mobilno banko in vrstice z gumbom »Kopiraj« za telefon, kjer QR-ja na istem zaslonu ni mogoče skenirati.

- Vrstice: Prejemnik, IBAN, Znesek, Sklic, Namen – oznake v slogu `eyebrow`, vrednosti v `mono`. IBAN se kopira brez presledkov, znesek z vejico.
- **QR v knjižnici je samo vizualni vzorec** (oznaka »Vzorec«). V aplikaciji ga zamenja prava UPN QR koda po standardu Združenja bank Slovenije; ozadje QR-ja ostane čisto belo (izjema od tokenov).
- Pod podatki kratko navodilo (`hint`), npr. »Na telefonu kopiraj podatke v svojo banko.«
- Na zaslonih ožjih od 520 px se QR postavi nad vrstice.
- Uporabnik poda: `recipient`, `iban`, `amountCents`, `reference`, `purpose`, neobvezno `hint`.
