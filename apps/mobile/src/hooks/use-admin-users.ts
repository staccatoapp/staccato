import {
  AdminUserArraySchema,
  AdminUserResponseSchema,
  type AdminUserResponse,
  type CreateUser,
} from "@staccato/shared";

import { useAuthedMutation } from "./use-authed-mutation";
import { useAuthedQuery } from "./use-authed-query";

/** All users on this server (admin only). */
export function useAdminUsers() {
  return useAuthedQuery<AdminUserResponse[]>(
    ["admin-users"],
    "/api/admin/users",
    AdminUserArraySchema,
  );
}

/** Creates a user (username + password); invalidates the user list. */
export function useCreateUser() {
  return useAuthedMutation<AdminUserResponse, CreateUser>(
    ["admin-users"],
    (client, vars) =>
      client.post("/api/admin/users", vars, AdminUserResponseSchema),
  );
}
