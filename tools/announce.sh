#!/bin/sh
# Tell Bing, Yandex and the other IndexNow search engines that the page exists or has changed.
# Run once the site is live. The key file next to index.html proves the site is ours.
URL=https://checocadena.github.io/earth-jukebox/
curl -sS -X POST https://api.indexnow.org/indexnow -H 'Content-Type: application/json; charset=utf-8' \
  -d "{\"host\":\"checocadena.github.io\",\"key\":\"af7b0ee27cdbe3118297c123bc1d165c\",\"keyLocation\":\"${URL}af7b0ee27cdbe3118297c123bc1d165c.txt\",\"urlList\":[\"$URL\"]}" -w '\nHTTP %{http_code}\n'
# Google no longer takes sitemap pings. Add ${URL}sitemap.xml in Search Console (and Bing Webmaster Tools) by hand.
