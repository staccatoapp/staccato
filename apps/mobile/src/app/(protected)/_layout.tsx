import AppTabs from "@/components/app-tabs";

// The Home tab is the anchor for the tabs navigator. It lives in a `(home)/`
// GROUP (URL-transparent) whose `index.tsx` therefore owns "/" — required so the
// cold-launch URL resolves a route. A plain `home/` folder would add a `/home`
// segment, leaving nothing matching "/" and stranding the app on a black splash.
export const unstable_settings = { initialRouteName: "(home)" };

export default function HomeLayout() {
  return <AppTabs />;
}
