# Kitchen Table AI site

Plain static HTML/CSS/JS (no build step), deployed on Netlify from `main`.

- `index.html` – landing page
- `thank-you.html` – confirmation page, served at `/thank-you`
- `fonts/` – self-hosted Atkinson Hyperlegible Next + DM Serif Display, loaded via `fonts/fonts.css`
- `images/` – hero photo and teacher photo
- `netlify.toml` – publish settings, headers, `/thank-you` rewrite

## Taster signup flow

1. Every "Try the free taster" button opens the signup popup (`#taster` in `index.html`). It works without JavaScript too, and `/#taster` links straight to it.
2. First name + email are saved by the Netlify Form **`taster-signup`**, along with which button was clicked (`cta`: header / hero / final), any `utm_source` / `utm_medium` / `utm_campaign` from the ad link, and the referrer.
3. Only after a successful save does the visitor reach `/thank-you`, which greets them by name and shows their email.
4. The optional "one task" answer on the thank-you page is saved by the Netlify Form **`taster-task`**, tagged with the same name and email.

Both forms show up under **Forms** in the Netlify dashboard. Turn on email notifications there (Forms → Form notifications) so you hear about each signup. Netlify does **not** email the person who signed up; send the join link yourself or connect an email tool.

Search the HTML for `TODO` to find placeholders still to fill in (checkout link, FAQ answers, taster date, calendar links, policy pages).

Local preview: `python3 -m http.server 8000`, then open http://localhost:8000 (use `/thank-you.html` locally; Netlify serves `/thank-you`).
