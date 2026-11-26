
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const session = require("cookie-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const UPLOADS = path.join(DATA, "uploads");
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "";

if (IS_PRODUCTION && (!ADMIN_PASSWORD || SESSION_SECRET.length < 32)) {
  console.error("ADMIN_PASSWORD and a strong SESSION_SECRET are required.");
  process.exit(1);
}

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.use(session({
  name: "zivari_session",
  keys: [SESSION_SECRET || crypto.randomBytes(32).toString("hex")],
  httpOnly: true,
  sameSite: "lax",
  secure: IS_PRODUCTION,
  maxAge: 8 * 60 * 60 * 1000
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 150,
  standardHeaders: true,
  legacyHeaders: false
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
});

app.use("/api", apiLimiter);

const db = new Database(path.join(DATA, "zivari.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  grade TEXT,
  service TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','counselor','student')),
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  student_code TEXT UNIQUE,
  grade TEXT,
  counselor_id INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  counselor_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  plan_date TEXT NOT NULL,
  subject TEXT NOT NULL,
  task TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS daily_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  report_date TEXT NOT NULL,
  subject TEXT NOT NULL,
  planned_minutes INTEGER NOT NULL DEFAULT 0,
  actual_minutes INTEGER NOT NULL DEFAULT 0,
  completion_percent INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  counselor_feedback TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS change_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  counselor_reply TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS content_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('article','video','podcast')),
  title TEXT NOT NULL,
  summary TEXT DEFAULT '',
  body TEXT DEFAULT '',
  category TEXT DEFAULT '',
  cover_url TEXT DEFAULT '',
  media_url TEXT DEFAULT '',
  external_url TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS media_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL DEFAULT ''
);
`);

function clean(value, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function idOf(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function noCache(res) {
  res.set("Cache-Control", "no-store");
}

function fail(res, status, error) {
  noCache(res);
  return res.status(status).json({ error });
}

function auth(req, res, next) {
  if (!req.session || !req.session.user) {
    return fail(res, 401, "ابتدا وارد حساب کاربری شوید.");
  }

  const user = db.prepare(`
    SELECT id, username, full_name, role, active
    FROM users WHERE id = ?
  `).get(req.session.user.id);

  if (!user || !user.active) {
    req.session = null;
    return fail(res, 401, "حساب کاربری فعال نیست.");
  }

  req.user = user;
  next();
}

function roles(...allowed) {
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return fail(res, 403, "اجازه دسترسی به این بخش را ندارید.");
    }
    next();
  };
}

function getStudent(studentId) {
  return db.prepare(`
    SELECT s.*, u.full_name, u.username
    FROM students s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `).get(studentId);
}

function canAccessStudent(user, student) {
  if (!student) return false;
  if (user.role === "admin") return true;

  if (user.role === "counselor") {
    return student.counselor_id === user.id;
  }

  if (user.role === "student") {
    return !!db.prepare(
      "SELECT id FROM students WHERE id = ? AND user_id = ?"
    ).get(student.id, user.id);
  }

  return false;
}

function studentAccess(req, res, next) {
  const studentId = idOf(req.params.id);
  const student = studentId ? getStudent(studentId) : null;

  if (!student) return fail(res, 404, "دانش‌آموز پیدا نشد.");

  if (!canAccessStudent(req.user, student)) {
    return fail(res, 403, "اجازه دسترسی به این پرونده را ندارید.");
  }

  req.student = student;
  next();
}

/* مدیر اولیه */
if (ADMIN_PASSWORD) {
  const existing = db.prepare(
    "SELECT id FROM users WHERE username = ?"
  ).get(ADMIN_USERNAME);

  if (!existing) {
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role)
      VALUES (?, ?, ?, 'admin')
    `).run(
      ADMIN_USERNAME,
      bcrypt.hashSync(ADMIN_PASSWORD, 12),
      "مدیر زیوری"
    );
  }
}

