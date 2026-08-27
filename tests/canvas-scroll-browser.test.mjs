import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { chromium } from "playwright-core";

const stylesheet = await readFile(
  new URL("../packages/canvas-panels/dist/styles.css", import.meta.url),
  "utf8",
);

async function wheelOver(page, selector, deltaX, deltaY) {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  assert.ok(box, `${selector} must be visible`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(deltaX, deltaY);
  await page.waitForTimeout(50);
}

async function assertGestureOwnership(browser, breakpoint, viewportWidth) {
  const page = await browser.newPage({
    viewport: { width: viewportWidth, height: 700 },
  });

  try {
    await page.setContent(`
      <!doctype html>
      <style>${stylesheet}</style>
      <style>
        html, body { margin: 0; }
        body { min-width: 1800px; }
        [data-canvas-workspace] {
          --canvas-panel-active-width: 500px;
          --canvas-panel-width: 500px;
        }
        [data-canvas-application] {
          height: 300px;
          min-height: 0;
          width: 600px;
        }
        [data-canvas-panel-body] { padding: 0; }
        .tall-content {
          height: 1000px;
          width: 900px;
        }
      </style>
      <main data-canvas-workspace data-canvas-breakpoint="${breakpoint}">
        <div data-canvas-application>
          <article data-canvas-panel data-active>
            <header data-canvas-panel-header>Accounts</header>
            <div data-canvas-panel-body>
              <div class="tall-content">Scrollable account list</div>
            </div>
          </article>
          <article data-canvas-panel${breakpoint === "mobile" ? " hidden inert" : ""}>
            <header data-canvas-panel-header>Account</header>
            <div data-canvas-panel-body>Account details</div>
          </article>
        </div>
      </main>
    `);

    const application = page.locator("[data-canvas-application]");
    const body = page.locator("[data-canvas-panel-body]").first();

    await wheelOver(page, "[data-canvas-panel-header]", 160, 0);
    const headerSwipe = await application.evaluate((element) =>
      Math.round(element.scrollLeft),
    );
    if (breakpoint === "mobile") {
      assert.equal(
        headerSwipe,
        0,
        "mobile: the one visible Panel leaves no Stack to pan",
      );
    } else {
      assert.ok(
        headerSwipe > 0,
        `${breakpoint}: a horizontal header swipe pans the Canvas`,
      );
    }

    await application.evaluate((element) => {
      element.scrollLeft = 0;
    });
    await wheelOver(page, "[data-canvas-panel-body]", 160, 0);
    const bodySwipe = await application.evaluate((element) =>
      Math.round(element.scrollLeft),
    );
    assert.equal(
      bodySwipe,
      headerSwipe,
      `${breakpoint}: the same horizontal gesture pans the Canvas equally over a Panel body`,
    );
    assert.equal(
      Math.round(await body.evaluate((element) => element.scrollLeft)),
      breakpoint === "mobile" ? 160 : 0,
      breakpoint === "mobile"
        ? "mobile: oversized Panel content keeps its existing horizontal body scroll"
        : `${breakpoint}: oversized Panel content cannot take the Stack's horizontal gesture`,
    );

    const headerTop = await page
      .locator("[data-canvas-panel-header]")
      .first()
      .evaluate((element) => element.getBoundingClientRect().top);
    await body.evaluate((element) => {
      element.scrollTop = 0;
    });
    await wheelOver(page, "[data-canvas-panel-body]", 0, 160);
    assert.equal(
      Math.round(await body.evaluate((element) => element.scrollTop)),
      160,
      `${breakpoint}: a vertical gesture scrolls the Panel body`,
    );
    assert.equal(
      await application.evaluate((element) => element.scrollTop),
      0,
      `${breakpoint}: a vertical gesture does not move the Canvas`,
    );
    assert.equal(
      await page
        .locator("[data-canvas-panel-header]")
        .first()
        .evaluate((element) => element.getBoundingClientRect().top),
      headerTop,
      `${breakpoint}: the Panel header stays fixed while its body scrolls`,
    );

    if (breakpoint === "mobile") {
      assert.equal(
        await page.evaluate(() => window.scrollX),
        0,
        "mobile: a horizontal gesture still cannot escape the one-Panel Canvas",
      );
      return;
    }

    await application.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await wheelOver(
      page,
      "[data-canvas-panel]:last-child [data-canvas-panel-header]",
      160,
      0,
    );
    assert.equal(
      await page.evaluate(() => window.scrollX),
      0,
      `${breakpoint}: the Canvas contains horizontal overscroll at the Stack boundary`,
    );
  } finally {
    await page.close();
  }
}

test("gesture direction chooses the Canvas or Panel body scroll surface", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  try {
    await assertGestureOwnership(browser, "desktop", 1400);
    await assertGestureOwnership(browser, "tablet", 900);
    await assertGestureOwnership(browser, "mobile", 600);
  } finally {
    await browser.close();
  }
});
