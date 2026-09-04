import { configureReaderUi, type EpubReaderHandle } from "../../../react";

let activeReader: EpubReaderHandle | null = null;

export const TEST_UI_CONFIGURATION = configureReaderUi({
  layout: { compactBreakpointPx: 720, panelWidthPx: 392 },
  tools: [
    {
      id: "test.statistics",
      label: "Reading statistics",
      shortLabel: "Stats",
      description: "Test-only registered reader tool",
      placement: "secondary",
      renderIcon: () => <span aria-hidden="true">#</span>,
      render: ({ reader }) => {
        activeReader = reader;
        return (
          <section aria-label="Registered reading statistics">
            {reader.state.reader?.publication.metadata.title ?? "Opening"}
          </section>
        );
      },
    },
  ],
  surfaceRenderers: [
    {
      kind: "external-link",
      render: ({ surface }) => (
        <p aria-label="Configured external explanation">
          Approved {surface.target.kind} destination.
        </p>
      ),
    },
  ],
});

export function getActiveReader(): EpubReaderHandle | null {
  return activeReader;
}