/* =========================
   آپلود و مدیریت فایل‌ها
========================= */

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "video/mp4",
  "video/webm"
]);

const extensionByMime = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/webm": ".webm",
  "video/mp4": ".mp4",
  "video/webm": ".webm"
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS),
  filename: (req, file, cb) => {
    const ext = extensionByMime[file.mimetype];
    cb(null, crypto.randomUUID() + ext);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error("فرمت این فایل پشتیبانی نمی‌شود."));
    }
    cb(null, true);
  }
});

app.use("/uploads", express.static(UPLOADS, {
  index: false,
  dotfiles: "deny",
  setHeaders: (res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=604800");
  }
}));

function deleteUploadedFile(url) {
  if (!url || typeof url !== "string") return;

  const prefix = "/uploads/";
  if (!url.startsWith(prefix)) return;

  const fileName = path.basename(url.slice(prefix.length));
  const filePath = path.join(UPLOADS, fileName);

  if (filePath.startsWith(UPLOADS + path.sep) && fs.existsSync(filePath)) {
    fs.unlink(filePath, () => {});
  }
}

/* =========================
   درخواست‌های مشاوره
========================= */

app.post("/api/requests", (req, res) => {
  const name = clean(req.body?.name, 120);
  const phone = clean(req.body?.phone, 40);

  if (!name || !phone) {
    return fail(res, 400, "نام و شماره تماس الزامی است.");
  }

  try {
    const result = db.prepare(`
      INSERT INTO requests (name, phone, grade, service, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      name,
      phone,
      clean(req.body?.grade, 80),
      clean(req.body?.service, 120),
      clean(req.body?.message, 3000)
    );

    noCache(res);
    res.status(201).json({ ok: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error(error);
    fail(res, 500, "ثبت درخواست ناموفق بود.");
  }
});

/* =========================
   ورود و خروج
========================= */

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  try {
    const username = clean(req.body?.username, 80);
    const password = typeof req.body?.password === "string"
      ? req.body.password
      : "";

    if (!username || !password || password.length > 1024) {
      return fail(res, 400, "نام کاربری و رمز عبور را وارد کنید.");
    }

    const user = db.prepare(`
      SELECT * FROM users WHERE username = ? AND active = 1
    `).get(username);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return fail(res, 401, "نام کاربری یا رمز عبور اشتباه است.");
    }

    req.session = { user: { id: user.id } };

    noCache(res);
    res.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role
      }
    });
  } catch (error) {
    console.error(error);
    fail(res, 500, "ورود ناموفق بود.");
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session = null;
  noCache(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", auth, (req, res) => {
  noCache(res);
  res.json({ user: req.user });
});

/* سازگاری با پنل مدیریت قبلی */
app.post("/api/admin/login", loginLimiter, async (req, res) => {
  try {
    const password = typeof req.body?.password === "string"
      ? req.body.password
      : "";

    if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
      return fail(res, 401, "رمز عبور نادرست است.");
    }

    const user = db.prepare(
      "SELECT id FROM users WHERE username = ? AND role = 'admin'"
    ).get(ADMIN_USERNAME);

    if (!user) return fail(res, 503, "حساب مدیر در دسترس نیست.");

    req.session = { user: { id: user.id } };
    noCache(res);
    res.json({ ok: true, authenticated: true });
  } catch (error) {
    console.error(error);
    fail(res, 500, "ورود ناموفق بود.");
  }
});

app.post("/api/admin/logout", (req, res) => {
  req.session = null;
  noCache(res);
  res.json({ ok: true });
});

app.get("/api/admin/me", (req, res) => {
  noCache(res);
  res.json({ authenticated: !!req.session?.user });
});

/* =========================
   داشبورد و درخواست‌ها
========================= */

app.get("/api/admin/dashboard", auth, roles("admin"), (req, res) => {
  const stats = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='new' THEN 1 ELSE 0 END) AS new,
      SUM(CASE WHEN status='contacted' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS completed
    FROM requests
  `).get();

  const recent = db.prepare(
    "SELECT * FROM requests ORDER BY id DESC LIMIT 5"
  ).all();

  noCache(res);
  res.json({ ok: true, stats, recent });
});

app.get("/api/admin/requests", auth, roles("admin"), (req, res) => {
  noCache(res);
  res.json(db.prepare("SELECT * FROM requests ORDER BY id DESC").all());
});

app.patch("/api/admin/requests/:id", auth, roles("admin"), (req, res) => {
  const id = idOf(req.params.id);
  const status = clean(req.body?.status, 30);

  if (!id || !["new", "contacted", "done", "cancelled"].includes(status)) {
    return fail(res, 400, "شناسه یا وضعیت نامعتبر است.");
  }

  const result = db.prepare(
    "UPDATE requests SET status = ? WHERE id = ?"
  ).run(status, id);

  if (!result.changes) return fail(res, 404, "درخواست پیدا نشد.");

  noCache(res);
  res.json({ ok: true });
});

app.delete("/api/admin/requests/:id", auth, roles("admin"), (req, res) => {
  const id = idOf(req.params.id);
  if (!id) return fail(res, 400, "شناسه نامعتبر است.");

  const result = db.prepare("DELETE FROM requests WHERE id = ?").run(id);
  if (!result.changes) return fail(res, 404, "درخواست پیدا نشد.");

  noCache(res);
  res.json({ ok: true });
});

/* =========================
   کاربران
========================= */

app.get("/api/users", auth, roles("admin"), (req, res) => {
  const users = db.prepare(`
    SELECT id, username, full_name, role, phone, active, created_at
    FROM users ORDER BY id DESC
  `).all();

  noCache(res);
  res.json({ users });
});

app.post("/api/users", auth, roles("admin"), async (req, res) => {
  try {
    const fullName = clean(req.body?.full_name, 120);
    const username = clean(req.body?.username, 80);
    const password = typeof req.body?.password === "string"
      ? req.body.password
      : "";
    const role = clean(req.body?.role, 20);
    const phone = clean(req.body?.phone, 40);

    if (!fullName || !/^[a-zA-Z0-9_.-]{3,80}$/.test(username)) {
      return fail(res, 400, "نام کامل یا نام کاربری معتبر نیست.");
    }

    if (password.length < 10 || password.length > 1024) {
      return fail(res, 400, "رمز عبور باید حداقل ۱۰ کاراکتر باشد.");
    }

    if (!["student", "counselor"].includes(role)) {
      return fail(res, 400, "نقش انتخاب‌شده معتبر نیست.");
    }

    const hash = await bcrypt.hash(password, 12);

    const result = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, phone)
      VALUES (?, ?, ?, ?, ?)
    `).run(username, hash, fullName, role, phone);

    if (role === "student") {
      db.prepare(`
        INSERT INTO students (user_id, student_code)
        VALUES (?, ?)
      `).run(result.lastInsertRowid, `ZV-${result.lastInsertRowid}`);
    }

    noCache(res);
    res.status(201).json({ ok: true, id: result.lastInsertRowid });
  } catch (error) {
    if (String(error.code).includes("SQLITE_CONSTRAINT")) {
      return fail(res, 409, "این نام کاربری قبلاً ثبت شده است.");
    }

    console.error(error);
    fail(res, 500, "ساخت حساب ناموفق بود.");
  }
});

/* =========================
   دانش‌آموزان
========================= */

app.get("/api/students", auth, roles("admin", "counselor"), (req, res) => {
  const students = req.user.role === "admin"
    ? db.prepare(`
        SELECT s.*, u.full_name
        FROM students s JOIN users u ON u.id=s.user_id
        ORDER BY u.full_name
      `).all()
    : db.prepare(`
        SELECT s.*, u.full_name
        FROM students s JOIN users u ON u.id=s.user_id
        WHERE s.counselor_id = ?
        ORDER BY u.full_name
      `).all(req.user.id);

  noCache(res);
  res.json({ students });
});

app.get("/api/students/:id", auth, roles("admin", "counselor"), studentAccess, (req, res) => {
  noCache(res);
  res.json({ student: req.student });
});

app.get("/api/my/student", auth, roles("student"), (req, res) => {
  const student = db.prepare(`
    SELECT s.*, u.full_name
    FROM students s JOIN users u ON u.id=s.user_id
    WHERE s.user_id = ?
  `).get(req.user.id);

  if (!student) return fail(res, 404, "پرونده دانش‌آموز پیدا نشد.");

  noCache(res);
  res.json({ student });
});

/* برنامه‌ها */
app.get("/api/students/:id/plans", auth, studentAccess, (req, res) => {
  const plans = db.prepare(`
    SELECT * FROM plans WHERE student_id = ?
    ORDER BY plan_date DESC, id DESC
  `).all(req.student.id);

  noCache(res);
  res.json({ plans });
});

app.post("/api/students/:id/plans", auth, roles("admin", "counselor"), studentAccess, (req, res) => {
  const title = clean(req.body?.title, 200);
  const planDate = clean(req.body?.plan_date, 10);
  const subject = clean(req.body?.subject, 100);
  const task = clean(req.body?.task, 1000);
  const duration = Number(req.body?.duration_minutes);

  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(planDate) ||
      !subject || !task || !Number.isInteger(duration) ||
      duration < 0 || duration > 1440) {
    return fail(res, 400, "اطلاعات برنامه معتبر نیست.");
  }

  const result = db.prepare(`
    INSERT INTO plans
      (student_id, counselor_id, title, plan_date, subject, task, duration_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.student.id,
    req.user.id,
    title,
    planDate,
    subject,
    task,
    duration
  );

  noCache(res);
  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

/* گزارش روزانه */
app.get("/api/students/:id/reports", auth, studentAccess, (req, res) => {
  const reports = db.prepare(`
    SELECT * FROM daily_reports WHERE student_id = ?
    ORDER BY report_date DESC, id DESC
  `).all(req.student.id);

  noCache(res);
  res.json({ reports });
});

app.post("/api/students/:id/reports", auth, roles("student"), studentAccess, (req, res) => {
  const reportDate = clean(req.body?.report_date, 10);
  const subject = clean(req.body?.subject, 100);
  const planned = Number(req.body?.planned_minutes);
  const actual = Number(req.body?.actual_minutes);
  const completion = Number(req.body?.completion_percent);
  const note = clean(req.body?.note, 3000);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || !subject ||
      !Number.isInteger(planned) || planned < 0 || planned > 1440 ||
      !Number.isInteger(actual) || actual < 0 || actual > 1440 ||
      !Number.isInteger(completion) || completion < 0 || completion > 100) {
    return fail(res, 400, "اطلاعات گزارش معتبر نیست.");
  }

  const result = db.prepare(`
    INSERT INTO daily_reports
      (student_id, report_date, subject, planned_minutes, actual_minutes, completion_percent, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.student.id, reportDate, subject, planned, actual, completion, note);

  noCache(res);
  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

app.patch("/api/reports/:id/feedback", auth, roles("admin", "counselor"), (req, res) => {
  const id = idOf(req.params.id);
  const feedback = clean(req.body?.feedback, 2000);

  if (!id) return fail(res, 400, "شناسه گزارش معتبر نیست.");

  const report = db.prepare(`
    SELECT r.id, s.counselor_id
    FROM daily_reports r JOIN students s ON s.id=r.student_id
    WHERE r.id=?
  `).get(id);

  if (!report) return fail(res, 404, "گزارش پیدا نشد.");
  if (req.user.role === "counselor" && report.counselor_id !== req.user.id) {
    return fail(res, 403, "اجازه دسترسی ندارید.");
  }

  db.prepare("UPDATE daily_reports SET counselor_feedback=? WHERE id=?")
    .run(feedback, id);

  noCache(res);
  res.json({ ok: true });
});

/* درخواست تغییر برنامه */
app.get("/api/students/:id/change-requests", auth, studentAccess, (req, res) => {
  const requests = db.prepare(`
    SELECT * FROM change_requests WHERE student_id = ?
    ORDER BY id DESC
  `).all(req.student.id);

  noCache(res);
  res.json({ requests });
});

app.post("/api/students/:id/change-requests", auth, roles("student"), studentAccess, (req, res) => {
  const message = clean(req.body?.message, 2000);

  if (message.length < 5) {
    return fail(res, 400, "دلیل درخواست باید حداقل ۵ کاراکتر باشد.");
  }

  const result = db.prepare(`
    INSERT INTO change_requests (student_id, message)
    VALUES (?, ?)
  `).run(req.student.id, message);

  noCache(res);
  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

app.patch("/api/change-requests/:id", auth, roles("admin", "counselor"), (req, res) => {
  const id = idOf(req.params.id);
  const status = clean(req.body?.status, 20);
  const reply = clean(req.body?.counselor_reply, 2000);

  if (!id || !["approved", "rejected"].includes(status)) {
    return fail(res, 400, "شناسه یا وضعیت نامعتبر است.");
  }

  const request = db.prepare(`
    SELECT cr.id, s.counselor_id
    FROM change_requests cr
    JOIN students s ON s.id=cr.student_id
    WHERE cr.id=?
  `).get(id);

  if (!request) return fail(res, 404, "درخواست پیدا نشد.");
  if (req.user.role === "counselor" && request.counselor_id !== req.user.id) {
    return fail(res, 403, "اجازه دسترسی ندارید.");
  }

  db.prepare(`
    UPDATE change_requests
    SET status=?, counselor_reply=?
    WHERE id=?
  `).run(status, reply, id);

  noCache(res);
  res.json({ ok: true });
});

/* =========================
   مدیریت محتوای سایت
========================= */

const validContentTypes = ["article", "video", "podcast"];
const validContentStatuses = ["draft", "published"];

function contentInput(body) {
  const type = clean(body?.type, 20);
  const title = clean(body?.title, 180);
  const summary = clean(body?.summary, 1000);
  const bodyText = typeof body?.body === "string"
    ? body.body.slice(0, 30000)
    : "";
  const category = clean(body?.category, 100);
  const coverUrl = clean(body?.cover_url, 500);
  const mediaUrl = clean(body?.media_url, 500);
  const externalUrl = clean(body?.external_url, 1000);
  const status = clean(body?.status, 20);

  if (!validContentTypes.includes(type)) {
    throw new Error("نوع محتوا معتبر نیست.");
  }

  if (!title) {
    throw new Error("عنوان محتوا الزامی است.");
  }

  if (!validContentStatuses.includes(status)) {
    throw new Error("وضعیت انتشار معتبر نیست.");
  }

  return {
    type,
    title,
    summary,
    body: bodyText,
    category,
    cover_url: coverUrl,
    media_url: mediaUrl,
    external_url: externalUrl,
    status
  };
}

/* محتوای منتشرشده برای سایت */
app.get("/api/content", (req, res) => {
  const type = clean(req.query?.type, 20);

  let items;

  if (validContentTypes.includes(type)) {
    items = db.prepare(`
      SELECT id, type, title, summary, category, cover_url,
        media_url, external_url, created_at, updated_at
      FROM content_items
      WHERE status='published' AND type=?
      ORDER BY id DESC
    `).all(type);
  } else {
    items = db.prepare(`
      SELECT id, type, title, summary, category, cover_url,
        media_url, external_url, created_at, updated_at
      FROM content_items
      WHERE status='published'
      ORDER BY id DESC
    `).all();
  }

  noCache(res);
  res.json({ items });
});

/* جزئیات یک محتوای منتشرشده */
app.get("/api/content/:id", (req, res) => {
  const id = idOf(req.params.id);
  if (!id) return fail(res, 400, "شناسه محتوا معتبر نیست.");

  const item = db.prepare(`
    SELECT * FROM content_items
    WHERE id=? AND status='published'
  `).get(id);

  if (!item) return fail(res, 404, "محتوا پیدا نشد.");

  noCache(res);
  res.json({ item });
});

/* فهرست همه محتواها در پنل */
app.get("/api/admin/content", auth, roles("admin"), (req, res) => {
  const items = db.prepare(`
    SELECT * FROM content_items ORDER BY id DESC
  `).all();

  noCache(res);
  res.json({ items });
});

/* ایجاد محتوا */
app.post("/api/admin/content", auth, roles("admin"), (req, res) => {
  try {
    const item = contentInput(req.body);

    const result = db.prepare(`
      INSERT INTO content_items
        (type, title, summary, body, category, cover_url,
         media_url, external_url, status)
      VALUES
        (@type, @title, @summary, @body, @category, @cover_url,
         @media_url, @external_url, @status)
    `).run(item);

    noCache(res);
    res.status(201).json({
      ok: true,
      id: result.lastInsertRowid
    });
  } catch (error) {
    fail(res, 400, error.message || "ثبت محتوا ناموفق بود.");
  }
});

/* ویرایش محتوا */
app.put("/api/admin/content/:id", auth, roles("admin"), (req, res) => {
  const id = idOf(req.params.id);
  if (!id) return fail(res, 400, "شناسه محتوا معتبر نیست.");

  try {
    const item = contentInput(req.body);

    const result = db.prepare(`
      UPDATE content_items SET
        type=@type,
        title=@title,
        summary=@summary,
        body=@body,
        category=@category,
        cover_url=@cover_url,
        media_url=@media_url,
        external_url=@external_url,
        status=@status,
        updated_at=datetime('now','localtime')
      WHERE id=@id
    `).run({ ...item, id });

    if (!result.changes) return fail(res, 404, "محتوا پیدا نشد.");

    noCache(res);
    res.json({ ok: true });
  } catch (error) {
    fail(res, 400, error.message || "ویرایش محتوا ناموفق بود.");
  }
});

/* حذف محتوا */
app.delete("/api/admin/content/:id", auth, roles("admin"), (req, res) => {
  const id = idOf(req.params.id);
  if (!id) return fail(res, 400, "شناسه محتوا معتبر نیست.");

  const item = db.prepare(
    "SELECT cover_url, media_url FROM content_items WHERE id=?"
  ).get(id);

  if (!item) return fail(res, 404, "محتوا پیدا نشد.");

  db.prepare("DELETE FROM content_items WHERE id=?").run(id);

  deleteUploadedFile(item.cover_url);
  deleteUploadedFile(item.media_url);

  noCache(res);
  res.json({ ok: true });
});

/* =========================
   کتابخانه رسانه و آپلود
========================= */

app.post(
  "/api/admin/upload",
  auth,
  roles("admin"),
  (req, res, next) => {
    upload.single("file")(req, res, (error) => {
      if (error) {
        const message = error.code === "LIMIT_FILE_SIZE"
          ? "حجم فایل نباید بیشتر از ۱۵ مگابایت باشد."
          : error.message || "آپلود فایل ناموفق بود.";
        return fail(res, 400, message);
      }
      next();
    });
  },
  (req, res) => {
    if (!req.file) return fail(res, 400, "فایلی انتخاب نشده است.");

    const url = "/uploads/" + req.file.filename;

    const result = db.prepare(`
      INSERT INTO media_assets
        (original_name, file_name, url, mime_type, size)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      clean(req.file.originalname, 250),
      req.file.filename,
      url,
      req.file.mimetype,
      req.file.size
    );

    noCache(res);
    res.status(201).json({
      ok: true,
      asset: {
        id: result.lastInsertRowid,
        name: req.file.originalname,
        url,
        mime_type: req.file.mimetype,
        size: req.file.size
      }
    });
  }
);

app.get("/api/admin/media", auth, roles("admin"), (req, res) => {
  const assets = db.prepare(`
    SELECT id, original_name, url, mime_type, size, created_at
    FROM media_assets ORDER BY id DESC
  `).all();

  noCache(res);
  res.json({ assets });
});

app.delete("/api/admin/media/:id", auth, roles("admin"), (req, res) => {
  const id = idOf(req.params.id);
  if (!id) return fail(res, 400, "شناسه فایل معتبر نیست.");

  const asset = db.prepare(
    "SELECT * FROM media_assets WHERE id=?"
  ).get(id);

  if (!asset) return fail(res, 404, "فایل پیدا نشد.");

  db.prepare("DELETE FROM media_assets WHERE id=?").run(id);
  deleteUploadedFile(asset.url);

  noCache(res);
  res.json({ ok: true });
});

/* =========================
   تنظیمات صفحه اصلی
========================= */

app.get("/api/site-settings", (req, res) => {
  const rows = db.prepare(
    "SELECT setting_key, setting_value FROM site_settings"
  ).all();

  const settings = {};
  for (const row of rows) {
    settings[row.setting_key] = row.setting_value;
  }

  noCache(res);
  res.json({ settings });
});

app.get("/api/admin/site-settings", auth, roles("admin"), (req, res) => {
  const rows = db.prepare(
    "SELECT setting_key, setting_value FROM site_settings"
  ).all();

  const settings = {};
  for (const row of rows) {
    settings[row.setting_key] = row.setting_value;
  }

  noCache(res);
  res.json({ settings });
});

app.put("/api/admin/site-settings", auth, roles("admin"), (req, res) => {
  const settings = req.body?.settings;

  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return fail(res, 400, "ساختار تنظیمات معتبر نیست.");
  }

  const save = db.prepare(`
    INSERT INTO site_settings (setting_key, setting_value)
    VALUES (?, ?)
    ON CONFLICT(setting_key)
    DO UPDATE SET setting_value=excluded.setting_value
  `);

  const transaction = db.transaction((entries) => {
    for (const [key, value] of entries) {
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(key)) continue;
      save.run(key, clean(String(value ?? ""), 2000));
    }
  });

  transaction(Object.entries(settings));

  noCache(res);
  res.json({ ok: true });
});

