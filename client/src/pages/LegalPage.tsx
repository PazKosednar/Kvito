import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { KvitaLockup } from "@/components/brand";
import { ROUTES, TERMS_VERSION } from "@/constants";

/**
 * Terms of use and privacy policy – DRAFT. Facts about the app (what is stored, for how long, who processes it)
 * are taken from the code and docs/RETENTION.md; every legal assessment is left as TODO(pravnik).
 * The texts are Slovenian only until a lawyer approves them (then translate to English).
 */

type Block = { h: string; p?: string[]; li?: string[]; todo?: string };

const TERMS: Block[] = [
  {
    h: "1. Kaj je Kvito",
    p: [
      "Kvito je spletna aplikacija za evidenco obveznosti in komunikacijo med najemodajalcem in najemnikom: najemnina, stroški, obračuni, varščina, sporočila, okvare, števci, dokumenti in primopredaja.",
      "Kvito nikoli ne prejme ali posreduje denarja. Plačila potekajo neposredno med uporabniki (npr. z UPN nalogom); Kvito jih samo beleži, ko jih uporabnik javi ali potrdi.",
    ],
  },
  {
    h: "2. Račun",
    li: [
      "Za uporabo potrebuješ račun z e-naslovom, ki ga potrdiš s kodo, in geslom.",
      "Vpisuješ resnične podatke in skrbiš, da gesla ne izveš drugim.",
      "Račun lahko kadar koli izbrišeš v meniju računa → Zasebnost.",
    ],
  },
  {
    h: "3. Vsebina, ki jo vpišeš",
    p: [
      "Zneske, obračune, zapisnike in sporočila vpisujejo uporabniki. Kvito jih izračuna in prikaže, ne preverja pa, ali se ujemajo s pogodbo, računi ali zakonom.",
      "Kvito ne daje pravnih, davčnih ali računovodskih nasvetov. Povzetki (npr. letni povzetek prejete najemnine) so pomoč, ne uradni dokument.",
    ],
  },
  {
    h: "4. Česa ne smeš",
    li: ["Vpisovati tujih podatkov brez dovoljenja (npr. EMŠO ali kopij osebnih dokumentov – Kvito jih ne potrebuje).", "Poskušati dostopati do tujih najemov ali obremenjevati sistema.", "Uporabljati Kvita za nezakonite namene."],
  },
  { h: "5. Naročnina in plačilo", todo: "Cenik, obračunsko obdobje, odpoved in vračila – ko bo naročnina uvedena." },
  { h: "6. Odgovornost", todo: "Omejitev odgovornosti, razpoložljivost storitve, višja sila." },
  { h: "7. Spremembe pogojev in pravo", todo: "Kako obveščamo o spremembah, uporaba prava RS, pristojno sodišče, potrošniške pravice." },
  { h: "Ponudnik storitve", todo: "Ime podjetja, naslov, matična in davčna številka, kontakt." },
];

const PRIVACY: Block[] = [
  { h: "Upravljavec osebnih podatkov", todo: "Ime podjetja, naslov, kontakt; ali je potrebna pooblaščena oseba za varstvo podatkov (DPO)." },
  {
    h: "Katere podatke hranimo",
    li: [
      "Račun: ime, e-naslov, telefon (če ga vpišeš), jezik, vloga, zgoščena vrednost gesla (gesla samega ne hranimo).",
      "Najem: nepremičnina in enota, pogoji najema, IBAN prejemnika plačil, člani najema.",
      "Denar: obveznosti, javljena in potrjena plačila, varščina, akontacije, stroški po mesecih in obračuni.",
      "Komunikacija: sporočila, okvare, komentarji, obvestila.",
      "Datoteke, ki jih naložiš: računi, fotografije, dokumenti, dokazila o plačilu.",
      "Tehnični podatki: seje (naprava, IP), naprave za potisna obvestila, dnevnik sprememb z IP-naslovom.",
      "Kvito ne zbira EMŠO in kopij osebnih dokumentov.",
    ],
  },
  {
    h: "Za kaj jih uporabljamo",
    li: ["Delovanje aplikacije med najemodajalcem in najemnikom.", "Obvestila in opomniki (e-pošta, potisna obvestila).", "Varnost: prijava, zaščita pred zlorabo, dnevnik sprememb."],
    todo: "Pravna podlaga za vsak namen (pogodba, zakoniti interes, privolitev).",
  },
  {
    h: "Kdo jih obdeluje za nas",
    li: [
      "Gostovanje aplikacije in baze: Railway, regija EU.",
      "Hramba datotek: S3-združljiva hramba v EU.",
      "E-pošta: ponudnik SMTP v EU.",
      "Potisna obvestila: storitve proizvajalca brskalnika ali naprave (npr. Apple, Google) – prejmejo le vsebino obvestila.",
    ],
    todo: "Imena obdelovalcev in pogodbe o obdelavi (DPA).",
  },
  {
    h: "Kako dolgo",
    li: [
      "Kode za potrditev in novo geslo: 1 dan po poteku.",
      "Seje: 30 dni po poteku ali preklicu.",
      "Obvestila: prebrana 180 dni, neprebrana 365 dni.",
      "Neuporabljena povabila: 90 dni po poteku ali preklicu.",
      "Ob izbrisu računa izbrišemo ime, e-naslov, telefon, seje, naprave in obvestila. Obveznosti, plačila in sporočila ostanejo drugi strani najema kot »Izbrisan uporabnik«.",
    ],
    todo: "Zakonski roki hrambe računovodskih zapisov in dnevnika sprememb.",
  },
  {
    h: "Tvoje pravice",
    p: [
      "Imaš pravico do dostopa, popravka, izbrisa, omejitve obdelave, prenosljivosti in ugovora. Izvoz vseh svojih podatkov in izbris računa narediš sam v meniju računa → Zasebnost.",
      "Pritožbo lahko vložiš pri Informacijskem pooblaščencu Republike Slovenije.",
    ],
  },
];

export function LegalPage({ doc }: { doc: "terms" | "privacy" }) {
  const { t } = useTranslation();
  const blocks = doc === "terms" ? TERMS : PRIVACY;
  return (
    <div className="min-h-dvh bg-surface px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-16 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link to={ROUTES.login} aria-label={t("app.name")}>
          <KvitaLockup className="h-5" />
        </Link>
        <h1 className="mt-8 text-title font-semibold lg:text-h1">{t(doc === "terms" ? "legal.terms" : "legal.privacy")}</h1>
        <p className="mt-3 rounded-sm bg-warn-soft px-4 py-3 text-sm text-warn" role="note">
          {t("legal.draft")}
        </p>
        {/* TODO(pravnik): pregled in dokončno besedilo; nato prevod v angleščino. */}
        {blocks.map((b) => (
          <section key={b.h} className="mt-8">
            <h2 className="text-lg font-semibold">{b.h}</h2>
            {b.p?.map((p) => (
              <p key={p} className="mt-2 text-ink-muted">
                {p}
              </p>
            ))}
            {b.li && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted">
                {b.li.map((li) => (
                  <li key={li}>{li}</li>
                ))}
              </ul>
            )}
            {b.todo && <p className="mt-2 font-mono text-xs text-ink-faint">TODO(pravnik): {b.todo}</p>}
          </section>
        ))}
        <p className="mt-10 text-sm text-ink-faint">{t("legal.version", { version: TERMS_VERSION })}</p>
      </div>
    </div>
  );
}
