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
const { put, del } = require('@vercel/blob');
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
const orderCodeLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 6, standardHeaders: true, legacyHeaders: false });
const adminReplyLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()); }
function cleanText(v, max) { return String(v || '').trim().replace(/\0/g, '').slice(0, max); }
function asBool(v, fallback = true) { if (typeof v === 'boolean') return v; if (v === 0 || v === '0' || v === 'false') return false; if (v === 1 || v === '1' || v === 'true') return true; return fallback; }
function safeHttpUrl(v, max = 1200) { const s = cleanText(v, max); if (!s) return ''; try { const u = new URL(s); return ['http:','https:'].includes(u.protocol) ? u.toString() : ''; } catch { return ''; } }
function parseSettingValue(value, fallback = {}) { try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : fallback; } catch { return fallback; } }
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
    res.setHeader('Cache-Control', 'no-store');
    const { rows } = await query("SELECT setting_key,setting_value FROM site_settings WHERE setting_key IN ('restaurant','opening_hours','contact')");
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

app.post('/api/orders/request-code', orderCodeLimiter, async (req, res) => {
  const conn = await getConnection();
  try {
    const customerName = cleanText(req.body?.customerName, 120);
    const customerPhone = cleanText(req.body?.customerPhone, 40).replace(/\D/g, '');
    const customerEmail = cleanText(req.body?.customerEmail, 180).toLowerCase();
    const orderType = ['pickup','dine_in'].includes(req.body?.orderType) ? req.body.orderType : 'pickup';
    const notes = cleanText(req.body?.notes, 1000);
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 30) : [];

    if (customerName.length < 2 || !items.length) {
      return res.status(400).json({ message: 'Informations de commande incomplètes.' });
    }
    if (!/^0[5-7]\d{8}$/.test(customerPhone)) {
      return res.status(400).json({ message: 'Numéro algérien invalide. Utilisez 10 chiffres commençant par 05, 06 ou 07.' });
    }
    if (!validEmail(customerEmail)) {
      return res.status(400).json({ message: 'Une adresse email valide est obligatoire pour confirmer la commande.' });
    }

    const normalized = items
      .map(x => ({
        id: Number(x.id),
        qty: Math.min(20, Math.max(1, Number(x.qty) || 1))
      }))
      .filter(x => Number.isInteger(x.id) && x.id > 0);

    const ids = [...new Set(normalized.map(x => x.id))];
    if (!ids.length) {
      return res.status(400).json({ message: 'Panier invalide.' });
    }

    const placeholders = ids.map(() => '?').join(',');
    const [dbItems] = await conn.execute(
      `SELECT id,name,price,available FROM menu_items WHERE id IN (${placeholders})`,
      ids
    );
    const byId = new Map(dbItems.map(x => [Number(x.id), x]));
    const lines = normalized
      .map(x => ({ ...x, item: byId.get(x.id) }))
      .filter(x => Number(x.item?.available) === 1);

    if (!lines.length || lines.length !== normalized.length) {
      return res.status(400).json({ message: 'Un ou plusieurs articles ne sont plus disponibles.' });
    }

    const transport = mailTransport();
    if (!transport) {
      return res.status(503).json({ message: 'Le service email n’est pas encore configuré.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const code = String(crypto.randomInt(100000, 1000000));
    const payload = {
      customerName,
      customerPhone,
      customerEmail,
      orderType,
      notes,
      items: normalized
    };

    await query(
      'DELETE FROM order_verifications WHERE expires_at < NOW() OR email=?',
      [customerEmail]
    );

    await query(
      `INSERT INTO order_verifications(token,email,payload_json,code_hash,expires_at)
       VALUES(?,?,?,?,DATE_ADD(NOW(), INTERVAL 3 MINUTE))`,
      [token, customerEmail, JSON.stringify(payload), hashCode(token, code)]
    );

    await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: customerEmail,
      subject: 'Confirmez votre commande — SAMMOLLO',
      text: `Votre code de confirmation SAMMOLLO est ${code}. Il expire dans 3 minutes.`,
      html: `<div style="font-family:Arial,sans-serif;background:#f7f3ec;padding:30px">
        <div style="max-width:540px;margin:auto;background:#fff;padding:28px;border-radius:14px;border-top:4px solid #d79a24">
          <h2 style="margin:0 0 10px">SAMMOLLO Restaurant</h2>
          <p>Utilisez ce code pour confirmer votre commande :</p>
          <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#b87910;margin:24px 0">${code}</div>
          <p>Ce code expire dans <strong>3 minutes</strong>.</p>
          <p style="font-size:12px;color:#777">Si vous n’avez pas passé de commande, ignorez cet email.</p>
        </div>
      </div>`
    });

    res.json({
      token,
      expiresIn: 180,
      emailHint: customerEmail.replace(/^(.{1,2}).*(@.*)$/, '$1••••$2')
    });
  } catch (e) {
    console.error('Envoi code commande:', e);
    res.status(500).json({ message: 'Impossible d’envoyer le code de confirmation pour le moment.' });
  } finally {
    conn.release();
  }
});

