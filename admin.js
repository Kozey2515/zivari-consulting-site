"use strict";

(() => {
  const $ = (selector) => document.querySelector(selector);

  const loginBox = $("#login");
  const panel = $("#panel");
  const loginForm = $("#lf");
  const passwordInput = $("#pw");
  const loginStatus = $("#ls");
  const loginButton = $("#loginBtn");
  const logoutButton = $("#out");
  const refreshButton = $("#ref");

  const table = $("#table");
  const searchInput = $("#searchRequests");
  const statusFilter = $("#statusFilter");

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

  const SECTION_TITLES = {
    dashboard: "داشبورد مدیریت",
    requests: "درخواست‌های مشاوره",
    followups: "پیگیری مراجعان",
    students: "پرونده دانش‌آموزان",
    appointments: "جلسات مشاوره",
    reports: "گزارش‌های مدیریتی"
  };

  const SECTION_IDS = {
    dashboard: "dashboardSection",
    requests: "requestsSection",
    followups: "followupsSection",
    students: "studentsSection",
    appointments: "appointmentsSection",
    reports: "reportsSection"
  };

  let requests = [];
  let isLoading = false;
  let isAuthenticated = false;
  let toastTimer = null;

  /* =====================================
     توابع عمومی
  ===================================== */

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

  function showToast(message, type = "success") {
    if (!toastElement) {
      alert(message);
      return;
    }

    toastElement.textContent = message;
    toastElement.style.borderColor =
      type === "error" ? "#ff7777" : "#d4af37";

    toastElement.hidden = false;

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      toastElement.hidden = true;
    }, 3500);
  }

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

    if (!response.ok) {
      const error = new Error(
        data.error || `خطای سرور (${response.status})`
      );

      error.status = response.status;

      throw error;
    }

    return data;
  }

  function setNumber(element, value) {
    if (!element) return;

    const number = Number(value || 0);

    element.textContent = Number.isFinite(number)
      ? number.toLocaleString("fa-IR")
      : "۰";
  }

  function formatDate(value) {
    if (!value) return "نامشخص";

    const date = new Date(
      String(value).replace(" ", "T")
    );

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

  /* =====================================
     نمایش فرم ورود و پنل
  ===================================== */

  function showLogin(message = "") {
    isAuthenticated = false;

    if (loginBox) {
      loginBox.hidden = false;
    }

    if (panel) {
      panel.hidden = true;
    }

    if (loginStatus) {
      loginStatus.textContent = message;
    }

    if (passwordInput) {
      passwordInput.value = "";
    }
  }

  function showPanel() {
    isAuthenticated = true;

    if (loginBox) {
      loginBox.hidden = true;
    }

    if (panel) {
      panel.hidden = false;
    }

    if (loginStatus) {
      loginStatus.textContent = "";
    }
  }

  /* =====================================
     مدیریت بخش‌های پنل
  ===================================== */

  function showSection(name) {
    if (!isAuthenticated) return;

    const selectedId = SECTION_IDS[name];

    if (!selectedId) return;

    Object.values(SECTION_IDS).forEach((id) => {
      const section = document.getElementById(id);

      if (section) {
        section.hidden = true;
      }
    });

    const selected = document.getElementById(selectedId);

    if (selected) {
      selected.hidden = false;
    }

    document.querySelectorAll(".nav-item").forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.section === name
      );
    });

    const title = $("#pageTitle");

    if (title) {
      title.textContent = SECTION_TITLES[name];
    }

    if (name === "dashboard") {
      loadDashboard().catch(handleError);
    }

    if (name === "requests") {
      loadRequests().catch(handleError);
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  function setupNavigation() {
    document.querySelectorAll("[data-section]").forEach((button) => {
      button.addEventListener("click", () => {
        showSection(button.dataset.section);
      });
    });
  }

  /* =====================================
     فیلتر وضعیت درخواست‌ها
  ===================================== */

  function setupStatusFilter() {
    if (!statusFilter) return;

    const currentValue = statusFilter.value;

    statusFilter.innerHTML = `
      <option value="">همه وضعیت‌ها</option>
      <option value="new">جدید</option>
      <option value="contacted">در حال پیگیری</option>
      <option value="done">تکمیل‌شده</option>
      <option value="cancelled">لغوشده</option>
    `;

    statusFilter.value = VALID_STATUSES.includes(currentValue)
      ? currentValue
      : "";
  }

  /* =====================================
     داشبورد
  ===================================== */

  async function loadDashboard() {
    const data = await api("/api/admin/dashboard");
    const stats = data.stats || {};

    setNumber(totalCount, stats.total);
    setNumber(newCount, stats.new);
    setNumber(pendingCount, stats.pending);
    setNumber(completedCount, stats.completed);

    if (newBadge) {
      const count = Number(stats.new || 0);

      newBadge.textContent = count.toLocaleString("fa-IR");
      newBadge.hidden = count === 0;
    }

    renderRecentRequests(
      Array.isArray(data.recent) ? data.recent : []
    );
  }

  function renderRecentRequests(items) {
    if (!recentRequests) return;

    if (!items.length) {
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
            <strong>
              ${escapeHTML(item.name || "بدون نام")}
            </strong>

            <small>
              ${escapeHTML(item.phone || "—")}
            </small>
          </div>

          <div>
            <span class="status-pill">
              ${STATUS_LABELS[status]}
            </span>

            <br>

            <small>
              ${escapeHTML(formatDate(item.created_at))}
            </small>
          </div>
        </div>
      `;
    }).join("");
  }

  /* =====================================
     درخواست‌های مشاوره
  ===================================== */

  async function loadRequests() {
    const data = await api("/api/admin/requests");

    requests = Array.isArray(data)
      ? data
      : Array.isArray(data.requests)
        ? data.requests
        : [];

    renderRequests();
  }

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

  function renderRequests() {
    if (!table) return;

    const filtered = getFilteredRequests();

    if (!filtered.length) {
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

          <td>${escapeHTML(item.message || "—")}</td>

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

  /* =====================================
     به‌روزرسانی اطلاعات
  ===================================== */

  async function refreshAll() {
    if (isLoading || !isAuthenticated) return;

    isLoading = true;

    const originalText = refreshButton
      ? refreshButton.textContent
      : "";

    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.textContent = "در حال بروزرسانی...";
    }

    try {
      const results = await Promise.allSettled([
        loadDashboard(),
        loadRequests()
      ]);

      const failed = results.find(
        (result) => result.status === "rejected"
      );

      if (failed) {
        handleError(failed.reason);
      } else {
        showToast("اطلاعات با موفقیت به‌روزرسانی شد.");
      }
    } finally {
      isLoading = false;

      if (refreshButton) {
        refreshButton.disabled = false;
        refreshButton.textContent =
          originalText || "↻ به‌روزرسانی";
      }
    }
  }

  /* =====================================
     ورود و بررسی نشست
  ===================================== */

  async function checkAuthentication() {
    // فرم ابتدا نمایش داده می‌شود و فقط پس از تأیید
    // سرور، پنل مدیریت باز خواهد شد.
    showLogin();

    try {
      const data = await api("/api/admin/me");

      if (data.authenticated === true) {
        showPanel();
        setupStatusFilter();
        await refreshAll();
      } else {
        showLogin();
      }
    } catch (error) {
      console.error("Authentication check failed:", error);

      showLogin(
        "بررسی ورود ناموفق بود. اتصال سرور را بررسی کن."
      );
    }
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const password = passwordInput?.value || "";

      if (!password) {
        if (loginStatus) {
          loginStatus.textContent = "رمز عبور را وارد کن.";
        }

        passwordInput?.focus();
        return;
      }

      if (loginButton) {
        loginButton.disabled = true;
        loginButton.textContent = "در حال ورود...";
      }

      try {
        const result = await api("/api/admin/login", {
          method: "POST",
          body: JSON.stringify({ password })
        });

        if (!result.authenticated) {
          throw new Error("ورود تأیید نشد.");
        }

        if (passwordInput) {
          passwordInput.value = "";
        }

        showPanel();
        setupStatusFilter();

        await refreshAll();

        showToast("ورود با موفقیت انجام شد.");

      } catch (error) {
        console.error("Login failed:", error);

        showLogin(
          error.message || "ورود انجام نشد. دوباره تلاش کن."
        );

      } finally {
        if (loginButton) {
          loginButton.disabled = false;
          loginButton.textContent = "ورود به پنل";
        }
      }
    });
  }

  /* =====================================
     خروج
  ===================================== */

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      logoutButton.disabled = true;

      try {
        await api("/api/admin/logout", {
          method: "POST",
          body: JSON.stringify({})
        });

        requests = [];

        showLogin("از پنل مدیریت خارج شدی.");

      } catch (error) {
        handleError(error);

      } finally {
        logoutButton.disabled = false;
      }
    });
  }

  /* =====================================
     تغییر وضعیت درخواست
  ===================================== */

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

      const request = requests.find(
        (item) => Number(item.id) === id
      );

      const previousStatus = request?.status;

      select.disabled = true;

      try {
        await api(`/api/admin/requests/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ status })
        });

        if (request) {
          request.status = status;
        }

        renderRequests();

        await loadDashboard();

        showToast("وضعیت درخواست تغییر کرد.");

      } catch (error) {
        showToast(
          error.message || "تغییر وضعیت انجام نشد.",
          "error"
        );

        if (previousStatus) {
          select.value = previousStatus;
        }

      } finally {
        select.disabled = false;
      }
    });

    /* ===================================
       حذف درخواست
    =================================== */

    table.addEventListener("click", async (event) => {
      const button = event.target.closest(
        'button[data-action="delete"]'
      );

      if (!button) return;

      const row = button.closest("[data-request-id]");
      const id = Number(row?.dataset.requestId);

      if (!Number.isInteger(id) || id < 1) return;

      const confirmed = confirm(
        "آیا از حذف این درخواست مطمئنی؟ این کار قابل بازگشت نیست."
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
        handleError(error);

      } finally {
        button.disabled = false;
      }
    });
  }

  /* =====================================
     جست‌وجو و فیلتر
  ===================================== */

  if (searchInput) {
    searchInput.addEventListener("input", renderRequests);
  }

  if (statusFilter) {
    statusFilter.addEventListener("change", renderRequests);
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", refreshAll);
  }

  /* =====================================
     مدیریت خطا
  ===================================== */

  function handleError(error) {
    if (error?.status === 401) {
      showLogin(
        "نشست ورود معتبر نیست. لطفاً دوباره وارد شو."
      );

      return;
    }

    console.error("Panel error:", error);

    showToast(
      error?.message || "خطایی رخ داد. دوباره تلاش کن.",
      "error"
    );
  }

  /* =====================================
     شروع برنامه
  ===================================== */

  setupStatusFilter();
  setupNavigation();
  checkAuthentication();

})();
