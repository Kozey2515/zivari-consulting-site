# Zivari Consulting Site
سایت قابل استقرار زیوری با Node.js، Express و SQLite.

## اجرا
1. Node.js LTS نصب کنید.
2. `npm install`
3. `.env.example` را به `.env` تبدیل کنید.
4. SESSION_SECRET و ADMIN_PASSWORD را حتماً تغییر دهید.
5. `npm start`
6. سایت: http://localhost:3000
7. پنل: http://localhost:3000/admin.html

## امکانات
- سایت RTL و responsive
- فرم واقعی ثبت درخواست
- ذخیره درخواست‌ها در SQLite
- پنل مدیریت با ورود رمز عبور
- تغییر وضعیت و حذف درخواست
- لینک مستقیم واتساپ و بله
- محدودسازی API و ورود
- آماده اتصال به API اعلان

## نکته استقرار
برای SQLite باید هاست storage پایدار داشته باشد. اگر هاست serverless باشد، بهتر است دیتابیس به PostgreSQL/Supabase منتقل شود.
ارسال خودکار پیام به واتساپ/بله نیازمند API یا بات معتبر است؛ توکن ساختگی داخل پروژه قرار داده نشده است.
