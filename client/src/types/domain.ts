/** API shapes (mirrors server responses). Dates arrive as ISO strings. */

export type CostType =
  | "RENT"
  | "ELECTRICITY"
  | "WATER"
  | "GAS"
  | "HEATING"
  | "WASTE"
  | "INTERNET"
  | "TV"
  | "MAINTENANCE_FUND"
  | "BUILDING_MANAGEMENT"
  | "CLEANING"
  | "OTHER";

export const COST_TYPES: CostType[] = [
  "ELECTRICITY",
  "WATER",
  "GAS",
  "HEATING",
  "WASTE",
  "INTERNET",
  "TV",
  "MAINTENANCE_FUND",
  "BUILDING_MANAGEMENT",
  "CLEANING",
  "OTHER",
];

export type SplitMethod = "EQUAL" | "PERCENTAGE" | "PER_PERSON";
export type TenancyStatus = "DRAFT" | "ACTIVE" | "ENDED";

export interface PersonRef {
  id: string;
  name: string | null;
  email: string;
}

export interface TenancyMember {
  id: string;
  userId: string;
  isPrimary: boolean;
  shareBasisPoints: number | null;
  personCount: number;
  joinedAt: string;
  user: PersonRef;
}

export interface Tenancy {
  id: string;
  unitId: string;
  status: TenancyStatus;
  startDate: string;
  endDate: string | null;
  rentCents: number;
  rentDueDay: number;
  depositCents: number | null;
  payeeName: string;
  payeeIban: string;
  payeeStreet: string | null;
  payeeCity: string | null;
  coveredCosts: CostType[];
  splitMethod: SplitMethod;
  noticePeriodDays: number | null;
  rentReviewMonth: number | null;
  paymentNote: string | null;
  /** COMBINED: rent and cost advances are one monthly payment (pavšal). */
  billingMode: BillingMode;
  members: TenancyMember[];
}

export type BillingMode = "COMBINED" | "SEPARATE";

export interface TenancyDetail extends Tenancy {
  unit: {
    id: string;
    name: string;
    floor: string | null;
    property: {
      id: string;
      name: string;
      street: string;
      postalCode: string;
      city: string;
      owner: PersonRef & { phone: string | null };
    };
  };
}

export interface Unit {
  id: string;
  propertyId: string;
  name: string;
  floor: string | null;
  notes: string | null;
  tenancies: Tenancy[];
}

/** Mirrors server PropertyType: hiša, stanovanje (v bloku), poslovni prostor. */
export type PropertyType = "HOUSE" | "APARTMENT" | "COMMERCIAL";

export interface Property {
  id: string;
  type: PropertyType;
  name: string;
  street: string;
  postalCode: string;
  city: string;
  notes: string | null;
  units: Unit[];
}

export type InvitationState = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

export interface InvitationSummary {
  id: string;
  email: string | null;
  state: InvitationState;
  createdAt: string;
  expiresAt: string;
  acceptedBy: { name: string | null; email: string } | null;
}

export interface InvitationPreview {
  state: InvitationState;
  email: string | null;
  landlordName: string | null;
  unitName: string;
  propertyName: string;
  street: string;
  city: string;
  expiresAt: string;
}

// ---------- Charges (Phase 2) ----------

export type ChargeStatus = "OPEN" | "REPORTED_PAID" | "CONFIRMED" | "OVERDUE" | "DISPUTED";
export type ChargeType = "RENT" | "BILL" | "OTHER" | "DEPOSIT" | "ADVANCE" | "SETTLEMENT";
export type PayTo = "LANDLORD" | "SUPPLIER";
export type AttachmentKind = "BILL" | "PAYMENT_PROOF" | "MESSAGE" | "ISSUE" | "METER" | "HANDOVER" | "DOCUMENT";

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
}

export interface PaymentReport {
  id: string;
  paidOn: string | null;
  amountCents: number;
  note: string | null;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  source: "TENANT" | "BANK_IMPORT" | "LANDLORD";
  rejectReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reportedBy: PersonRef;
  attachments: Attachment[];
}

