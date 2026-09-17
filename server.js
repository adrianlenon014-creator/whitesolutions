const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Whop-Signature, X-Whop-Hmac-Sha256');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const WHOP_ACCOUNT_ID = process.env.WHOP_ACCOUNT_ID || '';
const WHOP_API_KEY = process.env.WHOP_API_KEY || '';
const WHOP_WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET || '';
const WHOP_CHECKOUT_URL = process.env.WHOP_CHECKOUT_URL || '';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || '';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'White Solutions <noreply@whitesolutions.com>';

const products = [
  {
    id: 'algorithmic-trading-scripts',
    name: 'Algorithmic Trading Scripts',
    price: 450,
    tag: 'High-Performance Strategy Systems',
    badge: 'Top Seller',
    description: 'Institutional-grade trading scripts built for automation, execution logic, risk controls, and signal generation.',
    features: ['Backtested strategy logic', 'Execution and risk engine', 'Trading journal + analytics'],
    downloadLabel: 'Algorithmic Trading Scripts PDF',
    pdfFile: 'algorithmic-trading-scripts.pdf',
  },
  {
    id: 'deployment-backend-boilerplates',
    name: 'Deployment & Backend Boilerplates',
    price: 600,
    tag: 'Production-Ready Infrastructure',
    badge: 'Most Valuable',
    description: 'Launch fast with ready-to-deploy backend stacks for APIs, auth, admin systems, and secure production workflows.',
    features: ['Node.js + Express architecture', 'Secure authentication patterns', 'Deployment configs for Render & Netlify'],
    downloadLabel: 'Deployment & Backend Boilerplates PDF',
    pdfFile: 'deployment-backend-boilerplates.pdf',
  },
  {
    id: 'smart-contract-templates',
    name: 'Smart Contract Templates',
    price: 929,
    tag: 'On-Chain Capital Systems',
    badge: 'Premium',
    description: 'Secure Solidity starter templates for vaults, staking, token flows, governance, and blockchain-enabled product launches.',
    features: ['Auditable Solidity structure', 'Upgradeable contract patterns', 'Token & governance frameworks'],
    downloadLabel: 'Smart Contract Templates PDF',
    pdfFile: 'smart-contract-templates.pdf',
  },
  {
    id: 'automation-scripts',
    name: 'Automation Scripts',
    price: 299,
    tag: 'Workflow Optimization',
    badge: 'Essential',
    description: 'Automate repetitive business and dev tasks with scripts that save time, reduce errors, and increase operational leverage.',
    features: ['API automation logic', 'Lead workflow tooling', 'Task scheduling and reporting'],
    downloadLabel: 'Automation Scripts PDF',
    pdfFile: 'automation-scripts.pdf',
  },
];

const grantedAccess = new Map();

function escapePdfText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildPdfDocument(title, description) {
  const contentText = `${title}\n${description}`;
  const pdfText = escapePdfText(contentText.replace(/\n/g, ' '));
  const contentStream = `BT\n/F1 18 Tf\n72 720 Td\n(${pdfText}) Tj\n0 -28 Td\n/F1 11 Tf\n(${escapePdfText('White Solutions | Premium Digital Product Delivery')}) Tj\n0 -24 Td\n/F1 10 Tf\n(${escapePdfText('Your secure product access file is now available for download.')}) Tj\nET`;

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';

  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}

function getPublicBaseUrl(req) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

