import { useQuery } from "@tanstack/react-query";

export function CurrentUserBadge() {
  const query = useQuery({
    queryKey: ["currentUser"],
    queryFn: async () => {
      const response = await fetch("/api/me");
      if (!response.ok) throw new Error("Failed to fetch current user");
      return response.json();
    },
  });

  return (
    <div className="current-user-badge">
      <svg className="user-icon" role="presentation" aria-hidden="true">
        <use href="/icons.svg#user-icon"></use>
      </svg>
      <span>
        Hello,{" "}
        {query.isPending
          ? "Loading..."
          : query.isError
            ? "Error"
            : query.data?.username}
        !
      </span>
    </div>
  );
}
