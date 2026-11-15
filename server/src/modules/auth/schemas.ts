import { z } from "zod";
import { PASSWORD_MAX, PASSWORD_MIN } from "../../lib/password.js";

/** Language of the sign-in screen: a new account starts with it. */
const locale = z.enum(["sl", "en"]).optional();
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const newPassword = z.string().min(PASSWORD_MIN, "PASSWORD_TOO_SHORT").max(PASSWORD_MAX);

export const RegisterBody = z.object({
  name: z.string().trim().min(1).max(80),
  email,
  password: newPassword,
  locale,
});

export const LoginBody = z.object({
  email,
  password: z.string().min(1).max(PASSWORD_MAX),
});

export const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword,
});
