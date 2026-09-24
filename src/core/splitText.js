// Split-text minimale (SplitText in GSAP 3.12 è un plugin Club, non su npm pubblico).
// Il testo originale resta leggibile dagli screen reader con una copia .sr-only;
// i pezzi animati sono aria-hidden.

/** Sostituisce il contenuto con una span per parola (dal sorgente originale). */
function wrapWords(el) {
  el.innerHTML = el.dataset.splitSource;
  // ogni parola ricorda se era preceduta da uno spazio: "l'<em>ambra</em>," resta attaccato
  const words = [];
  let space = false;
  const walk = (node, wrapTag) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (!part.trim()) {
            space = true;
            return;
          }
          words.push({ text: part, tag: wrapTag, space: space && words.length > 0 });
          space = false;
        });
      } else if (child.tagName === 'BR') {
        words.push({ br: true });
        space = false;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child, child.tagName.toLowerCase());
      }
    });
  };
  walk(el, null);

  // i pezzi senza spazio in mezzo (l’ + <em>ambra</em> + ,) formano una sola parola:
  // due span affiancate permetterebbero al browser di andare a capo tra "l’" e "ambra"
  const groups = [];
  for (const w of words) {
    if (w.br) groups.push({ br: true });
    else if (!w.space && groups.length && !groups.at(-1).br) groups.at(-1).parts.push(w);
    else groups.push({ space: w.space, parts: [w] });
  }

  el.innerHTML = groups
    .map((g) => {
      if (g.br) return '<br>';
      const inner = g.parts.map((w) => (w.tag ? `<${w.tag}>${w.text}</${w.tag}>` : w.text)).join('');
      return `${g.space ? ' ' : ''}<span class="split-word"${g.space ? ' data-space' : ''}>${inner}</span>`;
    })
    .join('');
}

function prepare(el) {
  if (!el.dataset.splitSource) {
    el.dataset.splitSource = el.innerHTML;
    el.dataset.splitText = el.textContent.trim().replace(/\s+/g, ' ');
  }
}

function appendSrText(el) {
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = el.dataset.splitText;
  el.append(sr);
}

/** Lettere dentro una maschera: <span.mask><span.char>L</span></span> */
export function splitChars(el) {
  prepare(el);
  const text = el.textContent.trim();
  el.innerHTML = [...text]
    .map((c) => `<span class="split-mask" aria-hidden="true"><span class="split-char">${c}</span></span>`)
    .join('');
  appendSrText(el);
  return [...el.querySelectorAll('.split-char')];
}

/** Parole: <span.split-word>, conservando i tag inline (es. <em>). */
export function splitWords(el) {
  prepare(el);
  wrapWords(el);
  const spans = [...el.querySelectorAll('.split-word')];
  spans.forEach((s) => s.setAttribute('aria-hidden', 'true'));
  appendSrText(el);
  return spans;
}

/**
 * Righe dentro una maschera, calcolate dal layout reale.
 * Mantiene gli elementi inline (es. <em>) avvolgendo ogni parola nel proprio stile.
 */
export function splitLines(el) {
  prepare(el);
  wrapWords(el);

  // raggruppa per offsetTop
  const lines = [];
  let lastTop = null;
  el.querySelectorAll('.split-word').forEach((span) => {
    const top = span.offsetTop;
    if (lastTop === null || Math.abs(top - lastTop) > 4) {
      lines.push([]);
      lastTop = top;
    }
    const line = lines[lines.length - 1];
    line.push((line.length && span.hasAttribute('data-space') ? ' ' : '') + span.innerHTML);
  });

  el.innerHTML = lines
    .map((l) => `<span class="split-mask" aria-hidden="true"><span class="split-line">${l.join('')}</span></span>`)
    .join('');
  appendSrText(el);
  return [...el.querySelectorAll('.split-line')];
}
