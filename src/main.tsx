import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource/geist/300.css";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "@fontsource/instrument-serif/400.css";
import "./theme.css";
import { useSettingsStore } from "./settings/settingsStore";
import { ClerkProvider } from "@clerk/clerk-react";
import { clerkAppearance } from "./auth/clerkAppearance";

(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = "/";

void useSettingsStore.getState().load();

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY. Copy .env.example to .env and add your Clerk key.");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} appearance={clerkAppearance}>
      <App />
    </ClerkProvider>
  </React.StrictMode>,
);
