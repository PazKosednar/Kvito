import type * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = accent fill (one per view); secondary = bordered; ghost = text only. Default primary. */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** sm 32px · md 40px (default) · lg 48px (mobile). */
  size?: 'sm' | 'md' | 'lg';
  /** Optional leading icon (lucide-react, 16px). */
  icon?: React.ReactNode;
}
export declare function Button(props: ButtonProps): React.ReactElement;

export interface EyebrowProps { /** Mono index shown in ink, e.g. "01". */ index?: React.ReactNode; children?: React.ReactNode; className?: string }
export declare function Eyebrow(props: EyebrowProps): React.ReactElement;

export type ChargeStatus = 'open' | 'reported' | 'confirmed' | 'overdue' | 'disputed';
export interface StatusBadgeProps { status: ChargeStatus; /** Overrides the default Slovenian label. */ children?: React.ReactNode; className?: string }
export declare function StatusBadge(props: StatusBadgeProps): React.ReactElement;

export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: React.ReactNode;
  hint?: React.ReactNode;
  /** Error text; replaces the hint and marks the input invalid. */
  error?: React.ReactNode;
  /** Mono font for IBAN, sklic, codes. */
  mono?: boolean;
}
export declare function Field(props: FieldProps): React.ReactElement;

export interface ChargeCardProps {
  /** Eyebrow text, e.g. "Najemnina · nov 2026". */
  kind: React.ReactNode;
  index?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  /** Amount in euro cents (integer). */
  amountCents: number;
  /** Due date already formatted, e.g. "15. 11. 2026". */
  due?: string;
  status: ChargeStatus;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}
export declare function ChargeCard(props: ChargeCardProps): React.ReactElement;

export interface PaymentPanelProps {
  recipient: string;
  /** IBAN as displayed (with spaces); copied without spaces. */
  iban: string;
  amountCents: number;
  reference: string;
  purpose: string;
  hint?: React.ReactNode;
  /** Shows the "Vzorec" tag. The built-in QR is a visual sample; pass sample={false} only once a real UPN QR replaces it in the app. */
  sample?: boolean;
  className?: string;
}
export declare function PaymentPanel(props: PaymentPanelProps): React.ReactElement;

export interface SettledBannerProps { /** Eyebrow, e.g. "November 2026". */ period?: React.ReactNode; children?: React.ReactNode; className?: string }
export declare function SettledBanner(props: SettledBannerProps): React.ReactElement;

declare global {
  interface Window {
    Kvita: {
      Button: typeof Button; Eyebrow: typeof Eyebrow; StatusBadge: typeof StatusBadge; Field: typeof Field;
      ChargeCard: typeof ChargeCard; PaymentPanel: typeof PaymentPanel; SettledBanner: typeof SettledBanner;
    };
  }
}
