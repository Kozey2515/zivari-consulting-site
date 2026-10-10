const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const session = require("cookie-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();

/* =========================================
   تنظیمات اصلی
========================================= */

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, "data");

const IS_PRODUCTION = process.env.NODE_ENV === "production";

app.set("trust proxy", 1);

/* =========================================
   بررسی تنظیمات امنیتی
========================================= */

const adminPassword = process.env.ADMIN_PASSWORD || "";
const sessionSecret = process.env.SESSION_SECRET || "";

if (!adminPassword) {
  console.error(
    "ERROR: ADMIN_PASSWORD is not configured."
  );
}

if (
  IS_PRODUCTION &&
  (!sessionSecret || sessionSecret === "CHANGE_SECRET")
) {
  console.error(
    "ERROR: A strong SESSION_SECRET must be configured in production."
  );

  process.exit(1);
}

if (
  !IS_PRODUCTION &&
  !sessionSecret
) {
  console.warn(
    "WARNING: Set SESSION_SECRET before deploying the website."
  );
}

const adminHash = adminPassword
  ? bcrypt.hashSync(adminPassword, 12)
  : null;

/* =========================================
   ایجاد پوشه اطلاعات
========================================= */

if (!fs.existsSync(DATA)) {
  fs.mkdirSync(DATA, { recursive: true });
}

/* =========================================
   اتصال به SQLite
========================================= */

const db = new Database(
  path.join(DATA, "zivari.db")
);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

/* =========================================
   ساخت جدول درخواست‌های مشاوره
   اطلاعات قبلی حفظ می‌شوند.
========================================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    grade TEXT,
    service TEXT,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL
      DEFAULT (datetime('now','localtime'))
  );
`);

/* =========================================
   امنیت HTTP
========================================= */

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(
  express.json({
    limit: "100kb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "100kb"
  })
);

/* =========================================
   نشست مدیر
========================================= */

app.use(
  session({
    name: "zivari_session",

    keys: [
      sessionSecret || "CHANGE_SECRET"
    ],

    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,

    maxAge: 8 * 60 * 60 * 1000
  })
);

/* =========================================
   محدودیت درخواست‌ها
========================================= */

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
});

const submissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
});

app.use("/api", apiLimiter);

/* =========================================
   توابع کمکی
========================================= */

function cleanText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function validId(value) {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0
    ? id
    : null;
}

function noCache(res) {
  res.set("Cache-Control", "no-store");
}

function admin(req, res, next) {
  if (req.session?.admin === true) {
    return next();
  }

  noCache(res);

  return res.status(401).json({
    error: "UNAUTHORIZED"
  });
}

/* =========================================
   ثبت درخواست مشاوره
========================================= */

app.post(
  "/api/requests",
  submissionLimiter,
  (req, res) => {
    try {
      const body = req.body || {};

      const name = cleanText(body.name, 120);
      const phone = cleanText(body.phone, 40);
      const grade = cleanText(body.grade, 80);
      const service = cleanText(body.service, 120);
      const message = cleanText(body.message, 3000);

      if (!name || !phone) {
        return res.status(400).json({
          error: "نام و شماره تماس الزامی است."
        });
      }

      const result = db.prepare(`
        INSERT INTO requests (
          name,
          phone,
          grade,
          service,
          message
        )
        VALUES (?, ?, ?, ?, ?)
      `).run(
        name,
        phone,
        grade,
        service,
        message
      );

      noCache(res);

      return res.status(201).json({
        ok: true,
        id: result.lastInsertRowid,
        message: "درخواست شما با موفقیت ثبت شد."
      });

    } catch (error) {
      console.error("REQUEST SUBMISSION ERROR:", error);

      return res.status(500).json({
        error: "ثبت درخواست با خطا مواجه شد."
      });
    }
  }
);

/* =========================================
   ورود مدیر
========================================= */

app.post(
  "/api/admin/login",
  loginLimiter,
  async (req, res) => {
    noCache(res);

    try {
      if (!adminPassword || !adminHash) {
        return res.status(503).json({
          error: "رمز مدیریت در تنظیمات سرور تعریف نشده است."
        });
      }

      const password =
        typeof req.body?.password === "string"
          ? req.body.password
          : "";

      if (!password || password.length > 1024) {
        return res.status(400).json({
          error: "رمز عبور معتبر وارد کنید."
        });
      }

      const valid = await bcrypt.compare(
        password,
        adminHash
      );

      if (!valid) {
        return res.status(401).json({
          error: "رمز عبور نادرست است."
        });
      }

      req.session = {
        admin: true
      };

      return res.json({
        ok: true,
        authenticated: true
      });

    } catch (error) {
      console.error("ADMIN LOGIN ERROR:", error);

      return res.status(500).json({
        error: "ورود به پنل با خطا مواجه شد."
      });
    }
  }
);

/* =========================================
   خروج مدیر
========================================= */

app.post(
  "/api/admin/logout",
  (req, res) => {
    noCache(res);

    req.session = null;

    return res.json({
      ok: true
    });
  }
);

/* =========================================
   بررسی نشست مدیر
========================================= */

app.get(
  "/api/admin/me",
  (req, res) => {
    noCache(res);

    return res.json({
      authenticated: req.session?.admin === true
    });
  }
);

/* =========================================
   آمار داشبورد
========================================= */

