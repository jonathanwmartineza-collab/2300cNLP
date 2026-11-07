# Kitchen Table AI site

Plain static HTML/CSS/JS (no build step), deployed on Netlify from `main`.

- `index.html` – landing page
- `thank-you.html` – confirmation page, served at `/thank-you`
- `fonts/` – self-hosted Atkinson Hyperlegible Next + DM Serif Display, loaded via `fonts/fonts.css`
- `images/` – hero photo and teacher photo
- `netlify.toml` – publish settings, headers, `/thank-you` rewrite

The "one task" box on the thank-you page is a Netlify Form named `taster-task`; submissions show up under **Forms** in the Netlify dashboard.

Search the HTML for `TODO` to find placeholders still to fill in (checkout link, FAQ answers, taster date, calendar links, policy pages).

Local preview: `python3 -m http.server 8000`, then open http://localhost:8000 (use `/thank-you.html` locally; Netlify serves `/thank-you`).
