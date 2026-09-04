import { createRoot } from "react-dom/client";
import { EpubReaderShowcase } from "../../showcase/EpubReaderShowcase";
import "../../styles.css";
import { TEST_UI_CONFIGURATION } from "./interaction/configuration";
import { runBrowserInteractionScenario } from "./interaction/scenario";

const resultNode = requireElement("result");
const rootElement = requireElement("root");

createRoot(rootElement).render(
  <EpubReaderShowcase readerConfiguration={TEST_UI_CONFIGURATION} />,
);

void runBrowserInteractionScenario().then(
  (steps) => finish({ status: "pass", steps }),
  (error) =>
    finish({
      status: "fail",
      reason: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
);

function finish(result: Record<string, unknown>): void {
  resultNode.textContent = JSON.stringify(result);
  document.documentElement.dataset.testStatus = String(result.status);
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element)
    throw new Error(`Browser interaction harness is missing #${id}.`);
  return element;
}
