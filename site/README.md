# Lexora — static site

Standalone, design-forward marketing-and-app site for Lexora. Built with vanilla HTML / CSS / JS so it can be opened directly in a browser or served by any static host (Netlify, Vercel, GitHub Pages, S3+CloudFront, nginx).

## Run locally

```sh
cd site
python3 -m http.server 5500
# then open http://localhost:5500
```

`open index.html` works too, but a few features (the manifest fetch, anonymous fonts) are slightly happier behind `http://`.

## Pages

| Page                    | Auth     | What it does                                                |
| ----------------------- | -------- | ----------------------------------------------------------- |
| `index.html`            | public   | Landing — hero, marquee, features, CEFR map, bento, CTA     |
| `register.html`         | public   | Account creation (mock, localStorage)                       |
| `login.html`            | public   | Log in                                                       |
| `forgot-password.html`  | public   | Reset flow — sends a (demo) link, then sets a new password  |
| `topics.html`           | public   | A1–C2 lexical / grammar / philology topic browser, EN & FR  |
| `dashboard.html`        | required | Stats, deck counts, jump-off links                          |
| `upload.html`           | required | Drag-and-drop a `.txt` / `.csv` dictionary                  |
| `flashcards.html`       | required | Tap-to-flip card study, weighted by past performance        |

## Design

- Palette: parchment cream (`#EEEFE2`), aubergine ink (`#1F3A2C`), chartreuse (`#C8E26A`), terracotta (`#A07859`), deep teal (`#264E45`)
- Type: Fraunces (display serif) · Space Grotesk (sans) · JetBrains Mono (mono)
- Custom cursor follower (dot + ring, mix-blend `difference`) — falls back to native cursor on touch
- Magnetic buttons (`data-magnetic="0.3"`)
- Scroll reveals (`.reveal`)
- Paper-grain SVG overlay (`body::before`)
- Accent shapes: stamps, blobs, marquee strips, asymmetric bento

## Auth

The site ships with a mock localStorage-based auth so the upload + study flow is fully demoable without a backend. To plug a real backend in, swap the four functions in `js/auth.js` (register / login / forgot / reset) and the `Lexora.getUser` / `Lexora.setUser` helpers in `js/core.js`.

The existing FastAPI backend in `../backend` is left untouched.

## File format

One card per line. Recognised separators: ` - `, ` – `, ` — `, `:`, `=`, tab, ` / `. Comments start with `#`. Empty lines are skipped.

```
maison - house
crépuscule - twilight
flâner: to wander, to stroll
amie = friend (f.)
```

## SEO

- Per-page `<title>` & `<meta description>` tuned with primary keywords
- `noindex,follow` on the auth + study screens
- Open Graph + Twitter card meta
- JSON-LD (`EducationalOrganization` on landing, `ItemList` on topics)
- `sitemap.xml`, `robots.txt`, `manifest.webmanifest`
- Canonical URLs, semantic HTML, descriptive `aria-label`s
- 404 page that links back into the funnel

## File map

```
site/
├── index.html · login.html · register.html · forgot-password.html
├── dashboard.html · upload.html · topics.html · flashcards.html
├── 404.html
├── manifest.webmanifest · robots.txt · sitemap.xml
├── assets/
│   ├── logo.svg · favicon.svg · og-image.svg
├── css/
│   └── styles.css
├── data/
│   └── topics.js   (A1–C2 catalogue, EN & FR)
└── js/
    ├── core.js     (cursor, magnetic, reveal, marquee, mock-auth helpers)
    ├── auth.js     (register, login, forgot, reset)
    └── app.js      (deck storage, upload parser, topic filter, flashcard session, dashboard stats)
```
