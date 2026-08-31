const HEX_COMMIT = /^[0-9a-f]{40}$/u;

const COPY = Object.freeze({
  intro: Object.freeze({
    eyebrow: "PROOFERA / BSC TESTNET",
    headline: "Proof before permission.",
    label: "EVIDENCE AND CONTROL FOR AUTONOMOUS CAPITAL",
    sequence: "IDENTITY  /  EVIDENCE  /  AUTHORITY  /  OUTCOME"
  }),
  outro: Object.freeze({
    eyebrow: "THE PROOFERA STANDARD",
    headline: "Hire agents by proof, not promises.",
    label: "PROOFERA.TANGVU.DEV",
    sequence: "BUILT ON BNB SMART CHAIN TESTNET"
  })
});

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildDemoTitleCard({ kind, sourceCommit }) {
  if (!(kind in COPY) || !HEX_COMMIT.test(sourceCommit)) {
    throw new Error("DEMO_TITLE_CARD_INPUT_INVALID");
  }
  const copy = COPY[kind];
  const shortCommit = sourceCommit.slice(0, 8);
  const heading = escapeHtml(copy.headline);
  const [lead, tail] = heading.split(/ (?=[^ ]+$)/u);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #070a08; }
      body {
        color: #f6f5ee;
        font-family: Inter, "Segoe UI", Arial, sans-serif;
        display: grid;
        place-items: center;
      }
      .stage {
        position: relative;
        width: 100%;
        height: 100%;
        isolation: isolate;
        background:
          radial-gradient(circle at 76% 37%, rgba(120, 255, 183, .11), transparent 25%),
          radial-gradient(circle at 19% 73%, rgba(255, 218, 69, .10), transparent 29%),
          linear-gradient(135deg, #080b09 0%, #0b100d 52%, #070908 100%);
      }
      .stage::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: -2;
        background-image:
          linear-gradient(rgba(255,255,255,.034) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,.034) 1px, transparent 1px);
        background-size: 72px 72px;
        mask-image: linear-gradient(to bottom, black, transparent 88%);
        animation: grid-drift 9s linear both;
      }
      .stage::after {
        content: "";
        position: absolute;
        inset: -35%;
        z-index: -1;
        background: conic-gradient(from 180deg, transparent 0 36%, rgba(245,213,67,.06) 44%, transparent 51% 72%, rgba(99,230,161,.055) 81%, transparent 88%);
        animation: orbit 14s linear both;
      }
      .rail {
        position: absolute;
        inset: 32px 42px auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: rgba(246,245,238,.62);
        font: 600 12px/1.2 ui-monospace, "SFMono-Regular", Consolas, monospace;
        letter-spacing: .14em;
        opacity: 0;
        animation: reveal .8s 1.4s cubic-bezier(.2,.8,.2,1) forwards;
      }
      .brand { display: flex; align-items: center; gap: 12px; color: #fff; font: 750 17px/1 Inter, "Segoe UI", sans-serif; letter-spacing: -.02em; }
      .mark { width: 31px; height: 31px; display: grid; place-items: center; border: 1px solid rgba(245,213,67,.62); border-radius: 9px; color: #f5d543; font: 700 13px/1 ui-monospace, Consolas, monospace; box-shadow: inset 0 0 22px rgba(245,213,67,.08), 0 0 30px rgba(245,213,67,.07); }
      .main { position: absolute; left: 100px; right: 410px; top: 50%; transform: translateY(-48%); }
      .eyebrow { color: #f5d543; font: 700 13px/1.4 ui-monospace, Consolas, monospace; letter-spacing: .18em; opacity: 0; transform: translateY(18px); animation: rise .8s 1.53s cubic-bezier(.2,.8,.2,1) forwards; }
      h1 { max-width: 930px; margin: 24px 0 27px; font-size: clamp(68px, 7.4vw, 110px); line-height: .91; letter-spacing: -.072em; font-weight: 760; text-wrap: balance; opacity: 0; transform: translateY(30px); animation: rise 1s 1.67s cubic-bezier(.16,1,.3,1) forwards; }
      h1 span { color: #f5d543; text-shadow: 0 0 48px rgba(245,213,67,.13); }
      .label { color: rgba(246,245,238,.68); font-size: 17px; line-height: 1.5; letter-spacing: .08em; opacity: 0; transform: translateY(18px); animation: rise .8s 1.97s cubic-bezier(.2,.8,.2,1) forwards; }
      .signal { position: absolute; right: 112px; top: 50%; width: 248px; height: 248px; transform: translateY(-50%); opacity: .72; }
      .ring { position: absolute; inset: 0; border: 1px solid rgba(110,247,172,.19); border-radius: 50%; animation: pulse 3.2s ease-in-out infinite alternate; }
      .ring:nth-child(2) { inset: 41px; border-color: rgba(245,213,67,.27); animation-delay: -.8s; }
      .ring:nth-child(3) { inset: 83px; border-color: rgba(255,255,255,.17); animation-delay: -1.6s; }
      .core { position: absolute; inset: 103px; display: grid; place-items: center; border-radius: 14px; border: 1px solid rgba(245,213,67,.7); color: #f5d543; font: 700 15px/1 ui-monospace, Consolas, monospace; box-shadow: 0 0 44px rgba(245,213,67,.1); }
      .footer { position: absolute; left: 100px; right: 100px; bottom: 56px; display: flex; justify-content: space-between; color: rgba(246,245,238,.44); font: 600 11px/1.3 ui-monospace, Consolas, monospace; letter-spacing: .11em; opacity: 0; animation: reveal .8s 2.25s ease forwards; }
      .meter { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,.05); }
      .meter::after { content: ""; display: block; height: 100%; width: 0; background: linear-gradient(90deg, #f5d543, #6ef7ac); animation: progress 6.75s 1.25s linear forwards; }
      @keyframes rise { to { opacity: 1; transform: translateY(0); } }
      @keyframes reveal { to { opacity: 1; } }
      @keyframes grid-drift { to { transform: translate3d(36px, 18px, 0); } }
      @keyframes orbit { to { transform: rotate(22deg) scale(1.02); } }
      @keyframes pulse { from { transform: scale(.98); opacity: .48; } to { transform: scale(1.04); opacity: 1; } }
      @keyframes progress { to { width: 100%; } }
    </style>
  </head>
  <body>
    <main class="stage" data-proofera-title-card="${kind}">
      <header class="rail">
        <div class="brand"><span class="mark">P</span><span>ProofEra</span></div>
        <div>EXACT TESTNET BUILD&nbsp; ${shortCommit}</div>
      </header>
      <section class="main">
        <div class="eyebrow">${escapeHtml(copy.eyebrow)}</div>
        <h1>${lead} <span>${tail}</span></h1>
        <div class="label">${escapeHtml(copy.label)}</div>
      </section>
      <aside class="signal" aria-hidden="true">
        <div class="ring"></div><div class="ring"></div><div class="ring"></div><div class="core">P</div>
      </aside>
      <footer class="footer"><span>${escapeHtml(copy.sequence)}</span><span>CHAIN 97 / NO MAINNET</span></footer>
      <div class="meter" aria-hidden="true"></div>
    </main>
  </body>
</html>`;
}
