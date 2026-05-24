// npm install playwright googleapis

const fs   = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { google }   = require("googleapis");

// ─────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────
const CONFIG = {
  outputFile:       "karthik-mortgage-video.mp4",
  videoTimeoutMs:   900_000,   // 5 min
  loginTimeoutMs:   300_000,   // 2 min for manual login
  pollIntervalMs:   20_000,
  debugScreenshots: true,
};

const VIDEO_SCRIPT =
    "Create a professional vertical video (9:16 aspect ratio) under 30 seconds for Instagram Reels and YouTube Shorts. " +
  "Refinance your home loan today with Karthik Mortgage. " +
  "Enjoy lower EMI, better rates, and fast approval. " +
  "Whether you want to reduce your monthly payment " +
  "or pay off your loan faster, we have the right plan for you. " +
  "Don't wait." +
  "Contact us at sandeepsmr85@gmail.com. " +
  "Your dream home, made more affordable.";

// ─────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────
function log(msg, isError = false) {
  console.log(`${isError ? "[ERROR]" : "[INFO] "} ${msg}`);
}

async function shot(page, label) {
  if (!CONFIG.debugScreenshots) return;
  const f = `debug-${label}.png`;
  await page.screenshot({ path: f, fullPage: true });
  log(`Screenshot → ${f}`);
}

// ─────────────────────────────────────────
//  GOOGLE DRIVE UPLOAD
// ─────────────────────────────────────────
async function uploadToDrive(filePath) {
  const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes:  ["https://www.googleapis.com/auth/drive.file"],
  });
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.create({
    requestBody: { name: path.basename(filePath), mimeType: "video/mp4" },
    media:       { mimeType: "video/mp4", body: fs.createReadStream(filePath) },
    fields:      "id, webViewLink",
  });
  return { fileId: res.data.id, webViewLink: res.data.webViewLink };
}

// ─────────────────────────────────────────
//  SAVE VIDEO
// ─────────────────────────────────────────
async function saveVideo(page, src, outputPath) {
  if (src.startsWith("blob:")) {
    const b64 = await page.evaluate(async (u) => {
      const r = await fetch(u);
      const b = await r.arrayBuffer();
      let s = "";
      new Uint8Array(b).forEach(x => s += String.fromCharCode(x));
      return btoa(s);
    }, src);
    fs.writeFileSync(outputPath, Buffer.from(b64, "base64"));
    return;
  }
  const resp = await page.request.get(src);
  if (!resp.ok()) throw new Error(`Download failed: HTTP ${resp.status()}`);
  fs.writeFileSync(outputPath, await resp.body());
}

// ─────────────────────────────────────────
//  STEP 1 — Login
//  Fresh browser every run — always prompts for login
// ─────────────────────────────────────────
async function ensureLoggedIn(page) {
  log("Opening HeyGen…");
  await page.goto("https://app.heygen.com/home", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(3_000);
  await shot(page, "01-initial");
  log(`URL: ${page.url()}`);

  // Since we use a fresh (non-persistent) context, login is always required
  console.log("\n⚠  Please log in manually in the browser window.");
  console.log("   Waiting up to 2 minutes…\n");

  await page.waitForFunction(() => {
    return document.body.innerText.includes("Generate a video") ||
           document.body.innerText.includes("Build a video") ||
           document.body.innerText.includes("Avatar") ||
           document.body.innerText.includes("Translate");
  }, { timeout: CONFIG.loginTimeoutMs });

  log("Login detected — dashboard loaded.");
  await shot(page, "02-dashboard");
}

// ─────────────────────────────────────────
//  STEP 2 — Click "Generate a video from a prompt"
// ─────────────────────────────────────────
async function goToVideoFromPrompt(page) {
  log('Looking for "Generate a video from a prompt" card…');
  await shot(page, "03-home-page");

  const cardSelectors = [
    'text="Generate a video from a prompt"',
    ':has-text("Generate a video from a prompt")',
    'text="Generate a video"',
    ':has-text("Generate a video")',
    'text="Build a video scene by scene"',
    ':has-text("Build a video scene")',
  ];

  let clicked = false;
  for (const sel of cardSelectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 3_000 }).catch(() => false)) {
      log(`Clicking: ${sel}`);
      await el.click();
      clicked = true;
      await page.waitForTimeout(3_000);
      await shot(page, "04-after-card-click");
      break;
    }
  }

  if (!clicked) {
    log("Card not found — trying direct URL…");
    await page.goto("https://app.heygen.com/video-from-prompt", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(3_000);
    await shot(page, "04-prompt-page-direct");
  }

  log(`Now on: ${page.url()}`);
}

