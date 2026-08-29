/**
 * Holds dashboard.recavo.app and book.recavo.app until production is built.
 *
 * These hostnames were pointed at the real app before anyone noticed that the
 * only database behind it was `recavo-staging`. Rather than leave a live-looking
 * site serving test data — or leave the names unclaimed for someone else to
 * resolve — they serve this, and nothing else, from the edge.
 *
 * Deploy with `npm run deploy:holding`. Delete this directory at launch.
 */

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>RECAVO</title>
    <style>
      :root { color-scheme: light dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 2rem;
        background: #fafaf9;
        color: #1c1917;
        font: 400 16px/1.6 ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      main { max-width: 26rem; text-align: center; }
      .mark {
        font-size: 0.8125rem;
        font-weight: 700;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: #7c3aed;
      }
      h1 {
        margin: 1.25rem 0 0.75rem;
        font-size: 1.75rem;
        line-height: 1.25;
        font-weight: 600;
        letter-spacing: -0.02em;
      }
      p { margin: 0; color: #57534e; }
      a { color: inherit; text-decoration-color: #a8a29e; text-underline-offset: 3px; }
      @media (prefers-color-scheme: dark) {
        body { background: #0c0a09; color: #fafaf9; }
        p { color: #a8a29e; }
        .mark { color: #a78bfa; }
      }
    </style>
  </head>
  <body>
    <main>
      <p class="mark">Recavo</p>
      <h1>Coming soon</h1>
      <p>
        Booking and scheduling for practitioners.
        Get in touch at <a href="mailto:hello@recavo.app">hello@recavo.app</a>.
      </p>
    </main>
  </body>
</html>
`;

export default {
  fetch() {
    return new Response(PAGE, {
      // 503 rather than 200: the address is real but has nothing behind it yet,
      // which keeps search engines from indexing a placeholder as the product.
      status: 503,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
        "x-robots-tag": "noindex",
      },
    });
  },
};
