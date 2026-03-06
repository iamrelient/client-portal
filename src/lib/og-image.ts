/**
 * Extract Open Graph image from a URL for thumbnail previews.
 * Falls back to Google's high-res favicon service.
 */
export async function extractOgImage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; OGBot/1.0; +https://portal.rayrenders.com)",
        Accept: "text/html",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!res.ok) return getFaviconFallback(url);

    // Only read first 50KB to avoid downloading huge pages
    const reader = res.body?.getReader();
    if (!reader) return getFaviconFallback(url);

    let html = "";
    const decoder = new TextDecoder();
    const maxBytes = 50 * 1024;
    let bytesRead = 0;

    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.length;
      html += decoder.decode(value, { stream: true });

      // Stop early if we've passed the </head> tag
      if (html.includes("</head>")) break;
    }

    reader.cancel().catch(() => {});

    // Try og:image
    const ogMatch = html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    );
    if (!ogMatch) {
      // Try reversed attribute order: content before property
      const ogMatch2 = html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
      );
      if (ogMatch2) return resolveUrl(ogMatch2[1], url);
    } else {
      return resolveUrl(ogMatch[1], url);
    }

    // Try twitter:image
    const twMatch = html.match(
      /<meta[^>]+(?:name|property)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
    );
    if (!twMatch) {
      const twMatch2 = html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:image["']/i
      );
      if (twMatch2) return resolveUrl(twMatch2[1], url);
    } else {
      return resolveUrl(twMatch[1], url);
    }

    // No OG/Twitter image found — use favicon fallback
    return getFaviconFallback(url);
  } catch {
    return getFaviconFallback(url);
  }
}

function resolveUrl(imageUrl: string, baseUrl: string): string {
  try {
    // Already absolute
    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      return imageUrl;
    }
    // Protocol-relative
    if (imageUrl.startsWith("//")) {
      return "https:" + imageUrl;
    }
    // Relative — resolve against base
    return new URL(imageUrl, baseUrl).href;
  } catch {
    return imageUrl;
  }
}

function getFaviconFallback(url: string): string | null {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  } catch {
    return null;
  }
}
