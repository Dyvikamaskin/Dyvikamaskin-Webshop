"""
Recon LS Engineers (lsengineers.co.uk) — a UK retailer selling Wacker Neuson
parts, including telehandlers (TH627). Telehandlers are in our 96-machine
big-equipment blind spot, so this could be a critical fill.

Goals:
  1. Detect platform (Shopify / WooCommerce / Magento / custom)
  2. Find catalog size hints (sitemap, brand collection, total products)
  3. Extract sample fitment data from product page
  4. Capture SKU shape (1xxx Weidemann/Kramer vs 5xxx WN constr)
"""
import re
import ssl
import sys
import urllib.request
import urllib.error
import json

import certifi

sys.stdout.reconfigure(encoding="utf-8")
CTX = ssl.create_default_context(cafile=certifi.where())
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "Chrome/126.0 Safari/537.36")


def fetch(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "text/html,*/*",
    })
    try:
        with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
            return r.status, r.read().decode("utf-8", errors="replace"), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, "", {}


URLS = [
    "https://www.lsengineers.co.uk/wacker-th627-418-22-telehandler-parts.html",
    "https://www.lsengineers.co.uk/cover-plate-genuine-wacker-part-oem-no-1000335943.html",
    "https://www.lsengineers.co.uk/sitemap.xml",
    "https://www.lsengineers.co.uk/",
]

for url in URLS:
    print(f"\n=== {url}")
    code, html, headers = fetch(url)
    print(f"  Status: {code}  size: {len(html):,}")
    if code != 200: continue

    # Platform detection
    platform = "unknown"
    for sig, name in [
        ("Shopify", "Shopify"),
        ("woocommerce", "WooCommerce"),
        ("Magento", "Magento (custom)"),
        ("var BCData", "BigCommerce"),
        ("cart.js", "Shopify or generic"),
        ("klevu", "Klevu search"),
        ("convertcart", "ConvertCart"),
    ]:
        if sig in html or sig.lower() in html.lower():
            platform = name; break
    print(f"  Platform signature: {platform}")

    # SKU mentions
    skus = set(re.findall(r"\b[15]\d{9}\b|\b0\d{6}\b", html))
    print(f"  SKU-shaped numbers on page: {len(skus)}  sample: {sorted(skus)[:6]}")

    # Fitment-related anchors
    anchors_found = []
    for a in ["Fits Models", "Fits Model", "Fitment", "Compatibility", "Compatible With",
              "TH627", "WP1550", "DPU", "Telehandler"]:
        if a.lower() in html.lower(): anchors_found.append(a)
    print(f"  Fitment/model anchors: {anchors_found}")

    # JSON-LD presence
    jsonld = re.findall(r'<script[^>]*application/ld\+json[^>]*>([\s\S]*?)</script>', html, re.I)
    print(f"  JSON-LD blocks: {len(jsonld)}")
    if jsonld:
        for block in jsonld[:2]:
            try:
                d = json.loads(block.strip())
                kind = d.get("@type", "?") if isinstance(d, dict) else "list"
                print(f"    type={kind}")
            except Exception: pass

    # Sample model row pattern (lines containing "TH627")
    if "TH627" in html:
        for line in html.split("\n"):
            if "TH627" in line:
                cleaned = re.sub(r"<[^>]+>", " ", line)
                cleaned = re.sub(r"\s+", " ", cleaned).strip()
                if cleaned and len(cleaned) < 250:
                    print(f"  TH627 line: {cleaned!r}")
                    break

    # Specific extraction for the part page: look for "Fits Models" block
    if "Fits Model" in html or "Fits Models" in html:
        # find a region around it
        idx = html.lower().find("fits model")
        region = html[max(0, idx - 100): idx + 1500]
        cleaned = re.sub(r"<[^>]+>", " | ", region)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        print(f"  Around 'Fits Models':")
        print(f"    {cleaned[:600]}")
