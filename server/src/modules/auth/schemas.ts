import { z } from "zod";
import { OTP_LENGTH } from "./otp.js";

/** Language of the sign-in screen: used for the code e-mail and as the new account's language. */
const locale = z.enum(["sl", "en"]).optional();

export const RequestCodeBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  locale,
});

export const VerifyCodeBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  code: z.string().trim().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`)),
  locale,
});
