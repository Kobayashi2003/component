import {
  CompatibilityRegistry,
  ConflictingCompatibilitySelectionError,
  CrossStageCompatibilityDependencyError,
  DisabledCompatibilityDependencyError,
  DuplicateCompatibilityModuleError,
  UnknownCompatibilityModuleError,
  runBinaryResourceCompatibility,
  runContentDocumentCompatibility,
  runInlineStyleResourceCompatibility,
  runNavigationFallbackCompatibility,
  runRenditionCompatibilityPolicies,
  runRootfileSelectionCompatibility,
  runStylesheetResourceCompatibility,
  type BinaryResourceCompatibilityRule,
  type ContentDocumentCompatibilityRule,
  type InlineStyleResourceCompatibilityRule,
  type NavigationFallbackCompatibilityRule,
  type RenditionCompatibilityPolicy,
  type RootfileSelectionCompatibilityRule,
  type StylesheetResourceCompatibilityRule,
} from "../../core/epub/compatibility";
import {
  DEFAULT_READER_PREFERENCES,
  type ContainerRootfile,
  type NavigationModel,
  type Publication,
  type PublicationDiagnostic,
  type SpineItem,
} from "../../core/epub/publication";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition)
    throw new Error(`Compatibility modules unit test failed: ${message}`);
}

const emptyNavigation: NavigationModel = Object.freeze({
  source: "none",
  toc: [],
  landmarks: [],
  pageList: [],
});

const spineItem: SpineItem = Object.freeze({
  index: 0,
  idref: "chapter",
  href: "EPUB/chapter.xhtml",
  path: "EPUB/chapter.xhtml",
  remote: false,
  mediaType: "application/xhtml+xml",
  linear: true,
  properties: [],
  rendition: {},
});

const publication = Object.freeze<Publication>({
  version: "3.3",
  packagePath: "EPUB/package.opf",
  metadata: { creators: [], contributors: [], entries: [] },
  manifest: [],
  spine: [spineItem],
  navigation: emptyNavigation,
  pageProgressionDirection: "ltr",
  rendition: {
    layout: "reflowable",
    orientation: "auto",
    spread: "auto",
    flow: "auto",
  },
});

const rootfiles: readonly ContainerRootfile[] = Object.freeze([
  Object.freeze({ fullPath: "OPS/alternate.opf", mediaType: "text/xml" }),
  Object.freeze({
    fullPath: "EPUB/package.opf",
    mediaType: "application/oebps-package+xml",
  }),
]);

const repairDiagnostic: PublicationDiagnostic = Object.freeze({
  code: "TEST_COMPATIBILITY_REPAIR",
  severity: "info",
  phase: "compatibility",
  message: "Test compatibility repair applied.",
  repair: {
    strategy: "test-repair",
    description: "Exercise the compatibility runner.",
  },
});

