"use strict";

(() => {
  const $ = (selector) => document.querySelector(selector);

  // عناصر اصلی صفحه
  const loginBox = $("#login");
  const panel = $("#panel");
  const loginForm = $("#lf");
  const passwordInput = $("#pw");
  const loginStatus = $("#ls");
  const loginButton = $("#loginBtn");
  const logoutButton = $("#out");
  const refreshButton = $("#ref");

  // بخش درخواست‌ها
  const table = $("#table");
  const searchInput = $("#searchRequests");
  const statusFilter = $("#statusFilter");

  // آمار داشبورد
  const totalCount = $("#totalCount");
  const newCount = $("#newCount");
  const pendingCount = $("#pendingCount");
  const completedCount = $("#completedCount");
  const newBadge = $("#newBadge");
  const recentRequests = $("#recentRequests");

  const toastElement = $("#toast");

  const VALID_STATUSES = [
    "new",
    "contacted",
    "done",
    "cancelled"
  ];

  const STATUS_LABELS = {
    new: "جدید",
    contacted: "در حال پیگیری",
    done: "تکمیل‌شده",
    cancelled: "لغوشده"
  };

  let requests = [];
  let isLoading = false;
  let toastTimer = null;

  // تبدیل امن متن به HTML
  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };

      return entities[char];
    });
  }

  // نمایش پیام
  function showToast(message, type = "success") {
    if (!toastElement) {
      alert(message);
      return;
    }

    toastElement.textContent = message;
    toastElement.hidden = false;

    toastElement.style.borderColor =
      type === "error" ? "#ff7777" : "#d4af37";

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      toastElement.hidden = true;
    }, 3500);
  }

  // ارتباط با سرور
  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: {
        ...(options.body
          ? { "Content-Type": "application/json" }
          : {}),
        ...(options.headers || {})
      }
    });

    let data = {};

    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (response.status === 401) {
      showLogin("نشست شما منقضی شده است؛ دوباره وارد شوید.");
      throw new Error("برای ادامه، دوباره وارد پنل شوید.");
    }

    if (!response.ok || data.ok === false) {
      throw new Error(
        data.error || `خطای سرور (${response.status})`
      );
    }

    return data;
  }

  // نمایش فرم ورود
  function showLogin(message = "") {
    if (loginBox) {
      loginBox.hidden = false;
      loginBox.style.display = "";
    }

    if (panel) {
      panel.hidden = true;
      panel.style.display = "";
    }

    if (loginStatus) {
      loginStatus.textContent = message;
    }

    if (passwordInput) {
      passwordInput.value = "";
    }
  }

  // نمایش پنل مدیریت
  function showPanel() {
    if (loginBox) {
      loginBox.hidden = true;
      loginBox.style.display = "";
    }

    if (panel) {
      panel.hidden = false;
      panel.style.display = "";
    }

    if (loginStatus) {
      loginStatus.textContent = "";
    }
  }

  // قالب‌بندی تاریخ
  function formatDate(value) {
    if (!value) return "—";

    let date;

    // تاریخ‌های دیتابیس ممکن است بدون منطقه زمانی باشند.
    date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    try {
      return new Intl.DateTimeFormat("fa-IR", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date);
    } catch {
      return date.toLocaleString();
    }
  }

  // هماهنگ‌کردن فیلتر وضعیت با وضعیت‌های سرور
  function setupStatusFilter() {
    if (!statusFilter) return;

    const oldValue = statusFilter.value;

    statusFilter.innerHTML = `
      <option value="">همه وضعیت‌ها</option>
      <option value="new">جدید</option>
      <option value="contacted">در حال پیگیری</option>
      <option value="done">تکمیل‌شده</option>
      <option value="cancelled">لغوشده</option>
    `;

    statusFilter.value = [
      "",
      ...VALID_STATUSES
    ].includes(oldValue) ? oldValue : "";
  }

  function setNumber(element, value) {
    if (element) {
      const number = Number(value);
      element.textContent = Number.isFinite(number)
        ? number.toLocaleString("fa-IR")
        : "۰";
    }
  }

  // دریافت آمار داشبورد
  async function loadDashboard() {
    const data = await api("/api/admin/dashboard");
    const stats = data.stats || {};

    setNumber(totalCount, stats.total);
    setNumber(newCount, stats.new);
    setNumber(pendingCount, stats.pending);
    setNumber(completedCount, stats.completed);

    if (newBadge) {
      const count = Number(stats.new) || 0;

      newBadge.textContent = count.toLocaleString("fa-IR");
      newBadge.hidden = count <= 0;
    }

    renderRecentRequests(
      Array.isArray(data.recent) ? data.recent : []
    );
  }

  // نمایش آخرین درخواست‌ها
  function renderRecentRequests(items) {
    if (!recentRequests) return;

    if (items.length === 0) {
      recentRequests.innerHTML = `
        <div class="empty">
          <strong>▤</strong>
          هنوز درخواستی ثبت نشده است.
        </div>
      `;
      return;
    }

    recentRequests.innerHTML = items.map((item) => {
      const status = VALID_STATUSES.includes(item.status)
        ? item.status
        : "new";

      return `
        <div class="recent-item">
          <div>
            <strong>${escapeHTML(item.name || "بدون نام")}</strong>
            <small>${escapeHTML(item.phone || "—")}</small>
          </div>

          <div>
            <span class="status-pill">
              ${STATUS_LABELS[status]}
            </span>
            <br>
            <small>${escapeHTML(formatDate(item.created_at))}</small>
          </div>
        </div>
      `;
    }).join("");
  }

  // اعمال جست‌وجو و فیلتر
  function getFilteredRequests() {
    const term = (searchInput?.value || "")
      .trim()
      .toLocaleLowerCase();

    const selectedStatus = statusFilter?.value || "";

    return requests.filter((item) => {
      const statusMatches =
        !selectedStatus || item.status === selectedStatus;

      const searchable = [
        item.name,
        item.phone,
        item.grade,
        item.service,
        item.message
      ]
        .map((value) => String(value || ""))
        .join(" ")
        .toLocaleLowerCase();

      return statusMatches &&
        (!term || searchable.includes(term));
    });
  }

  // ساخت جدول درخواست‌ها
  function renderRequests() {
    if (!table) return;

    const filtered = getFilteredRequests();

    if (filtered.length === 0) {
      table.innerHTML = `
        <div class="empty">
          <strong>⌕</strong>
          درخواستی با این مشخصات پیدا نشد.
        </div>
      `;
      return;
    }

    const rows = filtered.map((item) => {
      const id = Number(item.id);

      const options = VALID_STATUSES.map((status) => `
        <option
          value="${status}"
          ${item.status === status ? "selected" : ""}>
          ${STATUS_LABELS[status]}
        </option>
      `).join("");

      return `
        <tr data-request-id="${id}">
          <td>${id}</td>

          <td>
            <strong>${escapeHTML(item.name || "—")}</strong>
            <div class="muted">
              ${escapeHTML(item.phone || "—")}
            </div>
          </td>

          <td>${escapeHTML(item.grade || "—")}</td>

          <td>${escapeHTML(item.service || "—")}</td>

          <td>
            ${escapeHTML(item.message || "—")}
          </td>

          <td>
            <select
              data-action="status"
              aria-label="وضعیت درخواست ${id}">
              ${options}
            </select>
          </td>

          <td>
            <small>
              ${escapeHTML(formatDate(item.created_at))}
            </small>

            <br>

            <button
              type="button"
              data-action="delete"
              aria-label="حذف درخواست ${id}">
              حذف
            </button>
          </td>
        </tr>
      `;
    }).join("");

    table.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>شناسه</th>
              <th>نام و تماس</th>
              <th>پایه</th>
              <th>خدمت</th>
              <th>توضیحات</th>
              <th>وضعیت</th>
              <th>عملیات</th>
            </tr>
          </thead>

          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  // دریافت درخواست‌ها
  async function loadRequests() {
    const data = await api("/api/admin/requests");

    requests = Array.isArray(data.requests)
      ? data.requests
      : Array.isArray(data)
        ? data
        : [];

    renderRequests();
  }

  // بروزرسانی اطلاعات
  async function refreshAll() {
    if (isLoading) return;

    isLoading = true;

    const originalText = refreshButton
      ? refreshButton.textContent
      : "";

    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.textContent = "در حال بروزرسانی…";
    }

    try {
      const results = await Promise.allSettled([
        loadDashboard(),
        loadRequests()
      ]);

      const failed = results.filter(
        (result) => result.status === "rejected"
      );

      if (failed.length > 0) {
        const error = failed[0].reason;

        showToast(
          error?.message || "دریافت بخشی از اطلاعات ناموفق بود.",
          "error"
        );
      }
    } finally {
      isLoading = false;

      if (refreshButton) {
        refreshButton.disabled = false;
        refreshButton.textContent = originalText || "↻ به‌روزرسانی";
      }
    }
  }

  // بررسی اعتبار نشست
  async function checkAuthentication() {
    try {
      const data = await api("/api/admin/me");

      if (data.authenticated) {
        showPanel();
        setupStatusFilter();
        await refreshAll();
      } else {
        showLogin();
      }
    } catch (error) {
      showLogin();
      console.error("Authentication check failed:", error);
    }
  }

  // ورود
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const password = passwordInput?.value || "";

      if (!password) {
        showToast("لطفاً رمز عبور را وارد کن.", "error");
        passwordInput?.focus();
        return;
      }

      if (loginButton) {
        loginButton.disabled = true;
        loginButton.textContent = "در حال ورود…";
      }

      try {
        await api("/api/admin/login", {
          method: "POST",
          body: JSON.stringify({ password })
        });

        if (passwordInput) {
          passwordInput.value = "";
        }

        showPanel();
        setupStatusFilter();

        await refreshAll();

        showToast("ورود با موفقیت انجام شد.");
      } catch (error) {
        showLogin(error.message || "ورود انجام نشد.");

        console.error("Login failed:", error);
      } finally {
        if (loginButton) {
          loginButton.disabled = false;
          loginButton.textContent = "ورود به پنل";
        }
      }
    });
  }

  // خروج
  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      logoutButton.disabled = true;

      try {
        await api("/api/admin/logout", {
          method: "POST",
          body: JSON.stringify({})
        });
      } catch (error) {
        console.error("Logout request failed:", error);
      } finally {
        requests = [];
        showLogin("از پنل مدیریت خارج شدی.");
        logoutButton.disabled = false;
      }
    });
  }

  // بروزرسانی دستی
  if (refreshButton) {
    refreshButton.addEventListener("click", refreshAll);
  }

  // جست‌وجوی زنده
  if (searchInput) {
    searchInput.addEventListener("input", renderRequests);
  }

  // فیلتر وضعیت
  if (statusFilter) {
    statusFilter.addEventListener("change", renderRequests);
  }

  // تغییر وضعیت درخواست
  if (table) {
    table.addEventListener("change", async (event) => {
      const select = event.target.closest(
        'select[data-action="status"]'
      );

      if (!select) return;

      const row = select.closest("[data-request-id]");
      const id = Number(row?.dataset.requestId);
      const status = select.value;

      if (!Number.isInteger(id) || id < 1) return;

      if (!VALID_STATUSES.includes(status)) {
        showToast("وضعیت انتخاب‌شده معتبر نیست.", "error");
        return;
      }

      const previous = requests.find(
        (item) => Number(item.id) === id
      )?.status;

      select.disabled = true;

      try {
        await api(`/api/admin/requests/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ status })
        });

        const request = requests.find(
          (item) => Number(item.id) === id
        );

        if (request) {
          request.status = status;
        }

        renderRequests();
        await loadDashboard();

        showToast("وضعیت درخواست بروزرسانی شد.");
      } catch (error) {
        showToast(
          error.message || "تغییر وضعیت انجام نشد.",
          "error"
        );

        if (previous) {
          select.value = previous;
        }

        console.error("Status update failed:", error);
      } finally {
        select.disabled = false;
      }
    });

    // حذف درخواست
    table.addEventListener("click", async (event) => {
      const button = event.target.closest(
        'button[data-action="delete"]'
      );

      if (!button) return;

      const row = button.closest("[data-request-id]");
      const id = Number(row?.dataset.requestId);

      if (!Number.isInteger(id) || id < 1) return;

      const confirmed = confirm(
        "آیا مطمئنی که می‌خواهی این درخواست را حذف کنی؟ این کار قابل بازگشت نیست."
      );

      if (!confirmed) return;

      button.disabled = true;

      try {
        await api(`/api/admin/requests/${id}`, {
          method: "DELETE"
        });

        requests = requests.filter(
          (item) => Number(item.id) !== id
        );

        renderRequests();
        await loadDashboard();

        showToast("درخواست حذف شد.");
      } catch (error) {
        showToast(
          error.message || "حذف درخواست انجام نشد.",
          "error"
        );

        console.error("Delete request failed:", error);
      } finally {
        button.disabled = false;
      }
    });
  }

  // ناوبری بخش‌های پنل
  document.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => {
      const section = button.dataset.section;

      if (section === "dashboard") {
        loadDashboard().catch((error) => {
          showToast(error.message, "error");
        });
      }

      if (section === "requests") {
        loadRequests().catch((error) => {
          showToast(error.message, "error");
        });
      }
    });
  });

  // شروع برنامه
  setupStatusFilter();
  checkAuthentication();
})();
