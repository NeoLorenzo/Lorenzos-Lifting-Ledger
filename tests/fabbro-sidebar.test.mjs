import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Heracles adopts Fabbro Design System 0.2.0 and Application Sidebar 1.0.0", () => {
  assert.equal(read("fabbro-design/VERSION").trim(), "0.2.0");
  assert.equal(read("fabbro-design/components/application-sidebar/VERSION").trim(), "1.0.0");

  const product = JSON.parse(read("fabbro-design/product.json"));
  assert.deepEqual(
    {
      version: product.version,
      product: product.product,
      symbol: product.symbol,
      coreIdea: product.coreIdea,
      accent: product.accent,
    },
    {
      version: "0.2.0",
      product: "Heracles",
      symbol: "Pillar",
      coreIdea: "Strength",
      accent: "#FF383C",
    },
  );

  const contract = JSON.parse(read("fabbro-design/components/application-sidebar/contract.json"));
  assert.equal(contract.version, "1.0.0");
  assert.equal(contract.desktop.defaultState, "expanded");
  assert.equal(contract.desktop.expandedWidth, "15.5rem");
  assert.equal(contract.desktop.collapsedWidth, "4.5rem");
  assert.equal(contract.desktop.collapseMode, "icon");
  assert.equal(contract.mobile.breakpoint, "900px");
  assert.equal(contract.mobile.behavior, "offcanvas-drawer");
});

test("authenticated Heracles shell implements the canonical sidebar contract", () => {
  const index = read("index.html");
  const styles = read("styles.css");
  const app = read("app.js");

  assert.match(index, /data-fabbro-product="heracles"/);
  assert.match(index, /fabbro-design\/fabbro-tokens\.css/);
  assert.match(index, /id="signed-in" class="app-view" data-sidebar-state="expanded"/);
  assert.match(index, /aria-label="Heracles primary navigation"/);
  assert.match(index, /brand\/heracles-lockup\.svg/);
  assert.match(index, /brand\/heracles-mark\.svg/);
  assert.match(index, /brand\/fabbro-mark\.svg/);
  assert.match(index, /id="sidebar-rail"/);
  assert.match(index, /id="sign-out" class="utility-sign-out"/);

  assert.match(styles, /var\(--fs-app-sidebar-width\)/);
  assert.match(styles, /var\(--fs-app-sidebar-collapsed-width\)/);
  assert.match(styles, /var\(--fs-app-nav-active-indicator-width\)/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /data-mobile-open="true"/);

  assert.match(app, /fabbro:application-sidebar-expanded/);
  assert.match(app, /function setSidebarExpanded/);
  assert.match(app, /function syncSidebarForViewport/);
  assert.match(app, /appMenu\.dataset\.mobileOpen/);
});

test("deployed Heracles application assets match the adopted Fabbro snapshot", () => {
  assert.equal(read("brand/heracles-mark.svg"), read("fabbro-design/assets/Heracles Logo.svg"));
  assert.equal(
    read("brand/heracles-lockup.svg"),
    read("fabbro-design/assets/Heracles Logo Colored With Text Beside.svg"),
  );
  assert.equal(read("brand/fabbro-mark.svg"), read("fabbro-design/assets/Fabbro Systems Logo.svg"));
});
