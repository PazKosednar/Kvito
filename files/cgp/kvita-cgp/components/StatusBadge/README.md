# StatusBadge

Stanje obveznosti v eni besedi in z ikono, da barva nikoli ni edini nosilec pomena.

| `status` | Napis | Barve |
|---|---|---|
| `open` | Odprto | `ink-muted` na `surface-sunken` |
| `reported` | Čaka potrditev | `ink` na `surface-raised`, rob `line-strong` |
| `confirmed` | Poravnano | `accent` na `accent-soft` |
| `overdue` | Zamuda | `warn` na `warn-soft` |
| `disputed` | Spor | `danger` na `danger-soft` |

- Statusi se ujemajo s potekom OPEN → REPORTED_PAID → CONFIRMED (+ OVERDUE, DISPUTED) v aplikaciji.
- Napis lahko zamenjaš (`children`), ikone ne.
- Ne: več kot ena značka na kartico, značke kot gumbi.
