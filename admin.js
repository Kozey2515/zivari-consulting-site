const L = document.getElementById("login");
const P = document.getElementById("panel");
const T = document.getElementById("table");

async function check() {
  try {
    const r = await fetch("/api/admin/me");
    const x = await r.json();

    if (x.authenticated) {
      L.hidden = true;
      P.hidden = false;
      await load();
    }
  } catch (e) {
    console.error(e);
  }
}

document.getElementById("lf").addEventListener("submit", async function (e) {
  e.preventDefault();

  const password = document.getElementById("pw").value;
  const status = document.getElementById("ls");

  status.textContent = "در حال ورود...";

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "same-origin",
      body: JSON.stringify({
        password: password
      })
    });

    const result = await response.json();

    if (!response.ok) {
      status.textContent = result.error || "ورود ناموفق بود.";
      return;
    }

    status.textContent = "ورود موفق بود. در حال انتقال...";

    window.location.href = "/admin.html";

  } catch (error) {
    console.error(error);
    status.textContent = "ارتباط با سرور برقرار نشد.";
  }
});

document.getElementById("out").addEventListener("click", async function () {
  try {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "same-origin"
    });
  } finally {
    window.location.href = "/admin.html";
  }
});

document.getElementById("ref").addEventListener("click", load);

async function load() {
  try {
    const r = await fetch("/api/admin/requests", {
      credentials: "same-origin"
    });

    if (r.status === 401) {
      L.hidden = false;
      P.hidden = true;
      return;
    }

    if (!r.ok) {
      T.innerHTML = "<p>خطا در دریافت درخواست‌ها.</p>";
      return;
    }

    const a = await r.json();

    if (!a.length) {
      T.innerHTML = "<p>هنوز درخواستی ثبت نشده است.</p>";
      return;
    }

    T.innerHTML =
      "<table><thead><tr>" +
      "<th>کد</th>" +
      "<th>نام</th>" +
      "<th>تماس</th>" +
      "<th>پایه</th>" +
      "<th>خدمت</th>" +
      "<th>توضیحات</th>" +
      "<th>وضعیت</th>" +
      "<th>تاریخ</th>" +
      "<th></th>" +
      "</tr></thead><tbody>" +

      a.map(x => `
        <tr>
          <td>${esc(x.id)}</td>
          <td>${esc(x.name)}</td>
          <td>${esc(x.phone)}</td>
          <td>${esc(x.grade || "-")}</td>
          <td>${esc(x.service || "-")}</td>
          <td>${esc(x.message || "-")}</td>
          <td>
            <select class="status" onchange="st(${x.id}, this.value)">
              <option value="new" ${x.status === "new" ? "selected" : ""}>جدید</option>
              <option value="contacted" ${x.status === "contacted" ? "selected" : ""}>تماس گرفته شد</option>
              <option value="done" ${x.status === "done" ? "selected" : ""}>انجام شد</option>
              <option value="cancelled" ${x.status === "cancelled" ? "selected" : ""}>لغو شد</option>
            </select>
          </td>
          <td>${esc(x.created_at)}</td>
          <td>
            <button class="danger" onclick="del(${x.id})">حذف</button>
          </td>
        </tr>
      `).join("") +

      "</tbody></table>";

  } catch (error) {
    console.error(error);
    T.innerHTML = "<p>خطا در ارتباط با سرور.</p>";
  }
}

async function st(id, status) {
  try {
    await fetch("/api/admin/requests/" + id, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "same-origin",
      body: JSON.stringify({
        status: status
      })
    });

    await load();

  } catch (error) {
    console.error(error);
  }
}

async function del(id) {
  if (!confirm("آیا از حذف این درخواست مطمئن هستید؟")) {
    return;
  }

  try {
    await fetch("/api/admin/requests/" + id, {
      method: "DELETE",
      credentials: "same-origin"
    });

    await load();

  } catch (error) {
    console.error(error);
  }
}

function esc(v) {
  return String(v).replace(/[&<>"']/g, function (m) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m];
  });
}

check();
