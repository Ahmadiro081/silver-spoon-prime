import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { App } from "./App";
import { AppStateProvider } from "./context/AppStateContext";
import { ThemeProvider } from "./context/ThemeContext";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AppStateProvider>
        <App />
        <Toaster position="top-right" richColors />
      </AppStateProvider>
    </ThemeProvider>
  </StrictMode>,
);