export interface ChargeShare {
  id: string;
  refNo: number;
  memberId: string;
  amountCents: number;
  status: ChargeStatus;
  confirmedAt: string | null;
  reference: string | null;
  member: { id: string; userId: string; user: PersonRef };
  paymentReports: PaymentReport[];
}

export interface Charge {
  id: string;
  tenancyId: string;
  type: ChargeType;
  costType: CostType | null;
  title: string;
  description: string | null;
  amountCents: number;
  dueDate: string;
  rentPeriod: string | null;
  autoKey: string | null;
  status: ChargeStatus;
  payTo: PayTo;
  payeeName: string;
  payeeIban: string;
  payeeStreet: string | null;
  payeeCity: string | null;
  reference: string | null;
  purposeCode: string | null;
  purpose: string | null;
  createdAt: string;
  shares: ChargeShare[];
  attachments: Attachment[];
  lines: ChargeLine[];
}

export interface ChargeLine {
  id: string;
  costType: CostType;
  label: string | null;
  amountCents: number;
  /** Set when the line pays part of the charge with a settlement credit. */
  creditSettlementId?: string | null;
}

export interface ChargesSummary {
  kvita: boolean;
  openCents: number;
  overdueCents: number;
  awaitingConfirmationCents: number;
  count: number;
}

export interface PaymentData {
  chargeId: string;
  shareId: string;
  payTo: PayTo;
  payeeName: string;
  payeeIban: string;
  payeeAddress: string | null;
  amountCents: number;
  reference: string | null;
  purpose: string;
  purposeCode: string;
  dueDate: string;
  title: string;
  paymentNote: string | null;
  qrText: string | null;
  qrSvg: string | null;
  qrUnavailable: string | null;
}
// ---------- Messages & issues (Phase 3) ----------

export interface Message {
  id: string;
  tenancyId: string;
  kind: "USER" | "SYSTEM";
  body: string;
  systemEvent: string | null;
  systemData: Record<string, string | number | null> | null;
  createdAt: string;
  author: PersonRef | null;
  charge: { id: string; title: string } | null;
  issue: { id: string; title: string } | null;
  attachments: Attachment[];
}

export interface ConversationRead {
  userId: string;
  lastReadAt: string;
}

export type IssueCategory = "PLUMBING" | "ELECTRICAL" | "HEATING" | "APPLIANCE" | "WINDOWS_DOORS" | "STRUCTURE" | "PESTS" | "OTHER";
export const ISSUE_CATEGORIES: IssueCategory[] = ["PLUMBING", "ELECTRICAL", "HEATING", "APPLIANCE", "WINDOWS_DOORS", "STRUCTURE", "PESTS", "OTHER"];
export type IssueUrgency = "LOW" | "NORMAL" | "URGENT";
export type IssueStatus = "NEW" | "IN_PROGRESS" | "RESOLVED";

export interface IssueSummary {
  id: string;
  tenancyId: string;
  category: IssueCategory;
  title: string;
  urgency: IssueUrgency;
  status: IssueStatus;
  createdAt: string;
  resolvedAt: string | null;
  reporter: PersonRef;
  _count: { comments: number; attachments: number };
}

export interface IssueComment {
  id: string;
  body: string;
  createdAt: string;
  author: PersonRef;
  attachments: Attachment[];
}

export interface Issue extends Omit<IssueSummary, "_count"> {
  description: string;
  reporterId: string;
  attachments: Attachment[];
  comments: IssueComment[];
}
// ---------- Meters, documents, handover (Phase 4) ----------

export type MeterType = "ELECTRICITY" | "WATER" | "GAS" | "HEAT";
export const METER_TYPES: MeterType[] = ["ELECTRICITY", "WATER", "GAS", "HEAT"];
export const METER_UNITS: Record<MeterType, string> = { ELECTRICITY: "kWh", WATER: "m³", GAS: "m³", HEAT: "kWh" };

