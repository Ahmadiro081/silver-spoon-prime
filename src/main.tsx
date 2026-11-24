import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { App } from "./App";
import { AppStateProvider } from "./context/AppStateProvider";
import { ThemeProvider } from "./context/ThemeProvider";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AppStateProvider>
        <App />
        <Toaster position="top-right" richColors closeButton />
      </AppStateProvider>
    </ThemeProvider>
  </StrictMode>,
);
