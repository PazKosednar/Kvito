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
  members: TenancyMember[];
}

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

export interface Property {
  id: string;
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
export type ChargeType = "RENT" | "BILL" | "OTHER";
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