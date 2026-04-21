import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/library" });
  },
});

// function RouteComponent() {
//   return <div>Hello "/"!</div>;
// }
