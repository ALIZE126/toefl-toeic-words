import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { loadStateAsync } from "./lib/stateDb";
import { emptyState } from "./lib/storage";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
loadStateAsync()
  .catch(() => emptyState())
  .then((initial) =>
    root.render(
      <StrictMode>
        <App initial={initial} />
      </StrictMode>,
    ),
  );
