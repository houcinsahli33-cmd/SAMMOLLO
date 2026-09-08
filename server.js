require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { query, getConnection, testConnection } = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({
  limit: '25kb',
  verify: (req, _res, buf) => {
    if (req.originalUrl === '/api/payments/chargily/webhook') req.rawBody = Buffer.from(buf);
  }
}));
app.use(express.urlencoded({ extended: false, limit: '25kb' }));

app.use((req, res, next) => {
  const blocked = /^\/(?:database(?:\/|$)|db\.js$|serveur\.js$|package(?:-lock)?\.json$|README\.md$|\.env(?:\.|$))/i;
  if (blocked.test(req.path)) return res.status(404).end();
  next();
});
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_PATH = String(process.env.ADMIN_PATH || '')
  .trim()
  .replace(/^\/+|\/+$/g, '');

if (!ADMIN_PATH) {
  console.warn('[Sécurité] ADMIN_PATH non configuré.');
}

if (ADMIN_PATH) {
  app.get(`/${ADMIN_PATH}`, (req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.sendFile(path.join(__dirname, 'admin-private.html'));
  });
}

app.get([
  '/admin',
  '/admin.html',
  '/administration',
  '/administrator',
  '/backoffice',
  '/back-office'
], (_req, res) => {
  res.status(404).send('Not Found');
});

app.use(express.static(PUBLIC_DIR, {
  extensions: ['html'],
  index: 'index.html'
}));

app.get('/', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

const contactLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });
const orderLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()); }
function cleanText(v, max) { return String(v || '').trim().replace(/\0/g, '').slice(0, max); }
function hashCode(token, code) { return crypto.createHash('sha256').update(`${token}:${code}:${JWT_SECRET}`).digest('hex'); }
function safeEqualHex(a, b) {
  try { const A = Buffer.from(a, 'hex'), B = Buffer.from(b, 'hex'); return A.length === B.length && crypto.timingSafeEqual(A, B); }
  catch { return false; }
}
function escapeHtml(s) { return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function mailTransport() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '');
  const port = Number(String(process.env.SMTP_PORT || '587').trim());
  const secure = String(process.env.SMTP_SECURE || 'false').trim().toLowerCase() === 'true';
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: port === 587,
    auth: { user, pass }
  });
}
function appBaseUrl(req) {
  const configured = String(process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
}
function chargilyConfig() {
  const key = String(process.env.CHARGILY_SECRET_KEY || '').trim();
  const mode = String(process.env.CHARGILY_MODE || 'test').trim().toLowerCase() === 'live' ? 'live' : 'test';
  const baseUrl = mode === 'live' ? 'https://pay.chargily.net/api/v2' : 'https://pay.chargily.net/test/api/v2';
  return { key, mode, baseUrl };
}
function verifyChargilySignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    const a = Buffer.from(String(signature), 'hex');
    const b = Buffer.from(computed, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}
function signAdmin(admin) { return jwt.sign({ sub: admin.id, email: admin.email, role: 'admin' }, JWT_SECRET, { expiresIn: '8h' }); }
function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}
function requireAdmin(req, res, next) {
  try { req.admin = jwt.verify(getCookie(req, 'sammollo_admin'), JWT_SECRET); next(); }
  catch { res.status(401).json({ message: 'Session administrateur invalide ou expirée.' }); }
}
async function audit(req, action, entityType = null, entityId = null) {
  try { await query('INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,ip_address) VALUES(?,?,?,?,?)', [req.admin?.sub || null, action, entityType, entityId ? String(entityId) : null, req.ip]); }
  catch (e) { console.error('audit:', e.message); }
}

app.get('/api/health', async (_req, res) => {
  try { const info = await testConnection(); res.json({ ok: true, database: info.db_name, engine: 'mysql' }); }
  catch { res.status(503).json({ ok: false, database: 'unavailable' }); }
});

