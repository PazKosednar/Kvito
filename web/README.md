# Kvito – predstavitvena spletna stran

Ločena od aplikacije: statična stran (HTML/CSS, malo JS) in majhen Node strežnik brez odvisnosti. Na Railwayu teče kot **svoja storitev** v istem projektu kot aplikacija.

## Lokalno (PowerShell)

```powershell
cd web
npm start
# odpri http://localhost:8080
```

## Kaj je kje

| Datoteka | Vsebina |
|---|---|
| `public/index.html` | celotna stran (razdelki 01–09), ikone lucide (ISC) kot vgrajen sprite |
| `public/site.css` | slogi po CGP (robovi namesto senc, majhni radiji, mono nadnaslovi) |
| `public/tokens.css` | **kopija** `client/src/styles/tokens.css` – ob spremembi barv v aplikaciji jo prekopiraj |
| `public/theme.js`, `public/site.js` | tema (privzeto temna, kot aplikacija), mobilni meni |
| `public/img/` | posnetki aplikacije (demo podatki iz seeda) in logotipi iz CGP |
| `server.mjs` | strežnik: `{{APP_URL}}` v HTML zamenja z okoljsko spremenljivko, glave za varnost in predpomnjenje, `/health` |

## Railway (ločena storitev)

1. V projektu aplikacije: **New → GitHub Repo** (isti repozitorij Kvito), regija EU.
2. **Settings → Source → Root Directory:** `web`
3. **Settings → Config-as-code:** `web/railway.json` (zagon `node server.mjs`, preverjanje `/health`, gradnja samo ob spremembah v `web/**`).
4. **Variables:** `APP_URL` = javni naslov aplikacije brez poševnice na koncu (privzeto `https://kvitaserver-production.up.railway.app`; kasneje npr. `https://app.kvito.si`).
5. **Settings → Networking:** ustvari domeno (kasneje `kvito.si` / `www.kvito.si`).

Storitev aplikacije (koren repozitorija) nima `watchPatterns`, zato se ob spremembah v `web/` lahko na novo zgradi tudi aplikacija. `TODO(preveri)`: po želji ji v korenskem `railway.json` dodaj `watchPatterns`, ki izključi `web/**`.

## Odprto

- `TODO(preveri)`: cenik po testnem obdobju (na strani namenoma ni cen).
- `TODO(pravnik)`: pogoji uporabe in politika zasebnosti (povezave vodijo v aplikacijo).
- Kontaktni e-naslov ni objavljen, dokler domena `kvito.si` in e-pošta nista urejeni.
- Posnetki zaslonov so iz seeda; ob večjih spremembah videza jih posnemi znova.