export interface MeterReading {
  id: string;
  unitId: string;
  tenancyId: string | null;
  handoverId: string | null;
  meterType: MeterType;
  meterLabel: string | null;
  value: string;
  valueMilli: number;
  readOn: string;
  note: string | null;
  recordedBy: PersonRef;
  createdAt: string;
  attachments: Attachment[];
}

export type DocumentCategory = "CONTRACT" | "ANNEX" | "HOUSE_RULES" | "MANUAL" | "OTHER";
export const DOCUMENT_CATEGORIES: DocumentCategory[] = ["CONTRACT", "ANNEX", "HOUSE_RULES", "MANUAL", "OTHER"];
export type DocumentVisibility = "LANDLORD_ONLY" | "TENANTS";

export interface KvitaDocument {
  id: string;
  tenancyId: string | null;
  unitId: string | null;
  category: DocumentCategory;
  title: string;
  visibility: DocumentVisibility;
  createdAt: string;
  uploadedBy: PersonRef;
  attachments: Attachment[];
}

export type HandoverKind = "MOVE_IN" | "MOVE_OUT";
export type HandoverStatus = "DRAFT" | "AWAITING_CONFIRMATION" | "CONFIRMED";
export type ItemCondition = "GOOD" | "WORN" | "DAMAGED" | "MISSING";

export interface HandoverItem {
  id: string;
  room: string;
  name: string;
  condition: ItemCondition;
  note: string | null;
  attachments: Attachment[];
}

export interface HandoverSummary {
  id: string;
  kind: HandoverKind;
  status: HandoverStatus;
  handoverOn: string;
  _count: { items: number };
}

export interface Handover {
  id: string;
  tenancyId: string;
  kind: HandoverKind;
  status: HandoverStatus;
  handoverOn: string;
  keysCount: number | null;
  keysNote: string | null;
  notes: string | null;
  landlordConfirmedAt: string | null;
  tenantConfirmedAt: string | null;
  tenantConfirmedBy: PersonRef | null;
  items: HandoverItem[];
  meterReadings: MeterReading[];
}
// ---------- Contract money (Phase 6) ----------

export type DepositStatus = "AWAITING_PAYMENT" | "HELD" | "RETURN_PROPOSED" | "RETURN_DISPUTED" | "RETURN_AGREED" | "RETURNED";

export interface DepositDeduction {
  id: string;
  reason: string;
  amountCents: number;
  handoverItem: { id: string; room: string; name: string; condition: ItemCondition } | null;
}

export interface Deposit {
  id: string;
  amountCents: number;
  status: DepositStatus;
  charge: { id: string; status: ChargeStatus } | null;
  receivedOn: string | null;
  returnCents: number | null;
  keptCents: number | null;
  proposalNote: string | null;
  proposedAt: string | null;
  disputeReason: string | null;
  agreedAt: string | null;
  returnedOn: string | null;
  receiptConfirmedAt: string | null;
  deductions: DepositDeduction[];
  returnByMember: { memberId: string; name: string; amountCents: number }[];
}

export interface DepositState {
  agreedCents: number | null;
  rentCents: number;
  deposit: Deposit | null;
  damagedItems: { id: string; room: string; name: string; condition: ItemCondition; note: string | null }[];
}

export interface CostAdvance {
  id: string;
  costType: CostType;
  amountCents: number;
}

export type SettlementStatus = "DRAFT" | "SENT" | "DISPUTED" | "ACCEPTED" | "CLOSED";
export type CreditChoice = "CARRY_OVER" | "OFFSET_NEXT" | "REFUND";
export const CREDIT_CHOICES: CreditChoice[] = ["CARRY_OVER", "OFFSET_NEXT", "REFUND"];

export interface SettlementTotals {
  advanceCents: number;
  actualCents: number;
  /** Credit taken over from earlier settlements. */
  carriedInCents: number;
  /** > 0: the tenant pays the difference; < 0: the tenant is in credit. */
  balanceCents: number;
}