app.get('/api/menu', async (_req, res) => {
  try {
    const { rows } = await query(`SELECT m.id,m.name,m.slug,m.description,m.price,m.old_price,m.image_path,m.available,m.featured,m.badge,c.name AS category,c.slug AS category_slug
      FROM menu_items m JOIN categories c ON c.id=m.category_id WHERE c.active=1 ORDER BY c.sort_order,m.featured DESC,m.sort_order,m.id`);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Impossible de charger le menu.' }); }
});

app.get('/api/events', async (_req, res) => {
  try {
    const { rows } = await query(`SELECT id,title,slug,summary,image_path,event_date,recurrence_label,featured
      FROM events WHERE status='published' ORDER BY featured DESC, sort_order, COALESCE(event_date, '2999-12-31 00:00:00'), id`);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Impossible de charger les événements.' }); }
});

app.get('/api/settings/public', async (_req, res) => {
  try {
    const { rows } = await query("SELECT setting_key,setting_value FROM site_settings WHERE setting_key IN ('restaurant','opening_hours')");
    const result = {};
    for (const r of rows) {
      try { result[r.setting_key] = JSON.parse(r.setting_value); }
      catch { result[r.setting_key] = r.setting_value; }
    }
    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Impossible de charger les paramètres.' }); }
});

app.post('/api/contact/request-code', contactLimiter, async (req, res) => {
  try {
    const name = cleanText(req.body?.name, 120), email = cleanText(req.body?.email, 180).toLowerCase();
    const subject = cleanText(req.body?.subject, 120), message = cleanText(req.body?.message, 5000);
    if (name.length < 2 || !validEmail(email) || subject.length < 2 || message.length < 10) return res.status(400).json({ message: 'Veuillez compléter correctement tous les champs.' });
    const transport = mailTransport();
    if (!transport) return res.status(503).json({ message: 'Le service email n’est pas encore configuré.' });

    const token = crypto.randomBytes(32).toString('hex');
    const code = String(crypto.randomInt(100000, 1000000));
    await query('DELETE FROM contact_verifications WHERE expires_at < NOW() OR email=?', [email]);
    await query(`INSERT INTO contact_verifications(token,name,email,subject,message,code_hash,expires_at)
      VALUES(?,?,?,?,?,?,DATE_ADD(NOW(), INTERVAL 3 MINUTE))`, [token,name,email,subject,message,hashCode(token, code)]);

    await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'Votre code de vérification — Sammollo',
      text: `Votre code de vérification Sammollo est ${code}. Il expire dans 3 minutes.`,
      html: `<div style="font-family:Arial,sans-serif;background:#f7f3ec;padding:30px"><div style="max-width:540px;margin:auto;background:#fff;padding:28px;border-radius:14px;border-top:4px solid #d79a24"><h2>Sammollo Restaurant</h2><p>Utilisez ce code pour confirmer votre adresse email :</p><div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#b87910;margin:24px 0">${code}</div><p>Ce code expire dans <strong>3 minutes</strong>.</p></div></div>`
    });
    res.json({ token, expiresIn: 180 });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Impossible d’envoyer le code pour le moment.' }); }
});

app.post('/api/contact/verify', contactLimiter, async (req, res) => {
  const conn = await getConnection();
  try {
    const token = cleanText(req.body?.token, 80), code = cleanText(req.body?.code, 6);
    await conn.beginTransaction();
    const [found] = await conn.execute('SELECT * FROM contact_verifications WHERE token=? FOR UPDATE', [token]);
    const rec = found[0];
    if (!rec) { await conn.rollback(); return res.status(400).json({ message: 'Session de vérification invalide ou expirée.' }); }
    if (new Date(rec.expires_at).getTime() <= Date.now()) { await conn.execute('DELETE FROM contact_verifications WHERE token=?', [token]); await conn.commit(); return res.status(400).json({ message: 'Le code a expiré.' }); }
    const attempts = Number(rec.attempts) + 1;
    await conn.execute('UPDATE contact_verifications SET attempts=? WHERE token=?', [attempts, token]);
    if (attempts > 3) { await conn.execute('DELETE FROM contact_verifications WHERE token=?', [token]); await conn.commit(); return res.status(429).json({ message: 'Nombre maximal de tentatives atteint.' }); }
    if (!safeEqualHex(hashCode(token, code), rec.code_hash)) { await conn.commit(); return res.status(400).json({ message: `Code incorrect. ${Math.max(0, 3 - attempts)} tentative(s) restante(s).` }); }

    const [inserted] = await conn.execute('INSERT INTO contact_messages(name,email,subject,message) VALUES(?,?,?,?)', [rec.name,rec.email,rec.subject,rec.message]);
    await conn.execute('DELETE FROM contact_verifications WHERE token=?', [token]);
    await conn.commit();

    const transport = mailTransport();
    if (transport) await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: process.env.RESTAURANT_EMAIL || 'SammolloDEM@gmail.com',
      replyTo: rec.email,
      subject: `Contact site — ${rec.subject}`,
      text: `Nom : ${rec.name}\nEmail : ${rec.email}\nObjet : ${rec.subject}\n\n${rec.message}`,
      html: `<h2>Nouveau message depuis Sammollo</h2><p><strong>Nom :</strong> ${escapeHtml(rec.name)}</p><p><strong>Email :</strong> ${escapeHtml(rec.email)}</p><p><strong>Objet :</strong> ${escapeHtml(rec.subject)}</p><p>${escapeHtml(rec.message).replace(/\n/g,'<br>')}</p>`
    });
    res.json({ ok: true, messageId: inserted.insertId });
  } catch (e) { await conn.rollback().catch(()=>{}); console.error(e); res.status(500).json({ message: 'Le message n’a pas pu être enregistré.' }); }
  finally { conn.release(); }
});

