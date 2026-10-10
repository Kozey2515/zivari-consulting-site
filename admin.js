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

  const VALID_STATUSES = ["new", "contacted", "done", "cancelled"];

  const STATUS_LABELS = {
    new: "جدید",
    contacted: "در حال پیگیری",
    done: "تکمیل‌شده",
    cancelled: "لغوشده"
  };

  let requests = [];
  let isLoading = false;

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function showToast(message, type = "success") {
    if (!toastElement) {
      alert(message);
      return;
    }

    toastElement.textContent = message;
    toastElement.classList.remove("show", "success", "error");

    toastElement.classList.add(type === "error" ? "error" : "success");
    toastElement.classList.add("show");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
      toastElement.classList.remove("show");
    }, 3000);
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
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
      showLogin();
      throw new Error("نشست شما منقضی شده است؛ دوباره وارد شوید.");
    }

    if (!response.ok || data.ok === false) {
      throw new Error(data.error || "ارتباط با سرور با مشکل مواجه شد.");
    }

    return data;
  }

  function showLogin(message = "") {
    if (loginBox) loginBox.style.display = "";
    if (panel) panel.style.display = "none";

    if (loginStatus) {
      loginStatus.textContent = message;
    }
  }

  function showPanel() {
    if (loginBox) loginBox.style.display = "none";
    if (panel) panel.style.display = "";
    if (loginStatus) loginStatus.textContent = "";
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

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

  function ensureStatusFilter() {
    if (!statusFilter) return;

    const currentValue = statusFilter.value;

    statusFilter.innerHTML = `
      <option value="">همه وضعیت‌ها</option>
      <option value="new">جدید</option>
      <option value="contacted">در حال پیگیری</option>
      <option value="done">تکمیل‌شده</option>
      <option value="cancelled">لغوشده</option>
    `;

    if (["", ...VALID_STATUSES].includes(currentValue)) {
      statusFilter.value = currentValue;
    }
  }

  function setText(element, value) {
    if (element) element.textContent = String(value ?? 0);
  }

  async function loadDashboard() {
    const data = await api("/api/admin/dashboard");

    const stats = data.stats || {};

    setText(totalCount, stats.total);
    setText(newCount, stats.new);
    setText(pendingCount, stats.pending);
    setText(completedCount, stats.completed);

    if (newBadge) {
      newBadge.textContent = String(stats.new ?? 0);
      newBadge.style.display = Number(stats.new) > 0 ? "" : "none";
    }

    renderRecentRequests(data.recent || []);
  }

  function renderRecentRequests(items) {
    if (!recentRequests) return;

    if (!items.length) {
      recentRequests.innerHTML = `
        <div class="empty-state">
          هنوز درخواستی ثبت نشده است.
        </div>
      `;
      return;
    }

    recentRequests.innerHTML = items.map((item) => `
      <div class="recent-item">
        <div class="recent-item-info">
          <strong>${escapeHTML(item.name)}</strong>
          <span>${escapeHTML(item.phone)}</span>
        </div>
        <div class="recent-item-meta">
          <span class="status status-${escapeHTML(item.status)}">
            ${escapeHTML(STATUS_LABELS[item.status] || item.status || "نامشخص")}
          </span>
          <small>${escapeHTML(formatDate(item.created_at))}</small>
        </div>
      </div>
    `).join("");
  }

  function getFilteredRequests() {
    const searchTerm = (searchInput?.value || "").trim().toLocaleLowerCase();
    const selectedStatus = statusFilter?.value || "";

    return requests.filter((item) => {
      const matchesStatus =
        !selectedStatus || item.status === selectedStatus;

      const searchableText = [
        item.name,
        item.phone,
        item.grade,
        item.service,
        item.message
      ].join(" ").toLocaleLowerCase();

      const matchesSearch =
        !searchTerm || searchableText.includes(searchTerm);

      return matchesStatus && matchesSearch;
    });
  }

  function renderRequests() {
    if (!table) return;

    const filtered = getFilteredRequests();

    if (!filtered.length) {
      table.innerHTML = `
        <tr>
          <td colspan="7" class="empty-state">
            درخواستی با این مشخصات پیدا نشد.
          </td>
        </tr>
      `;
      return;
    }

    table.innerHTML = filtered.map((item) => {
      const id = Number(item.id);

      const statusOptions = VALID_STATUSES.map((status) => `
        <option value="${status}"
          ${item.status === status ? "selected" : ""}>
          ${STATUS_LABELS[status]}
        </option>
      `).join("");

      return `
        <tr data-request-id="${id}">
          <td>${id}</td>
          <td>
            <strong>${escapeHTML(item.name)}</strong>
            <div class="muted">${escapeHTML(item.phone)}</div>
          </td>
          <td>${escapeHTML(item.grade || "—")}</td>
          <td>${escapeHTML(item.service || "—")}</td>
          <td>
            <div class="request-message">
              ${escapeHTML(item.message || "—")}
            </div>
          </td>
          <td>
            <select
              class="request-status"
              data-action="status"
              aria-label="تغییر وضعیت درخواست ${id}">
              ${statusOptions}
            </select>
          </td>
          <td>
            <div class="request-actions">
              <small>${escapeHTML(formatDate(item.created_at))}</small>
              <button
                type="button"
                class="danger"
                data-action="delete"
                aria-label="حذف درخواست ${id}">
                حذف
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  async function loadRequests() {
    const data = await api("/api/admin/requests");

    requests = Array.isArray(data.requests)
      ? data.requests
      : Array.isArray(data)
        ? data
        : [];

    renderRequests();
  }

  async function refreshAll() {
    if (isLoading) return;

    isLoading = true;

    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.textContent = "در حال بروزرسانی…";
    }

    try {
      await Promise.all([
        loadDashboard(),
        loadRequests()
      ]);
    } catch (error) {
      showToast(error.message || "دریافت اطلاعات ناموفق بود.", "error");
    } finally {
      isLoading = false;

      if (refreshButton) {
        refreshButton.disabled = false;
        refreshButton.textContent = "بروزرسانی";
      }
    }
  }

  async function checkAuthentication() {
    try {
      const data = await api("/api/admin/me");

      if (data.authenticated) {
        showPanel();
        ensureStatusFilter();
        await refreshAll();
      } else {
        showLogin();
      }
    } catch {
      showLogin();
    }
  }

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

        if (passwordInput) passwordInput.value = "";

        showPanel();
        ensureStatusFilter();

        await refreshAll();

        showToast("با موفقیت وارد پنل مدیریت شدی.");
      } catch (error) {
        if (loginStatus) {
          loginStatus.textContent =
            error.message || "ورود انجام نشد.";
        } else {
          showToast(error.message || "ورود انجام نشد.", "error");
        }
      } finally {
        if (loginButton) {
          loginButton.disabled = false;
          loginButton.textContent = "ورود به پنل";
        }
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      try {
        await api("/api/admin/logout", {
          method: "POST",
          body: JSON.stringify({})
        });
      } catch {
        // حتی در صورت خطا، صفحه ورود نمایش داده می‌شود.
      }

      requests = [];
      showLogin("از پنل مدیریت خارج شدی.");
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", refreshAll);
  }

  if (searchInput) {
    searchInput.addEventListener("input", renderRequests);
  }

  if (statusFilter) {
    statusFilter.addEventListener("change", renderRequests);
  }

  if (table) {
    table.addEventListener("change", async (event) => {
      const select = event.target.closest(
        'select[data-action="status"]'
      );

      if (!select) return;

      const row = select.closest("tr");
      const id = Number(row?.dataset.requestId);
      const status = select.value;

      if (!Number.isInteger(id) || id < 1) return;

      if (!VALID_STATUSES.includes(status)) {
        showToast("وضعیت انتخاب‌شده معتبر نیست.", "error");
        return;
      }

      select.disabled = true;

      try {
        await api(`/api/admin/requests/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ status })
        });

        const request = requests.find((item) => Number(item.id) === id);

        if (request) request.status = status;

        renderRequests();
        await loadDashboard();

        showToast("وضعیت درخواست تغییر کرد.");
      } catch (error) {
        showToast(error.message || "تغییر وضعیت انجام نشد.", "error");
        await loadRequests().catch(() => {});
      } finally {
        select.disabled = false;
      }
    });

    table.addEventListener("click", async (event) => {
      const button = event.target.closest(
        'button[data-action="delete"]'
      );

      if (!button) return;

      const row = button.closest("tr");
      const id = Number(row?.dataset.requestId);

      if (!Number.isInteger(id) || id < 1) return;

      if (!confirm("از حذف این درخواست مطمئنی؟ این کار قابل بازگشت نیست.")) {
        return;
      }

      button.disabled = true;

      try {
        await api(`/api/admin/requests/${id}`, {
          method: "DELETE"
        });

        requests = requests.filter((item) => Number(item.id) !== id);

        renderRequests();
        await loadDashboard();

        showToast("درخواست حذف شد.");
      } catch (error) {
        showToast(error.message || "حذف درخواست انجام نشد.", "error");
        await loadRequests().catch(() => {});
      } finally {
        button.disabled = false;
      }
    });
  }

  // بخش‌هایی که نیاز به اطلاعات سرور دارند، در زمان باز شدن تازه‌سازی می‌شوند.
  document.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.section === "dashboard") {
        refreshAll();
      }

      if (button.dataset.section === "requests") {
        loadRequests().catch((error) => {
          showToast(error.message || "دریافت درخواست‌ها ناموفق بود.", "error");
        });
      }
    });
  });

  ensureStatusFilter();
  checkAuthentication();
})();
