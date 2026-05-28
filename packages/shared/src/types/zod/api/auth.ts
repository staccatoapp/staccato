import { z } from "zod";

export const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const SetupSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(8),
});

export const AuthenticatedUserResponseSchema = z.object({
  id: z.string(),
  username: z.string(),
  isAdmin: z.boolean(),
  onboardingComplete: z.boolean(),
});
export type AuthenticatedUserResponse = z.infer<
  typeof AuthenticatedUserResponseSchema
>;