app.post('/api/orders', orderLimiter, async (req, res) => {
  const conn = await getConnection();
  try {
    const customerName = cleanText(req.body?.customerName, 120), customerPhone = cleanText(req.body?.customerPhone, 40);
    const customerEmail = cleanText(req.body?.customerEmail, 180).toLowerCase();
    const orderType = ['pickup','dine_in'].includes(req.body?.orderType) ? req.body.orderType : 'pickup';
    const notes = cleanText(req.body?.notes, 1000), items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 30) : [];
    if (customerName.length < 2 || customerPhone.length < 6 || !items.length) return res.status(400).json({ message: 'Informations de commande incomplètes.' });
    if (customerEmail && !validEmail(customerEmail)) return res.status(400).json({ message: 'Adresse email invalide.' });

    const normalized = items.map(x => ({ id: Number(x.id), qty: Math.min(20, Math.max(1, Number(x.qty) || 1)) })).filter(x => Number.isInteger(x.id) && x.id > 0);
    const ids = [...new Set(normalized.map(x => x.id))];
    if (!ids.length) return res.status(400).json({ message: 'Panier invalide.' });
    const placeholders = ids.map(() => '?').join(',');
    const [dbItems] = await conn.execute(`SELECT id,name,price,available FROM menu_items WHERE id IN (${placeholders})`, ids);
    const byId = new Map(dbItems.map(x => [Number(x.id), x]));
    const lines = normalized.map(x => ({ ...x, item: byId.get(x.id) })).filter(x => Number(x.item?.available) === 1);
    if (!lines.length || lines.length !== normalized.length) return res.status(400).json({ message: 'Un ou plusieurs articles ne sont plus disponibles.' });
    const subtotal = lines.reduce((s,x) => s + Number(x.item.price) * x.qty, 0), total = subtotal, publicId = randomUUID();

    await conn.beginTransaction();
    const [orderResult] = await conn.execute(`INSERT INTO orders(public_id,customer_name,customer_email,customer_phone,order_type,subtotal,total,notes)
      VALUES(?,?,?,?,?,?,?,?)`, [publicId,customerName,customerEmail || null,customerPhone,orderType,subtotal,total,notes || null]);
    for (const line of lines) await conn.execute(`INSERT INTO order_items(order_id,menu_item_id,item_name,unit_price,quantity,line_total) VALUES(?,?,?,?,?,?)`,
      [orderResult.insertId,line.item.id,line.item.name,line.item.price,line.qty,Number(line.item.price)*line.qty]);
    await conn.commit();
    const [saved] = await conn.execute('SELECT id,public_id,status,payment_status,total,created_at FROM orders WHERE id=?', [orderResult.insertId]);
    try {
      const transport = mailTransport();
      if (transport && process.env.RESTAURANT_EMAIL) await transport.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to: process.env.RESTAURANT_EMAIL,
        subject: `Nouvelle commande SAMMOLLO — ${publicId.slice(0,8).toUpperCase()}`,
        text: `Nouvelle commande de ${customerName}. Total : ${total} DA. Téléphone : ${customerPhone}.`,
        html: `<h2>Nouvelle commande SAMMOLLO</h2><p><strong>Référence :</strong> ${escapeHtml(publicId.slice(0,8).toUpperCase())}</p><p><strong>Client :</strong> ${escapeHtml(customerName)}</p><p><strong>Téléphone :</strong> ${escapeHtml(customerPhone)}</p><p><strong>Total :</strong> ${total} DA</p>`
      });
    } catch (mailError) { console.error('Notification nouvelle commande:', mailError.message); }
    res.status(201).json(saved[0]);
  } catch (e) { await conn.rollback().catch(()=>{}); console.error(e); res.status(500).json({ message: 'Impossible de créer la commande.' }); }
  finally { conn.release(); }
});


