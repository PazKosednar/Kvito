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

Postavljeno v projektu `eloquent-dream` kot storitev **`kvito-web`** (EU, `europe-west4`), domena
`https://kvito-web-production.up.railway.app`. Nastavitve so v storitvi (Railway za nove storitve ne bere več `railway.json`;
`web/railway.json` je zapis istih vrednosti):

- Source: repozitorij Kvito, veja `main`, **Root Directory** `/web`
- Start: `node server.mjs`, healthcheck `/health`, restart ON_FAILURE (5)
- Watch paths: `/web/**` – gradi se samo ob spremembah strani
- Variables: `APP_URL` (javni naslov aplikacije brez poševnice na koncu; kasneje npr. `https://app.kvito.si`), `PORT=8080`, `NODE_ENV=production`

Aplikacija (`@kvita/server`) ima svoje watch paths (`/server/**`, `/client/**` …), zato spremembe v `web/` aplikacije ne zgradijo znova.
Lastna domena (`kvito.si` / `www.kvito.si`): Settings → Networking → Custom Domain, nato DNS zapisi pri registrarju.

## Odprto

- `TODO(preveri)`: cenik po testnem obdobju (na strani namenoma ni cen).
- `TODO(pravnik)`: pogoji uporabe in politika zasebnosti (povezave vodijo v aplikacijo).
- Kontaktni e-naslov ni objavljen, dokler domena `kvito.si` in e-pošta nista urejeni.
- Posnetki zaslonov so iz seeda; ob večjih spremembah videza jih posnemi znova.
