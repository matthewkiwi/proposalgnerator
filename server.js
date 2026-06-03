const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.APP_PASSWORD || 'robot';

// Ensure data directories exist
['data', 'generated'].forEach(dir => {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'robotcom-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 hours
}));
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// ---- Auth routes ----
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === PASSWORD) {
    req.session.authenticated = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Wrong password' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

// ---- Settings (admin customization) ----
const settingsPath = path.join(__dirname, 'data', 'settings.json');
function getSettings() {
  if (!fs.existsSync(settingsPath)) {
    const defaults = {
      companyName: 'Robot.com',
      defaultModels: ['Kiwi 1.0', 'Kiwi 2.0', 'Kiwi Pro', 'Custom / TBD'],
      defaultTiers: ['Standard', 'Premium', 'Enterprise'],
      proposalIntro: 'Thank you for the opportunity to present this proposal. Robot.com is pleased to offer autonomous robot deployment services tailored to your needs.',
      operatorNote: 'Robots will come with onsite operators who will assist in refilling robots and can also serve as brand ambassadors.',
      includedItems: [
        'Fully operational Robot.com autonomous robots',
        'Dedicated onsite operators for the full activation period',
        'Robot refilling and on-the-spot maintenance support',
        'Brand ambassador services',
        'Setup and deployment coordination by the Robot.com team'
      ],
      footerNote: 'Prepared by Robot.com Operations'
    };
    fs.writeFileSync(settingsPath, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

app.get('/api/settings', requireAuth, (req, res) => {
  res.json(getSettings());
});

app.post('/api/settings', requireAuth, (req, res) => {
  const current = getSettings();
  const updated = { ...current, ...req.body };
  fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2));
  res.json({ ok: true, settings: updated });
});

// ---- Proposals CRUD ----
const proposalsPath = path.join(__dirname, 'data', 'proposals.json');
function getProposals() {
  if (!fs.existsSync(proposalsPath)) return [];
  return JSON.parse(fs.readFileSync(proposalsPath, 'utf8'));
}
function saveProposals(list) {
  fs.writeFileSync(proposalsPath, JSON.stringify(list, null, 2));
}

app.get('/api/proposals', requireAuth, (req, res) => {
  res.json(getProposals());
});

app.post('/api/proposals', requireAuth, (req, res) => {
  const { v4: uuidv4 } = require('uuid');
  const proposals = getProposals();
  const proposal = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    ...req.body
  };
  proposals.unshift(proposal);
  saveProposals(proposals);
  res.json({ ok: true, proposal });
});

app.delete('/api/proposals/:id', requireAuth, (req, res) => {
  let proposals = getProposals();
  proposals = proposals.filter(p => p.id !== req.params.id);
  saveProposals(proposals);
  res.json({ ok: true });
});

// ---- PDF generation ----
app.post('/api/generate-pdf', requireAuth, async (req, res) => {
  try {
    const puppeteer = require('puppeteer');
    const { v4: uuidv4 } = require('uuid');
    const proposalData = req.body;
    const settings = getSettings();
    const html = buildProposalHTML(proposalData, settings);
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      margin: { top: '0.8in', right: '0.9in', bottom: '0.8in', left: '0.9in' },
      printBackground: true
    });
    await browser.close();
    const filename = `proposal_${proposalData.clientName || 'client'}_${Date.now()}.pdf`.replace(/\s+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF error:', err);
    res.status(500).json({ error: 'PDF generation failed: ' + err.message });
  }
});

