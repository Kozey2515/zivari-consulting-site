(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  let requests = [];
  let users = [];
  let students = [];
  let activeStudentId = null;
  let messageTimer = null;

  const pageInfo = {
    dashboard: ["داشبورد", "نمای کلی عملکرد مجموعه"],
    requests: ["درخواست‌های مشاوره", "مدیریت درخواست‌های ثبت‌شده"],
    users: ["مدیریت کاربران", "ساخت و مشاهده حساب‌های کاربری"],
    students: ["دانش‌آموزان", "مشاهده پرونده‌ها و گزارش‌های درسی"],
    reports: ["گزارش‌ها", "آمار کلی و خروجی اطلاعات"]
  };

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  const number = value =>
    new Intl.NumberFormat("fa-IR").format(Number(value) || 0);

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 && !url.includes("/login")) {
        showLogin();
      }

      throw new Error(data.error || "خطا در ارتباط با سرور");
    }

    return data;
  }

  function showMessage(message, error = false) {
    const element = $("#global-message");
    if (!element) return;

    clearTimeout(messageTimer);

    element.textContent = message;
    element.classList.toggle("is-error", error);
    element.classList.add("is-visible");

    messageTimer = setTimeout(() => {
      element.classList.remove("is-visible");
    }, 4000);
  }

  function showLogin() {
    $("#login-view").hidden = false;
    $("#admin-app").hidden = true;
  }

  function showApp() {
    $("#login-view").hidden = true;
    $("#admin-app").hidden = false;
  }

  function statusLabel(status) {
    return ({
      new: "جدید",
      contacted: "در حال پیگیری",
      done: "تکمیل‌شده",
      cancelled: "لغوشده",
      pending: "در انتظار بررسی",
      approved: "تأییدشده",
      rejected: "ردشده"
    })[status] || status || "نامشخص";
  }

  function statusBadge(status) {
    return `<span class="status-badge status-${escapeHTML(status)}">${escapeHTML(statusLabel(status))}</span>`;
  }

  function emptyRow(columns, text = "اطلاعاتی برای نمایش وجود ندارد.") {
    return `<tr><td colspan="${columns}" class="empty-cell">${escapeHTML(text)}</td></tr>`;
  }

  function openPage(page) {
    if (!pageInfo[page]) return;

    $$(".page-section").forEach(section => {
      section.hidden = section.id !== `page-${page}`;
    });

    $$(".nav-item").forEach(button => {
      button.classList.toggle("active", button.dataset.page === page);
    });

    $("#page-title").textContent = pageInfo[page][0];
    $("#page-description").textContent = pageInfo[page][1];

    if (page === "dashboard") loadDashboard();
    if (page === "requests") loadRequests();
    if (page === "users") loadUsers();
    if (page === "students") loadStudents();
    if (page === "reports") loadReports();
  }

  async function loadDashboard() {
    try {
      const data = await api("/api/admin/dashboard");
      const stats = data.stats || {};

      $("#stat-total").textContent = number(stats.total);
      $("#stat-new").textContent = number(stats.new);
      $("#stat-pending").textContent = number(stats.pending);
      $("#stat-completed").textContent = number(stats.completed);

      renderRecent(data.recent || []);
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  function renderRecent(items) {
    const tbody = $("#recent-requests");

    if (!items.length) {
      tbody.innerHTML = emptyRow(5);
      return;
    }

    tbody.innerHTML = items.map(item => `
      <tr>
        <td>${escapeHTML(item.name)}</td>
        <td>${escapeHTML(item.phone)}</td>
        <td>${escapeHTML(item.service || "ثبت نشده")}</td>
        <td>${statusBadge(item.status)}</td>
        <td>
          <button class="small-button" data-request-detail="${Number(item.id)}">
            جزئیات
          </button>
        </td>
      </tr>
    `).join("");
  }

  async function loadRequests() {
    try {
      const data = await api("/api/admin/requests");
      requests = Array.isArray(data) ? data : [];
      renderRequests();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  function renderRequests() {
    const query = $("#request-search").value.trim().toLocaleLowerCase();
    const status = $("#request-status-filter").value;

    const filtered = requests.filter(item => {
      const text = [
        item.name,
        item.phone,
        item.grade,
        item.service,
        item.message
      ].join(" ").toLocaleLowerCase();

      return text.includes(query) && (!status || item.status === status);
    });

    const tbody = $("#requests-table");

    if (!filtered.length) {
      tbody.innerHTML = emptyRow(7);
      return;
    }

    tbody.innerHTML = filtered.map(item => `
      <tr>
        <td>${escapeHTML(item.name)}</td>
        <td>${escapeHTML(item.phone)}</td>
        <td>${escapeHTML(item.grade || "-")}</td>
        <td>${escapeHTML(item.service || "-")}</td>
        <td>${escapeHTML(item.created_at || "-")}</td>
        <td>
          <select data-status-id="${Number(item.id)}" aria-label="تغییر وضعیت درخواست">
            ${[
              ["new", "جدید"],
              ["contacted", "در حال پیگیری"],
              ["done", "تکمیل‌شده"],
              ["cancelled", "لغوشده"]
            ].map(([value, label]) => `
              <option value="${value}" ${item.status === value ? "selected" : ""}>
                ${label}
              </option>
            `).join("")}
          </select>
        </td>
        <td>
          <button class="small-button" data-request-detail="${Number(item.id)}">
            مشاهده
          </button>
          <button class="small-button danger-button" data-delete-request="${Number(item.id)}">
            حذف
          </button>
        </td>
      </tr>
    `).join("");
  }

  async function updateRequestStatus(id, status) {
    try {
      await api(`/api/admin/requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });

      showMessage("وضعیت درخواست به‌روزرسانی شد.");
      await loadRequests();
      await loadDashboard();
    } catch (error) {
      showMessage(error.message, true);
      await loadRequests();
    }
  }

  async function deleteRequest(id) {
    if (!confirm("آیا از حذف این درخواست مطمئن هستید؟ این عملیات قابل بازگشت نیست.")) {
      return;
    }

    try {
      await api(`/api/admin/requests/${id}`, {
        method: "DELETE"
      });

      showMessage("درخواست حذف شد.");
      await loadRequests();
      await loadDashboard();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  function showRequestDetails(id) {
    const item = requests.find(request => Number(request.id) === Number(id));

    if (!item) {
      showMessage("اطلاعات درخواست پیدا نشد.", true);
      return;
    }

    $("#request-details").innerHTML = `
      <dl class="details-list">
        <dt>نام</dt>
        <dd>${escapeHTML(item.name)}</dd>

        <dt>شماره تماس</dt>
        <dd>${escapeHTML(item.phone)}</dd>

        <dt>پایه تحصیلی</dt>
        <dd>${escapeHTML(item.grade || "-")}</dd>

        <dt>خدمت درخواستی</dt>
        <dd>${escapeHTML(item.service || "-")}</dd>

        <dt>تاریخ ثبت</dt>
        <dd>${escapeHTML(item.created_at || "-")}</dd>

        <dt>وضعیت</dt>
        <dd>${statusBadge(item.status)}</dd>

        <dt>توضیحات</dt>
        <dd class="preserve-lines">${escapeHTML(item.message || "توضیحی ثبت نشده است.")}</dd>
      </dl>
    `;

    $("#request-dialog").showModal();
  }

  async function loadUsers() {
    try {
      const data = await api("/api/users");
      users = data.users || [];

      $("#users-table").innerHTML = users.length
        ? users.map(user => `
            <tr>
              <td>${escapeHTML(user.full_name)}</td>
              <td>${escapeHTML(user.username)}</td>
              <td>${user.role === "admin" ? "مدیر" : user.role === "counselor" ? "مشاور" : "دانش‌آموز"}</td>
              <td>${escapeHTML(user.phone || "-")}</td>
              <td>${user.active ? "فعال" : "غیرفعال"}</td>
            </tr>
          `).join("")
        : emptyRow(5);
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  async function createUser(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));

    try {
      await api("/api/users", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      form.reset();
      showMessage("حساب کاربری ساخته شد.");

      await loadUsers();
      await loadStudents();
      await loadReports();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  async function loadStudents() {
    try {
      const data = await api("/api/students");
      students = data.students || [];

      $("#students-table").innerHTML = students.length
        ? students.map(student => `
            <tr>
              <td>${escapeHTML(student.full_name)}</td>
              <td>${escapeHTML(student.student_code || "-")}</td>
              <td>${escapeHTML(student.grade || "ثبت نشده")}</td>
              <td>${number(student.id)}</td>
              <td>
                <button class="small-button" data-open-student="${Number(student.id)}">
                  مشاهده پرونده
                </button>
              </td>
            </tr>
          `).join("")
        : emptyRow(5);
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  async function openStudent(id) {
    activeStudentId = Number(id);

    try {
      const [studentData, plansData, reportsData, changesData] = await Promise.all([
        api(`/api/students/${id}`),
        api(`/api/students/${id}/plans`),
        api(`/api/students/${id}/reports`),
        api(`/api/students/${id}/change-requests`)
      ]);

      const student = studentData.student;

      $("#student-details-title").textContent = `پرونده ${student.full_name}`;

      $("#student-plans").innerHTML = renderDataList(
        plansData.plans || [],
        item => `
          <strong>${escapeHTML(item.title)}</strong>
          <p>${escapeHTML(item.subject)} | ${escapeHTML(item.plan_date)}</p>
          <p>${escapeHTML(item.task)}</p>
          <small>${number(item.duration_minutes)} دقیقه</small>
        `
      );

      $("#student-reports").innerHTML = renderDataList(
        reportsData.reports || [],
        item => `
          <strong>${escapeHTML(item.subject)}</strong>
          <p>تاریخ: ${escapeHTML(item.report_date)}</p>
          <p>برنامه: ${number(item.planned_minutes)} دقیقه | انجام‌شده: ${number(item.actual_minutes)} دقیقه</p>
          <p>درصد انجام: ${number(item.completion_percent)}٪</p>
          <p>${escapeHTML(item.note || "")}</p>
          <label>بازخورد مشاور
            <textarea data-feedback="${Number(item.id)}" maxlength="2000">${escapeHTML(item.counselor_feedback || "")}</textarea>
          </label>
          <button class="small-button" data-save-feedback="${Number(item.id)}">
            ذخیره بازخورد
          </button>
        `
      );

      $("#student-change-requests").innerHTML = renderDataList(
        changesData.requests || [],
        item => `
          <p>${escapeHTML(item.message)}</p>
          <p>وضعیت: ${statusBadge(item.status)}</p>
          <p>پاسخ: ${escapeHTML(item.counselor_reply || "پاسخی ثبت نشده است.")}</p>
          ${item.status === "pending" ? `
            <label>پاسخ مشاور
              <textarea data-reply="${Number(item.id)}" maxlength="2000"></textarea>
            </label>
            <button class="small-button" data-change-action="${Number(item.id)}" data-change-status="approved">
              تأیید
            </button>
            <button class="small-button danger-button" data-change-action="${Number(item.id)}" data-change-status="rejected">
              رد
            </button>
          ` : ""}
        `
      );

      $("#student-details").hidden = false;
      $("#student-details").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  function renderDataList(items, renderItem) {
    if (!items.length) {
      return '<p class="empty-cell">اطلاعاتی ثبت نشده است.</p>';
    }

    return items.map(item => `
      <article class="data-list-item">${renderItem(item)}</article>
    `).join("");
  }

  async function saveFeedback(id) {
    const textarea = document.querySelector(`[data-feedback="${id}"]`);
    if (!textarea) return;

    try {
      await api(`/api/reports/${id}/feedback`, {
        method: "PATCH",
        body: JSON.stringify({ feedback: textarea.value })
      });

      showMessage("بازخورد ذخیره شد.");
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  async function updateChangeRequest(id, status) {
    const reply = document.querySelector(`[data-reply="${id}"]`)?.value || "";

    try {
      await api(`/api/change-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          counselor_reply: reply
        })
      });

      showMessage("درخواست تغییر برنامه به‌روزرسانی شد.");

      if (activeStudentId) {
        await openStudent(activeStudentId);
      }

      await loadReports();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  async function loadReports() {
    try {
      const [usersData, studentsData, requestsData] = await Promise.all([
        api("/api/users"),
        api("/api/students"),
        api("/api/admin/requests")
      ]);

      const allUsers = usersData.users || [];
      const allStudents = studentsData.students || [];
      const allRequests = Array.isArray(requestsData) ? requestsData : [];

      $("#report-users").textContent = number(allUsers.length);
      $("#report-students").textContent = number(allStudents.length);

      let reportCount = 0;
      let changeCount = 0;

      const details = await Promise.all(
        allStudents.map(async student => {
          try {
            const [reports, changes] = await Promise.all([
              api(`/api/students/${student.id}/reports`),
              api(`/api/students/${student.id}/change-requests`)
            ]);

            return {
              reports: reports.reports || [],
              changes: changes.requests || []
            };
          } catch {
            return { reports: [], changes: [] };
          }
        })
      );

      for (const item of details) {
        reportCount += item.reports.length;
        changeCount += item.changes.length;
      }

      $("#report-daily").textContent = number(reportCount);
      $("#report-changes").textContent = number(changeCount);

      requests = allRequests;
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  function exportRequests() {
    const columns = [
      ["id", "شناسه"],
      ["name", "نام"],
      ["phone", "شماره تماس"],
      ["grade", "پایه"],
      ["service", "خدمت"],
      ["message", "توضیحات"],
      ["status", "وضعیت"],
      ["created_at", "تاریخ ثبت"]
    ];

    const csvCell = value =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const rows = [
      columns.map(([, label]) => label),
      ...requests.map(item => columns.map(([key]) => item[key] ?? ""))
    ];

    const csv = "\uFEFF" + rows
      .map(row => row.map(csvCell).join(","))
      .join("\r\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "zivari-requests.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function login(event) {
    event.preventDefault();

    const button = $("#login-button");
    const errorElement = $("#login-error");
    const password = $("#admin-password").value;

    button.disabled = true;
    errorElement.textContent = "";

    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password })
      });

      $("#login-form").reset();

      showApp();
      openPage("dashboard");
    } catch (error) {
      errorElement.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  async function logout() {
    try {
      await api("/api/admin/logout", {
        method: "POST"
      });
    } catch {
      // نشست ممکن است قبلاً منقضی شده باشد.
    }

    showLogin();
  }

  async function initialize() {
    try {
      const result = await api("/api/admin/me");

      if (!result.authenticated) {
        showLogin();
        return;
      }

      const me = await api("/api/auth/me");

      if (me.user.role !== "admin") {
        await logout();
        return;
      }

      showApp();
      openPage("dashboard");
    } catch {
      showLogin();
    }
  }

  $("#login-form").addEventListener("submit", login);
  $("#logout-button").addEventListener("click", logout);
  $("#user-form").addEventListener("submit", createUser);

  $("#request-search").addEventListener("input", renderRequests);

  $("#request-status-filter").addEventListener("change", renderRequests);

  $("#refresh-button").addEventListener("click", () => {
    const active = $(".nav-item.active")?.dataset.page || "dashboard";
    openPage(active);
  });

  $("#export-requests").addEventListener("click", async () => {
    await loadRequests();
    exportRequests();
  });

  $("#close-student-details").addEventListener("click", () => {
    $("#student-details").hidden = true;
    activeStudentId = null;
  });

  document.addEventListener("click", event => {
    const target = event.target.closest("button");
    if (!target) return;

    if (target.dataset.page) {
      openPage(target.dataset.page);
    }

    if (target.dataset.goto) {
      openPage(target.dataset.goto);
    }

    if (target.dataset.requestDetail) {
      const id = Number(target.dataset.requestDetail);

      if (!requests.length) {
        loadRequests().then(() => showRequestDetails(id));
      } else {
        showRequestDetails(id);
      }
    }

    if (target.dataset.deleteRequest) {
      deleteRequest(Number(target.dataset.deleteRequest));
    }

    if (target.dataset.openStudent) {
      openStudent(Number(target.dataset.openStudent));
    }

    if (target.dataset.saveFeedback) {
      saveFeedback(Number(target.dataset.saveFeedback));
    }

    if (target.dataset.changeAction) {
      updateChangeRequest(
        Number(target.dataset.changeAction),
        target.dataset.changeStatus
      );
    }
  });

  document.addEventListener("change", event => {
    const select = event.target.closest("[data-status-id]");
    if (!select) return;

    updateRequestStatus(
      Number(select.dataset.statusId),
      select.value
    );
  });

  initialize();
})();
