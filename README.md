# Kitchen Table AI site

Plain static HTML/CSS (no build step), deployed on Netlify from `main`.

- `index.html` – the page
- `fonts/` – self-hosted Atkinson Hyperlegible Next + Fraunces (woff2)
- `netlify.toml` – publish settings and headers

The "one task" box is a Netlify Form named `taster-task`; submissions show up under **Forms** in the Netlify dashboard.

Local preview: `python3 -m http.server 8000`, then open http://localhost:8000.
