import fixtureUrl from "../../../fixtures/corpus/single-image-spread.epub?url";
import { BrowserEpubReader, configureReaderExtensions } from "../../../core";
import { assert } from "./harness";

/** Real renderer integration: pure CSS string tests cannot see dropped leaf policy. */
export async function verifyImageSpread(): Promise<string> {
  const response = await fetch(fixtureUrl);
  assert(response.ok, "image spread fixture must load");
  const bytes = await response.arrayBuffer();
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;inset:0;width:1200px;height:500px;z-index:9999";
  document.body.append(container);
  let reader: BrowserEpubReader | undefined;
  const images = () =>
    Array.from(container.querySelectorAll("iframe")).map((frame) => {
      const doc = frame.contentDocument!;
      const image = doc.querySelector("img")!;
      return {
        frame,
        doc,
        image,
        style: doc.defaultView!.getComputedStyle(image),
      };
    });
  const assertContained = (count: number) => {
    const leaves = images();
    assert(leaves.length === count, `expected ${count} image leaves`);
    for (const { frame, image, style } of leaves) {
      const box = image.getBoundingClientRect();
      assert(
        style.position === "fixed",
        "every pure leaf must receive single-image compatibility",
      );
      assert(
        box.width > 0 &&
          box.height > 0 &&
          box.top >= -1 &&
          box.left >= -1 &&
          box.bottom <= frame.clientHeight + 1 &&
          box.right <= frame.clientWidth + 1,
        "image must fit inside its actual leaf viewport",
      );
      assert(
        Math.abs(
          box.width / box.height - image.naturalWidth / image.naturalHeight,
        ) < 0.01,
        "image aspect ratio must survive spread composition",
      );
    }
  };
  try {
    reader = await BrowserEpubReader.open(bytes, container, {
      preferences: { spread: "double", flow: "paginated" },
    });
    assertContained(2);
    const href = reader.snapshot.locator?.href;
    await reader.setViewport({ width: 1400, height: 420 });
    assertContained(2);
    assert(
      reader.snapshot.locator?.href === href,
      "resize must preserve the semantic location",
    );
    await reader.setPreferences({ spread: "single" });
    assertContained(1);
    await reader.setPreferences({ spread: "double" });
    assertContained(2);
    await reader.setPreferences({ flow: "scrolled" });
    assert(
      images().length === 1 &&
        images().every(({ style }) => style.position !== "fixed"),
      "explicit scroll mode must retain ordinary document flow",
    );
    await reader.setPreferences({ flow: "paginated" });
    assertContained(2);
    await reader.goTo({ kind: "href", href: "EPUB/c.xhtml" });
    assert(
      images().every(({ style }) => style.position !== "fixed"),
      "captioned page must not inherit the preceding pure-image policy",
    );
    reader.dispose();
    reader = await BrowserEpubReader.open(bytes, container, {
      preferences: {
        spread: "double",
        compatibility: { fitSingleImagePages: false },
      },
    });
    assert(
      images().length === 2 &&
        images().every(({ style }) => style.position !== "fixed"),
      "disabled compatibility must remain disabled on both leaves",
    );
    reader.dispose();
    reader = await BrowserEpubReader.open(bytes, container, {
      preferences: { spread: "double" },
      extensions: configureReaderExtensions({
        compatibilityModules: [
          {
            id: "test.image-leaf-policy",
            family: "rendition",
            stage: "rendition.policy",
            revision: "1",
            enabledByDefault: true,
            dependencies: ["epub.rendition.single-image-fit"],
            apply(context, directives) {
              return {
                value: {
                  ...directives,
                  fitSingleImagePage:
                    context.spineItem.index === 0 &&
                    directives.fitSingleImagePage,
                },
              };
            },
          },
        ],
      }),
    });
    const leaves = images();
    assert(
      leaves.length === 2 &&
        leaves.filter(({ style }) => style.position === "fixed").length === 1,
      "each leaf must evaluate the session profile with its own spine item",
    );
    assert(
      leaves.find(({ frame }) => frame.title.endsWith("b.xhtml"))?.style
        .position !== "fixed",
      "the adjacent leaf must not inherit the root's compatibility directives",
    );
    return "pure image spread fits both leaves across resize/single/double; captions, scroll mode, disabled and per-leaf compatibility retain their semantics";
  } finally {
    reader?.dispose();
    container.remove();
  }
}