function createDownloadToken(productId, email) {
  return crypto.randomBytes(24).toString('hex');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getProductById(productId) {
  return products.find((item) => item.id === productId);
}

function getWhopCheckoutUrl(product) {
  if (!product) return '';

  const envKey = `WHOP_CHECKOUT_URL_${product.id.toUpperCase().replace(/-/g, '_')}`;
  return process.env[envKey] || WHOP_CHECKOUT_URL || '';
}

function verifyWhopSignature(rawBody, signature, secret) {
  if (!secret || !signature) return true;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = String(signature).replace(/^sha256=/i, '');

  if (!provided || provided.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

async function sendDeliveryEmail({ email, productName, downloadUrl }) {
  const normalizedEmail = normalizeEmail(email);

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log(`Delivery email would be sent to ${normalizedEmail} for ${productName}`);
    console.log(`Download URL: ${downloadUrl}`);
    return { sent: false, mode: 'console' };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: SMTP_FROM,
    to: normalizedEmail,
    subject: `Your ${productName} is ready`,
    html: `
      <div style="font-family: Arial, sans-serif; background: #0b1220; color: #f4f7ff; padding: 24px; border-radius: 16px;">
        <h2 style="margin-top: 0;">White Solutions</h2>
        <p>Your purchase is complete.</p>
        <p><strong>Product:</strong> ${productName}</p>
        <p><strong>Download link:</strong> <a href="${downloadUrl}" style="color: #8fe3ff;">Open product PDF</a></p>
      </div>
    `,
  });

  return { sent: true, mode: 'smtp' };
}

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/pdfs', express.static(path.join(__dirname, 'pdfs')));

app.post('/api/whop/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const rawBody = req.body;
    const payload = JSON.parse(rawBody.toString('utf8'));
    const signature = req.headers['x-whop-signature'] || req.headers['x-whop-hmac-sha256'] || '';

    if (WHOP_WEBHOOK_SECRET && !verifyWhopSignature(rawBody, signature, WHOP_WEBHOOK_SECRET)) {
      return res.status(401).json({ ok: false, error: 'Invalid webhook signature.' });
    }

    const eventType = payload.type || payload.event || payload.event_type || '';
    const productId = payload.product_id || payload.data?.product_id || payload.product?.id || payload.productId;
    const email = normalizeEmail(payload.customer?.email || payload.data?.customer?.email || payload.email || payload.data?.email || payload.user?.email);

    const product = getProductById(productId);

    if (eventType && /success|paid|completed/i.test(eventType) && product) {
      const token = createDownloadToken(product.id, email);
      const downloadUrl = `${getPublicBaseUrl(req)}/download/${product.id}?token=${token}`;

      grantedAccess.set(token, {
        productId: product.id,
        email,
        productName: product.name,
        issuedAt: Date.now(),
      });

      await sendDeliveryEmail({ email, productName: product.name, downloadUrl });

      return res.status(200).json({ ok: true, productId: product.id, email, downloadUrl });
    }

    return res.status(200).json({ ok: true, received: true, eventType });
  } catch (error) {
    console.error('Webhook error', error);
    return res.status(400).json({ ok: false, error: 'Invalid payload.' });
  }
});

app.get('/api/products', (req, res) => {
  res.json(products);
});

app.get('/api/config', (req, res) => {
  res.json({
    accountIdConfigured: Boolean(WHOP_ACCOUNT_ID),
    apiKeyConfigured: Boolean(WHOP_API_KEY),
    webhookConfigured: Boolean(WHOP_WEBHOOK_SECRET),
    emailConfigured: Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS),
    checkoutMode: 'secure-payments',
    environment: process.env.NODE_ENV || 'development',
  });
});

app.post('/api/checkout', async (req, res) => {
  const payload = req.body || {};
  const { productId, email } = payload;
  const product = getProductById(productId);

  if (!product) {
    return res.status(404).json({ success: false, error: 'Product not found.' });
  }

  const normalizedEmail = normalizeEmail(email || 'customer@whitesolutions.com');
  const checkoutUrl = getWhopCheckoutUrl(product);

  if (!checkoutUrl) {
    return res.status(400).json({
      success: false,
      error: 'Whop checkout URL is not configured. Add WHOP_CHECKOUT_URL or WHOP_CHECKOUT_URL_<PRODUCT_ID> in Render.',
      productId: product.id,
      email: normalizedEmail,
    });
  }

  return res.json({
    success: true,
    productId: product.id,
    productName: product.name,
    price: product.price,
    email: normalizedEmail,
    checkoutUrl,
    message: 'Redirecting to secure Whop checkout.',
    accountIdConfigured: Boolean(WHOP_ACCOUNT_ID),
    apiKeyConfigured: Boolean(WHOP_API_KEY),
  });
});

app.get('/download/:productId', (req, res) => {
  const { productId } = req.params;
  const token = String(req.query.token || '');
  const product = getProductById(productId);

  if (!product) {
    return res.status(404).send('Product not found.');
  }

  const access = grantedAccess.get(token);

  if (!access || access.productId !== productId) {
    return res.status(401).send('Unauthorized access. Please complete the purchase first.');
  }

  const pdfPath = path.join(__dirname, 'pdfs', product.pdfFile);

  if (!fs.existsSync(pdfPath)) {
    return res.status(404).send('PDF file not found. Please upload the file for this product.');
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${product.downloadLabel.replace(/\s+/g, '-').toLowerCase()}.pdf"`);
  return res.sendFile(pdfPath);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'Route not found.' });
  }

  return res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`White Solutions backend running on http://localhost:${PORT}`);
  console.log('Whop config:', {
    accountIdConfigured: Boolean(WHOP_ACCOUNT_ID),
    apiKeyConfigured: Boolean(WHOP_API_KEY),
    webhookConfigured: Boolean(WHOP_WEBHOOK_SECRET),
    emailConfigured: Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS),
  });
});