app.post('/api/orders/verify', orderLimiter, async (req, res) => {
  const conn = await getConnection();
  let savedOrder = null;
  let customer = null;

  try {
    const token = cleanText(req.body?.token, 80);
    const code = cleanText(req.body?.code, 6);

    if (!token || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: 'Code de confirmation invalide.' });
    }

    await conn.beginTransaction();

    const [found] = await conn.execute(
      'SELECT * FROM order_verifications WHERE token=? FOR UPDATE',
      [token]
    );
    const rec = found[0];

    if (!rec) {
      await conn.rollback();
      return res.status(400).json({ message: 'Session de vérification invalide ou expirée.' });
    }

    if (new Date(rec.expires_at).getTime() <= Date.now()) {
      await conn.execute('DELETE FROM order_verifications WHERE token=?', [token]);
      await conn.commit();
      return res.status(400).json({ message: 'Le code a expiré. Demandez un nouveau code.' });
    }

    const attempts = Number(rec.attempts) + 1;
    await conn.execute(
      'UPDATE order_verifications SET attempts=? WHERE token=?',
      [attempts, token]
    );

    if (attempts > 3) {
      await conn.execute('DELETE FROM order_verifications WHERE token=?', [token]);
      await conn.commit();
      return res.status(429).json({ message: 'Nombre maximal de tentatives atteint. Demandez un nouveau code.' });
    }

    if (!safeEqualHex(hashCode(token, code), rec.code_hash)) {
      await conn.commit();
      return res.status(400).json({
        message: `Code incorrect. ${Math.max(0, 3 - attempts)} tentative(s) restante(s).`
      });
    }

    let payload;
    try {
      payload = JSON.parse(rec.payload_json);
    } catch {
      await conn.rollback();
      return res.status(400).json({ message: 'Commande temporaire invalide.' });
    }

    const customerName = cleanText(payload.customerName, 120);
    const customerPhone = cleanText(payload.customerPhone, 40).replace(/\D/g, '');
    const customerEmail = cleanText(payload.customerEmail, 180).toLowerCase();
    const orderType = ['pickup','dine_in'].includes(payload.orderType) ? payload.orderType : 'pickup';
    const notes = cleanText(payload.notes, 1000);
    const normalized = Array.isArray(payload.items)
      ? payload.items.slice(0, 30)
          .map(x => ({
            id: Number(x.id),
            qty: Math.min(20, Math.max(1, Number(x.qty) || 1))
          }))
          .filter(x => Number.isInteger(x.id) && x.id > 0)
      : [];

    if (
      customerName.length < 2 ||
      !/^0[5-7]\d{8}$/.test(customerPhone) ||
      !validEmail(customerEmail) ||
      !normalized.length ||
      customerEmail !== String(rec.email).toLowerCase()
    ) {
      await conn.rollback();
      return res.status(400).json({ message: 'Informations de commande invalides.' });
    }

    const ids = [...new Set(normalized.map(x => x.id))];
    const placeholders = ids.map(() => '?').join(',');
    const [dbItems] = await conn.execute(
      `SELECT id,name,price,available FROM menu_items WHERE id IN (${placeholders})`,
      ids
    );

    const byId = new Map(dbItems.map(x => [Number(x.id), x]));
    const lines = normalized
      .map(x => ({ ...x, item: byId.get(x.id) }))
      .filter(x => Number(x.item?.available) === 1);

    if (!lines.length || lines.length !== normalized.length) {
      await conn.rollback();
      return res.status(400).json({ message: 'Un ou plusieurs articles ne sont plus disponibles.' });
    }

    const subtotal = lines.reduce(
      (sum, x) => sum + Number(x.item.price) * x.qty,
      0
    );
    const total = subtotal;
    const publicId = randomUUID();

    const [orderResult] = await conn.execute(
      `INSERT INTO orders(
        public_id,customer_name,customer_email,customer_phone,
        order_type,subtotal,total,notes
      ) VALUES(?,?,?,?,?,?,?,?)`,
      [
        publicId,
        customerName,
        customerEmail,
        customerPhone,
        orderType,
        subtotal,
        total,
        notes || null
      ]
    );

    for (const line of lines) {
      await conn.execute(
        `INSERT INTO order_items(
          order_id,menu_item_id,item_name,unit_price,quantity,line_total
        ) VALUES(?,?,?,?,?,?)`,
        [
          orderResult.insertId,
          line.item.id,
          line.item.name,
          line.item.price,
          line.qty,
          Number(line.item.price) * line.qty
        ]
      );
    }

    await conn.execute(
      'DELETE FROM order_verifications WHERE token=?',
      [token]
    );

    const [saved] = await conn.execute(
      'SELECT id,public_id,status,payment_status,total,created_at FROM orders WHERE id=?',
      [orderResult.insertId]
    );

    await conn.commit();

    savedOrder = saved[0];
    customer = {
      name: customerName,
      email: customerEmail,
      phone: customerPhone,
      total
    };
  } catch (e) {
    await conn.rollback().catch(() => {});
    console.error('Validation commande:', e);
    return res.status(500).json({ message: 'Impossible de confirmer la commande.' });
  } finally {
    conn.release();
  }

  try {
    const transport = mailTransport();
    if (transport && savedOrder) {
      if (process.env.RESTAURANT_EMAIL) {
        await transport.sendMail({
          from: process.env.MAIL_FROM || process.env.SMTP_USER,
          to: process.env.RESTAURANT_EMAIL,
          replyTo: customer.email,
          subject: `Nouvelle commande SAMMOLLO — ${savedOrder.public_id.slice(0,8).toUpperCase()}`,
          text: `Nouvelle commande de ${customer.name}. Total : ${customer.total} DA. Téléphone : ${customer.phone}.`,
          html: `<h2>Nouvelle commande SAMMOLLO</h2>
            <p><strong>Référence :</strong> ${escapeHtml(savedOrder.public_id.slice(0,8).toUpperCase())}</p>
            <p><strong>Client :</strong> ${escapeHtml(customer.name)}</p>
            <p><strong>Email vérifié :</strong> ${escapeHtml(customer.email)}</p>
            <p><strong>Téléphone :</strong> ${escapeHtml(customer.phone)}</p>
            <p><strong>Total :</strong> ${customer.total} DA</p>`
        });
      }
    }
  } catch (mailError) {
    console.error('Notification nouvelle commande:', mailError.message);
  }

  res.status(201).json(savedOrder);
});

