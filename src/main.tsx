import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import TranslationWindow from "./TranslationWindow";
import { SettingsView } from "./components/Settings/SettingsView";
import { I18nProvider } from "./i18n";

window.addEventListener(
  "pointerdown",
  () => {
    document.documentElement.dataset.inputModality = "pointer";
  },
  true,
);

window.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Tab") {
      document.documentElement.dataset.inputModality = "keyboard";
    }
  },
  true,
);

const params = new URLSearchParams(window.location.search);
const windowType = params.get("window") || params.get("view");

function renderRootComponent() {
  if (windowType === "translation") {
    return <TranslationWindow />;
  }
  if (windowType === "settings") {
    return <SettingsView />;
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      {renderRootComponent()}
    </I18nProvider>
  </React.StrictMode>,
);
