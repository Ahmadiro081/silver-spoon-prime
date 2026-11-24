import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SRC_ROOT = path.resolve(process.cwd(), "src");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = path.join(SRC_ROOT, specifier.slice(2));
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
        if (existsSync(candidate)) {
          return nextResolve(pathToFileURL(candidate).href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const accessibility = await import("@/utils/accessibility");
const pageTitle = await import("@/utils/pageTitle");

function collectTsxFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...collectTsxFiles(full));
    } else if (entry.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

describe("Phase 3 — Focus-Trap Utility", () => {
  it("wraps Tab forward from last focusable element to index 0", () => {
    assert.equal(
      accessibility.computeFocusTrapTargetIndex({ count: 3, activeIndex: 2, shiftKey: false }),
      0,
    );
  });

  it("wraps Shift+Tab backward from first focusable element to last index", () => {
    assert.equal(
      accessibility.computeFocusTrapTargetIndex({ count: 3, activeIndex: 0, shiftKey: true }),
      2,
    );
  });

  it("recovers focus into dialog when activeElement is outside (-1)", () => {
    assert.equal(
      accessibility.computeFocusTrapTargetIndex({ count: 4, activeIndex: -1, shiftKey: false }),
      0,
    );
    assert.equal(
      accessibility.computeFocusTrapTargetIndex({ count: 4, activeIndex: -1, shiftKey: true }),
      3,
    );
  });

  it("returns null for normal middle tab progression or empty focusable lists", () => {
    assert.equal(
      accessibility.computeFocusTrapTargetIndex({ count: 4, activeIndex: 1, shiftKey: false }),
      null,
    );
    assert.equal(
      accessibility.computeFocusTrapTargetIndex({ count: 4, activeIndex: 2, shiftKey: true }),
      null,
    );
    assert.equal(
      accessibility.computeFocusTrapTargetIndex({ count: 0, activeIndex: -1, shiftKey: false }),
      null,
    );
  });

  it("keeps single-element dialogs trapped on index 0 in both directions", () => {
    assert.equal(
      accessibility.computeFocusTrapTargetIndex({ count: 1, activeIndex: 0, shiftKey: false }),
      0,
    );
    assert.equal(
      accessibility.computeFocusTrapTargetIndex({ count: 1, activeIndex: 0, shiftKey: true }),
      0,
    );
  });

  it("exposes standard interactive selectors in FOCUSABLE_SELECTOR", () => {
    for (const token of ["a[href]", "button", "input", "select", "textarea", "[tabindex]"]) {
      assert.ok(
        accessibility.FOCUSABLE_SELECTOR.includes(token),
        `Expected FOCUSABLE_SELECTOR to include ${token}`,
      );
    }
  });
});

describe("Phase 3 — Route Document Title Resolution", () => {
  it("resolves distinct, descriptive titles for public, auth, investor, and admin routes", () => {
    assert.match(pageTitle.resolvePageTitle("/"), /SILVER SPOON/);
    assert.match(pageTitle.resolvePageTitle("/plans"), /Investment Plans/);
    assert.match(pageTitle.resolvePageTitle("/plans/"), /Investment Plans/);
    assert.match(pageTitle.resolvePageTitle("/how-it-works"), /How It Works/);
    assert.match(pageTitle.resolvePageTitle("/login"), /Sign In/);
    assert.match(pageTitle.resolvePageTitle("/reset-password"), /Reset Password/);
    assert.match(pageTitle.resolvePageTitle("/dashboard"), /Portfolio Overview/);
    assert.match(pageTitle.resolvePageTitle("/dashboard/wallet"), /Wallet/);
    assert.match(pageTitle.resolvePageTitle("/dashboard/profile"), /Profile|KYC/);
    assert.match(pageTitle.resolvePageTitle("/admin"), /Platform Overview.*Admin Console/);
    assert.match(pageTitle.resolvePageTitle("/admin/users"), /User Management/);
    assert.match(pageTitle.resolvePageTitle("/admin/settings"), /Platform Settings/);
    assert.match(pageTitle.resolvePageTitle("/non-existent-route"), /Page Not Found/);
  });
});

describe("Phase 3 — Accessibility & UI Structural Audits", () => {
  it("all 4 application layouts provide skip links, main-content landmarks, and aria-current", () => {
    const layouts = [
      "layouts/PublicLayout.tsx",
      "layouts/AuthLayout.tsx",
      "layouts/UserDashboardLayout.tsx",
      "layouts/AdminDashboardLayout.tsx",
    ];
    for (const rel of layouts) {
      const content = readFileSync(path.join(SRC_ROOT, rel), "utf8");
      assert.ok(content.includes("skip-link"), `${rel} missing .skip-link`);
      assert.ok(content.includes('id="main-content"'), `${rel} missing #main-content landmark`);
      assert.ok(content.includes("<main"), `${rel} missing <main> landmark`);
      if (rel !== "layouts/AuthLayout.tsx") {
        assert.ok(content.includes("aria-current"), `${rel} missing aria-current on active navigation`);
      }
    }
  });

  it("modals and mobile drawers enforce dialog semantics and keyboard focus trapping", () => {
    const dialogFiles = [
      "components/common/Modal.tsx",
      "layouts/UserDashboardLayout.tsx",
      "layouts/AdminDashboardLayout.tsx",
    ];
    for (const rel of dialogFiles) {
      const content = readFileSync(path.join(SRC_ROOT, rel), "utf8");
      assert.ok(content.includes('role="dialog"'), `${rel} missing role="dialog"`);
      assert.ok(content.includes('aria-modal="true"'), `${rel} missing aria-modal="true"`);
      assert.ok(content.includes("handleFocusTrapKeyDown"), `${rel} missing focus trap key handler`);
    }
  });

  it("global CSS and App root support prefers-reduced-motion and visible keyboard focus", () => {
    const css = readFileSync(path.join(SRC_ROOT, "styles.css"), "utf8");
    const appTsx = readFileSync(path.join(SRC_ROOT, "App.tsx"), "utf8");
    assert.ok(css.includes("prefers-reduced-motion"), "styles.css missing prefers-reduced-motion rule");
    assert.ok(css.includes(":focus-visible"), "styles.css missing :focus-visible styling");
    assert.ok(appTsx.includes("MotionConfig"), "App.tsx missing MotionConfig");
    assert.ok(appTsx.includes('reducedMotion="user"'), "App.tsx missing reducedMotion=\"user\"");
  });

  it("every <label> across src/pages is explicitly associated via htmlFor or wraps a native control", () => {
    const pageFiles = collectTsxFiles(path.join(SRC_ROOT, "pages"));
    const unassociated = [];

    for (const file of pageFiles) {
      const content = readFileSync(file, "utf8");
      const labelRegex = /<label\b([^>]*)>([\s\S]*?)<\/label>/g;
      let match;
      while ((match = labelRegex.exec(content)) !== null) {
        const attrs = match[1];
        const body = match[2];
        const hasHtmlFor = /\bhtmlFor\s*=/.test(attrs);
        const wrapsControl = /<(input|select|textarea)\b/.test(body);
        if (!hasHtmlFor && !wrapsControl) {
          unassociated.push(`${path.relative(SRC_ROOT, file)}: <label${attrs.slice(0, 60)}>`);
        }
      }
    }

    assert.deepEqual(
      unassociated,
      [],
      `Found unassociated <label> elements:\n${unassociated.join("\n")}`,
    );
  });

  it("no page file contains duplicate static htmlFor attributes", () => {
    const pageFiles = collectTsxFiles(path.join(SRC_ROOT, "pages"));
    const duplicates = [];

    for (const file of pageFiles) {
      const content = readFileSync(file, "utf8");
      const seen = new Set();
      const htmlForRegex = /\bhtmlFor="([^"]+)"/g;
      let match;
      while ((match = htmlForRegex.exec(content)) !== null) {
        const val = match[1];
        if (seen.has(val)) {
          duplicates.push(`${path.relative(SRC_ROOT, file)} -> htmlFor="${val}"`);
        }
        seen.add(val);
      }
    }

    assert.deepEqual(
      duplicates,
      [],
      `Found duplicate static htmlFor values:\n${duplicates.join("\n")}`,
    );
  });

  it("every role=\"switch\" button has aria-checked and an accessible name", () => {
    const allTsx = collectTsxFiles(SRC_ROOT);
    const violations = [];

    for (const file of allTsx) {
      const content = readFileSync(file, "utf8");
      const buttonRegex = /<button\b([^>]*)>/g;
      let match;
      while ((match = buttonRegex.exec(content)) !== null) {
        const attrs = match[1];
        if (/role="switch"/.test(attrs)) {
          const hasChecked = /\baria-checked\s*=/.test(attrs);
          const hasName = /\b(aria-label|aria-labelledby)\s*=/.test(attrs);
          if (!hasChecked || !hasName) {
            violations.push(path.relative(SRC_ROOT, file));
          }
        }
      }
    }

    assert.deepEqual(violations, [], `Switch buttons missing ARIA attributes: ${violations.join(", ")}`);
  });

  it("every table header <th> across src/ defines an explicit scope attribute", () => {
    const allTsx = collectTsxFiles(SRC_ROOT);
    const missingScope = [];

    for (const file of allTsx) {
      const content = readFileSync(file, "utf8");
      const thRegex = /<th\b([^>]*)>/g;
      let match;
      while ((match = thRegex.exec(content)) !== null) {
        const attrs = match[1];
        if (!/\bscope="(col|row|colgroup|rowgroup)"/.test(attrs)) {
          missingScope.push(`${path.relative(SRC_ROOT, file)}: <th${attrs}>`);
        }
      }
    }

    assert.deepEqual(
      missingScope,
      [],
      `Found <th> elements missing scope attribute:\n${missingScope.join("\n")}`,
    );
  });

  it("sensitive and destructive actions are guarded by ConfirmDialog", () => {
    const guardedPages = [
      "pages/dashboard/SettingsPage.tsx",
      "pages/admin/AdminSettingsPage.tsx",
      "pages/admin/AdminUsersPage.tsx",
      "pages/admin/AdminPlansPage.tsx",
      "pages/admin/AdminReferralsPage.tsx",
    ];
    for (const rel of guardedPages) {
      const content = readFileSync(path.join(SRC_ROOT, rel), "utf8");
      assert.ok(content.includes("<ConfirmDialog"), `${rel} missing ConfirmDialog safeguard`);
    }
  });
});
