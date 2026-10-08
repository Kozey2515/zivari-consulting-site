const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const session = require("cookie-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();

app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, "data");

/* ساخت پوشه data */
if (!fs.existsSync(DATA)) {
  fs.mkdirSync(DATA, { recursive: true });
}

/* دیتابیس */
const db = new Database(
  path.join(DATA, "zivari.db")
);

db.pragma("journal_mode=WAL");

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

/* رمز ادمین */
const adminPassword =
  process.env.ADMIN_PASSWORD || "";

if (!adminPassword) {
  console.error(
    "ADMIN_PASSWORD is not configured."
  );
}

const adminHash = adminPassword
  ? bcrypt.hashSync(adminPassword, 12)
  : null;

/* امنیت */
app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

/* JSON */
app.use(
  express.json({
    limit: "100kb"
  })
);

/* فرم‌ها */
app.use(
  express.urlencoded({
    extended: true
  })
);

/*
  Session
  برای Bonto secure را false گذاشته‌ایم
  تا Session بعد از ورود از بین نرود.
*/
app.use(
  session({
    name: "zivari_session",

    keys: [
      process.env.SESSION_SECRET ||
      "CHANGE_SECRET"
    ],

    httpOnly: true,

    sameSite: "lax",

    secure: false,

    maxAge: 8 * 60 * 60 * 1000
  })
);

/* محدودیت درخواست‌ها */
const limiter = rateLimit({
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

app.use("/api", limiter);

/* بررسی دسترسی ادمین */
function admin(req, res, next) {
  if (
    req.session &&
    req.session.admin === true
  ) {
    return next();
  }

  return res.status(401).json({
    error: "UNAUTHORIZED"
  });
}

/* =========================================
   ثبت درخواست مشاوره
========================================= */

app.post(
  "/api/requests",
  (req, res) => {

    const {
      name,
      phone,
      grade,
      service,
      message
    } = req.body || {};

    if (!name || !phone) {
      return res.status(400).json({
        error:
          "نام و شماره تماس الزامی است."
      });
    }

    if (
      String(name).length > 120 ||
      String(phone).length > 40 ||
      String(message || "").length > 3000
    ) {
      return res.status(400).json({
        error:
          "اطلاعات واردشده بیش از حد مجاز است."
      });
    }

    const result = db
      .prepare(`
        INSERT INTO requests
        (
          name,
          phone,
          grade,
          service,
          message
        )
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(
        String(name).trim(),
        String(phone).trim(),
        String(grade || "").trim(),
        String(service || "").trim(),
        String(message || "").trim()
      );

    return res.json({
      ok: true,
      id: result.lastInsertRowid,
      message:
        "درخواست شما با موفقیت ثبت شد."
    });
  }
);


/* =========================================
   ورود ادمین
========================================= */

app.post(
  "/api/admin/login",
  loginLimiter,
  async (req, res) => {

    try {

      if (!adminPassword || !adminHash) {
        return res.status(503).json({
          error:
            "ADMIN_PASSWORD تنظیم نشده است."
        });
      }

      const password = String(
        req.body?.password || ""
      );

      const valid =
        await bcrypt.compare(
          password,
          adminHash
        );

      if (!valid) {
        return res.status(401).json({
          error:
            "رمز عبور نادرست است."
        });
      }

      /*
        ذخیره Session
      */

      req.session = {
        admin: true
      };

      return res.json({
        ok: true,
        authenticated: true
      });

    } catch (error) {

      console.error(
        "LOGIN ERROR:",
        error
      );

      return res.status(500).json({
        error:
          "خطا در ورود به پنل."
      });
    }
  }
);


/* =========================================
   خروج ادمین
========================================= */

app.post(
  "/api/admin/logout",
  (req, res) => {

    req.session = null;

    return res.json({
      ok: true
    });
  }
);


/* =========================================
   بررسی وضعیت ورود
========================================= */

app.get(
  "/api/admin/me",
  (req, res) => {

    return res.json({
      authenticated:
        req.session?.admin === true
    });
  }
);


/* =========================================
   دریافت درخواست‌ها
========================================= */

app.get(
  "/api/admin/requests",
  admin,
  (req, res) => {

    try {

      const rows = db
        .prepare(`
          SELECT *
          FROM requests
          ORDER BY id DESC
        `)
        .all();

      return res.json(rows);

    } catch (error) {

      console.error(
        "REQUESTS ERROR:",
        error
      );

      return res.status(500).json({
        error:
          "خطا در دریافت درخواست‌ها."
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

    const allowedStatuses = [
      "new",
      "contacted",
      "done",
      "cancelled"
    ];

    if (
      !allowedStatuses.includes(
        req.body?.status
      )
    ) {
      return res.status(400).json({
        error:
          "وضعیت نامعتبر است."
      });
    }

    const id =
      Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        error:
          "شناسه نامعتبر است."
      });
    }

    const result = db
      .prepare(`
        UPDATE requests
        SET status = ?
        WHERE id = ?
      `)
      .run(
        req.body.status,
        id
      );

    return res.json({
      ok: result.changes > 0
    });
  }
);


/* =========================================
   حذف درخواست
========================================= */

app.delete(
  "/api/admin/requests/:id",
  admin,
  (req, res) => {

    const id =
      Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        error:
          "شناسه نامعتبر است."
      });
    }

    const result = db
      .prepare(`
        DELETE FROM requests
        WHERE id = ?
      `)
      .run(id);

    return res.json({
      ok: result.changes > 0
    });
  }
);


/* =========================================
   تنظیمات تماس
========================================= */

app.get(
  "/api/contact-config",
  (req, res) => {

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
   فایل‌های سایت
   فایل‌ها در ریشه پروژه هستند
========================================= */

app.use(
  express.static(ROOT)
);


/* =========================================
   صفحه اصلی
========================================= */

app.get(
  "/",
  (req, res) => {

    res.sendFile(
      path.join(
        ROOT,
        "index.html"
      )
    );
  }
);


/* =========================================
   پنل مدیریت
========================================= */

app.get(
  "/admin.html",
  (req, res) => {

    res.sendFile(
      path.join(
        ROOT,
        "admin.html"
      )
    );
  }
);

app.get(
  "/admin",
  (req, res) => {

    res.sendFile(
      path.join(
        ROOT,
        "admin.html"
      )
    );
  }
);


/* =========================================
   اجرای سرور
========================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Zivari site running on port ${PORT}`
    );
  }
);