/* =========================
   تنظیمات تماس عمومی
========================= */

app.get("/api/contact-config", (req, res) => {
  noCache(res);
  res.json({
    whatsapp: process.env.WHATSAPP_NUMBER || "",
    bale: process.env.BALE_USERNAME || ""
  });
});

/* =========================
   فایل‌های عمومی سایت
========================= */

const publicFiles = [
  "index.html",
  "style.css",
  "app.js",
  "admin.html",
  "admin.css",
  "admin.js",
  "portal.html",
  "portal.css",
  "portal.js"
];

for (const file of publicFiles) {
  app.get("/" + file, (req, res, next) => {
    res.sendFile(path.join(ROOT, file), error => {
      if (error) next(error);
    });
  });
}

app.get("/", (req, res, next) => {
  res.sendFile(path.join(ROOT, "index.html"), error => {
    if (error) next(error);
  });
});

app.get(["/admin", "/admin.html"], (req, res, next) => {
  res.sendFile(path.join(ROOT, "admin.html"), error => {
    if (error) next(error);
  });
});

app.get(["/portal", "/portal.html"], (req, res, next) => {
  res.sendFile(path.join(ROOT, "portal.html"), error => {
    if (error) next(error);
  });
});

app.use("/api", (req, res) => {
  fail(res, 404, "مسیر درخواست‌شده پیدا نشد.");
});

app.use((error, req, res, next) => {
  console.error("SERVER ERROR:", error);
  if (res.headersSent) return next(error);
  fail(res, 500, "خطای داخلی سرور رخ داده است.");
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Zivari site running on port ${PORT}`);
});

function shutdown() {
  server.close(() => {
    try {
      db.close();
    } catch (error) {
      console.error("DATABASE CLOSE ERROR:", error);
    }
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
