# Varnost in varstvo podatkov – stanje in odprte točke

Pregled: 17. 11. 2026, ponovni pregled 20. 11. 2026 (avtorizacija vseh API poti, odvisnosti, izvoz in izbris podatkov). Dokument dopolni ob vsaki spremembi, ki vpliva na varnost.

## Kaj je urejeno v kodi

- **Gesla**: scrypt (N=2^15), zavrnitev pogostih gesel, zaklep računa po 5 napačnih poskusih.
- **Seje**: kratek dostopni žeton (15 min, samo v pomnilniku brskalnika), osvežilni žeton v `httpOnly` + `Secure` + `SameSite=Lax` piškotku, rotacija z zaznavo ponovne uporabe.
- **Preklic sej**: dostopni žeton preneha veljati takoj ob izbrisu računa in ob menjavi/ponastavitvi gesla (`User.sessionsValidFrom`), ne šele po izteku. Velja tudi za Socket.IO; povezava se zapre, ko žetonu poteče veljavnost.
- **Avtorizacija**: vsak vir preverja lastništvo oz. članstvo na strežniku (`modules/access/access.ts`), tuji viri vračajo 404.
- **Vhodi**: zod validacija, omejitev velikosti telesa (100 kB JSON, 10 MB datoteke), vrsta datoteke se prepozna iz vsebine.
- **Datoteke**: S3 v EU, dostop samo s podpisano povezavo (1 h).
- **Omejevanje zahtev**: splošno, prijava, kode, registracija, nalaganje datotek.
- **Glave**: CSP, HSTS, `frame-ancestors 'none'`, `Permissions-Policy`, brez `X-Powered-By`.
- **Zagon v produkciji**: strežnik se ne zažene z `CLIENT_ORIGIN` brez https ali z nadomestnim `JWT_ACCESS_SECRET`.
- **Zasebnost**: izvoz in izbris podatkov uporabnika (vključno z lastnimi stroški najemodajalca in fotografijami nepremičnin), pravila hrambe ([RETENTION.md](RETENTION.md)), revizijska sled.
- **Dnevniki**: brez teles zahtev, brez poizvedb s podpisi, brez žetonov in piškotkov.

## Odprto – pred prvimi pravimi uporabniki

1. **E-pošta (SMTP)**: v produkciji sta nastavljena `EMAIL_CONSOLE_IN_PRODUCTION` in `SKIP_EMAIL_VERIFICATION`. Dokler sta vklopljena, e-naslovi niso potrjeni, kode za ponastavitev gesla pa gredo v dnevnik strežnika. Posledica: povabilo, vezano na e-naslov, lahko sprejme vsak, ki prvi ustvari račun s tem naslovom. Izberi ponudnika SMTP v EU, nastavi `SMTP_*` in obe spremenljivki odstrani.
2. **Pravna besedila**: pogoji uporabe in politika zasebnosti – `TODO(pravnik)`.
3. **Pogodbe o obdelavi (DPA)**: Railway (strežnik, baza, datoteke), ponudnik SMTP. `TODO(preveri)`.
4. **Varnostne kopije baze**: v Railway vklopi redne kopije volumna Postgres in enkrat preizkusi obnovitev.
5. **Dostopi**: dvostopenjska prijava (2FA) na GitHub in Railway.
6. **Odvisnosti**: `npm audit` ob vsaki izdaji; Dependabot odpira PR-je tedensko. Stanje 20. 11. 2026: ostaja opozorilo za `effect` (prek orodja `prisma` CLI, samo ob migracijah, ne obdeluje vnosov uporabnikov); popravek zahteva starejšo različico Prisme, zato počakamo na posodobitev Prisme.

## Prijava ranljivosti

podpora@kvito.si – `TODO(preveri)`: potrdi naslov, ko bo domena urejena.