// ---- HTML proposal builder ----
function buildProposalHTML(data, settings) {
  const { clientName, contactName, contactEmail, contactPhone, proposalDate, expiryDate, status, notes, clientNotes, options = [] } = data;

  const optionRows = [
    ['', ...options.map((o, i) => `<strong>Option ${String.fromCharCode(65 + i)}</strong>`)],
    ['Number of robots', ...options.map(o => o.robots ? `${o.robots} unit${o.robots != 1 ? 's' : ''}` : '—')],
    ['Activation period', ...options.map(o => o.days ? `${o.days} day${o.days != 1 ? 's' : ''}` : '—')],
    ['Robot model', ...options.map(o => o.model || '—')],
    ['Service tier', ...options.map(o => o.tier || '—')],
    ['Onsite operators', ...options.map(() => 'Included')],
    ['Brand ambassador support', ...options.map(() => 'Included')],
    ['Total investment', ...options.map(o => o.price ? `$${Number(o.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—')],
  ];

  const tableHTML = `
    <table>
      ${optionRows.map((row, ri) => `
        <tr class="${ri === 0 ? 'header-row' : ri % 2 === 0 ? 'even-row' : ''}">
          ${row.map((cell, ci) => `<td class="${ri === 0 ? 'th' : ''} ${ci === 0 ? 'label-col' : ''} ${ri === optionRows.length - 1 ? 'total-row' : ''}">${cell}</td>`).join('')}
        </tr>
      `).join('')}
    </table>
  `;

  const optionDetails = options.map((o, i) => {
    const label = String.fromCharCode(65 + i);
    const price = o.price ? `$${Number(o.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '';
    return `
      <h3>Option ${label}${o.robots ? ` &mdash; ${o.robots} Robot${o.robots != 1 ? 's' : ''}` : ''}${o.days ? `, ${o.days} Days` : ''}${price ? ` &mdash; ${price}` : ''}</h3>
      <p>${o.desc || `Option ${label} provides a tailored deployment of ${o.robots || '—'} robot${o.robots != 1 ? 's' : ''} over ${o.days || '—'} days, with full onsite operator support throughout the activation period.`}</p>
    `;
  }).join('');

  const includedList = (settings.includedItems || []).map(item => `<li>${item}</li>`).join('');
  const clientNotesSection = clientNotes ? `<div class="callout"><strong>Note:</strong> ${clientNotes}</div>` : '';
  const operatorNote = settings.operatorNote ? `<p>${settings.operatorNote}</p>` : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', Arial, sans-serif; color: #000; background: #fff; font-size: 11pt; line-height: 1.6; }

  .page-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #cac9c6; padding-bottom: 10px; margin-bottom: 32px; }
  .page-header .brand { font-size: 10pt; font-weight: 700; letter-spacing: 0.08em; color: #2c2c2a; }
  .page-header .conf { font-size: 9pt; color: #888780; }

  .title-block { margin-bottom: 36px; }
  .title-block h1 { font-size: 32pt; font-weight: 700; line-height: 1.1; margin-bottom: 6px; }
  .title-block .subtitle { font-size: 15pt; color: #2c2c2a; border-bottom: 1.5px solid #cac9c6; padding-bottom: 8px; margin-bottom: 10px; }
  .title-block .meta { font-size: 9.5pt; color: #888780; }

  .client-info { display: flex; gap: 40px; margin-bottom: 32px; background: #f8f6f3; border-radius: 6px; padding: 16px 20px; }
  .client-info .item label { font-size: 9pt; color: #888780; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; display: block; margin-bottom: 2px; }
  .client-info .item span { font-size: 11pt; font-weight: 500; color: #000; }

  h2 { font-size: 15pt; font-weight: 700; margin: 28px 0 10px; border-bottom: 1px solid #cac9c6; padding-bottom: 6px; }
  h3 { font-size: 12pt; font-weight: 600; margin: 20px 0 6px; color: #000; }
  p { margin-bottom: 10px; font-size: 11pt; }
  ul { padding-left: 20px; margin-bottom: 12px; }
  ul li { margin-bottom: 4px; font-size: 11pt; }

  table { width: 100%; border-collapse: collapse; margin: 16px 0 24px; font-size: 10pt; }
  table td { border: 1px solid #cac9c6; padding: 7px 10px; color: #5c5b58; }
  table .header-row td { background: #cac9c6; font-weight: 700; color: #000; text-align: center; }
  table .header-row td.label-col { text-align: left; }
  table .even-row td { background: #f8f6f3; }
  table .label-col { color: #5c5b58; }
  table .total-row { font-weight: 700; color: #000 !important; font-size: 10.5pt; }
  table td:not(.label-col) { text-align: center; }

  .callout { background: #fff65d; border-radius: 4px; padding: 12px 16px; margin: 16px 0; font-size: 10.5pt; }
  .callout strong { font-weight: 700; }

  .closing { border-top: 1px solid #e8e7e5; margin-top: 36px; padding-top: 12px; font-size: 9pt; color: #888780; }
  .page-break { page-break-before: always; }
</style>
</head>
<body>

<div class="page-header">
  <div class="brand">ROBOT.COM &nbsp;//&nbsp; CONFIDENTIAL</div>
  <div class="conf">Service Proposal</div>
</div>

<div class="title-block">
  <h1>Service Proposal</h1>
  <div class="subtitle">Autonomous Robot Deployment</div>
  <div class="meta">Prepared for ${clientName || 'Client'} &nbsp;|&nbsp; Robot.com Operations &nbsp;|&nbsp; ${proposalDate ? new Date(proposalDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
</div>

<div class="client-info">
  ${clientName ? `<div class="item"><label>Client</label><span>${clientName}</span></div>` : ''}
  ${contactName ? `<div class="item"><label>Contact</label><span>${contactName}</span></div>` : ''}
  ${contactEmail ? `<div class="item"><label>Email</label><span>${contactEmail}</span></div>` : ''}
  ${contactPhone ? `<div class="item"><label>Phone</label><span>${contactPhone}</span></div>` : ''}
  ${expiryDate ? `<div class="item"><label>Valid until</label><span>${new Date(expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>` : ''}
</div>

<h2>Overview</h2>
<p>Dear ${contactName || 'Team'},</p>
<p>${settings.proposalIntro}</p>
${operatorNote}

<h2>What's Included in Every Option</h2>
<ul>${includedList}</ul>

${clientNotesSection}

${options.length > 0 ? `
<h2>Proposal Options</h2>
<p>Please review the options below and select the one that best fits your goals and timeline.</p>
${tableHTML}
${optionDetails}
` : ''}

<h2>Next Steps</h2>
<div class="callout"><strong>Action:</strong> Please review the options and reply with your preferred choice. Our team will follow up to confirm logistics, timelines, and any customization needed.</div>
<p>We look forward to partnering with ${clientName || 'your team'} and are happy to answer any questions. Do not hesitate to reach out directly.</p>

${notes ? `<h2>Additional Notes</h2><p>${notes}</p>` : ''}

<div class="closing">Prepared by Robot.com Operations &nbsp;|&nbsp; ${new Date().getFullYear()}</div>

</body>
</html>`;
}

// Catch-all: serve index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Robot.com Proposal App running on http://localhost:${PORT}`);
});
