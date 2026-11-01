import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { refNoFromReference } from "./reference.js";

/**
 * Bank statements the landlord downloads from their e-bank: ISO 20022 camt.053 / camt.054 (XML) or a CSV export.
 * Only incoming payments matter. Nothing from the file is stored – it is parsed in memory to find payments
 * that carry a Kvito reference (RF + 8-digit share number, see lib/reference.ts).
 */

export interface BankEntry {
  /** Bank's own entry reference when there is one, otherwise a hash of the entry. */
  entryId: string;
  /** "YYYY-MM-DD" or null when the file has no readable date. */
  bookedOn: string | null;
  /** Positive amount in cents; null when the amount could not be read. */
  amountCents: number | null;
  credit: boolean;
  counterparty: string | null;
  reference: string | null;
  purpose: string | null;
  /** Kvito share number found anywhere in the entry, if any. */
  refNo: number | null;
}

export class StatementError extends Error {
  constructor(public readonly code: "STATEMENT_UNREADABLE" | "STATEMENT_EMPTY") {
    super(code);
    this.name = "StatementError";
  }
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);

/** Any valid Kvito reference in a text, also when written with spaces ("RF18 0000 0042"). */
export function findKvitoRefNo(...texts: (string | null | undefined)[]): number | null {
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.toUpperCase().matchAll(/RF[ -]?\d[ -]?\d(?:[ -]?\d){8}(?!\d)/g)) {
      const refNo = refNoFromReference(m[0].replace(/[ -]/g, ""));
      if (refNo !== null) return refNo;
    }
  }
  return null;
}

/** "1.250,00", "1,250.00", "1250,5", "-12,50 EUR" → cents (sign kept). */
export function parseAmountCents(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).replace(/[^\d,.+-]/g, "");
  if (!/\d/.test(s)) return null;
  const negative = s.startsWith("-");
  s = s.replace(/[+-]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const decimalSep = lastComma > lastDot ? "," : lastDot > -1 && s.length - lastDot - 1 <= 2 ? "." : lastComma > -1 && s.length - lastComma - 1 <= 2 ? "," : null;
  let intPart = s;
  let frac = "";
  if (decimalSep) {
    const at = s.lastIndexOf(decimalSep);
    intPart = s.slice(0, at);
    frac = s.slice(at + 1);
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d*$/.test(intPart) || !/^\d{0,2}$/.test(frac)) return null;
  const cents = Number(intPart || "0") * 100 + Number(frac.padEnd(2, "0") || "0");
  return negative ? -cents : cents;
}

/** "15.11.2026", "15. 11. 2026", "15/11/2026", "2026-11-15", "2026-11-15T10:00:00" → "2026-11-15". */
export function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return null;
}

// ---------- camt.053 / camt.054 ----------

type Node = Record<string, unknown>;
const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const str = (v: unknown): string | null => {
  if (v == null) return null;
  if (typeof v === "object") return str((v as Node)["#text"]);
  const s = String(v).trim();
  return s || null;
};
const at = (n: unknown, ...path: string[]): unknown => path.reduce<unknown>((cur, k) => (cur && typeof cur === "object" ? (cur as Node)[k] : undefined), n);

function parseCamt(xml: string): BankEntry[] {
  const doc = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, processEntities: true }).parse(xml) as Node;
  const root = (doc["Document"] ?? doc) as Node;
  const containers = [...asArray(at(root, "BkToCstmrStmt", "Stmt")), ...asArray(at(root, "BkToCstmrDbtCdtNtfctn", "Ntfctn")), ...asArray(at(root, "BkToCstmrAcctRpt", "Rpt"))];
  const entries: BankEntry[] = [];
  for (const c of containers) {
    for (const ntry of asArray(at(c, "Ntry")) as Node[]) {
      const credit = str(ntry["CdtDbtInd"]) === "CRDT";
      const bookedOn = parseDate(str(at(ntry, "BookgDt", "Dt")) ?? str(at(ntry, "BookgDt", "DtTm")) ?? str(at(ntry, "ValDt", "Dt")));
      const entryRef = str(ntry["AcctSvcrRef"]);
      const txs = asArray(at(ntry, "NtryDtls", "TxDtls")) as Node[];
      // A batched entry lists each transfer separately; otherwise the entry itself is the transfer.
      const parts = txs.length ? txs : [ntry];
      parts.forEach((tx, i) => {
        const amount = parseAmountCents(str(at(tx, "AmtDtls", "TxAmt", "Amt")) ?? str(tx["Amt"]) ?? (parts.length === 1 ? str(ntry["Amt"]) : null));
        const reference = str(at(tx, "RmtInf", "Strd", "CdtrRefInf", "Ref")) ?? asArray(at(tx, "RmtInf", "Strd")).map((s) => str(at(s, "CdtrRefInf", "Ref"))).find(Boolean) ?? null;
        const purpose = asArray(at(tx, "RmtInf", "Ustrd")).map(str).filter(Boolean).join(" ") || str(at(tx, "AddtlTxInf")) || str(ntry["AddtlNtryInf"]);
        const counterparty = str(at(tx, "RltdPties", "Dbtr", "Nm")) ?? str(at(tx, "RltdPties", "Dbtr", "Pty", "Nm")) ?? str(at(tx, "RltdPties", "UltmtDbtr", "Nm"));
        const txRef = str(at(tx, "Refs", "AcctSvcrRef")) ?? str(at(tx, "Refs", "EndToEndId"));
        entries.push({
          entryId: entryRef ? `${entryRef}${parts.length > 1 ? `#${i}` : ""}` : txRef ?? hash(JSON.stringify(tx) + JSON.stringify(ntry["Amt"]) + (bookedOn ?? "")),
          bookedOn,
          amountCents: amount === null ? null : Math.abs(amount),
          credit,
          counterparty,
          reference,
          purpose,
          refNo: findKvitoRefNo(reference, purpose),
        });
      });
    }
  }
  return entries;
}

