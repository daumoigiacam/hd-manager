import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const sourceDir = path.join(rootDir, "hdconnect-website");
const outputDir = path.join(rootDir, "hdconnect-website-dist");

const requiredFiles = [
  "index.html",
  "apps.html",
  "app-detail.html",
  "bang-gia.html",
  "checkout.html",
  "payment.html",
  "success.html",
  "account.html",
  "payment-policy.html",
  "refund-policy.html",
  "robots.txt",
  "sitemap.xml",
  ".htaccess",
  "assets/css/styles.css",
  "assets/js/main.js",
  "assets/js/site-config.js",
  "assets/js/apps.js",
  "assets/js/app-detail.js",
  "assets/js/account.js",
  "assets/js/commerce.js",
  "assets/js/commerce-checkout.js",
  "assets/js/commerce-payment.js",
  "assets/js/commerce-success.js",
];

const cleanRoutes = new Set([
  "/",
  "/apps",
  "/apps/hd-manager",
  "/pricing",
  "/checkout",
  "/checkout/payment",
  "/checkout/success",
  "/account",
  "/account/orders",
  "/account/invoices",
  "/account/subscriptions",
  "/account/profile",
  "/terms",
  "/privacy",
  "/payment-policy",
  "/refund-policy",
  "/support",
]);

const deployExtensions = new Set([".html", ".css", ".js", ".json", ".txt", ".xml", ".htaccess"]);
const forbiddenPatterns = [
  { label: "localhost endpoint", pattern: /localhost(?::\d+)?/i },
  { label: "loopback endpoint", pattern: /127\.0\.0\.1|::1/i },
  { label: "development environment", pattern: /environment\s*[:=]\s*["']development["']/i },
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i },
  { label: "Google API key", pattern: /AIza[0-9A-Za-z_-]{20,}/ },
  { label: "secret assignment", pattern: /(?:client_secret|access_token|refresh_token)\s*[:=]/i },
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

async function assertRequiredFiles() {
  const missing = [];
  for (const relative of requiredFiles) {
    try {
      await readFile(path.join(sourceDir, relative));
    } catch {
      missing.push(relative);
    }
  }
  if (missing.length) throw new Error(`Missing required files: ${missing.join(", ")}`);
}

function stripReference(reference) {
  return reference.split("#", 1)[0].split("?", 1)[0];
}

function isIgnoredReference(reference) {
  return !reference || reference.startsWith("#") || /^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(reference);
}

async function assertLocalReferences(files) {
  const failures = [];
  const htmlFiles = files.filter((file) => path.extname(file).toLowerCase() === ".html");
  for (const file of htmlFiles) {
    const source = await readFile(file, "utf8");
    const references = [...source.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
    for (const reference of references) {
      if (isIgnoredReference(reference)) continue;
      const cleanReference = stripReference(reference);
      if (!cleanReference) continue;
      if (cleanReference.startsWith("/")) {
        if (cleanRoutes.has(cleanReference)) continue;
        const candidate = path.join(sourceDir, cleanReference.replace(/^\/+/, ""));
        try { await readFile(candidate); } catch { failures.push(`${path.relative(sourceDir, file)} -> ${reference}`); }
        continue;
      }
      const candidate = path.resolve(path.dirname(file), cleanReference);
      try { await readFile(candidate); } catch { failures.push(`${path.relative(sourceDir, file)} -> ${reference}`); }
    }
  }
  if (failures.length) throw new Error(`Broken local references:\n${failures.join("\n")}`);
}

async function assertCleanRouteBase(files) {
  const failures = [];
  for (const file of files.filter((candidate) => path.extname(candidate).toLowerCase() === ".html")) {
    const source = await readFile(file, "utf8");
    if (!source.includes('<base href="/">')) failures.push(path.relative(sourceDir, file));
  }
  if (failures.length) throw new Error(`HTML documents missing root base URL:\n${failures.join("\n")}`);
}

async function assertReleaseSafety(files) {
  const failures = [];
  for (const file of files) {
    if (!deployExtensions.has(path.extname(file).toLowerCase()) && path.basename(file) !== ".htaccess") continue;
    const source = await readFile(file, "utf8");
    for (const item of forbiddenPatterns) {
      if (item.pattern.test(source)) failures.push(`${item.label}: ${path.relative(sourceDir, file)}`);
    }
  }
  if (failures.length) throw new Error(`Release safety checks failed:\n${failures.join("\n")}`);
}

async function assertRewriteRoutes() {
  const rules = await readFile(path.join(sourceDir, ".htaccess"), "utf8");
  const requiredRules = [
    "RewriteRule ^apps/?$ apps.html [L]",
    "RewriteRule ^apps/([A-Za-z0-9-]+)/?$ app-detail.html?slug=$1 [QSA,L]",
    "RewriteRule ^pricing/?$ bang-gia.html [L]",
    "RewriteRule ^checkout/payment/?$ payment.html [L]",
    "RewriteRule ^checkout/success/?$ success.html [L]",
    "RewriteRule ^account/?$ account.html [L]",
    "RewriteRule ^terms/?$ dieu-khoan-su-dung.html [L]",
    "RewriteRule ^privacy/?$ chinh-sach-bao-mat.html [L]",
    "RewriteRule ^payment-policy/?$ payment-policy.html [L]",
    "RewriteRule ^refund-policy/?$ refund-policy.html [L]",
    "RewriteRule ^support/?$ ho-tro.html [L]",
  ];
  const missing = requiredRules.filter((rule) => !rules.includes(rule));
  if (missing.length) throw new Error(`Missing clean route rewrites: ${missing.join(", ")}`);
}

async function main() {
  await assertRequiredFiles();
  const files = await walk(sourceDir);
  await assertLocalReferences(files);
  await assertCleanRouteBase(files);
  await assertReleaseSafety(files);
  await assertRewriteRoutes();
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await cp(sourceDir, outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "BUILD-INFO.txt"), "HD CONNECT static website release\nPAYMENTS_ENABLED=false\nPAYMENT_MODE=MOCK_DISABLED\nGenerated by scripts/build-hdconnect-website.mjs\n", "utf8");
  console.log(`WEBSITE_BUILD_PASS ${path.relative(rootDir, outputDir)}`);
  console.log(`FILES_CHECKED ${files.length}`);
  console.log("PAYMENTS_ENABLED=false");
  console.log("PAYMENT_MODE=MOCK_DISABLED");
}

main().catch((error) => {
  console.error(`WEBSITE_BUILD_FAIL ${error.message}`);
  process.exitCode = 1;
});
