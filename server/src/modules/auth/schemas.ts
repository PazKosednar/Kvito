import { z } from "zod";
import { OTP_LENGTH } from "./otp.js";

export const RequestCodeBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
});

export const VerifyCodeBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  code: z.string().trim().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`)),
});
