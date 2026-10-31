import { Router } from "express";
import { env } from "../../config/env.js";
import { parseDateOnly } from "../../lib/dates.js";
import { notFound } from "../../lib/errors.js";
import { rfReference, shareReference } from "../../lib/reference.js";
import { buildUpnQrText, upnQrSvg, type UpnFields } from "../../lib/upnqr.js";

/**
 * Sample UPN QR codes for manual testing in Slovenian banking apps (page /upn-test).
 * Uses a fictional payee IBAN with a valid checksum – do NOT confirm a payment in the bank while testing.
 * TODO(preveri): replace with a bank-provided test account or your own IBAN for a real 0,01 € test.
 */
const DEV_IBAN = "SI56191000000123438";

const base: UpnFields = {
  payerName: "Ana Kovač",
  payerStreet: "Trnovska ulica 1",
  payerCity: "1000 Ljubljana",
  amountCents: 65000,
  purposeCode: "RENT",
  purpose: "Najemnina november 2026",
  dueDate: parseDateOnly("2026-11-05"),
  payeeIban: DEV_IBAN,
  payeeReference: shareReference(1),
  payeeName: "Mojca Novak",
  payeeStreet: "Trnovska ulica 1",
  payeeCity: "1000 Ljubljana",
};

const SAMPLES: { id: string; title: string; check: string; fields: UpnFields }[] = [
  {
    id: "rent-rf",
    title: "Najemnina najemodajalcu (sklic RF)",
    check: "Znesek 650,00 €, koda RENT, sklic RF…00000001, rok 5. 11. 2026.",
    fields: base,
  },
  {
    id: "bill-share",
    title: "Delež položnice (elektrika 60 %)",
    check: "Znesek 29,24 €, koda ELEC, sklic RF…00000002.",
    fields: { ...base, amountCents: 2924, purposeCode: "ELEC", purpose: "Elektrika oktober (60 %)", payeeReference: shareReference(2) },
  },
  {
    id: "supplier-si",
    title: "Neposredno dobavitelju (sklic SI12)",
    check: "Prejemnik »Dobavitelj elektrike d.o.o.«, sklic SI12 1234567890120 (kontrolna števka mod 11).",
    fields: {
      ...base,
      amountCents: 4873,
      purposeCode: "ELEC",
      purpose: "Račun 2026-10-4411",
      payeeReference: "SI121234567890120",
      payeeName: "Dobavitelj elektrike d.o.o.",
      payeeStreet: "Elektrarniška cesta 5",
      payeeCity: "2000 Maribor",
    },
  },
  {
    id: "diacritics",
    title: "Šumniki in dolga imena",
    check: "Č, Š, Ž, Ć, Đ se pravilno prikažejo; predolgi nazivi so odrezani na 33/42 znakov.",
    fields: {
      ...base,
      payerName: "Žiga Čeh Šuštar Đurić",
      payeeName: "Štefanija Žužek Čebašek s.p. – najemnine in storitve",
      purpose: "Plačilo najemnine za stanovanje št. 3 – november 2026",
      payeeReference: rfReference("KVITA2026"),
    },
  },
  {
    id: "minimum",
    title: "Najmanjši znesek 0,01 €",
    check: "Znesek 0,01 €. Uporabno za resničen preizkus z lastnim IBAN-om.",
    fields: { ...base, amountCents: 1, purposeCode: "OTHR", purpose: "Preizkus Kvita UPN QR" },
  },
  {
    id: "no-reference",
    title: "Brez sklica",
    check: "Polje sklic je prazno; banka naj vseeno prebere vse ostalo.",
    fields: { ...base, payeeReference: null },
  },
];

export function upnRouter(): Router {
  const router = Router();
  router.get("/upn/samples", (_req, res) => {
    if (env.NODE_ENV === "production") throw notFound();
    res.json({
      samples: SAMPLES.map((s) => {
        const text = buildUpnQrText(s.fields);
        return { id: s.id, title: s.title, check: s.check, text, svg: upnQrSvg(text) };
      }),
    });
  });
  return router;
}
