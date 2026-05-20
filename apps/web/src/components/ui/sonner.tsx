import { Toaster as Sonner, type ToasterProps } from "sonner";

// The app has no theme switcher (single dark theme), so we pin the toaster to
// dark and map its surface colors onto our CSS theme tokens.
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
