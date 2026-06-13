// No type import: the object is validated structurally against ClerkProvider's
// `appearance` prop in main.tsx, avoiding a dependency on a possibly-unexported type.
/** Maps Clerk's prebuilt components to the Vibe Space warm-dark / amber theme. */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#d79a3d",
    colorBackground: "#161411",
    colorText: "#f3eee5",
    colorTextSecondary: "#b1a692",
    colorInputBackground: "#1a1815",
    colorInputText: "#f3eee5",
    colorNeutral: "#f3eee5",
    borderRadius: "8px",
    fontFamily: '"Geist", system-ui, sans-serif',
  },
  elements: {
    card: { boxShadow: "0 10px 30px -18px rgba(0,0,0,.6)" },
  },
};