async function main(): Promise<void> {
  const rootBase: RootfileSelectionCompatibilityRule = {
    id: "publication.rootfile-base",
    family: "publication",
    stage: "publication.rootfile-selection",
    revision: "1",
    enabledByDefault: false,
    apply(_context, selected) {
      return { value: selected };
    },
  };
  const rootPreferred: RootfileSelectionCompatibilityRule = {
    id: "publication.preferred-rootfile",
    family: "publication",
    stage: "publication.rootfile-selection",
    revision: "2",
    enabledByDefault: true,
    dependencies: ["publication.rootfile-base"],
    apply(context) {
      return {
        value: context.rootfiles[1] ?? null,
        diagnostics: [repairDiagnostic],
      };
    },
  };
  const legacyNavigation: NavigationModel = Object.freeze({
    source: "ncx",
    sourcePath: "EPUB/toc.ncx",
    toc: [
      {
        label: "Legacy chapter",
        href: spineItem.href,
        path: spineItem.path,
        children: [],
      },
    ],
    landmarks: [],
    pageList: [],
  });
  const navigationFallback: NavigationFallbackCompatibilityRule = {
    id: "publication.legacy-navigation",
    family: "publication",
    stage: "publication.navigation-fallback",
    revision: "1",
    enabledByDefault: true,
    apply(context, current) {
      return {
        value:
          current.toc.length === 0
            ? (context.legacyNavigation ?? current)
            : current,
      };
    },
  };
  const recoverContent: ContentDocumentCompatibilityRule = {
    id: "content.html-recovery",
    family: "content-document",
    stage: "content-document.processing",
    revision: "1",
    enabledByDefault: true,
    apply(context, state) {
      return {
        value: context.standardParseError
          ? { ...state, parseMode: "html-recovery" }
          : state,
      };
    },
  };
  const binaryRule: BinaryResourceCompatibilityRule = {
    id: "resource.binary-test",
    family: "resource",
    stage: "resource.binary",
    revision: "1",
    enabledByDefault: true,
    applies: () => true,
    apply(_context, bytes) {
      return { value: new Uint8Array([...bytes, 3]) };
    },
  };
  const stylesheetRule: StylesheetResourceCompatibilityRule = {
    id: "resource.stylesheet-test",
    family: "resource",
    stage: "resource.stylesheet",
    revision: "1",
    enabledByDefault: true,
    apply(_context, css) {
      return { value: css.replace("-epub-", "") };
    },
  };
  const inlineStyleRule: InlineStyleResourceCompatibilityRule = {
    id: "resource.inline-style-test",
    family: "resource",
    stage: "resource.inline-style",
    revision: "1",
    enabledByDefault: true,
    apply(_context, css) {
      return { value: `${css};writing-mode:vertical-rl` };
    },
  };
  const renditionPolicy: RenditionCompatibilityPolicy = {
    id: "rendition.single-image-fit",
    family: "rendition",
    stage: "rendition.policy",
    revision: "1",
    enabledByDefault: true,
    apply(context, directives) {
      return {
        value: {
          ...directives,
          fitSingleImagePage:
            context.contentHints?.page?.kind === "single-image-page",
        },
      };
    },
  };

  // Profiles resolve transitive same-stage dependencies and produce stable cache identities.
  const registry = new CompatibilityRegistry([
    rootPreferred,
    rootBase,
    navigationFallback,
    recoverContent,
    binaryRule,
    stylesheetRule,
    inlineStyleRule,
    renditionPolicy,
  ]);
  const profile = registry.createProfile();
  const sameProfile = registry.createProfile();
  assert(
    profile.modules[0]?.id === rootBase.id &&
      profile.modules[1]?.id === rootPreferred.id,
    "a dependency must precede its consumer even when registered later",
  );
  assert(
    profile.signature === sameProfile.signature &&
      profile.signature.startsWith("epub-compat/v1;"),
    "identical ordered modules must produce a deterministic profile signature",
  );
  assert(
    profile.publicationRules.length === 3 &&
      profile.contentDocumentRules.length === 1 &&
      profile.resourceRules.length === 3 &&
      profile.renditionPolicies.length === 1,
    "profile must expose each module through exactly one typed family",
  );
  assert(
    Object.isFrozen(rootPreferred) &&
      Object.isFrozen(rootPreferred.dependencies),
    "registered compatibility definitions must become immutable",
  );
  const withoutPreferred = registry.createProfile({
    disable: [rootPreferred.id],
  });
  assert(
    !withoutPreferred.has(rootPreferred.id) &&
      !withoutPreferred.has(rootBase.id),
    "disabling a default consumer must not enable its otherwise-disabled dependency",
  );
  assert(
    withoutPreferred.signature !== profile.signature,
    "enabling or disabling a module must isolate cache variants through the profile signature",
  );
  const rootOnlyProfile = new CompatibilityRegistry([
    rootBase,
    rootPreferred,
  ]).createProfile();
  const revisedProfile = new CompatibilityRegistry([
    { ...rootBase, revision: "2" },
    { ...rootPreferred, revision: "3" },
  ]).createProfile();
  assert(
    revisedProfile.signature !== rootOnlyProfile.signature,
    "a module revision change must alter the profile signature",
  );
  const canonicalA = new CompatibilityRegistry([
    renditionPolicy,
    recoverContent,
  ]).createProfile();
  const canonicalB = new CompatibilityRegistry([
    recoverContent,
    renditionPolicy,
  ]).createProfile();
  assert(
    canonicalA.signature === canonicalB.signature,
    "cross-stage registration order must not change the fixed workflow or cache signature",
  );
  assertThrows(
    () => registry.createProfile({ disable: [rootBase.id] }),
    DisabledCompatibilityDependencyError,
    "explicitly disabling a required dependency must reject the profile",
  );
  assertThrows(
    () =>
      registry.createProfile({ enable: [rootBase.id], disable: [rootBase.id] }),
    ConflictingCompatibilitySelectionError,
    "profile selections cannot enable and disable the same module",
  );
  assertThrows(
    () => registry.createProfile({ enable: ["missing.module"] }),
    UnknownCompatibilityModuleError,
    "unknown profile module ids must fail explicitly",
  );
  assertThrows(
    () => registry.register(rootBase),
    DuplicateCompatibilityModuleError,
    "module ids must be globally unique",
  );

  const crossStage: NavigationFallbackCompatibilityRule = {
    ...navigationFallback,
    id: "publication.invalid-cross-stage",
    dependencies: [rootBase.id],
  };
  assertThrows(
    () =>
      new CompatibilityRegistry([rootBase, crossStage]).createProfile({
        enable: [crossStage.id],
      }),
    CrossStageCompatibilityDependencyError,
    "dependencies must not cross fixed compatibility execution stages",
  );

  // Publication rules see normalized candidates, never a raw archive.
  const rootResult = await runRootfileSelectionCompatibility(
    profile.publicationRules,
    {
      containerPath: "META-INF/container.xml",
      rootfiles,
    },
    rootfiles[0] ?? null,
  );
  assert(
    rootResult.value === rootfiles[1] &&
      rootResult.diagnostics[0]?.code === repairDiagnostic.code,
    "rootfile rules must select from validated candidates and retain repair diagnostics",
  );
  const invalidRootRule: RootfileSelectionCompatibilityRule = {
    ...rootBase,
    id: "publication.invalid-rootfile",
    apply() {
      return { value: { fullPath: "unvalidated.opf", mediaType: "text/xml" } };
    },
  };
  const invalidRootResult = await runRootfileSelectionCompatibility(
    [invalidRootRule],
    {
      containerPath: "META-INF/container.xml",
      rootfiles,
    },
    rootfiles[0] ?? null,
  );
  assert(
    invalidRootResult.value === rootfiles[0] &&
      invalidRootResult.diagnostics[0]?.code === "COMPATIBILITY_MODULE_FAILED",
    "invalid rootfile output must be isolated without replacing the current safe value",
  );

  const navigationResult = await runNavigationFallbackCompatibility(
    profile.publicationRules,
    {
      publication,
      primaryNavigation: emptyNavigation,
      legacyNavigation,
      legacyLandmarks: [],
    },
    emptyNavigation,
  );
  assert(
    navigationResult.value.source === "ncx",
    "navigation rules must consume only pre-parsed normalized candidates",
  );

  // Content rules can choose controlled recovery state but cannot bypass later sanitization/materialization.
  const contentResult = await runContentDocumentCompatibility(
    profile.contentDocumentRules,
    {
      path: spineItem.path!,
      spineItem,
      mediaType: spineItem.mediaType,
      authoredSource: "<html><body>",
      standardParseError: new Error("not well formed"),
    },
    { source: "<html><body>", parseMode: "xml", hints: {} },
  );
  assert(
    contentResult.value.parseMode === "html-recovery" &&
      Object.isFrozen(contentResult.value),
    "content compatibility must return a validated immutable processing state",
  );

  // Resource stages remain separate and enforce fixed output bounds after every rule.
  const oversizedBinary: BinaryResourceCompatibilityRule = {
    ...binaryRule,
    id: "resource.oversized-test",
    apply() {
      return { value: new Uint8Array(10) };
    },
  };
  const mutatingFailure: BinaryResourceCompatibilityRule = {
    ...binaryRule,
    id: "resource.mutating-failure-test",
    apply(_context, bytes) {
      bytes[0] = 99;
      throw new Error("mutation must roll back");
    },
  };
  const initialBytes = new Uint8Array([1, 2]);
  const binaryResult = await runBinaryResourceCompatibility(
    [binaryRule, mutatingFailure, oversizedBinary],
    {
      publication,
      path: "EPUB/font.otf",
      mediaType: "font/otf",
      maxOutputBytes: 4,
    },
    initialBytes,
  );
  assert(
    [...binaryResult.value].join(",") === "1,2,3" &&
      binaryResult.diagnostics.length === 2,
    "mutating or oversized binary failures must preserve the previous safe transformation",
  );
  assert(
    binaryResult.matchedModuleIds.length === 3 &&
      binaryResult.appliedModuleIds.length === 1,
    "binary execution must distinguish matching rules from successfully applied transforms",
  );
  assert(
    [...initialBytes].join(",") === "1,2",
    "binary compatibility must never mutate the caller-owned resource bytes",
  );
  const stylesheetResult = await runStylesheetResourceCompatibility(
    profile.resourceRules,
    {
      publication,
      path: "EPUB/style.css",
      maxOutputCharacters: 100,
    },
    "-epub-writing-mode:vertical-rl",
  );
  assert(
    stylesheetResult.value === "writing-mode:vertical-rl",
    "stylesheet rules must run only in the stylesheet stage",
  );
  const inlineResult = await runInlineStyleResourceCompatibility(
    profile.resourceRules,
    {
      publication,
      documentPath: spineItem.path!,
      maxOutputCharacters: 100,
    },
    "color:red",
  );
  assert(
    inlineResult.value.includes("writing-mode:vertical-rl"),
    "inline style rules must run through their own bounded stage",
  );

  // Rendition policies emit only closed directives and isolate policy failures.
  const failingPolicy: RenditionCompatibilityPolicy = {
    ...renditionPolicy,
    id: "rendition.failure-test",
    apply() {
      throw new Error("policy failed");
    },
  };
  const renditionResult = runRenditionCompatibilityPolicies(
    [renditionPolicy, failingPolicy],
    {
      publication,
      spineItem,
      preferences: DEFAULT_READER_PREFERENCES,
      contentHints: {
        page: {
          kind: "single-image-page",
          pageLike: true,
          semanticTextLength: 0,
          replacedElementCount: 1,
        },
      },
    },
    { fitSingleImagePage: false },
  );
  assert(
    renditionResult.value.fitSingleImagePage &&
      renditionResult.diagnostics[0]?.code === "COMPATIBILITY_MODULE_FAILED",
    "failed rendition policies must not erase the last valid closed directive",
  );

  console.log("Compatibility modules unit test: PASS");
}

function assertThrows<TError extends Error>(
  operation: () => unknown,
  errorType: new (...args: never[]) => TError,
  message: string,
): void {
  let error: unknown;
  try {
    operation();
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof errorType, message);
}

void main().catch((error) => {
  console.error(error);
  throw error;
});
