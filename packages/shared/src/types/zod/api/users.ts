import { z } from "zod";

export const CreateUserSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(8),
});
export type CreateUser = z.infer<typeof CreateUserSchema>;

export const AdminUserResponseSchema = z.object({
  id: z.string(),
  username: z.string(),
  isAdmin: z.boolean(),
  createdAt: z.coerce.date(),
});
export type AdminUserResponse = z.infer<typeof AdminUserResponseSchema>;

export const AdminUserArraySchema = z.array(AdminUserResponseSchema);