// L'ancien endpoint direct est volontairement bloqué :
// une commande doit désormais être confirmée par email.
app.post('/api/orders', orderLimiter, (_req, res) => {
  res.status(400).json({
    message: 'La vérification de l’adresse email est obligatoire avant l’enregistrement de la commande.'
  });
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


// ======================================================
// ADMIN — PROFIL
// ======================================================
app.get('/api/admin/profile', requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id,email,display_name,last_login_at,created_at
       FROM admins
       WHERE id=? AND active=1
       LIMIT 1`,
      [req.admin.sub]
    );

    const admin = rows[0];
    if (!admin) {
      return res.status(404).json({ message: 'Administrateur introuvable.' });
    }

    res.json({
      id: admin.id,
      email: admin.email,
      displayName: admin.display_name,
      lastLoginAt: admin.last_login_at,
      createdAt: admin.created_at
    });
  } catch (e) {
    console.error('Profil admin:', e);
    res.status(500).json({ message: 'Impossible de charger le profil.' });
  }
});

app.patch('/api/admin/profile', requireAdmin, async (req, res) => {
  try {
    const displayName = cleanText(req.body?.displayName, 100);
    const email = cleanText(req.body?.email, 180).toLowerCase();
    const currentPassword = String(req.body?.currentPassword || '');

    if (!displayName || !validEmail(email)) {
      return res.status(400).json({ message: 'Le nom et une adresse email valide sont obligatoires.' });
    }

    const { rows } = await query(
      `SELECT id,email,password_hash
       FROM admins
       WHERE id=? AND active=1
       LIMIT 1`,
      [req.admin.sub]
    );

    const admin = rows[0];
    if (!admin) {
      return res.status(404).json({ message: 'Administrateur introuvable.' });
    }

    if (email !== String(admin.email).toLowerCase()) {
      if (!currentPassword) {
        return res.status(400).json({
          message: 'Saisissez votre mot de passe actuel pour changer l’adresse email.'
        });
      }

      const ok = await bcrypt.compare(currentPassword, admin.password_hash);
      if (!ok) {
        return res.status(401).json({ message: 'Mot de passe actuel incorrect.' });
      }

      const duplicate = await query(
        'SELECT id FROM admins WHERE email=? AND id<>? LIMIT 1',
        [email, req.admin.sub]
      );
      if (duplicate.rows.length) {
        return res.status(409).json({ message: 'Cette adresse email est déjà utilisée.' });
      }
    }

    await query(
      `UPDATE admins
       SET display_name=?,email=?,updated_at=NOW()
       WHERE id=?`,
      [displayName, email, req.admin.sub]
    );

    await audit(req, 'profile.update', 'admin', req.admin.sub);

    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const token = signAdmin({ id: req.admin.sub, email });
    res.setHeader(
      'Set-Cookie',
      `sammollo_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`
    );

    res.json({
      ok: true,
      admin: { email, displayName }
    });
  } catch (e) {
    console.error('Modification profil admin:', e);
    res.status(500).json({ message: 'Impossible de modifier le profil.' });
  }
});

app.patch('/api/admin/profile/password', requireAdmin, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Tous les champs sont obligatoires.' });
    }
    if (newPassword.length < 12) {
      return res.status(400).json({ message: 'Le nouveau mot de passe doit contenir au moins 12 caractères.' });
    }

    const { rows } = await query(
      `SELECT password_hash
       FROM admins
       WHERE id=? AND active=1
       LIMIT 1`,
      [req.admin.sub]
    );

    const admin = rows[0];
    if (!admin) {
      return res.status(404).json({ message: 'Administrateur introuvable.' });
    }

    const ok = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!ok) {
      return res.status(401).json({ message: 'Mot de passe actuel incorrect.' });
    }

    if (await bcrypt.compare(newPassword, admin.password_hash)) {
      return res.status(400).json({ message: 'Le nouveau mot de passe doit être différent de l’ancien.' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await query(
      `UPDATE admins SET password_hash=?,updated_at=NOW() WHERE id=?`,
      [newHash, req.admin.sub]
    );

    await audit(req, 'profile.password.change', 'admin', req.admin.sub);
    res.json({ ok: true, message: 'Mot de passe modifié avec succès.' });
  } catch (e) {
    console.error('Modification mot de passe admin:', e);
    res.status(500).json({ message: 'Impossible de modifier le mot de passe.' });
  }
});

app.get('/api/admin/dashboard', requireAdmin, async (_req, res) => {
  try {
    const [messages, pendingOrders, todayOrders, items, activeOrders, totalProducts, publishedEvents] = await Promise.all([
      query("SELECT COUNT(*) AS count FROM contact_messages WHERE status='new'"),
      query("SELECT COUNT(*) AS count FROM orders WHERE status='pending'"),
      query('SELECT COUNT(*) AS count FROM orders WHERE DATE(created_at)=CURDATE()'),
      query('SELECT COUNT(*) AS count FROM menu_items WHERE available=1'),
      query("SELECT COUNT(*) AS count FROM orders WHERE status IN ('confirmed','preparing','ready')"),
      query('SELECT COUNT(*) AS count FROM menu_items'),
      query("SELECT COUNT(*) AS count FROM events WHERE status='published'")
    ]);

    res.json({
      newMessages: Number(messages.rows[0].count),
      pendingOrders: Number(pendingOrders.rows[0].count),
      todayOrders: Number(todayOrders.rows[0].count),
      availableItems: Number(items.rows[0].count),
      activeOrders: Number(activeOrders.rows[0].count),
      totalProducts: Number(totalProducts.rows[0].count),
      publishedEvents: Number(publishedEvents.rows[0].count)
    });
  } catch (e) {
    console.error('Dashboard admin:', e);
    res.status(500).json({ message: 'Impossible de charger le tableau de bord.' });
  }
});

app.get('/api/admin/activity', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await query(`SELECT id,action,entity_type,entity_id,created_at
      FROM audit_logs ORDER BY created_at DESC LIMIT 16`);
    res.json(rows);
  } catch (e) {
    console.error('Activité admin:', e);
    res.status(500).json({ message: 'Impossible de charger l’activité récente.' });
  }
});

// ======================================================
// ADMIN — MESSAGES
// ======================================================
app.get('/api/admin/messages', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await query(`SELECT m.id,m.name,m.email,m.subject,m.message,m.status,m.created_at,m.updated_at,
      (SELECT COUNT(*) FROM contact_replies r WHERE r.contact_message_id=m.id) AS reply_count
      FROM contact_messages m ORDER BY m.created_at DESC LIMIT 150`);
    res.json(rows);
  } catch (e) {
    console.error('Messages admin:', e);
    res.status(500).json({ message: 'Impossible de charger les messages.' });
  }
});

app.patch('/api/admin/messages/:id/status', requireAdmin, async (req, res) => {
  const allowed = ['new','read','replied','archived'];
  const status = req.body?.status;
  if (!allowed.includes(status)) return res.status(400).json({ message: 'Statut invalide.' });

  const r = await query(
    'UPDATE contact_messages SET status=?,updated_at=NOW() WHERE id=?',
    [status, req.params.id]
  );
  if (!r.rowCount) return res.status(404).json({ message: 'Message introuvable.' });

  await audit(req, 'message.status.update', 'contact_message', req.params.id);
  res.json({ id: Number(req.params.id), status });
});

app.get('/api/admin/messages/:id/replies', requireAdmin, async (req, res) => {
  try {
    const message = await query('SELECT id FROM contact_messages WHERE id=? LIMIT 1', [req.params.id]);
    if (!message.rows.length) return res.status(404).json({ message: 'Message introuvable.' });

    const { rows } = await query(`SELECT r.id,r.reply_text,r.subject,r.sent_at,r.admin_id,a.display_name AS admin_name
      FROM contact_replies r
      LEFT JOIN admins a ON a.id=r.admin_id
      WHERE r.contact_message_id=?
      ORDER BY r.sent_at ASC,r.id ASC`, [req.params.id]);
    res.json(rows);
  } catch (e) {
    console.error('Historique réponses:', e);
    res.status(500).json({ message: 'Impossible de charger les réponses.' });
  }
});

app.post('/api/admin/messages/:id/reply', adminReplyLimiter, requireAdmin, async (req, res) => {
  try {
    const replyText = cleanText(req.body?.replyText, 5000);
    if (replyText.length < 2) return res.status(400).json({ message: 'Écrivez une réponse avant l’envoi.' });

    const messageResult = await query(
      'SELECT id,name,email,subject FROM contact_messages WHERE id=? LIMIT 1',
      [req.params.id]
    );
    const message = messageResult.rows[0];
    if (!message) return res.status(404).json({ message: 'Message introuvable.' });
    if (!validEmail(message.email)) return res.status(400).json({ message: 'Adresse email du client invalide.' });

    const transport = mailTransport();
    if (!transport) return res.status(503).json({ message: 'Le service email n’est pas configuré.' });

    const subject = `Re: ${cleanText(message.subject || 'Votre message SAMMOLLO', 140)}`;
    const safeName = escapeHtml(message.name || 'Client');
    const safeReply = escapeHtml(replyText).replace(/\n/g, '<br>');

    await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: message.email,
      replyTo: process.env.RESTAURANT_EMAIL || undefined,
      subject,
      text: `Bonjour ${message.name || ''},\n\n${replyText}\n\nSAMMOLLO Restaurant`,
      html: `<div style="font-family:Arial,sans-serif;background:#f6f1e8;padding:28px"><div style="max-width:620px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #eadfc9"><div style="padding:20px 26px;background:#111315;color:#fff"><strong style="font-size:20px;letter-spacing:.08em">SAMMOLLO</strong><div style="color:#d6a33a;font-size:12px;margin-top:4px">Réponse du restaurant</div></div><div style="padding:28px 26px;color:#252525;line-height:1.65"><p>Bonjour <strong>${safeName}</strong>,</p><p>${safeReply}</p><p style="margin-top:28px">Cordialement,<br><strong>SAMMOLLO Restaurant</strong></p></div></div></div>`
    });

    const saved = await query(
      `INSERT INTO contact_replies(contact_message_id,admin_id,recipient_email,subject,reply_text)
       VALUES(?,?,?,?,?)`,
      [message.id, req.admin.sub, message.email, subject, replyText]
    );
    await query("UPDATE contact_messages SET status='replied',updated_at=NOW() WHERE id=?", [message.id]);
    await audit(req, 'message.reply.send', 'contact_message', message.id);

    res.status(201).json({
      ok: true,
      reply: {
        id: saved.insertId,
        reply_text: replyText,
        subject,
        sent_at: new Date().toISOString(),
        admin_id: req.admin.sub
      }
    });
  } catch (e) {
    console.error('Réponse message:', e);
    res.status(500).json({ message: "Impossible d'envoyer la réponse pour le moment." });
  }
});

app.delete('/api/admin/messages/:id', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM contact_replies WHERE contact_message_id=?', [req.params.id]);
    const r = await query('DELETE FROM contact_messages WHERE id=?', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ message: 'Message introuvable.' });
    await audit(req, 'message.delete', 'contact_message', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Suppression message:', e);
    res.status(500).json({ message: 'Impossible de supprimer le message.' });
  }
});

// ======================================================
// ADMIN — CONTACT & INFORMATIONS
// ======================================================
app.get('/api/admin/settings/contact', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await query("SELECT setting_key,setting_value FROM site_settings WHERE setting_key IN ('restaurant','opening_hours','contact')");
    const settings = { restaurant: {}, opening_hours: {}, contact: {} };
    for (const row of rows) settings[row.setting_key] = parseSettingValue(row.setting_value, {});
    res.json({
      restaurant: settings.restaurant,
      openingHours: settings.opening_hours,
      contact: settings.contact
    });
  } catch (e) {
    console.error('Paramètres contact admin:', e);
    res.status(500).json({ message: 'Impossible de charger les informations de contact.' });
  }
});

app.patch('/api/admin/settings/contact', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const currentRows = await query("SELECT setting_key,setting_value FROM site_settings WHERE setting_key IN ('restaurant','opening_hours','contact')");
    const current = { restaurant: {}, opening_hours: {}, contact: {} };
    for (const row of currentRows.rows) current[row.setting_key] = parseSettingValue(row.setting_value, {});

    const email = cleanText(body.email ?? current.contact.email ?? current.restaurant.email, 180).toLowerCase();
    if (!validEmail(email)) return res.status(400).json({ message: 'Adresse email de contact invalide.' });

    const phoneDisplay = cleanText(body.phoneDisplay ?? current.contact.phoneDisplay ?? current.restaurant.phone, 40);
    const phoneHref = cleanText(body.phoneHref ?? current.contact.phoneHref ?? '', 40).replace(/[^+\d]/g, '');
    if (!phoneDisplay || !phoneHref) return res.status(400).json({ message: 'Le téléphone de contact est obligatoire.' });

    const contact = {
      address: cleanText(body.address ?? current.contact.address ?? 'Draâ El Mizan, Tizi-Ouzou, Algérie', 260),
      phoneDisplay,
      phoneHref,
      email,
      mapEmbed: safeHttpUrl(body.mapEmbed ?? current.contact.mapEmbed ?? ''),
      mapUrl: safeHttpUrl(body.mapUrl ?? current.contact.mapUrl ?? ''),
      directionsUrl: safeHttpUrl(body.directionsUrl ?? current.contact.directionsUrl ?? ''),
      facebook: safeHttpUrl(body.facebook ?? current.contact.facebook ?? ''),
      instagram: safeHttpUrl(body.instagram ?? current.contact.instagram ?? ''),
      tiktok: safeHttpUrl(body.tiktok ?? current.contact.tiktok ?? ''),
      showAddress: asBool(body.showAddress, current.contact.showAddress ?? true),
      showPhone: asBool(body.showPhone, current.contact.showPhone ?? true),
      showEmail: asBool(body.showEmail, current.contact.showEmail ?? true),
      showHours: asBool(body.showHours, current.contact.showHours ?? true),
      showSocial: asBool(body.showSocial, current.contact.showSocial ?? true)
    };

    const openingHours = {
      friday: cleanText(body.fridayHours ?? current.opening_hours.friday ?? '14:00-01:00', 80),
      saturday_thursday: cleanText(body.weekHours ?? current.opening_hours.saturday_thursday ?? '08:00-23:00', 80)
    };

    const restaurant = {
      ...current.restaurant,
      phone: phoneDisplay.replace(/\s+/g, ''),
      email,
      city: cleanText(body.city ?? current.restaurant.city ?? 'Draâ El Mizan', 100),
      wilaya: cleanText(body.wilaya ?? current.restaurant.wilaya ?? 'Tizi-Ouzou', 100),
      country: cleanText(body.country ?? current.restaurant.country ?? 'Algérie', 100)
    };

    await query(`INSERT INTO site_settings(setting_key,setting_value) VALUES('contact',?)
      ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_at=NOW()`, [JSON.stringify(contact)]);
    await query(`INSERT INTO site_settings(setting_key,setting_value) VALUES('opening_hours',?)
      ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_at=NOW()`, [JSON.stringify(openingHours)]);
    await query(`INSERT INTO site_settings(setting_key,setting_value) VALUES('restaurant',?)
      ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_at=NOW()`, [JSON.stringify(restaurant)]);

    await audit(req, 'contact.settings.update', 'site_settings', 'contact');
    res.json({ ok: true, restaurant, openingHours, contact });
  } catch (e) {
    console.error('Mise à jour contact admin:', e);
    res.status(500).json({ message: 'Impossible de mettre à jour les informations de contact.' });
  }
});

// ======================================================
// ADMIN — COMMANDES
// ======================================================
app.get('/api/admin/orders', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await query(`SELECT id,public_id,customer_name,customer_email,customer_phone,
      order_type,status,total,notes,created_at,updated_at
      FROM orders ORDER BY created_at DESC LIMIT 150`);
    res.json(rows);
  } catch (e) {
    console.error('Commandes admin:', e);
    res.status(500).json({ message: 'Impossible de charger les commandes.' });
  }
});

app.get('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(`SELECT id,public_id,customer_name,customer_email,customer_phone,
      order_type,status,subtotal,total,notes,created_at,updated_at
      FROM orders WHERE id=? LIMIT 1`, [req.params.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ message: 'Commande introuvable.' });

    const items = await query(
      'SELECT id,item_name,unit_price,quantity,line_total FROM order_items WHERE order_id=? ORDER BY id',
      [req.params.id]
    );
    res.json({ ...order, items: items.rows });
  } catch (e) {
    console.error('Détail commande:', e);
    res.status(500).json({ message: 'Impossible de charger la commande.' });
  }
});

app.patch('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
  const allowed = ['pending','confirmed','preparing','ready','completed','cancelled'];
  const status = req.body?.status;
  if (!allowed.includes(status)) return res.status(400).json({ message: 'Statut invalide.' });

  const { rows } = await query(
    'SELECT id,public_id,customer_name,customer_email,status FROM orders WHERE id=? LIMIT 1',
    [req.params.id]
  );
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
        text: `${notify[1]}\nRéférence : ${String(order.public_id).slice(0,8).toUpperCase()}`,
        html: `<div style="font-family:Arial,sans-serif;background:#f7f3ec;padding:28px"><div style="max-width:560px;margin:auto;background:#fff;padding:26px;border-radius:14px;border-top:4px solid #d79a24"><h2>SAMMOLLO Restaurant</h2><p>${escapeHtml(notify[1])}</p><p><strong>Référence :</strong> ${escapeHtml(String(order.public_id).slice(0,8).toUpperCase())}</p></div></div>`
      });
    } catch (e) {
      console.error('Notification commande:', e.message);
    }
  }

  res.json({ id: Number(req.params.id), status });
});

app.delete('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await query('SELECT id,status,public_id FROM orders WHERE id=? LIMIT 1', [req.params.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ message: 'Commande introuvable.' });

    if (!['completed','cancelled'].includes(order.status)) {
      return res.status(409).json({
        message: 'Pour éviter une suppression accidentelle, terminez ou annulez d’abord cette commande.'
      });
    }

    await query('DELETE FROM orders WHERE id=?', [req.params.id]);
    await audit(req, 'order.delete', 'order', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Suppression commande:', e);
    res.status(500).json({ message: 'Impossible de supprimer la commande.' });
  }
});

// ======================================================
// ADMIN — IMAGES VERCEL BLOB
// ======================================================
const ADMIN_IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp']);

function isManagedBlobUrl(value) {
  return /^https:\/\/.*\.blob\.vercel-storage\.com\//i.test(String(value || ''));
}

async function safeDeleteBlob(url) {
  if (!isManagedBlobUrl(url)) return;
  try { await del(url); }
  catch (e) { console.error('Suppression Blob:', e.message); }
}

function adminImageHandler(folder, auditAction) {
  return async (req, res) => {
    try {
      const contentType = String(req.headers['content-type'] || '')
        .split(';')[0].trim().toLowerCase();

      if (!ADMIN_IMAGE_TYPES.has(contentType)) {
        return res.status(415).json({ message: 'Format non autorisé. Utilisez JPG, PNG ou WebP.' });
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ message: 'Aucune image reçue.' });
      }

      const originalName = String(req.headers['x-file-name'] || 'image').slice(0, 120);
      const cleanName = originalName
        .replace(/\.[^/.]+$/, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'image';

      const ext = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' }[contentType];
      const blob = await put(`${folder}/${cleanName}.${ext}`, req.body, {
        access: 'public', contentType, addRandomSuffix: true
      });

      await audit(req, auditAction, 'blob', blob.pathname);
      res.status(201).json({ ok: true, url: blob.url, pathname: blob.pathname });
    } catch (e) {
      console.error('Upload image admin:', e);
      res.status(500).json({ message: "Impossible d'envoyer l'image pour le moment." });
    }
  };
}

const adminRawImage = express.raw({
  type: ['image/jpeg','image/png','image/webp'],
  limit: '4mb'
});

app.post('/api/admin/uploads/product-image', requireAdmin, adminRawImage, adminImageHandler('menu','menu.image.upload'));
app.post('/api/admin/uploads/event-image', requireAdmin, adminRawImage, adminImageHandler('events','event.image.upload'));

function adminSlug(value, fallback = 'element') {
  const slug = cleanText(value, 180)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

// ======================================================
// ADMIN — CARTE & PRODUITS
// ======================================================
app.get('/api/admin/menu', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await query(`SELECT m.id,m.category_id,m.name,m.slug,m.description,m.price,m.old_price,
      m.image_path,m.available,m.featured,m.badge,m.sort_order,m.created_at,m.updated_at,
      c.name AS category,c.slug AS category_slug
      FROM menu_items m JOIN categories c ON c.id=m.category_id
      ORDER BY c.sort_order,m.sort_order,m.id`);
    res.json(rows);
  } catch (e) {
    console.error('Menu admin:', e);
    res.status(500).json({ message: 'Impossible de charger les produits.' });
  }
});

app.post('/api/admin/menu', requireAdmin, async (req, res) => {
  const categoryId = Number(req.body?.categoryId);
  const name = cleanText(req.body?.name, 120);
  const description = cleanText(req.body?.description, 2000);
  const price = Number(req.body?.price);
  const imagePath = cleanText(req.body?.imagePath, 500) || null;
  const badge = cleanText(req.body?.badge, 40) || null;
  const sortOrder = Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : 0;
  const slug = adminSlug(req.body?.slug || name, 'produit') + '-' + crypto.randomBytes(3).toString('hex');

  if (!Number.isInteger(categoryId) || name.length < 2 || !Number.isInteger(price) || price < 0) {
    return res.status(400).json({ message: 'Données produit invalides.' });
  }

  try {
    const cat = await query('SELECT id FROM categories WHERE id=? LIMIT 1', [categoryId]);
    if (!cat.rows.length) return res.status(400).json({ message: 'Catégorie invalide.' });

    const r = await query(`INSERT INTO menu_items(
      category_id,name,slug,description,price,image_path,available,featured,badge,sort_order
    ) VALUES(?,?,?,?,?,?,?,?,?,?)`, [
      categoryId, name, slug, description, price, imagePath,
      req.body?.available !== false ? 1 : 0,
      req.body?.featured ? 1 : 0,
      badge, sortOrder
    ]);

    const { rows } = await query('SELECT * FROM menu_items WHERE id=?', [r.insertId]);
    await audit(req, 'menu.create', 'menu_item', r.insertId);
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('Création produit:', e);
    res.status(500).json({ message: 'Création du produit impossible.' });
  }
});

app.patch('/api/admin/menu/:id', requireAdmin, async (req, res) => {
  try {
    const existingResult = await query('SELECT * FROM menu_items WHERE id=? LIMIT 1', [req.params.id]);
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ message: 'Produit introuvable.' });

    const categoryId = Number(req.body?.categoryId ?? existing.category_id);
    const name = cleanText(req.body?.name ?? existing.name, 120);
    const description = cleanText(req.body?.description ?? existing.description, 2000);
    const price = Number(req.body?.price ?? existing.price);
    const imagePath = req.body?.imagePath === undefined
      ? existing.image_path
      : (cleanText(req.body.imagePath, 500) || null);
    const badge = req.body?.badge === undefined
      ? existing.badge
      : (cleanText(req.body.badge, 40) || null);
    const sortOrder = Number.isFinite(Number(req.body?.sortOrder))
      ? Number(req.body.sortOrder)
      : Number(existing.sort_order || 0);

    if (!Number.isInteger(categoryId) || name.length < 2 || !Number.isInteger(price) || price < 0) {
      return res.status(400).json({ message: 'Données produit invalides.' });
    }

    const cat = await query('SELECT id FROM categories WHERE id=? LIMIT 1', [categoryId]);
    if (!cat.rows.length) return res.status(400).json({ message: 'Catégorie invalide.' });

    await query(`UPDATE menu_items SET category_id=?,name=?,description=?,price=?,image_path=?,
      available=?,featured=?,badge=?,sort_order=?,updated_at=NOW() WHERE id=?`, [
      categoryId, name, description, price, imagePath,
      req.body?.available === undefined ? Number(existing.available) : (req.body.available ? 1 : 0),
      req.body?.featured === undefined ? Number(existing.featured) : (req.body.featured ? 1 : 0),
      badge, sortOrder, req.params.id
    ]);

    if (existing.image_path && existing.image_path !== imagePath) {
      await safeDeleteBlob(existing.image_path);
    }

    const { rows } = await query(`SELECT m.*,c.name AS category FROM menu_items m
      JOIN categories c ON c.id=m.category_id WHERE m.id=?`, [req.params.id]);
    await audit(req, 'menu.update', 'menu_item', req.params.id);
    res.json(rows[0]);
  } catch (e) {
    console.error('Modification produit:', e);
    res.status(500).json({ message: 'Modification du produit impossible.' });
  }
});

app.delete('/api/admin/menu/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await query('SELECT image_path FROM menu_items WHERE id=? LIMIT 1', [req.params.id]);
    const item = rows[0];
    if (!item) return res.status(404).json({ message: 'Produit introuvable.' });

    await query('DELETE FROM menu_items WHERE id=?', [req.params.id]);
    await safeDeleteBlob(item.image_path);
    await audit(req, 'menu.delete', 'menu_item', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Suppression produit:', e);
    res.status(500).json({ message: 'Suppression du produit impossible.' });
  }
});

// ======================================================
// ADMIN — CATÉGORIES
// ======================================================
app.get('/api/admin/categories', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await query(`SELECT c.id,c.name,c.slug,c.sort_order,c.active,c.created_at,c.updated_at,
      COUNT(m.id) AS item_count
      FROM categories c LEFT JOIN menu_items m ON m.category_id=c.id
      GROUP BY c.id,c.name,c.slug,c.sort_order,c.active,c.created_at,c.updated_at
      ORDER BY c.sort_order,c.id`);
    res.json(rows.map(r => ({ ...r, item_count: Number(r.item_count || 0) })));
  } catch (e) {
    console.error('Catégories admin:', e);
    res.status(500).json({ message: 'Impossible de charger les catégories.' });
  }
});

app.post('/api/admin/categories', requireAdmin, async (req, res) => {
  const name = cleanText(req.body?.name, 80);
  const slug = adminSlug(req.body?.slug || name, 'categorie');
  const sortOrder = Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : 0;
  if (name.length < 2) return res.status(400).json({ message: 'Nom de catégorie invalide.' });

  try {
    const r = await query(
      'INSERT INTO categories(name,slug,sort_order,active) VALUES(?,?,?,?)',
      [name, slug, sortOrder, req.body?.active !== false ? 1 : 0]
    );
    const { rows } = await query('SELECT * FROM categories WHERE id=?', [r.insertId]);
    await audit(req, 'category.create', 'category', r.insertId);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Cette catégorie existe déjà.' });
    console.error('Création catégorie:', e);
    res.status(500).json({ message: 'Création de la catégorie impossible.' });
  }
});

app.patch('/api/admin/categories/:id', requireAdmin, async (req, res) => {
  const name = cleanText(req.body?.name, 80);
  const slug = adminSlug(req.body?.slug || name, 'categorie');
  const sortOrder = Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : 0;
  if (name.length < 2) return res.status(400).json({ message: 'Nom de catégorie invalide.' });

  try {
    const r = await query(
      'UPDATE categories SET name=?,slug=?,sort_order=?,active=?,updated_at=NOW() WHERE id=?',
      [name, slug, sortOrder, req.body?.active !== false ? 1 : 0, req.params.id]
    );
    if (!r.rowCount) return res.status(404).json({ message: 'Catégorie introuvable.' });
    const { rows } = await query('SELECT * FROM categories WHERE id=?', [req.params.id]);
    await audit(req, 'category.update', 'category', req.params.id);
    res.json(rows[0]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Ce nom ou ce slug est déjà utilisé.' });
    console.error('Modification catégorie:', e);
    res.status(500).json({ message: 'Modification de la catégorie impossible.' });
  }
});

app.delete('/api/admin/categories/:id', requireAdmin, async (req, res) => {
  try {
    const count = await query('SELECT COUNT(*) AS count FROM menu_items WHERE category_id=?', [req.params.id]);
    if (Number(count.rows[0].count) > 0) {
      return res.status(409).json({
        message: 'Cette catégorie contient encore des produits. Déplacez ou supprimez-les avant de supprimer la catégorie.'
      });
    }

    const r = await query('DELETE FROM categories WHERE id=?', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ message: 'Catégorie introuvable.' });
    await audit(req, 'category.delete', 'category', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Suppression catégorie:', e);
    res.status(500).json({ message: 'Suppression de la catégorie impossible.' });
  }
});

// ======================================================
// ADMIN — ÉVÉNEMENTS
// ======================================================
app.get('/api/admin/events', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await query('SELECT * FROM events ORDER BY sort_order,created_at DESC');
    res.json(rows);
  } catch (e) {
    console.error('Événements admin:', e);
    res.status(500).json({ message: 'Impossible de charger les événements.' });
  }
});

app.post('/api/admin/events', requireAdmin, async (req, res) => {
  const title = cleanText(req.body?.title, 140);
  const summary = cleanText(req.body?.summary, 3000);
  const imagePath = cleanText(req.body?.imagePath, 500) || null;
  const recurrence = cleanText(req.body?.recurrenceLabel, 120) || null;
  const sortOrder = Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : 0;
  const slug = adminSlug(req.body?.slug || title, 'evenement') + '-' + crypto.randomBytes(3).toString('hex');
  if (title.length < 2) return res.status(400).json({ message: 'Titre obligatoire.' });

  try {
    const r = await query(`INSERT INTO events(
      title,slug,summary,image_path,event_date,recurrence_label,status,featured,sort_order
    ) VALUES(?,?,?,?,?,?,?,?,?)`, [
      title, slug, summary, imagePath, req.body?.eventDate || null, recurrence,
      ['draft','published','archived'].includes(req.body?.status) ? req.body.status : 'published',
      req.body?.featured ? 1 : 0, sortOrder
    ]);
    const { rows } = await query('SELECT * FROM events WHERE id=?', [r.insertId]);
    await audit(req, 'event.create', 'event', r.insertId);
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('Création événement:', e);
    res.status(500).json({ message: 'Création de l’événement impossible.' });
  }
});

app.patch('/api/admin/events/:id', requireAdmin, async (req, res) => {
  try {
    const currentResult = await query('SELECT * FROM events WHERE id=? LIMIT 1', [req.params.id]);
    const current = currentResult.rows[0];
    if (!current) return res.status(404).json({ message: 'Événement introuvable.' });

    const title = cleanText(req.body?.title ?? current.title, 140);
    const summary = cleanText(req.body?.summary ?? current.summary, 3000);
    const imagePath = req.body?.imagePath === undefined
      ? current.image_path
      : (cleanText(req.body.imagePath, 500) || null);
    const recurrence = req.body?.recurrenceLabel === undefined
      ? current.recurrence_label
      : (cleanText(req.body.recurrenceLabel, 120) || null);
    const status = ['draft','published','archived'].includes(req.body?.status)
      ? req.body.status : current.status;
    const sortOrder = Number.isFinite(Number(req.body?.sortOrder))
      ? Number(req.body.sortOrder) : Number(current.sort_order || 0);

    if (title.length < 2) return res.status(400).json({ message: 'Titre obligatoire.' });

    await query(`UPDATE events SET title=?,summary=?,image_path=?,event_date=?,recurrence_label=?,
      status=?,featured=?,sort_order=?,updated_at=NOW() WHERE id=?`, [
      title, summary, imagePath,
      req.body?.eventDate === undefined ? current.event_date : (req.body.eventDate || null),
      recurrence, status,
      req.body?.featured === undefined ? Number(current.featured) : (req.body.featured ? 1 : 0),
      sortOrder, req.params.id
    ]);

    if (current.image_path && current.image_path !== imagePath) {
      await safeDeleteBlob(current.image_path);
    }

    const { rows } = await query('SELECT * FROM events WHERE id=?', [req.params.id]);
    await audit(req, 'event.update', 'event', req.params.id);
    res.json(rows[0]);
  } catch (e) {
    console.error('Modification événement:', e);
    res.status(500).json({ message: 'Modification de l’événement impossible.' });
  }
});

app.delete('/api/admin/events/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await query('SELECT image_path FROM events WHERE id=? LIMIT 1', [req.params.id]);
    const event = rows[0];
    if (!event) return res.status(404).json({ message: 'Événement introuvable.' });

    await query('DELETE FROM events WHERE id=?', [req.params.id]);
    await safeDeleteBlob(event.image_path);
    await audit(req, 'event.delete', 'event', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Suppression événement:', e);
    res.status(500).json({ message: 'Suppression de l’événement impossible.' });
  }
});

app.use('/api', (_req,res)=>res.status(404).json({message:'Endpoint introuvable.'}));

async function bootstrap(){
  try {
    const dbInfo=await testConnection(); console.log(`[MySQL] connecté à ${dbInfo.db_name}`);
    await query(`CREATE TABLE IF NOT EXISTS order_verifications (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      token VARCHAR(80) NOT NULL,
      email VARCHAR(180) NOT NULL,
      payload_json LONGTEXT NOT NULL,
      code_hash CHAR(64) NOT NULL,
      attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_order_verifications_token (token),
      KEY idx_order_verifications_email (email),
      KEY idx_order_verifications_expires (expires_at)
    )`);
    await query('DELETE FROM order_verifications WHERE expires_at < NOW()');

    await query(`CREATE TABLE IF NOT EXISTS contact_replies (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      contact_message_id BIGINT UNSIGNED NOT NULL,
      admin_id BIGINT UNSIGNED NULL,
      recipient_email VARCHAR(180) NOT NULL,
      subject VARCHAR(180) NOT NULL,
      reply_text TEXT NOT NULL,
      sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_contact_replies_message (contact_message_id,sent_at),
      KEY idx_contact_replies_admin (admin_id)
    )`);

    const defaultContact = {
      address: 'Draâ El Mizan, Tizi-Ouzou, Algérie',
      phoneDisplay: '0668 92 94 53',
      phoneHref: '+213668929453',
      email: String(process.env.RESTAURANT_EMAIL || 'sammollo.contact.draa@gmail.com').trim().toLowerCase(),
      mapEmbed: 'https://www.google.com/maps?q=36.5375127,3.8336894&z=15&output=embed',
      mapUrl: 'https://www.google.com/maps/search/?api=1&query=36.5375127,3.8336894',
      directionsUrl: 'https://www.google.com/maps/dir/?api=1&destination=36.5375127,3.8336894',
      facebook: 'https://www.facebook.com/sam.mollo.58',
      instagram: 'https://www.instagram.com/sammollodraael/',
      tiktok: '',
      showAddress: true,
      showPhone: true,
      showEmail: true,
      showHours: true,
      showSocial: true
    };
    await query(`INSERT INTO site_settings(setting_key,setting_value) VALUES('contact',?)
      ON DUPLICATE KEY UPDATE setting_value=setting_value`, [JSON.stringify(defaultContact)]);

    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      const initialEmail = String(process.env.ADMIN_EMAIL).trim().toLowerCase();
      const existingAdmins = await query('SELECT id FROM admins LIMIT 1');

      // Les variables Vercel créent uniquement le premier compte.
      // Ensuite, le profil et le mot de passe sont gérés depuis le back-office.
      if (existingAdmins.rows.length === 0) {
        const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
        await query(
          `INSERT INTO admins(email,password_hash,display_name,active)
           VALUES(?,?,?,1)`,
          [
            initialEmail,
            hash,
            process.env.ADMIN_NAME || 'Administration Sammollo'
          ]
        );
        console.log('[Admin] compte initial créé.');
      }
    }
    app.listen(PORT,()=>console.log(`Sammollo Restaurant : http://localhost:${PORT}`));
  } catch(err){ console.error('[Démarrage] impossible de lancer le serveur :',err.message); console.error('Vérifiez DB_HOST, DB_PORT, DB_USER, DB_PASSWORD et DB_NAME dans .env, puis importez database/database.sql dans phpMyAdmin.'); process.exit(1); }
}
bootstrap();
