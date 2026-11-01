import { describe, expect, it } from "vitest";
import { findKvitoRefNo, parseAmountCents, parseDate, parseStatement } from "./bank-statement.js";
import { shareReference } from "./reference.js";

const ref42 = shareReference(42); // RF.. + 00000042
const ref7 = shareReference(7);

const camt = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <Stmt>
      <Ntry>
        <Amt Ccy="EUR">650.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-11-05</Dt></BookgDt>
        <AcctSvcrRef>NLB-0001</AcctSvcrRef>
        <NtryDtls><TxDtls>
          <RltdPties><Dbtr><Nm>Ana Novak</Nm></Dbtr></RltdPties>
          <RmtInf><Strd><CdtrRefInf><Ref>${ref42}</Ref></CdtrRefInf></Strd><Ustrd>Najemnina november 2026</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">42.10</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2026-11-06</Dt></BookgDt>
        <NtryDtls><TxDtls><RmtInf><Ustrd>Elektrika</Ustrd></RmtInf></TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">300.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-11-07</Dt></BookgDt>
        <AcctSvcrRef>NLB-0003</AcctSvcrRef>
        <NtryDtls>
          <TxDtls><Amt Ccy="EUR">150.00</Amt><RmtInf><Ustrd>placilo ${ref7.slice(0, 4)} ${ref7.slice(4)}</Ustrd></RmtInf></TxDtls>
          <TxDtls><Amt Ccy="EUR">150.00</Amt><RmtInf><Ustrd>Darilo</Ustrd></RmtInf></TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

describe("bank statement parsing", () => {
  it("reads camt.053: incoming and outgoing entries, batched transfers, references in either field", () => {
    const { format, entries } = parseStatement(Buffer.from(camt));
    expect(format).toBe("camt");
    expect(entries).toHaveLength(4);
    expect(entries[0]).toMatchObject({ entryId: "NLB-0001", bookedOn: "2026-11-05", amountCents: 65_000, credit: true, counterparty: "Ana Novak", reference: ref42, refNo: 42 });
    expect(entries[1]).toMatchObject({ credit: false, amountCents: 4_210, refNo: null });
    expect(entries[2]).toMatchObject({ entryId: "NLB-0003#0", amountCents: 15_000, refNo: 7 });
    expect(entries[3]).toMatchObject({ entryId: "NLB-0003#1", amountCents: 15_000, refNo: null });
  });

  it("reads a Slovenian CSV export in Windows-1250 with separate credit and debit columns", () => {
    const csv = [
      "Izpisek prometa;;;;;",
      "Datum knjiženja;Plačnik/prejemnik;Sklic;Namen;Znesek v breme;Znesek v dobro",
      `05.11.2026;"Novak, Ana";${ref42};Najemnina;;650,00`,
      "06.11.2026;Elektro Ljubljana;SI00 123;Elektrika;42,10;",
      `07.11.2026;Luka Kranjc;;Plačilo ${ref7};;1.150,00`,
    ].join("\r\n");
    const bytes = Buffer.from(new Uint8Array([...csv].map((c) => ({ ž: 0x9e, č: 0xe8 })[c] ?? c.charCodeAt(0))));
    const { format, entries } = parseStatement(bytes);
    expect(format).toBe("csv");
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ bookedOn: "2026-11-05", amountCents: 65_000, credit: true, counterparty: "Novak, Ana", refNo: 42 });
    expect(entries[1]).toMatchObject({ amountCents: 4_210, credit: false });
    expect(entries[2]).toMatchObject({ amountCents: 115_000, credit: true, refNo: 7, purpose: `Plačilo ${ref7}` });
  });

  it("reads a signed-amount CSV with commas", () => {
    const csv = `Date,Description,Amount,Reference\n2026-11-05,Rent,650.00,${ref42}\n2026-11-06,Shop,-12.30,`;
    const { entries } = parseStatement(Buffer.from(csv));
    expect(entries[0]).toMatchObject({ amountCents: 65_000, credit: true, refNo: 42 });
    expect(entries[1]).toMatchObject({ amountCents: 1_230, credit: false });
  });

  it("finds only valid Kvito references", () => {
    expect(findKvitoRefNo(`x ${ref42} y`)).toBe(42);
    expect(findKvitoRefNo(ref42.replace(/(.{4})/g, "$1 "))).toBe(42);
    expect(findKvitoRefNo("RF00 0000 0042")).toBeNull(); // wrong check digits
    expect(findKvitoRefNo("SI00 2026-11")).toBeNull();
  });

  it("parses amounts and dates the way banks write them", () => {
    expect(parseAmountCents("1.250,00")).toBe(125_000);
    expect(parseAmountCents("1,250.00")).toBe(125_000);
    expect(parseAmountCents("-12,5 EUR")).toBe(-1_250);
    expect(parseAmountCents("1.250")).toBe(125_000);
    expect(parseAmountCents("abc")).toBeNull();
    expect(parseDate("5. 11. 2026")).toBe("2026-11-05");
    expect(parseDate("2026-11-05T10:00:00")).toBe("2026-11-05");
    expect(parseDate("tomorrow")).toBeNull();
  });

  it("refuses files it cannot read", () => {
    expect(() => parseStatement(Buffer.from(""))).toThrow("STATEMENT_EMPTY");
    expect(() => parseStatement(Buffer.from("<Document><Nothing/></Document>"))).toThrow("STATEMENT_UNREADABLE");
  });
});