// ─────────────────────────────────────────
//  STEP 3 — Enter script & generate video
// ─────────────────────────────────────────
async function generateVideo(page) {
  await shot(page, "05-before-input");
  log("Looking for script/prompt input box…");

  const inputSelectors = [
    'textarea',
    '[contenteditable="true"]',
    'input[type="text"]',
    '[placeholder*="prompt" i]',
    '[placeholder*="script" i]',
    '[placeholder*="describe" i]',
    '[placeholder*="enter" i]',
    '[placeholder*="type" i]',
  ];

  let entered = false;
  for (const sel of inputSelectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 3_000 }).catch(() => false)) {
      log(`Found input: ${sel}`);
      await el.click();
      await el.fill(VIDEO_SCRIPT);
      entered = true;
      await page.waitForTimeout(1_000);
      await shot(page, "06-script-entered");
      break;
    }
  }

  if (!entered) {
    log("⚠  No input found — check debug-05-before-input.png", true);
    log("   Pausing 25 seconds — please type/paste the script manually in the browser.");
    await page.waitForTimeout(25_000);
  }

  log("Clicking Generate…");
  await shot(page, "07-before-generate");

  const generateSelectors = [
    'button:has-text("Generate")',
    'button:has-text("Generate video")',
    'button:has-text("Create")',
    'button:has-text("Submit")',
    'button:has-text("Continue")',
    'button:has-text("Next")',
    '[data-testid*="generate"]',
    '[data-testid*="submit"]',
  ];

  let generated = false;
  for (const sel of generateSelectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      log(`Clicking: ${sel}`);
      await btn.click();
      generated = true;
      await page.waitForTimeout(4_000);
      await shot(page, "08-after-generate");
      break;
    }
  }

  if (!generated) {
    log("⚠  No Generate button found — check debug-07-before-generate.png", true);
    log("   Pausing 25 seconds — please click Generate manually.");
    await page.waitForTimeout(25_000);
  }

  log("Generation started. Waiting for video to finish…");
}

// ─────────────────────────────────────────
//  STEP 4 — Poll for completed video
// ─────────────────────────────────────────
async function waitForVideo(page) {
  const start = Date.now();
  let pollNum = 0;

  while (Date.now() - start < CONFIG.videoTimeoutMs) {
    pollNum++;
    await shot(page, `09-poll-${pollNum}`);

    const videoEl = page.locator("video").first();
    if (await videoEl.isVisible().catch(() => false)) {
      const src = await videoEl.getAttribute("src");
      if (src) { log("Video element found!"); return { type: "element", src }; }
    }

    const dlBtn = page
      .locator('a[download], button:has-text("Download"), a:has-text("Download"), button:has-text("Export")')
      .first();
    if (await dlBtn.isVisible().catch(() => false)) {
      log("Download button found!");
      return { type: "button", btn: dlBtn };
    }

    const doneText = await page
      .locator('text="Complete", text="Done", text="100%", :has-text("ready")')
      .first()
      .isVisible({ timeout: 1_000 })
      .catch(() => false);
    if (doneText) {
      log("Completion text found — looking for download…");
      await page.waitForTimeout(2_000);
    }

    log(`Poll ${pollNum}: still waiting…`);
    await page.waitForTimeout(CONFIG.pollIntervalMs);
  }

  throw new Error("Timed out waiting for the generated video.");
}

// ─────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────
(async () => {
  let browser;
  let capturedVideoUrl = null;

  try {
    fs.readdirSync(".").filter(f => f.startsWith("debug-09-poll")).forEach(f => fs.unlinkSync(f));
  } catch (_) {}

  try {
    log("Launching browser (fresh session — no saved login)...");

    // Launch a standard (non-persistent) browser — no profile saved between runs
    browser = await chromium.launch({
      headless: false,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--start-maximized",
        "--disable-infobars",
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      acceptDownloads: true,
    });

    const page = await context.newPage();

    // Capture any MP4 URLs from network traffic
    page.on("response", async (response) => {
      const url = response.url();
      const ct  = response.headers()["content-type"] || "";
      if ((url.includes(".mp4") || ct.includes("video/mp4")) && response.status() === 200 && !capturedVideoUrl) {
        capturedVideoUrl = url;
        log(`MP4 captured from network: ${url}`);
      }
    });

    // Step 1 — Login (always required with fresh session)
    await ensureLoggedIn(page);

    // Step 2 — Navigate to "Generate video from prompt"
    await goToVideoFromPrompt(page);

    // Step 3 — Enter script and generate
    await generateVideo(page);

    // Step 4 — Wait for result
    let videoSrc = null;
    const result = await waitForVideo(page);

    if (result.type === "button") {
      const [download] = await Promise.all([
        context.waitForEvent("download"),
        result.btn.click(),
      ]);
      const tmp = await download.path();
      fs.copyFileSync(tmp, CONFIG.outputFile);
      log(`Saved via browser download → ${CONFIG.outputFile}`);

    } else if (result.type === "element") {
      videoSrc = result.src;
    } else if (capturedVideoUrl) {
      videoSrc = capturedVideoUrl;
    }

    if (videoSrc) {
      await saveVideo(page, videoSrc, CONFIG.outputFile);
      log(`Video saved → ${CONFIG.outputFile}`);
    }

    // Upload to Google Drive
    if (fs.existsSync(CONFIG.outputFile)) {
      log("Uploading to Google Drive…");
      const { fileId, webViewLink } = await uploadToDrive(CONFIG.outputFile);
      log(`Uploaded! File ID: ${fileId}`);
      log(`View link: ${webViewLink}`);
    }

    console.log("\n✅ Done! Workflow completed successfully.");

  } catch (err) {
    log(`Workflow failed: ${err.message}`, true);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();