export interface SettlementSummary {
  id: string;
  periodFrom: string;
  periodTo: string;
  status: SettlementStatus;
  sentAt: string | null;
  refundedOn: string | null;
  creditChoice: CreditChoice | null;
  creditRemainingCents: number;
  totals: SettlementTotals;
}

/** One month of actual running costs against the advances charged in it. */
export interface CostMonth {
  period: string;
  advanceCents: number;
  costs: Partial<Record<CostType, number>>;
  costCents: number;
  balanceCents: number;
}

/** Estimate of running costs until a month (GET /tenancies/:id/costs/forecast). */
export interface CostForecast {
  windowFrom: string;
  until: string;
  creditCents: number;
  lastActual: string | null;
  months: { period: string; costCents: number; advanceCents: number; basis: "LAST_YEAR" | "AVERAGE" | "NONE" }[];
  balanceNowCents: number;
  endBalanceCents: number;
  currentAdvanceCents: number;
  suggestedAdvanceCents: number;
}

export interface CostEntry {
  id: string;
  period: string;
  costType: CostType;
  amountCents: number;
  note: string | null;
  attachments: Attachment[];
}

export interface CostsView {
  from: string;
  to: string;
  months: (CostMonth & { lockedBy: string | null })[];
  costTypes: CostType[];
  totals: { advanceCents: number; costCents: number; balanceCents: number; byType: Partial<Record<CostType, number>> };
  entries: CostEntry[];
  running: { from: string; to: string; advanceCents: number; costCents: number; creditCents: number; balanceCents: number };
  access: "LANDLORD" | "TENANT";
}

export interface SettlementLine {
  id: string;
  costType: CostType;
  advanceCents: number;
  actualCents: number;
  note: string | null;
}

export interface Settlement extends SettlementSummary {
  tenancyId: string;
  note: string | null;
  dueDate: string | null;
  disputeReason: string | null;
  respondedAt: string | null;
  refundConfirmedAt: string | null;
  charge: { id: string; status: ChargeStatus } | null;
  lines: SettlementLine[];
  attachments: Attachment[];
  recommendedChoice: CreditChoice | null;
  carriedInCents: number;
  /** Money the landlord returns: the credit when the tenant chose a refund, or what is left of it later. */
  refundCents: number;
  refundByMember: { memberId: string; name: string; amountCents: number }[];
  months: CostMonth[];
  monthCostTypes: CostType[];
  /** How the next monthly payment would look with the credit deducted. */
  nextPayment: { period: string; beforeCents: number; afterCents: number } | null;
}

export interface RentChange {
  id: string;
  effectiveFrom: string;
  rentCents: number;
  previousCents: number;
  note: string | null;
  appliedAt: string | null;
  createdAt: string;
}

export type CloseoutKey = "charges" | "moveOut" | "meters" | "keys" | "settlement" | "deposit" | "credit";

export interface Closeout {
  items: { key: CloseoutKey; state: "done" | "pending" | "na"; detail?: Record<string, string | number | null> }[];
  ready: boolean;
  status: TenancyStatus;
  endDate: string | null;
}

// ---------- Bank statement import ----------

export type BankMatchState = "READY" | "AMOUNT_DIFFERS" | "AMOUNT_UNKNOWN" | "ALREADY_CONFIRMED" | "DUPLICATE";

export interface BankMatch {
  entryId: string;
  bookedOn: string | null;
  amountCents: number | null;
  counterparty: string | null;
  reference: string | null;
  state: BankMatchState;
  share: { id: string; chargeId: string; tenancyId: string; title: string; place: string; tenant: string; amountCents: number; status: ChargeStatus; dueDate: string };
}

export interface BankPreview {
  format: "camt" | "csv";
  entries: number;
  credits: number;
  matches: BankMatch[];
  foreignReferences: number;
  unmatched: { entryId: string; bookedOn: string | null; amountCents: number | null; counterparty: string | null; purpose: string | null; reference: string | null }[];
}
