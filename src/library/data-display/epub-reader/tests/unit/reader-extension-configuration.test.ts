import {
  BUILT_IN_COMPATIBILITY_MODULES,
  BUILT_IN_READER_INPUT_BINDINGS,
  BUILTIN_READER_THEMES,
  DEFAULT_READER_COMPATIBILITY_PREFERENCES,
  configureReaderExtensions,
  createReaderCompatibilityProfile,
  type ContentDocumentCompatibilityRule,
} from "../../core";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition)
    throw new Error(
      `Reader extension configuration unit test failed: ${message}`,
    );
}

const contentRule: ContentDocumentCompatibilityRule = {
  id: "test.compatibility.content",
  family: "content-document",
  stage: "content-document.processing",
  revision: "1",
  enabledByDefault: true,
  apply: (_context, state) => ({ value: state }),
};

function main(): void {
  const configuration = configureReaderExtensions({
    compatibilityModules: [contentRule],
    inputBindings: [
      {
        id: "test.input.vim",
        priority: 100,
        kinds: ["keyboard"],
        shortcuts: [
          {
            label: "Navigation",
            items: [{ keys: ["J"], action: "Next page" }],
          },
        ],
        map: (signal) =>
          signal.kind === "keyboard" && signal.key.toLowerCase() === "j"
            ? { type: "navigate", direction: "forward", source: "keyboard" }
            : null,
      },
    ],
    themes: [
      { id: "test-midnight", label: "Test midnight", background: "#111827" },
    ],
  });

  assert(
    Object.isFrozen(configuration),
    "the public configuration must be immutable",
  );
  assert(
    Object.isFrozen(configuration.themeCatalog),
    "the configured theme catalog must expose a read-only facade",
  );
  assert(
    configuration.compatibilityModules.length ===
      BUILT_IN_COMPATIBILITY_MODULES.length + 1,
    "compatibility contributions must extend rather than silently replace built-ins",
  );
  assert(
    configuration.inputMap.description.bindingIds.length ===
      BUILT_IN_READER_INPUT_BINDINGS.length + 1,
    "input contributions must extend the built-in map",
  );
  assert(
    configuration.themeCatalog.list().length ===
      BUILTIN_READER_THEMES.length + 1,
    "theme contributions must extend the built-in catalog",
  );

  const command = configuration.inputMap.resolve(
    { kind: "keyboard", key: "j" },
    {
      pageProgression: "ltr",
      enabled: true,
      contentKind: "reflowable",
      presentation: "paginated",
      wheelBoundaryNavigation: false,
    },
  ).command;
  assert(
    command?.type === "navigate" && command.direction === "forward",
    "custom input must be active in the resolved map",
  );
  assert(
    configuration.themeCatalog.resolve("test-midnight")?.background ===
      "#111827",
    "custom theme must be available",
  );

  const profile = createReaderCompatibilityProfile(
    DEFAULT_READER_COMPATIBILITY_PREFERENCES,
    configuration.compatibilityModules,
  );
  assert(
    profile.has(contentRule.id),
    "custom EPUB compatibility must enter the session profile",
  );

  let duplicateRejected = false;
  try {
    configureReaderExtensions({ themes: [{ id: "dark", background: "#000" }] });
  } catch (error) {
    duplicateRejected =
      error instanceof Error &&
      error.message.includes("Duplicate extension id");
  }
  assert(
    duplicateRejected,
    "contributions must not replace built-ins by reusing an id",
  );

  console.log("Reader extension configuration unit test: PASS");
}

main();
