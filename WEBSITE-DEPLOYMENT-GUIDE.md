# HD CONNECT Website Deployment Guide

## Scope

This guide deploys only the static website. It must not be used to upload the HD Manager application source, Firebase configuration, `.env` files, database dumps or the commerce backend to public hosting.

## 1. Build the release artifact

From `D:\quản lý bán hàng 1`:

```powershell
npm run build --prefix hdconnect-website
```

The command validates the website and creates `hdconnect-website-dist`. The artifact is ready for a static Apache/cPanel upload when it prints `WEBSITE_BUILD_PASS`.

## 2. Upload with cPanel File Manager

1. Sign in to the TH-2 hosting cPanel.
2. Open **File Manager** and enter the document root for `hdconnect.net`, usually `public_html`.
3. Back up the current website files if a previous public site exists.
4. Upload the contents of `hdconnect-website-dist` directly into the document root.
5. Enable **Show Hidden Files** and confirm `.htaccess` was uploaded.
6. Confirm these paths are directly under the document root: `index.html`, `assets`, `.htaccess`, `robots.txt`, `sitemap.xml`.
7. Do not upload the parent project folder, `hd-connect-platform`, `node_modules`, `.env`, Firebase files or database artifacts.

The current cPanel copy needs this refreshed upload because nested clean routes such as `/apps/hd-manager` require the HTML `<base href="/">` fix for root-relative asset resolution.

## 3. HTTPS and domain checks

1. In cPanel, issue or renew AutoSSL for `hdconnect.net` and `www.hdconnect.net` according to the hosting setup.
2. Confirm `https://hdconnect.net/` loads and HTTP redirects to HTTPS.
3. Confirm `https://hdconnect.net/robots.txt` and `https://hdconnect.net/sitemap.xml` return text/XML.
4. Confirm clean routes `/apps`, `/apps/hd-manager`, `/pricing`, `/support`, `/terms` and `/privacy` return the correct pages.
5. If clean routes return 404, confirm Apache `mod_rewrite` is enabled and `.htaccess` is allowed for the document root.

## 4. Release smoke test

- Open the home page on desktop, tablet and mobile widths.
- Open Apps, HD Manager detail, Pricing, Support, Contact, Account and each legal page.
- Confirm the mobile navigation opens and closes.
- Confirm checkout shows customer type, VAT, tax ID and referral fields.
- Confirm checkout and payment clearly show `MOCK_DISABLED`.
- Confirm no payment intent, bank QR or subscription activation is attempted while disabled.
- Confirm footer links for privacy, terms, payment, refund, deletion, email, hotline, Facebook and Zalo.
- Confirm browser console has no release-blocking errors.

## 5. Updating content

Edit the corresponding HTML or `assets` file in source, run the build again, then upload the new `hdconnect-website-dist` contents. Keep payment flags and API origins unchanged unless a separately approved backend release requires them.

## 6. Rollback

Keep the previous document-root backup until smoke testing is complete. To roll back, restore the previous static website files and verify the HTTPS, robots and sitemap URLs again. Do not roll back or modify HD Manager application data as part of a website rollback.