// ---------- CSV ----------

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const COLUMN: Record<"date" | "amount" | "credit" | "debit" | "reference" | "name" | "purpose", RegExp> = {
  date: /datum|date|valuta|knji[žz]/i,
  credit: /dobro|priliv|credit|prejet/i,
  debit: /breme|odliv|debit/i,
  amount: /znesek|amount|iznos|vrednost/i,
  reference: /sklic|referenc|reference/i,
  name: /pla[čc]nik|naziv|partner|payer|nasprotn|prejemnik|name|ime/i,
  purpose: /namen|opis|purpose|description|detajl|detail/i,
};

function parseCsv(text: string): BankEntry[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sample = lines.slice(0, 20).join("\n");
  const sep = [";", "\t", ","].map((s) => ({ s, n: sample.split(s).length })).sort((a, b) => b.n - a.n)[0]!.s;
  const rows = lines.map((l) => splitCsvLine(l, sep));

  // The header is the first row (of the first 15) that names at least two known columns.
  let headerAt = -1;
  const cols: Partial<Record<keyof typeof COLUMN, number>> = {};
  for (let r = 0; r < Math.min(rows.length, 15) && headerAt < 0; r++) {
    const found: typeof cols = {};
    rows[r]!.forEach((cell, i) => {
      for (const key of Object.keys(COLUMN) as (keyof typeof COLUMN)[]) {
        // "credit"/"debit" first: "Znesek v dobro" is a credit column, not a generic amount.
        if (found[key] === undefined && COLUMN[key].test(cell) && !(key === "amount" && (COLUMN.credit.test(cell) || COLUMN.debit.test(cell)))) {
          found[key] = i;
          break;
        }
      }
    });
    if (Object.keys(found).length >= 2) {
      headerAt = r;
      Object.assign(cols, found);
    }
  }

  const cell = (row: string[], key: keyof typeof COLUMN) => (cols[key] === undefined ? null : row[cols[key]!] || null);
  return rows.slice(headerAt + 1).map((row) => {
    const joined = row.join(" ");
    let amount: number | null = null;
    let credit = true;
    const creditAmount = parseAmountCents(cell(row, "credit"));
    const debitAmount = parseAmountCents(cell(row, "debit"));
    if (creditAmount) amount = Math.abs(creditAmount);
    else if (debitAmount) {
      amount = Math.abs(debitAmount);
      credit = false;
    } else {
      const signed = parseAmountCents(cell(row, "amount"));
      if (signed !== null) {
        amount = Math.abs(signed);
        credit = signed > 0;
      }
    }
    return {
      entryId: hash(joined),
      bookedOn: parseDate(cell(row, "date")),
      amountCents: amount,
      credit,
      counterparty: cell(row, "name"),
      reference: cell(row, "reference"),
      purpose: cell(row, "purpose"),
      // The reference may sit in any column (banks name them differently), so search the whole row.
      refNo: findKvitoRefNo(cell(row, "reference"), ...row),
    };
  });
}

/** Banks still export CSV in Windows-1250; UTF-8 when it decodes cleanly. */
export function decodeStatement(bytes: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1250").decode(bytes);
  }
}

export function parseStatement(bytes: Buffer): { format: "camt" | "csv"; entries: BankEntry[] } {
  const text = decodeStatement(bytes).trim();
  if (!text) throw new StatementError("STATEMENT_EMPTY");
  const isXml = text.startsWith("<");
  let entries: BankEntry[];
  try {
    entries = isXml ? parseCamt(text) : parseCsv(text);
  } catch {
    throw new StatementError("STATEMENT_UNREADABLE");
  }
  if (!entries.length) throw new StatementError(isXml ? "STATEMENT_UNREADABLE" : "STATEMENT_EMPTY");
  return { format: isXml ? "camt" : "csv", entries };
}