app.get(
  "/api/admin/dashboard",
  admin,
  (req, res) => {
    noCache(res);

    try {
      const stats = db.prepare(`
        SELECT
          COUNT(*) AS total,

          SUM(
            CASE
              WHEN status = 'new'
              THEN 1
              ELSE 0
            END
          ) AS new,

          SUM(
            CASE
              WHEN status = 'contacted'
              THEN 1
              ELSE 0
            END
          ) AS pending,

          SUM(
            CASE
              WHEN status = 'done'
              THEN 1
              ELSE 0
            END
          ) AS completed

        FROM requests
      `).get();

      const recent = db.prepare(`
        SELECT
          id,
          name,
          phone,
          grade,
          service,
          message,
          status,
          created_at

        FROM requests

        ORDER BY id DESC

        LIMIT 5
      `).all();

      return res.json({
        ok: true,

        stats: {
          total: Number(stats.total || 0),
          new: Number(stats.new || 0),
          pending: Number(stats.pending || 0),
          completed: Number(stats.completed || 0)
        },

        recent
      });

    } catch (error) {
      console.error("DASHBOARD ERROR:", error);

      return res.status(500).json({
        error: "دریافت آمار داشبورد ناموفق بود."
      });
    }
  }
);

/* =========================================
   دریافت همه درخواست‌ها
========================================= */

app.get(
  "/api/admin/requests",
  admin,
  (req, res) => {
    noCache(res);

    try {
      const rows = db.prepare(`
        SELECT
          id,
          name,
          phone,
          grade,
          service,
          message,
          status,
          created_at

        FROM requests

        ORDER BY id DESC
      `).all();

      return res.json(rows);

    } catch (error) {
      console.error("REQUEST LIST ERROR:", error);

      return res.status(500).json({
        error: "دریافت درخواست‌ها ناموفق بود."
      });
    }
  }
);

/* =========================================
   تغییر وضعیت درخواست
========================================= */

app.patch(
  "/api/admin/requests/:id",
  admin,
  (req, res) => {
    noCache(res);

    try {
      const id = validId(req.params.id);

      if (!id) {
        return res.status(400).json({
          error: "شناسه درخواست نامعتبر است."
        });
      }

      const allowedStatuses = [
        "new",
        "contacted",
        "done",
        "cancelled"
      ];

      const status = req.body?.status;

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          error: "وضعیت انتخاب‌شده معتبر نیست."
        });
      }

      const result = db.prepare(`
        UPDATE requests
        SET status = ?
        WHERE id = ?
      `).run(
        status,
        id
      );

      if (result.changes === 0) {
        return res.status(404).json({
          error: "درخواست موردنظر پیدا نشد."
        });
      }

      return res.json({
        ok: true
      });

    } catch (error) {
      console.error("REQUEST STATUS ERROR:", error);

      return res.status(500).json({
        error: "تغییر وضعیت درخواست ناموفق بود."
      });
    }
  }
);

/* =========================================
   حذف درخواست
========================================= */

app.delete(
  "/api/admin/requests/:id",
  admin,
  (req, res) => {
    noCache(res);

    try {
      const id = validId(req.params.id);

      if (!id) {
        return res.status(400).json({
          error: "شناسه درخواست نامعتبر است."
        });
      }

      const result = db.prepare(`
        DELETE FROM requests
        WHERE id = ?
      `).run(id);

      if (result.changes === 0) {
        return res.status(404).json({
          error: "درخواست موردنظر پیدا نشد."
        });
      }

      return res.json({
        ok: true
      });

    } catch (error) {
      console.error("REQUEST DELETE ERROR:", error);

      return res.status(500).json({
        error: "حذف درخواست ناموفق بود."
      });
    }
  }
);

/* =========================================
   تنظیمات تماس عمومی
========================================= */

app.get(
  "/api/contact-config",
  (req, res) => {
    noCache(res);

    return res.json({
      whatsapp:
        process.env.WHATSAPP_NUMBER ||
        "989219004975",

      bale:
        process.env.BALE_USERNAME ||
        "H0zeyf"
    });
  }
);

/* =========================================
   سرو فایل‌های عمومی سایت
   فایل‌های داخلی سرور منتشر نمی‌شوند.
========================================= */

const publicFiles = [
  "index.html",
  "style.css",
  "app.js",
  "admin.html",
  "admin.css",
  "admin.js"
];

for (const file of publicFiles) {
  app.get(
    "/" + file,
    (req, res, next) => {
      res.sendFile(
        path.join(ROOT, file),
        (error) => {
          if (error) {
            next(error);
          }
        }
      );
    }
  );
}

/* =========================================
   صفحه اصلی
========================================= */

app.get(
  "/",
  (req, res, next) => {
    res.sendFile(
      path.join(ROOT, "index.html"),
      (error) => {
        if (error) {
          next(error);
        }
      }
    );
  }
);

/* =========================================
   صفحه مدیریت
========================================= */

app.get(
  ["/admin", "/admin.html"],
  (req, res, next) => {
    res.sendFile(
      path.join(ROOT, "admin.html"),
      (error) => {
        if (error) {
          next(error);
        }
      }
    );
  }
);

/* =========================================
   مسیرهای ناموجود API
========================================= */

app.use("/api", (req, res) => {
  return res.status(404).json({
    error: "مسیر درخواست‌شده پیدا نشد."
  });
});

/* =========================================
   مدیریت خطاهای نهایی
========================================= */

app.use((error, req, res, next) => {
  console.error("SERVER ERROR:", error);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    error: "خطای داخلی سرور رخ داده است."
  });
});

/* =========================================
   اجرای سرور
========================================= */

const server = app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Zivari site running on port ${PORT}`
    );
  }
);

/* =========================================
   خاموش‌شدن کنترل‌شده
========================================= */

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
