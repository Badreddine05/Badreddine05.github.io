// Generates cv.html from data/cv.json. CI checks that the committed file matches this output.
import { readFile, writeFile } from 'node:fs/promises';

const c = JSON.parse(await readFile(new URL('../data/cv.json', import.meta.url), 'utf8'));
const e = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const ARROW = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 11 11 5M6 5h5v5"/></svg>';
const DOWN = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v8M4.5 7.5 8 11l3.5-3.5M3.5 13.5h9"/></svg>';

const slugOf = link => { try { return new URL(link).pathname.replaceAll('/', ''); } catch { return ''; } };
// An entry lists its own pages when it has no application of its own (NeuroLab, the games).
const links = x => {
  if (!x.link) return '';
  const slug = slugOf(x.link);
  const pages = x.pages ?? [{ label: 'Étude de cas', href: `projets/${slug}/` }, { label: 'Application', href: `${slug}/` }];
  return `<p class="cv-links">${pages.map(p => `<a class="link-arrow" href="${e(p.href)}">${e(p.label)}${ARROW}</a>`).join('')}</p>`;
};
const entry = x => `
      <article class="cv-entry">
        <header class="cv-entry__head"><h3>${e(x.title)}</h3>${x.dates ? `<span class="cv-entry__date">${e(x.dates)}</span>` : ''}</header>
        ${x.organization ? `<p class="cv-entry__org">${e(x.organization)}</p>` : ''}${x.tech ? `<p class="cv-entry__org">${e(x.tech)}</p>` : ''}
        ${x.items ? `<ul>${x.items.map(y => `<li>${e(y)}</li>`).join('')}</ul>` : ''}${x.detail ? `<p class="cv-entry__detail">${e(x.detail)}</p>` : ''}${links(x)}
      </article>`;
const section = (id, title, body) => `
    <section class="cv-section" id="${id}" aria-labelledby="${id}-titre">
      <h2 id="${id}-titre">${title}</h2>${body}
    </section>`;

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CV · ${e(c.name)}</title>
<meta name="description" content="CV de ${e(c.name)} : Master MIAGE à Paris-Saclay, data engineering, BI, expériences et projets. Version PDF téléchargeable.">
<meta name="theme-color" content="#fbfaf6" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#121211" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${e(c.website)}cv.html">
<link rel="icon" href="assets/brand/mark.svg" type="image/svg+xml">
<link rel="preload" href="assets/fonts/newsreader-opsz.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/plex-sans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/css/tokens.css">
<link rel="stylesheet" href="assets/css/site.css">
<link rel="stylesheet" href="assets/css/cv.css">
<script>try{var t=localStorage.getItem('bc-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>
<script type="module" src="assets/js/site.js"></script>
</head>
<body>
<a class="skip" href="#cv">Aller au CV</a>

<header class="site-header">
  <div class="wrap site-header__inner">
    <a class="brand" href="./" aria-label="${e(c.name)}, accueil">
      <svg class="brand__mark" viewBox="0 0 32 32" aria-hidden="true"><g fill="none" stroke-width="3" stroke-linecap="round"><path class="ink" d="M8 4.5V27.5"/><path class="ink" d="M21.95 14.15A8 8 0 1 0 21.95 24.85"/></g><circle class="dot" cx="24" cy="19.5" r="2.4"/></svg>
      <span class="brand__name">${e(c.name)}</span>
    </a>
    <nav class="site-nav" aria-label="Navigation principale">
      <a href="./#projets">Projets</a>
      <a href="./#parcours">Parcours</a>
      <a href="cv.html" aria-current="page">CV</a>
      <a href="./#contact">Contact</a>
    </nav>
    <button class="theme-toggle" type="button" aria-label="Changer de thème"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path class="half" d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg></button>
  </div>
</header>

<main class="cv wrap" id="cv">
  <aside class="cv-side">
    <h1 class="cv-name">${e(c.name)}</h1>
    <p class="cv-role">${e(c.title)}</p>
    <p class="cv-meta">${e(c.location)}</p>
    <ul class="cv-contact">
      <li><a href="mailto:${e(c.email)}">${e(c.email)}</a></li>
      <li><a href="${e(c.linkedin)}">LinkedIn</a></li>
      <li><a href="${e(c.github)}">GitHub</a></li>
      <li><a href="${e(c.website)}">${e(c.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></li>
    </ul>
    <p class="cv-download"><a class="btn btn--primary" href="assets/CV_Badreddine_Channoufi.pdf" download>Télécharger le PDF${DOWN}</a></p>
    <nav class="cv-toc" aria-label="Sections du CV">
      <a href="#experience">Expériences</a>
      <a href="#formation">Formation</a>
      <a href="#competences">Compétences</a>
      <a href="#portfolio">Projets</a>
      <a href="#autres-projets">Autres projets</a>
      <a href="#langues">Langues et certifications</a>
    </nav>
  </aside>

  <div class="cv-body">
    <p class="cv-summary">${e(c.summary)}</p>${section('experience', 'Expériences', c.experiences.map(entry).join(''))}${section('formation', 'Formation', c.education.map(entry).join(''))}${section('competences', 'Compétences', `
      <dl class="cv-skills">${c.skills.map(x => `<div><dt>${e(x.title)}</dt><dd>${e(x.detail)}</dd></div>`).join('')}</dl>`)}${section('portfolio', 'Projets', c.portfolio.map(entry).join(''))}${section('autres-projets', 'Autres projets', c.otherProjects.map(entry).join(''))}${section('langues', 'Langues et certifications', `
      <p>${e(c.languages)}</p>
      <p>${e(c.certifications)}</p>`)}${section('interets', "Centres d'intérêt", `
      <p>${e(c.interests)}</p>`)}
  </div>
</main>

<footer class="site-footer">
  <div class="wrap site-footer__inner">
    <span>© 2026 ${e(c.name)}</span>
    <span>Version PDF : <a href="assets/CV_Badreddine_Channoufi.pdf" download>CV_Badreddine_Channoufi.pdf</a></span>
  </div>
</footer>
</body>
</html>
`;

await writeFile(new URL('../cv.html', import.meta.url), html);
console.log('cv.html generated from data/cv.json');
