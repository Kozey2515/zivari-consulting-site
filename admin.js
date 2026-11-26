
(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  let requests = [];
  let users = [];
  let students = [];
  let contentItems = [];
  let mediaItems = [];
  let activeStudentId = null;
  let activeContentFilter = "all";
  let messageTimer = null;
  let previousPage = "content";

  const pageInfo = {
    dashboard: ["داشبورد", "نمای کلی عملکرد مجموعه"],
    requests: ["درخواست‌های مشاوره", "مدیریت درخواست‌های ثبت‌شده"],
    users: ["مدیریت کاربران", "ساخت و مشاهده حساب‌های کاربری"],
    students: ["دانش‌آموزان", "مشاهده پرونده‌ها و گزارش‌های درسی"],
    reports: ["گزارش‌ها", "آمار کلی و خروجی اطلاعات"],
    content: ["مدیریت محتوا", "مدیریت مقاله‌ها، ویدئوها و پادکست‌ها"],
    articles: ["مقاله‌ها", "مدیریت مقاله‌های منتشرشده و پیش‌نویس‌ها"],
    videos: ["ویدئوها", "مدیریت ویدئوهای آموزشی"],
    podcasts: ["پادکست‌ها", "مدیریت فایل‌ها و محتوای صوتی"],
    media: ["کتابخانه رسانه", "مدیریت فایل‌های تصویری، صوتی و ویدئویی"],
    settings: ["تنظیمات سایت", "مدیریت متن‌های صفحه اصلی"],
    editor: ["ویرایش محتوا", "ایجاد یا ویرایش محتوای سایت"]
  };

  const typeLabels = {
    article: "مقاله",
    video: "ویدئو",
    podcast: "پادکست"
  };

  const statusLabels = {
    new: "جدید",
    contacted: "در حال پیگیری",
    done: "تکمیل‌شده",
    cancelled: "لغوشده",
    pending: "در انتظار بررسی",
    approved: "تأییدشده",
    rejected: "ردشده",
    draft: "پیش‌نویس",
    published: "منتشرشده"
  };

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function number(value) {
    return new Intl.NumberFormat("fa-IR").format(Number(value) || 0);
  }

  function formatSize(bytes) {
    const size = Number(bytes) || 0;

    if (size < 1024) return `${number(size)} بایت`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} کیلوبایت`;

    return `${(size / (1024 * 1024)).toFixed(1)} مگابایت`;
  }

  function safeUrl(value) {
    const url = String(value || "").trim();

    if (!url) return "";

    if (url.startsWith("/uploads/")) {
      return url;
    }

    try {
      const parsed = new URL(url, window.location.origin);

      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.href;
      }
    } catch {
      return "";
    }

    return "";
  }

  async function api(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    const isFormData = options.body instanceof FormData;

    if (options.body && !isFormData && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers
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
    }, 4500);
  }

  function showLogin() {
    $("#login-view").hidden = false;
    $("#admin-app").hidden = true;
  }

  function showApp() {
    $("#login-view").hidden = true;
    $("#admin-app").hidden = false;
  }

  function statusBadge(status) {
    const label = statusLabels[status] || status || "نامشخص";

    return `
      <span class="status-badge status-${escapeHTML(status)}">
        ${escapeHTML(label)}
      </span>
    `;
  }

  function emptyRow(columns, message = "اطلاعاتی برای نمایش وجود ندارد.") {
    return `
      <tr>
        <td colspan="${columns}" class="empty-cell">
          ${escapeHTML(message)}
        </td>
      </tr>
    `;
  }

  function emptyCard(message) {
    return `
      <div class="empty-cell content-empty">
        ${escapeHTML(message)}
      </div>
    `;
  }

  /* =========================
     جابه‌جایی بین صفحات
  ========================= */

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

    if (page !== "editor") {
      previousPage = page;
    }

    switch (page) {
      case "dashboard":
        loadDashboard();
        break;

      case "requests":
        loadRequests();
        break;

      case "users":
        loadUsers();
        break;

      case "students":
        loadStudents();
        break;

      case "reports":
        loadReports();
        break;

      case "content":
        loadContent();
        break;

      case "articles":
        loadContent("article");
        break;

      case "videos":
        loadContent("video");
        break;

      case "podcasts":
        loadContent("podcast");
        break;

      case "media":
        loadMedia();
        break;

      case "settings":
        loadSettings();
        break;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* =========================
     داشبورد
  ========================= */

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

  /* =========================
     درخواست‌های مشاوره
  ========================= */

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
    const search = $("#request-search");
    const statusFilter = $("#request-status-filter");

    const query = search?.value.trim().toLocaleLowerCase() || "";
    const status = statusFilter?.value || "";

    const filtered = requests.filter(item => {
      const text = [
        item.name,
        item.phone,
        item.grade,
        item.service,
        item.message
      ].join(" ").toLocaleLowerCase();

      return text.includes(query) &&
        (!status || item.status === status);
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
          <select
            data-status-id="${Number(item.id)}"
            aria-label="تغییر وضعیت درخواست"
          >
            <option value="new" ${item.status === "new" ? "selected" : ""}>جدید</option>
            <option value="contacted" ${item.status === "contacted" ? "selected" : ""}>در حال پیگیری</option>
            <option value="done" ${item.status === "done" ? "selected" : ""}>تکمیل‌شده</option>
            <option value="cancelled" ${item.status === "cancelled" ? "selected" : ""}>لغوشده</option>
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
    if (!confirm("از حذف این درخواست مطمئن هستید؟")) return;

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

  async function showRequestDetails(id) {
    let item = requests.find(request => Number(request.id) === Number(id));

    if (!item) {
      await loadRequests();
      item = requests.find(request => Number(request.id) === Number(id));
    }

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
        <dd class="preserve-lines">
          ${escapeHTML(item.message || "توضیحی ثبت نشده است.")}
        </dd>
      </dl>
    `;

    const dialog = $("#request-dialog");

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  /* =========================
     کاربران
  ========================= */

  async function loadUsers() {
    try {
      const data = await api("/api/users");

      users = data.users || [];

      $("#users-table").innerHTML = users.length
        ? users.map(user => `
          <tr>
            <td>${escapeHTML(user.full_name)}</td>
            <td>${escapeHTML(user.username)}</td>
            <td>
              ${
                user.role === "admin" ? "مدیر" :
                user.role === "counselor" ? "مشاور" :
                "دانش‌آموز"
              }
            </td>
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

      showMessage("حساب کاربری با موفقیت ساخته شد.");

      await loadUsers();
      await loadStudents();
      await loadReports();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  /* =========================
     پرونده دانش‌آموزان
  ========================= */

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
      const [studentData, plansData, reportsData, changesData] =
        await Promise.all([
          api(`/api/students/${id}`),
          api(`/api/students/${id}/plans`),
          api(`/api/students/${id}/reports`),
          api(`/api/students/${id}/change-requests`)
        ]);

      const student = studentData.student;

      $("#student-details-title").textContent =
        `پرونده ${student.full_name}`;

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
          <p>
            برنامه: ${number(item.planned_minutes)} دقیقه
            |
            انجام‌شده: ${number(item.actual_minutes)} دقیقه
          </p>
          <p>درصد انجام: ${number(item.completion_percent)}٪</p>
          <p>${escapeHTML(item.note || "")}</p>

          <label>
            بازخورد مشاور
            <textarea
              data-feedback="${Number(item.id)}"
              maxlength="2000"
            >${escapeHTML(item.counselor_feedback || "")}</textarea>
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
          <p>
            پاسخ:
            ${escapeHTML(item.counselor_reply || "پاسخی ثبت نشده است.")}
          </p>

          ${item.status === "pending" ? `
            <label>
              پاسخ مشاور
              <textarea
                data-reply="${Number(item.id)}"
                maxlength="2000"
              ></textarea>
            </label>

            <button
              class="small-button"
              data-change-action="${Number(item.id)}"
              data-change-status="approved"
            >
              تأیید
            </button>

            <button
              class="small-button danger-button"
              data-change-action="${Number(item.id)}"
              data-change-status="rejected"
            >
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
      <article class="data-list-item">
        ${renderItem(item)}
      </article>
    `).join("");
  }

  async function saveFeedback(id) {
    const textarea = $(`[data-feedback="${id}"]`);

    if (!textarea) return;

    try {
      await api(`/api/reports/${id}/feedback`, {
        method: "PATCH",
        body: JSON.stringify({
          feedback: textarea.value
        })
      });

      showMessage("بازخورد ذخیره شد.");
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  async function updateChangeRequest(id, status) {
    const reply = $(`[data-reply="${id}"]`)?.value || "";

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

  /* =========================
     گزارش‌ها
  ========================= */

  async function loadReports() {
    try {
      const [usersData, studentsData, requestsData] =
        await Promise.all([
          api("/api/users"),
          api("/api/students"),
          api("/api/admin/requests")
        ]);

      const allUsers = usersData.users || [];
      const allStudents = studentsData.students || [];

      requests = Array.isArray(requestsData) ? requestsData : [];

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
            return {
              reports: [],
              changes: []
            };
          }
        })
      );

      for (const item of details) {
        reportCount += item.reports.length;
        changeCount += item.changes.length;
      }

      $("#report-daily").textContent = number(reportCount);
      $("#report-changes").textContent = number(changeCount);
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
      ...requests.map(item =>
        columns.map(([key]) => {
          if (key === "status") {
            return statusLabels[item[key]] || item[key];
          }

          return item[key] ?? "";
        })
      )
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

  /* =========================
     مدیریت محتوا
  ========================= */

  async function loadContent(type = "") {
    try {
      const data = await api("/api/admin/content");

      contentItems = data.items || [];

      renderContent(type);
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  function renderContent(pageType = "") {
    const search = $("#content-search");
    const statusFilter = $("#content-status-filter");

    const query = search?.value.trim().toLocaleLowerCase() || "";
    const status = statusFilter?.value || "";

    const selectedType = pageType || activeContentFilter;

    const filtered = contentItems.filter(item => {
      const matchesType =
        selectedType === "all" || !selectedType ||
        item.type === selectedType;

      const matchesSearch =
        `${item.title} ${item.summary} ${item.category}`
          .toLocaleLowerCase()
          .includes(query);

      const matchesStatus = !status || item.status === status;

      return matchesType && matchesSearch && matchesStatus;
    });

    const cards = filtered.map(renderContentCard).join("");

    if (pageType) {
      const target = {
        article: "#articles-list",
        video: "#videos-list",
        podcast: "#podcasts-list"
      }[pageType];

      if (target) {
        $(target).innerHTML = cards || emptyCard("محتوایی در این بخش ثبت نشده است.");
      }

      return;
    }

    $("#content-list").innerHTML =
      cards || emptyCard("محتوایی مطابق جست‌وجوی شما پیدا نشد.");
  }

  function renderContentCard(item) {
    const cover = safeUrl(item.cover_url);
    const type = typeLabels[item.type] || "محتوا";

    return `
      <article class="content-card">
        ${
          cover
            ? `<img class="content-cover" src="${escapeHTML(cover)}" alt="${escapeHTML(item.title)}" loading="lazy">`
            : `<div class="content-cover content-cover-placeholder">${escapeHTML(type)}</div>`
        }

        <div class="content-card-body">
          <div class="content-card-meta">
            <span>${escapeHTML(type)}</span>
            ${statusBadge(item.status)}
          </div>

          <h3>${escapeHTML(item.title)}</h3>

          <p>${escapeHTML(item.summary || "توضیحی برای این محتوا ثبت نشده است.")}</p>

          <small>${escapeHTML(item.category || "بدون دسته‌بندی")}</small>

          <div class="content-card-actions">
            <button
              class="small-button"
              data-edit-content="${Number(item.id)}"
            >
              ویرایش
            </button>

            <button
              class="small-button danger-button"
              data-delete-content="${Number(item.id)}"
            >
              حذف
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function openEditor(type = "article", item = null) {
    const form = $("#content-form");

    form.reset();

    form.elements.id.value = item?.id || "";
    form.elements.type.value = item?.type || type;
    form.elements.status.value = item?.status || "draft";
    form.elements.title.value = item?.title || "";
    form.elements.summary.value = item?.summary || "";
    form.elements.category.value = item?.category || "";
    form.elements.cover_url.value = item?.cover_url || "";
    form.elements.body.value = item?.body || "";
    form.elements.media_url.value = item?.media_url || "";
    form.elements.external_url.value = item?.external_url || "";

    $("#editor-heading").textContent = item
      ? "ویرایش محتوا"
      : `افزودن ${typeLabels[type] || "محتوای جدید"}`;

    $("#save-content-button").textContent = item
      ? "ذخیره تغییرات"
      : "ذخیره محتوا";

    openPage("editor");
  }

  async function saveContent(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));
    const id = payload.id;

    delete payload.id;

    const method = id ? "PUT" : "POST";
    const url = id
      ? `/api/admin/content/${encodeURIComponent(id)}`
      : "/api/admin/content";

    const button = $("#save-content-button");

    button.disabled = true;

    try {
      await api(url, {
        method,
        body: JSON.stringify(payload)
      });

      showMessage(id
        ? "تغییرات محتوا ذخیره شد."
        : "محتوای جدید ثبت شد."
      );

      form.reset();

      await loadContent();

      openPage(previousPage === "editor" ? "content" : previousPage);
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function editContent(id) {
    const item = contentItems.find(content => Number(content.id) === Number(id));

    if (!item) {
      showMessage("محتوای موردنظر پیدا نشد.", true);
      return;
    }

    openEditor(item.type, item);
  }

  async function deleteContent(id) {
    if (!confirm("از حذف این محتوا مطمئن هستید؟")) return;

    try {
      await api(`/api/admin/content/${id}`, {
        method: "DELETE"
      });

      showMessage("محتوا حذف شد.");

      await loadContent();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  /* =========================
     کتابخانه رسانه
  ========================= */

  async function loadMedia() {
    try {
      const data = await api("/api/admin/media");

      mediaItems = data.assets || [];

      renderMedia();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  function renderMedia() {
    const container = $("#media-list");

    if (!mediaItems.length) {
      container.innerHTML = emptyCard("هنوز فایلی در کتابخانه رسانه آپلود نشده است.");
      return;
    }

    container.innerHTML = mediaItems.map(item => {
      const url = safeUrl(item.url);
      const mime = String(item.mime_type || "");
      let preview = "";

      if (mime.startsWith("image/")) {
        preview = `
          <img
            class="media-preview"
            src="${escapeHTML(url)}"
            alt="${escapeHTML(item.original_name)}"
            loading="lazy"
          >
        `;
      } else if (mime.startsWith("audio/")) {
        preview = `
          <div class="media-preview media-preview-placeholder">
            <span>♫</span>
            <audio controls preload="none" src="${escapeHTML(url)}"></audio>
          </div>
        `;
      } else if (mime.startsWith("video/")) {
        preview = `
          <div class="media-preview media-preview-placeholder">
            <span>▶</span>
            <video controls preload="none" src="${escapeHTML(url)}"></video>
          </div>
        `;
      } else {
        preview = `
          <div class="media-preview media-preview-placeholder">FILE</div>
        `;
      }

      return `
        <article class="media-card">
          ${preview}

          <div class="media-card-body">
            <strong>${escapeHTML(item.original_name)}</strong>
            <small>${formatSize(item.size)}</small>

            <div class="media-card-actions">
              <button
                class="small-button"
                data-copy-media="${Number(item.id)}"
              >
                کپی آدرس
              </button>

              <button
                class="small-button danger-button"
                data-delete-media="${Number(item.id)}"
              >
                حذف
              </button>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  async function uploadMedia(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const fileInput = $("#media-file");
    const file = fileInput.files[0];

    if (!file) {
      showMessage("ابتدا یک فایل انتخاب کنید.", true);
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      showMessage("حجم فایل نباید بیشتر از ۱۵ مگابایت باشد.", true);
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    const formData = new FormData();

    formData.append("file", file);

    button.disabled = true;
    button.textContent = "در حال آپلود...";

    try {
      const data = await api("/api/admin/upload", {
        method: "POST",
        body: formData
      });

      showMessage("فایل با موفقیت آپلود شد.");

      form.reset();

      await loadMedia();

      if (data.asset?.url) {
        showMessage("فایل آپلود شد. آدرس آن در کتابخانه رسانه قابل کپی است.");
      }
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "آپلود فایل";
    }
  }

  async function copyMediaUrl(id) {
    const item = mediaItems.find(asset => Number(asset.id) === Number(id));

    if (!item) return;

    const fullUrl = new URL(item.url, window.location.origin).href;

    try {
      await navigator.clipboard.writeText(fullUrl);
      showMessage("آدرس فایل کپی شد.");
    } catch {
      const temporary = document.createElement("textarea");

      temporary.value = fullUrl;
      document.body.appendChild(temporary);
      temporary.select();

      const copied = document.execCommand("copy");
      temporary.remove();

      showMessage(
        copied ? "آدرس فایل کپی شد." : "کپی آدرس انجام نشد.",
        !copied
      );
    }
  }

  async function deleteMedia(id) {
    if (!confirm("از حذف این فایل مطمئن هستید؟")) return;

    try {
      await api(`/api/admin/media/${id}`, {
        method: "DELETE"
      });

      showMessage("فایل حذف شد.");

      await loadMedia();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  /* =========================
     تنظیمات صفحه اصلی
  ========================= */

  async function loadSettings() {
    try {
      const data = await api("/api/admin/site-settings");
      const settings = data.settings || {};
      const form = $("#settings-form");

      for (const [key, value] of Object.entries(settings)) {
        const field = form.elements.namedItem(key);

        if (field) {
          field.value = value;
        }
      }
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  async function saveSettings(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const settings = Object.fromEntries(new FormData(form));

    try {
      await api("/api/admin/site-settings", {
        method: "PUT",
        body: JSON.stringify({ settings })
      });

      showMessage("تنظیمات سایت ذخیره شد.");
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  /* =========================
     ورود و خروج مدیر
  ========================= */

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

      if (!me.user || me.user.role !== "admin") {
        await logout();
        return;
      }

      showApp();
      openPage("dashboard");
    } catch {
      showLogin();
    }
  }

  /* =========================
     رویدادهای صفحه
  ========================= */

  $("#login-form").addEventListener("submit", login);

  $("#logout-button").addEventListener("click", logout);

  $("#user-form").addEventListener("submit", createUser);

  $("#content-form").addEventListener("submit", saveContent);

  $("#media-upload-form").addEventListener("submit", uploadMedia);

  $("#settings-form").addEventListener("submit", saveSettings);

  $("#request-search").addEventListener("input", renderRequests);

  $("#request-status-filter").addEventListener("change", renderRequests);

  $("#content-search").addEventListener("input", () => {
    const currentPage = $(".nav-item.active")?.dataset.page || "content";

    const type = {
      articles: "article",
      videos: "video",
      podcasts: "podcast"
    }[currentPage] || "";

    renderContent(type);
  });

  $("#content-status-filter").addEventListener("change", () => {
    const currentPage = $(".nav-item.active")?.dataset.page || "content";

    const type = {
      articles: "article",
      videos: "video",
      podcasts: "podcast"
    }[currentPage] || "";

    renderContent(type);
  });

  $("#refresh-button").addEventListener("click", () => {
    const activePage = $(".nav-item.active")?.dataset.page || "dashboard";

    if (activePage === "editor") {
      openPage(previousPage);
    } else {
      openPage(activePage);
    }
  });

  $("#export-requests").addEventListener("click", async () => {
    await loadRequests();
    exportRequests();
  });

  $("#close-student-details").addEventListener("click", () => {
    $("#student-details").hidden = true;
    activeStudentId = null;
  });

  $("#new-content-button").addEventListener("click", () => {
    openEditor("article");
  });

  $("#cancel-editor").addEventListener("click", () => {
    openPage(previousPage);
  });

  $("#editor-cancel-bottom").addEventListener("click", () => {
    openPage(previousPage);
  });

  $$("[data-content-filter]").forEach(button => {
    button.addEventListener("click", () => {
      activeContentFilter = button.dataset.contentFilter;

      $$(".content-filter").forEach(item => {
        item.classList.toggle("active", item === button);
      });

      renderContent();
    });
  });

  document.addEventListener("click", event => {
    const target = event.target.closest("button");

    if (!target) return;

    if (target.dataset.page) {
      openPage(target.dataset.page);
      return;
    }

    if (target.dataset.goto) {
      openPage(target.dataset.goto);
      return;
    }

    if (target.dataset.requestDetail) {
      showRequestDetails(Number(target.dataset.requestDetail));
      return;
    }

    if (target.dataset.deleteRequest) {
      deleteRequest(Number(target.dataset.deleteRequest));
      return;
    }

    if (target.dataset.openStudent) {
      openStudent(Number(target.dataset.openStudent));
      return;
    }

    if (target.dataset.saveFeedback) {
      saveFeedback(Number(target.dataset.saveFeedback));
      return;
    }

    if (target.dataset.changeAction) {
      updateChangeRequest(
        Number(target.dataset.changeAction),
        target.dataset.changeStatus
      );
      return;
    }

    if (target.dataset.newType) {
      openEditor(target.dataset.newType);
      return;
    }

    if (target.dataset.editContent) {
      editContent(Number(target.dataset.editContent));
      return;
    }

    if (target.dataset.deleteContent) {
      deleteContent(Number(target.dataset.deleteContent));
      return;
    }

    if (target.dataset.copyMedia) {
      copyMediaUrl(Number(target.dataset.copyMedia));
      return;
    }

    if (target.dataset.deleteMedia) {
      deleteMedia(Number(target.dataset.deleteMedia));
      return;
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

  /* شروع پنل */
  initialize();
})();
