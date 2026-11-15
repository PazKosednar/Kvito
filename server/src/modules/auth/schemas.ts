import { z } from "zod";
import { PASSWORD_MAX, PASSWORD_MIN, isCommonPassword } from "../../lib/password.js";
import { CODE_LENGTH } from "./codes.js";

/** Language of the sign-in screen: a new account starts with it. */
const locale = z.enum(["sl", "en"]).optional();
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const code = z.string().trim().regex(new RegExp(`^\\d{${CODE_LENGTH}}$`));
export const newPassword = z
  .string()
  .min(PASSWORD_MIN, "PASSWORD_TOO_SHORT")
  .max(PASSWORD_MAX)
  .refine((p) => !isCommonPassword(p), "PASSWORD_TOO_COMMON");

export const RegisterBody = z.object({
  name: z.string().trim().min(1).max(80),
  email,
  password: newPassword,
  /** The person ticked "I accept the terms of use and the privacy policy". */
  acceptTerms: z.literal(true, "TERMS_REQUIRED"),
  locale,
});

export const EmailBody = z.object({ email });
export const VerifyEmailBody = z.object({ email, code });
export const ResetPasswordBody = z.object({ email, code, password: newPassword });

export const LoginBody = z.object({
  email,
  password: z.string().min(1).max(PASSWORD_MAX),
});

export const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword,
});
