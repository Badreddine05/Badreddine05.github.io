#!/usr/bin/env node
/**
 * Builds the compact datasets behind the portfolio figures.
 *
 * Inputs are the published project builds already present in this site
 * (flowlens/, gridpulse/, retailscope/) and the BCI benchmark report.
 * Calculations reuse the projects' own modules from the sibling repositories,
 * so the numbers in the case studies match the applications.
 *
 * Usage: node scripts/build-figures.mjs [--bci path/to/benchmark.json]
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, 'data', 'figures');
const sibling = (...parts) => path.resolve(ROOT, '..', ...parts);
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const exists = file => access(file).then(() => true, () => false);
const round = (value, digits = 0) => (value == null || !Number.isFinite(value) ? null : Number(value.toFixed(digits)));

async function write(name, data) {
  const file = path.join(OUT, name);
  const text = JSON.stringify(data);
  await writeFile(file, text + '\n');
  console.log(`${name.padEnd(18)} ${(text.length / 1024).toFixed(1)} kB`);
}

function quantile(values, p) {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y);
  const at = (a.length - 1) * p;
  const low = Math.floor(at);
  return a[low] + (a[Math.ceil(at)] - a[low]) * (at - low);
}

function bins(values, width, max) {
  const out = new Array(Math.ceil(max / width) + 1).fill(0);
  for (const v of values) out[Math.min(out.length - 1, Math.floor(v / width))]++;
  return out; // last bin = overflow (>= max)
}

/** Resample a series to n points with monotone cubic interpolation, normalised to [0, 1]. */
function shape(values, n) {
  const m = values.length;
  const d = values.slice(1).map((v, i) => v - values[i]);
  const t = values.map((_, i) => {
    if (i === 0) return d[0];
    if (i === m - 1) return d[m - 2];
    return d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  });
  const out = [];
  for (let k = 0; k < n; k++) {
    const x = (k / (n - 1)) * (m - 1);
    const i = Math.min(m - 2, Math.floor(x));
    const s = x - i;
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s;
    const h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
    out.push(h00 * values[i] + h10 * t[i] + h01 * values[i + 1] + h11 * t[i + 1]);
  }
  const lo = Math.min(...out), hi = Math.max(...out);
  return out.map(v => round((v - lo) / (hi - lo), 4));
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

await mkdir(OUT, { recursive: true });
const flowlens = await import(pathToFileURL(sibling('flowlens', 'src', 'analytics.mjs')));
const gridpulse = await import(pathToFileURL(sibling('gridpulse', 'src', 'data.mjs')));
const retailscope = await import(pathToFileURL(sibling('retailscope', 'src', 'analytics.js')));

/* ---------------------------------------------------------------- GridPulse */
const gridRaw = await readJson(path.join(ROOT, 'gridpulse', 'data', 'gridpulse.json'));
const gridRows = gridpulse.decodeData(gridRaw);
const FUELS = gridpulse.FUELS.map(f => f.key);
const byDay = new Map();
for (const r of gridRows) {
  const hour = Number(r.time.slice(0, 2));
  const day = byDay.get(r.date) || Array.from({ length: 24 }, () => []);
  day[hour].push(r);
  byDay.set(r.date, day);
}
const days = [...byDay.keys()].sort();
const meanOf = (list, key) => {
  const v = list.map(r => r[key]).filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const heat = [];
for (const date of days) for (const list of byDay.get(date)) {
  const mw = meanOf(list, 'consommation');
  heat.push(mw == null ? -1 : Math.round(mw / 100)); // GW x 10
}
const dayStats = days.map(date => {
  const hours = byDay.get(date);
  const all = hours.flat();
  const conso = all.map(r => r.consommation).filter(Number.isFinite);
  return {
    date,
    mean: conso.length === all.length && conso.length ? conso.reduce((a, b) => a + b, 0) / conso.length : null,
    max: conso.length ? Math.max(...conso) : null,
    solar: all.reduce((s, r) => s + (r.solaire || 0), 0),
    wind: all.reduce((s, r) => s + (r.eolien || 0), 0),
    weekday: new Date(date + 'T12:00:00Z').getUTCDay(),
  };
});
const pick = (list, key, dir = 1) => list.filter(d => d[key] != null).sort((a, b) => dir * (b[key] - a[key]))[0];
const peakDay = pick(dayStats, 'max');
const lowDay = pick(dayStats, 'mean', -1);
const sunDay = pick(dayStats, 'solar');
const windDay = pick(dayStats, 'wind');
const jan = dayStats.filter(d => d.date.startsWith('2024-01') && d.weekday >= 1 && d.weekday <= 5 && d.mean != null);
const janMedian = quantile(jan.map(d => d.mean), 0.5);
const typicalDay = [...jan].sort((a, b) => Math.abs(a.mean - janMedian) - Math.abs(b.mean - janMedian))[0];
const presetDay = (id, d) => ({
  id,
  date: d.date,
  hours: byDay.get(d.date).map(list => ({
    conso: round(meanOf(list, 'consommation')),
    co2: round(meanOf(list, 'taux_co2'), 1),
    mix: FUELS.map(k => round(meanOf(list, k))),
  })),
});
const presets = [
  presetDay('typical', typicalDay),
  presetDay('peak', peakDay),
  presetDay('low', lowDay),
  presetDay('sun', sunDay),
  presetDay('wind', windDay),
];
const fc = gridRows.filter(r => r.prediction != null);
const years = {};
for (const y of ['2023', '2024']) {
  const rowsY = gridRows.filter(r => r.date.startsWith(y));
  const finite = rowsY.filter(r => Number.isFinite(r.consommation));
  const peak = finite.reduce((a, r) => (r.consommation > a.consommation ? r : a), finite[0]);
  years[y] = {
    twh: round(finite.reduce((s, r) => s + r.consommation, 0) / 1e6, 1),
    peak: { date: peak.date, time: peak.time, mw: round(peak.consommation) },
    nuclearShare: round(finite.reduce((s, r) => s + r.nucleaire, 0) / finite.reduce((s, r) => s + FUELS.reduce((t, k) => t + (r[k] || 0), 0), 0), 4),
  };
}
const janProfile = Array.from({ length: 24 }, (_, h) => {
  const v = jan.map(d => meanOf(byDay.get(d.date)[h], 'consommation')).filter(Number.isFinite);
  return v.reduce((a, b) => a + b, 0) / v.length;
});
await write('gridpulse.json', {
  meta: { source: gridRaw.meta.source_url, license: gridRaw.meta.license, licenseUrl: gridRaw.meta.license_url, period: gridRaw.meta.period, quality: gridRaw.meta.quality, model: gridRaw.meta.model },
  fuels: gridpulse.FUELS.map(f => ({ key: f.key, label: f.label })),
  days: { first: days[0], count: days.length },
  heat,
  years,
  presets,
  forecast: {
    start: fc[0].unix_seconds_utc,
    t: fc.map(r => r.unix_seconds_utc - fc[0].unix_seconds_utc).map(s => s / 3600),
    observed: fc.map(r => round(r.consommation)),
    prediction: fc.map(r => round(r.prediction)),
    baseline: fc.map(r => round(r.baseline)),
    lower: fc.map(r => round(r.lower)),
    upper: fc.map(r => round(r.upper)),
  },
});

/* -------------------------------------------------------------- RetailScope */
const retailRaw = await readJson(path.join(ROOT, 'retailscope', 'data', 'analytics.json'));
const retailManifest = await readJson(path.join(ROOT, 'retailscope', 'data', 'manifest.json'));
const sel = retailscope.selectData(retailRaw, { country: 'All', start: '2010-12', end: '2011-11' });
const uk = retailscope.selectData(retailRaw, { country: 'United Kingdom', start: '2010-12', end: '2011-11' });
const SEGMENTS = sel.segments.map(s => s.name);
await write('retailscope.json', {
  meta: { citation: retailManifest.citation, license: retailManifest.license, licenseUrl: retailManifest.license_url, url: retailManifest.url, counts: retailManifest.counts, lastComplete: retailManifest.last_complete_month, maxDate: retailManifest.max_date },
  totals: { net: sel.totals.net, gross: sel.totals.gross, credit: sel.totals.credit, orders: sel.totals.orders, aov: round(sel.totals.aov), creditRate: round(sel.totals.creditRate, 4), customers: sel.customers.length, identifiedOrders: sel.identifiedOrders },
  monthly: sel.series.map((m, i) => ({ month: m.month, net: m.net, gross: m.gross, credit: m.credit, orders: m.orders, ukNet: uk.series[i].net })),
  countries: sel.countries.slice(0, 9).map(c => ({ country: c.country, net: c.net, orders: c.orders })),
  countryCount: sel.countries.length,
  segments: sel.segments,
  customers: sel.customers.map(c => [c.recency, c.frequency, Math.round(c.monetary / 1000), SEGMENTS.indexOf(c.segment)]),
  cohorts: sel.cohorts.map(c => ({ month: c.month, size: c.size, retention: c.retention.map(v => round(v, 4)) })),
});

/* ----------------------------------------------------------------- FlowLens */
const flowRaw = await readJson(path.join(ROOT, 'flowlens', 'data', 'cases.json'));
const cases = flowRaw.cases;
const agg = flowlens.aggregate(cases);
const completed = cases.filter(c => c.status !== 'open');
const STATUSES = ['pending', 'denied', 'cancelled'];
const reworkOf = c => c.events.filter(e => e[0] === 5).length > 1;
const stageEffect = stage => {
  let total = 0;
  for (const c of completed) for (let i = 0; i < c.events.length - 1; i++)
    if (c.events[i][0] === stage) total += (c.events[i + 1][1] - c.events[i][1]) / flowlens.DAY;
  return total;
};
const stages = [...Array(flowRaw.states.length).keys()].map(s => ({ s, total: stageEffect(s) })).sort((a, b) => b.total - a.total);
const scenarioStages = stages.slice(0, 3).map(x => x.s);
const scenario = scenarioStages.map(stage => ({
  stage,
  levels: Array.from({ length: 11 }, (_, i) => {
    const reduction = i * 10;
    const res = flowlens.simulate(cases, stage, reduction);
    const after = completed.map(c => {
      let interval = 0;
      for (let k = 0; k < c.events.length - 1; k++)
        if (c.events[k][0] === stage) interval += (c.events[k + 1][1] - c.events[k][1]) / flowlens.DAY;
      return Math.max(0, c.duration - (interval * reduction) / 100);
    });
    return { reduction, median: round(res.after, 2), p90: round(quantile(after, 0.9), 2), affected: res.affected, hist: bins(after, 1, 60) };
  }),
}));
await write('flowlens.json', {
  meta: { citation: flowRaw.citation, doi: flowRaw.sourceDoi, license: flowRaw.licenseUrl },
  labels: flowRaw.labels,
  states: flowRaw.states,
  totals: { cases: agg.count, completed: agg.completed, median: round(agg.median, 2), p90: round(agg.p90, 2), rework: agg.rework, statuses: agg.statuses, rawEvents: agg.rawEvents, applicationEvents: agg.applicationEvents, variants: agg.variants.length },
  nodes: flowRaw.states.map((s, i) => ({ id: i, cases: agg.stages.get(i) || 0 })),
  edges: agg.edges.map(e => ({ from: e.from, to: e.to, count: e.count, median: round(e.median, 2) })),
  variants: agg.variants.slice(0, 10).map(v => ({ path: v.path, count: v.count, median: round(v.median, 2) })),
  durations: Object.fromEntries(STATUSES.map(s => [s, bins(completed.filter(c => c.status === s).map(c => c.duration), 1, 60)])),
  rework: {
    yes: bins(completed.filter(reworkOf).map(c => c.duration), 1, 60),
    no: bins(completed.filter(c => !reworkOf(c)).map(c => c.duration), 1, 60),
    medianYes: round(quantile(completed.filter(reworkOf).map(c => c.duration), 0.5), 2),
    medianNo: round(quantile(completed.filter(c => !reworkOf(c)).map(c => c.duration), 0.5), 2),
  },
  months: agg.months.map(m => ({ month: m.month, count: m.count, median: round(m.median, 2) })),
  outcomes: Object.fromEntries(STATUSES.map(s => {
    const d = completed.filter(c => c.status === s).map(c => c.duration);
    return [s, { count: d.length, median: round(quantile(d, 0.5), 2), p90: round(quantile(d, 0.9), 2) }];
  })),
  reworkMix: Object.fromEntries([['yes', true], ['no', false]].map(([k, flag]) => {
    const group = completed.filter(c => reworkOf(c) === flag);
    return [k, { count: group.length, ...Object.fromEntries(STATUSES.map(s => [s, group.filter(c => c.status === s).length])) }];
  })),
  // Cumulative calendar time spent after each state, before the next one (waiting and work are not separable).
  timeAfter: stages.map(({ s, total }) => ({ stage: s, days: Math.round(total), cases: completed.filter(c => c.events.slice(0, -1).some(e => e[0] === s)).length })),
  scenario,
});

/* ----------------------------------------------------------------- NeuroLab */
const argIndex = process.argv.indexOf('--bci');
const bciCandidates = [
  argIndex > 0 ? path.resolve(process.argv[argIndex + 1]) : null,
  sibling('BCI', 'web', 'data', 'benchmark.json'),
  path.resolve(ROOT, '..', '..', 'BCI', 'web', 'data', 'benchmark.json'),
].filter(Boolean);
let bciFile = null;
for (const candidate of bciCandidates) if (await exists(candidate)) { bciFile = candidate; break; }
if (!bciFile) throw new Error('BCI benchmark.json not found; pass --bci <file>.');
const bci = await readJson(bciFile);
await write('neurolab.json', {
  meta: { generated: bci.generated_at, license: bci.data_license, sourcePage: bci.source_page, publication: bci.publication, sources: bci.sources.length, bytes: bci.sources.reduce((s, x) => s + x.bytes, 0) },
  protocol: bci.protocol,
  subjects: bci.subjects,
  records: bci.records.map(r => ({ subject: r.subject, model: r.model, balanced: round(r.balanced_accuracy, 4), accuracy: round(r.accuracy, 4), kappa: round(r.kappa, 4), confusion: r.confusion })),
  summary: bci.summary.map(s => ({ model: s.model, name: s.name, balanced: round(s.balanced_accuracy, 4), kappa: round(s.kappa, 4), min: round(s.subject_min, 4), max: round(s.subject_max, 4), confusion: s.confusion, train: s.train_trials, test: s.test_trials })),
  quality: bci.quality.map(q => ({ subject: q.subject, session: q.session, trials: q.trials, flagged: q.flagged_trials })),
});

/* --------------------------------------------------------------------- Home */
const rand = seeded(2014);
const eeg = Array.from({ length: 240 }, (_, i) => {
  const t = (i / 239) * 2; // seconds
  const envelope = 1 - 0.62 / (1 + Math.exp(-(t - 0.9) * 9));
  return envelope * Math.sin(2 * Math.PI * 10 * t) + 0.22 * Math.sin(2 * Math.PI * 2.3 * t + 0.7) + 0.16 * (rand() - 0.5);
});
const flowHist = bins(completed.map(c => c.duration), 1, 60).slice(0, 60);
const smooth = flowHist.map((_, i) => {
  const w = flowHist.slice(Math.max(0, i - 1), i + 2);
  return w.reduce((a, b) => a + b, 0) / w.length;
});
const lo = list => Math.min(...list), hi = list => Math.max(...list);
const retailNet = sel.series.map(m => m.net / 1000);
await write('home.json', {
  morph: [
    { id: 'gridpulse', values: shape(janProfile, 240), min: round(lo(janProfile) / 1000, 1), max: round(hi(janProfile) / 1000, 1), unit: 'GW' },
    { id: 'retailscope', values: shape(retailNet, 240), min: round(lo(retailNet) / 1e6, 2), max: round(hi(retailNet) / 1e6, 2), unit: 'M£' },
    { id: 'flowlens', values: shape(smooth, 240), min: 0, max: Math.round(hi(smooth)), unit: 'dossiers' },
    { id: 'neurolab', values: shape(eeg, 240), synthetic: true },
  ],
  stats: {
    gridpulseHours: gridRaw.meta.quality.hourly_rows,
    retailscopeRows: retailManifest.counts.source_rows,
    flowlensCases: agg.count,
    flowlensCompleted: agg.completed,
    flowlensMedian: round(agg.median, 1),
    neurolabTrials: bci.summary[0].train + bci.summary[0].test,
  },
  thumbs: {
    gridpulse: { first: days[0], daily: dayStats.map(d => (d.mean == null ? null : Math.round(d.mean / 100))) },
    retailscope: sel.cohorts.map(c => ({ month: c.month, size: c.size, retention: c.retention.map(v => round(v, 3)) })),
    flowlens: { labels: flowRaw.labels, nodes: flowRaw.states.map((s, i) => agg.stages.get(i) || 0), edges: agg.edges.map(e => [e.from, e.to, e.count]) },
    neurolab: { models: bci.summary.map(s => ({ model: s.model, name: s.name, mean: round(s.balanced_accuracy, 4) })), subjects: bci.subjects.map(id => bci.summary.map(s => round(bci.records.find(r => r.subject === id && r.model === s.model).balanced_accuracy, 4))) },
  },
});
console.log('Figures written to data/figures/.');