app.get('/api/orders/:publicId/status', async (req, res) => {
  try {
    const publicId = cleanText(req.params.publicId, 36);
    const { rows } = await query('SELECT public_id,status,payment_status,total,created_at FROM orders WHERE public_id=? LIMIT 1', [publicId]);
    if (!rows[0]) return res.status(404).json({ message: 'Commande introuvable.' });
    res.json(rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Impossible de vérifier la commande.' }); }
});

app.post('/api/orders/:publicId/checkout', orderLimiter, async (req, res) => {
  try {
    const publicId = cleanText(req.params.publicId, 36);
    const { rows } = await query('SELECT id,public_id,total,payment_status,status FROM orders WHERE public_id=? LIMIT 1', [publicId]);
    const order = rows[0];
    if (!order) return res.status(404).json({ message: 'Commande introuvable.' });
    if (order.status === 'cancelled') return res.status(409).json({ message: 'Cette commande a été annulée.' });
    if (order.payment_status === 'paid') return res.status(409).json({ message: 'Cette commande est déjà payée.' });

    const cfg = chargilyConfig();
    if (!cfg.key) return res.status(503).json({ message: 'Le paiement en ligne n’est pas encore configuré.' });

    const base = appBaseUrl(req);
    const response = await fetch(`${cfg.baseUrl}/checkouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        amount: Number(order.total),
        currency: 'dzd',
        success_url: `${base}/menu.html?payment=success&order=${encodeURIComponent(order.public_id)}`,
        failure_url: `${base}/menu.html?payment=failed&order=${encodeURIComponent(order.public_id)}`,
        webhook_endpoint: `${base}/api/payments/chargily/webhook`,
        description: `Commande SAMMOLLO ${order.public_id.slice(0, 8).toUpperCase()}`,
        locale: 'fr'
      })
    });
    const checkout = await response.json().catch(()=>({}));
    if (!response.ok || !checkout.id || !checkout.checkout_url) {
      console.error('Chargily checkout:', response.status, checkout);
      return res.status(502).json({ message: 'Impossible de démarrer le paiement en ligne.' });
    }

    await query(`UPDATE orders SET payment_status='pending',payment_provider='chargily',payment_reference=?,updated_at=NOW() WHERE id=?`, [checkout.id, order.id]);
    await query(`INSERT INTO payments(order_id,provider,provider_reference,amount,currency,status,raw_metadata)
      VALUES(?,?,?,?,?,'pending',?)`, [order.id,'chargily',checkout.id,Number(order.total),'DZD',JSON.stringify({ mode: cfg.mode })]);

    res.json({ checkoutUrl: checkout.checkout_url, checkoutId: checkout.id, mode: cfg.mode });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Impossible de démarrer le paiement en ligne.' }); }
});

app.post('/api/payments/chargily/webhook', async (req, res) => {
  try {
    const cfg = chargilyConfig();
    const signature = req.get('signature') || '';
    if (!verifyChargilySignature(req.rawBody, signature, cfg.key)) return res.status(403).json({ message: 'Signature invalide.' });

    const event = req.body || {};
    const checkout = event.data || {};
    const checkoutId = cleanText(checkout.id, 180);
    if (!checkoutId) return res.status(400).json({ message: 'Événement invalide.' });

    const { rows } = await query(`SELECT p.id AS payment_id,p.order_id,p.amount,o.total,o.payment_status,o.public_id
      FROM payments p JOIN orders o ON o.id=p.order_id
      WHERE p.provider='chargily' AND p.provider_reference=? ORDER BY p.id DESC LIMIT 1`, [checkoutId]);
    const rec = rows[0];
    if (!rec) return res.status(200).json({ ok: true, ignored: true });

    const type = String(event.type || '');
    let paymentStatus = null;
    if (type === 'checkout.paid') paymentStatus = 'paid';
    else if (type === 'checkout.failed' || type === 'checkout.canceled' || type === 'checkout.cancelled') paymentStatus = 'failed';
    if (!paymentStatus) return res.status(200).json({ ok: true, ignored: true });

    if (paymentStatus === 'paid' && Number(checkout.amount) !== Number(rec.total)) {
      console.error('Chargily amount mismatch', { checkoutId, received: checkout.amount, expected: rec.total });
      return res.status(409).json({ message: 'Montant incohérent.' });
    }

    const conn = await getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE payments SET status=?,raw_metadata=?,updated_at=NOW() WHERE id=?', [paymentStatus, JSON.stringify(event), rec.payment_id]);
      await conn.execute('UPDATE orders SET payment_status=?,updated_at=NOW() WHERE id=?', [paymentStatus, rec.order_id]);
      if (paymentStatus === 'paid') {
        const receiptNumber = `SAM-${String(rec.public_id).replace(/-/g,'').slice(0,12).toUpperCase()}`;
        await conn.execute(`INSERT INTO receipts(order_id,receipt_number,total,currency) VALUES(?,?,?,'DZD')
          ON DUPLICATE KEY UPDATE total=VALUES(total)`, [rec.order_id, receiptNumber, Number(rec.total)]);
      }
      await conn.commit();
    } catch (e) { await conn.rollback().catch(()=>{}); throw e; }
    finally { conn.release(); }

    res.json({ ok: true });
  } catch (e) { console.error('Chargily webhook:', e); res.status(500).json({ message: 'Webhook non traité.' }); }
});

app.post('/api/admin/login', loginLimiter, async (req, res) => {
  try {
    const email = cleanText(req.body?.email, 180).toLowerCase(), password = String(req.body?.password || '');
    const { rows } = await query('SELECT * FROM admins WHERE email=? AND active=1 LIMIT 1', [email]);
    const admin = rows[0];
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) return res.status(401).json({ message: 'Identifiants invalides.' });
    await query('UPDATE admins SET last_login_at=NOW() WHERE id=?', [admin.id]);
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `sammollo_admin=${encodeURIComponent(signAdmin(admin))}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`);
    res.json({ ok:true, admin: { email: admin.email, displayName: admin.display_name } });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Connexion impossible.' }); }
});

app.post('/api/admin/logout', requireAdmin, async (req, res) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sammollo_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
  await audit(req, 'auth.logout'); res.json({ ok:true });
});

app.get('/api/admin/dashboard', requireAdmin, async (_req, res) => {
  const [messages, pendingOrders, todayOrders, revenue, items, paidPayments, confirmedOrders] = await Promise.all([
    query("SELECT COUNT(*) AS count FROM contact_messages WHERE status='new'"),
    query("SELECT COUNT(*) AS count FROM orders WHERE status='pending'"),
    query('SELECT COUNT(*) AS count FROM orders WHERE DATE(created_at)=CURDATE()'),
    query("SELECT COALESCE(SUM(total),0) AS total FROM orders WHERE payment_status='paid' AND DATE(updated_at)=CURDATE()"),
    query('SELECT COUNT(*) AS count FROM menu_items WHERE available=1'),
    query("SELECT COUNT(*) AS count FROM payments WHERE status='paid' AND DATE(updated_at)=CURDATE()"),
    query("SELECT COUNT(*) AS count FROM orders WHERE status IN ('confirmed','preparing','ready')")
  ]);
  res.json({
    newMessages: Number(messages.rows[0].count),
    pendingOrders: Number(pendingOrders.rows[0].count),
    todayOrders: Number(todayOrders.rows[0].count),
    todayRevenue: Number(revenue.rows[0].total),
    availableItems: Number(items.rows[0].count),
    paidPayments: Number(paidPayments.rows[0].count),
    activeOrders: Number(confirmedOrders.rows[0].count)
  });
});

app.get('/api/admin/messages', requireAdmin, async (_req, res) => {
  const { rows } = await query('SELECT id,name,email,subject,message,status,created_at,updated_at FROM contact_messages ORDER BY created_at DESC LIMIT 100');
  res.json(rows);
});
app.patch('/api/admin/messages/:id/status', requireAdmin, async (req, res) => {
  const allowed = ['new','read','replied','archived'];
  if (!allowed.includes(req.body?.status)) return res.status(400).json({ message: 'Statut invalide.' });
  const r = await query('UPDATE contact_messages SET status=?,updated_at=NOW() WHERE id=?', [req.body.status, req.params.id]);
  if (!r.rowCount) return res.status(404).json({ message: 'Message introuvable.' });
  await audit(req, 'message.status.update', 'contact_message', req.params.id);
  res.json({ id:Number(req.params.id), status:req.body.status });
});

app.get('/api/admin/orders', requireAdmin, async (_req, res) => {
  const { rows } = await query(`SELECT id,public_id,customer_name,customer_email,customer_phone,order_type,status,payment_status,payment_provider,total,notes,created_at,updated_at
    FROM orders ORDER BY created_at DESC LIMIT 100`);
  res.json(rows);
});
app.get('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  const { rows } = await query('SELECT * FROM orders WHERE id=? LIMIT 1', [req.params.id]);
  const order = rows[0];
  if (!order) return res.status(404).json({ message: 'Commande introuvable.' });
  const [items, payments, receipt] = await Promise.all([
    query('SELECT id,item_name,unit_price,quantity,line_total FROM order_items WHERE order_id=? ORDER BY id', [req.params.id]),
    query('SELECT id,provider,provider_reference,amount,currency,status,created_at,updated_at FROM payments WHERE order_id=? ORDER BY created_at DESC', [req.params.id]),
    query('SELECT receipt_number,total,currency,issued_at FROM receipts WHERE order_id=? LIMIT 1', [req.params.id])
  ]);
  res.json({ ...order, items: items.rows, payments: payments.rows, receipt: receipt.rows[0] || null });
});

app.patch('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
  const allowed = ['pending','confirmed','preparing','ready','completed','cancelled'];
  const status = req.body?.status;
  if (!allowed.includes(status)) return res.status(400).json({ message: 'Statut invalide.' });
  const { rows } = await query('SELECT id,public_id,customer_name,customer_email,status FROM orders WHERE id=? LIMIT 1', [req.params.id]);
  const order = rows[0];
  if (!order) return res.status(404).json({ message: 'Commande introuvable.' });
  await query('UPDATE orders SET status=?,updated_at=NOW() WHERE id=?', [status, req.params.id]);
  await audit(req, 'order.status.update', 'order', req.params.id);

  const notify = {
    confirmed: ['Commande confirmée', 'Votre commande a été confirmée par SAMMOLLO.'],
    preparing: ['Commande en préparation', 'Votre commande est maintenant en préparation.'],
    ready: ['Commande prête', 'Votre commande est prête.'],
    completed: ['Commande terminée', 'Votre commande a été marquée comme terminée. Merci pour votre confiance.'],
    cancelled: ['Commande annulée', 'Votre commande a été annulée. Vous pouvez contacter SAMMOLLO pour plus d’informations.']
  }[status];
  if (notify && order.customer_email) {
    try {
      const transport = mailTransport();
      if (transport) await transport.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to: order.customer_email,
        subject: `${notify[0]} — SAMMOLLO`,
        text: `${notify[1]}
Référence : ${String(order.public_id).slice(0,8).toUpperCase()}`,
        html: `<div style="font-family:Arial,sans-serif;background:#f7f3ec;padding:28px"><div style="max-width:560px;margin:auto;background:#fff;padding:26px;border-radius:14px;border-top:4px solid #d79a24"><h2>SAMMOLLO Restaurant</h2><p>${escapeHtml(notify[1])}</p><p><strong>Référence :</strong> ${escapeHtml(String(order.public_id).slice(0,8).toUpperCase())}</p></div></div>`
      });
    } catch (e) { console.error('Notification commande:', e.message); }
  }
  res.json({ id:Number(req.params.id), status });
});

app.get('/api/admin/payments', requireAdmin, async (_req, res) => {
  const { rows } = await query(`SELECT p.id,p.provider,p.provider_reference,p.amount,p.currency,p.status,p.created_at,p.updated_at,
      o.id AS order_id,o.public_id,o.customer_name,o.customer_phone
    FROM payments p JOIN orders o ON o.id=p.order_id
    ORDER BY p.created_at DESC LIMIT 150`);
  res.json(rows);
});

app.patch('/api/admin/menu/:id', requireAdmin, async (req, res) => {
  const name=cleanText(req.body?.name,120), description=cleanText(req.body?.description,2000), price=Number(req.body?.price);
  const available=req.body?.available?1:0, featured=req.body?.featured?1:0, badge=cleanText(req.body?.badge,40)||null;
  if(name.length<2||!Number.isInteger(price)||price<0) return res.status(400).json({message:'Données produit invalides.'});
  const r=await query('UPDATE menu_items SET name=?,description=?,price=?,available=?,featured=?,badge=?,updated_at=NOW() WHERE id=?',[name,description,price,available,featured,badge,req.params.id]);
  if(!r.rowCount) return res.status(404).json({message:'Produit introuvable.'});
  const {rows}=await query('SELECT * FROM menu_items WHERE id=?',[req.params.id]); await audit(req,'menu.update','menu_item',req.params.id); res.json(rows[0]);
});

app.post('/api/admin/menu', requireAdmin, async (req,res)=>{
  const categoryId=Number(req.body?.categoryId), name=cleanText(req.body?.name,120), description=cleanText(req.body?.description,2000), price=Number(req.body?.price);
  const imagePath=cleanText(req.body?.imagePath,500)||null, badge=cleanText(req.body?.badge,40)||null;
  const slug=cleanText(req.body?.slug,140).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'');
  if(!Number.isInteger(categoryId)||!name||!slug||!Number.isInteger(price)||price<0) return res.status(400).json({message:'Données produit invalides.'});
  try { const r=await query(`INSERT INTO menu_items(category_id,name,slug,description,price,image_path,available,featured,badge) VALUES(?,?,?,?,?,?,?,?,?)`,[categoryId,name,slug,description,price,imagePath,req.body?.available!==false?1:0,req.body?.featured?1:0,badge]); const {rows}=await query('SELECT * FROM menu_items WHERE id=?',[r.insertId]); await audit(req,'menu.create','menu_item',r.insertId); res.status(201).json(rows[0]); }
  catch(e){ if(e.code==='ER_DUP_ENTRY') return res.status(409).json({message:'Ce slug existe déjà.'}); console.error(e); res.status(500).json({message:'Création impossible.'}); }
});
app.delete('/api/admin/menu/:id', requireAdmin, async (req,res)=>{ const r=await query('DELETE FROM menu_items WHERE id=?',[req.params.id]); if(!r.rowCount)return res.status(404).json({message:'Produit introuvable.'}); await audit(req,'menu.delete','menu_item',req.params.id); res.json({ok:true}); });
app.get('/api/admin/categories', requireAdmin, async (_req,res)=>{ const {rows}=await query('SELECT id,name,slug,sort_order,active FROM categories ORDER BY sort_order,id'); res.json(rows); });
app.get('/api/admin/events', requireAdmin, async (_req,res)=>{ const {rows}=await query('SELECT * FROM events ORDER BY sort_order,created_at DESC'); res.json(rows); });

app.post('/api/admin/events', requireAdmin, async (req,res)=>{
  const title=cleanText(req.body?.title,140), summary=cleanText(req.body?.summary,3000), imagePath=cleanText(req.body?.imagePath,500)||null, recurrence=cleanText(req.body?.recurrenceLabel,120)||null;
  const slug=cleanText(req.body?.slug,160).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,''); if(!title||!slug)return res.status(400).json({message:'Titre et slug obligatoires.'});
  try { const r=await query('INSERT INTO events(title,slug,summary,image_path,event_date,recurrence_label,status,featured) VALUES(?,?,?,?,?,?,?,?)',[title,slug,summary,imagePath,req.body?.eventDate||null,recurrence,['draft','published','archived'].includes(req.body?.status)?req.body.status:'published',req.body?.featured?1:0]); const {rows}=await query('SELECT * FROM events WHERE id=?',[r.insertId]); await audit(req,'event.create','event',r.insertId); res.status(201).json(rows[0]); }
  catch(e){ if(e.code==='ER_DUP_ENTRY') return res.status(409).json({message:'Cet événement existe déjà.'}); console.error(e); res.status(500).json({message:'Création impossible.'}); }
});
app.patch('/api/admin/events/:id', requireAdmin, async (req,res)=>{
  const title=cleanText(req.body?.title,140), summary=cleanText(req.body?.summary,3000), imagePath=cleanText(req.body?.imagePath,500)||null; if(!title)return res.status(400).json({message:'Titre obligatoire.'});
  const status=['draft','published','archived'].includes(req.body?.status)?req.body.status:'published'; const r=await query('UPDATE events SET title=?,summary=?,image_path=?,event_date=?,recurrence_label=?,status=?,featured=?,updated_at=NOW() WHERE id=?',[title,summary,imagePath,req.body?.eventDate||null,cleanText(req.body?.recurrenceLabel,120)||null,status,req.body?.featured?1:0,req.params.id]);
  if(!r.rowCount)return res.status(404).json({message:'Événement introuvable.'}); const {rows}=await query('SELECT * FROM events WHERE id=?',[req.params.id]); await audit(req,'event.update','event',req.params.id); res.json(rows[0]);
});
app.delete('/api/admin/events/:id', requireAdmin, async (req,res)=>{ const r=await query('DELETE FROM events WHERE id=?',[req.params.id]); if(!r.rowCount)return res.status(404).json({message:'Événement introuvable.'}); await audit(req,'event.delete','event',req.params.id); res.json({ok:true}); });

app.use('/api', (_req,res)=>res.status(404).json({message:'Endpoint introuvable.'}));

async function bootstrap(){
  try {
    const dbInfo=await testConnection(); console.log(`[MySQL] connecté à ${dbInfo.db_name}`);
    if(process.env.ADMIN_EMAIL&&process.env.ADMIN_PASSWORD){
      const hash=await bcrypt.hash(process.env.ADMIN_PASSWORD,12);
      await query(`INSERT INTO admins(email,password_hash,display_name,active) VALUES(?,?,?,1)
        ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash),display_name=VALUES(display_name),active=1,updated_at=NOW()`,[process.env.ADMIN_EMAIL.toLowerCase(),hash,process.env.ADMIN_NAME||'Administration Sammollo']);
    }
    app.listen(PORT,()=>console.log(`Sammollo Restaurant : http://localhost:${PORT}`));
  } catch(err){ console.error('[Démarrage] impossible de lancer le serveur :',err.message); console.error('Vérifiez DB_HOST, DB_PORT, DB_USER, DB_PASSWORD et DB_NAME dans .env, puis importez database/database.sql dans phpMyAdmin.'); process.exit(1); }
}
bootstrap();
