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
