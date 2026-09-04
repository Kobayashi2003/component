import { externalLinkDetails } from "../../react/overlays/external-link-model";
import { resolveExternalLinkTarget } from "../../core/interaction/navigation";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition)
    throw new Error(`External-link model test failed: ${message}`);
}

const websiteTarget = resolveExternalLinkTarget(
  "https://reader:secret@example.com/chapter?q=1#note",
);
assert(websiteTarget, "HTTPS should pass the engine external-link policy");
const website = externalLinkDetails(websiteTarget);
assert(website.kind === "website", "HTTPS should be presented as a website");
assert(
  website.destination === "https://example.com/chapter?q=1#note",
  "website display should retain the useful destination",
);
assert(
  !website.destination.includes("reader") &&
    !website.destination.includes("secret"),
  "website display must omit credentials",
);
assert(
  website.href === "https://reader:secret@example.com/chapter?q=1#note",
  "the actionable href should remain exact",
);

const emailTarget = resolveExternalLinkTarget(
  "mailto:reader%40example.com?subject=EPUB",
);
assert(emailTarget, "mailto should pass the engine external-link policy");
const email = externalLinkDetails(emailTarget);
assert(
  email.kind === "email" && email.destination === "reader@example.com",
  "mailto should show the decoded recipient",
);

const phoneTarget = resolveExternalLinkTarget("tel:%2B86-123456");
assert(phoneTarget, "tel should pass the engine external-link policy");
const phone = externalLinkDetails(phoneTarget);
assert(
  phone.kind === "phone" && phone.destination === "+86-123456",
  "tel should show the decoded phone destination",
);

assert(
  resolveExternalLinkTarget("javascript:alert(1)") === null,
  "script URLs must not produce an actionable target",
);
assert(
  resolveExternalLinkTarget("/chapter.xhtml") === null,
  "publication-relative links are not external actions",
);

console.log("External-link model unit test: PASS");
