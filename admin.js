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
      load();
    }
  } catch (e) {
    console.error(e);
  }
}

check();

document.getElementById("lf").onsubmit = async (e) => {
  e.preventDefault();

  const password = document.getElementById("pw").value;
  const status = document.getElementById("ls");

  status.textContent = "در حال ورود...";

  try {
    const r = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ password })
    });

    const x = await r.json();

    if (!r.ok) {
      status.textContent = x.error || "ورود ناموفق بود.";
      return;
    }

    window.location.href = "/admin.html";
  } catch (err) {
    status.textContent = "ارتباط با سرور برقرار نشد.";
  }
};

document.getElementById("out").onclick = async () => {
  await fetch("/api/admin/logout", {
    method: "POST"
  });

  location.reload();
};

document.getElementById("ref").onclick = load;

async function load() {
  const r = await fetch("/api/admin/requests");

  if (r.status === 401) {
    location.reload();
    return;
  }

  const a = await r.json();

  if (!a.length) {
    T.innerHTML = "<p>هنوز درخواستی ثبت نشده است.</p>";
    return;
  }

  T.innerHTML =
    "<table><thead><tr>" +
    "<th>کد</th><th>نام</th><th>تماس</th><th>پایه</th>" +
    "<th>خدمت</th><th>توضیحات</th><th>وضعیت</th><th>تاریخ</th><th></th>" +
    "</tr></thead><tbody>" +

    a.map(x =>
      `<tr>
        <td>${esc(x.id)}</td>
        <td>${esc(x.name)}</td>
        <td>${esc(x.phone)}</td>
        <td>${esc(x.grade || "-")}</td>
        <td>${esc(x.service || "-")}</td>
        <td>${esc(x.message || "-")}</td>
        <td>
          <select class="status" onchange="st(${x.id},this.value)">
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
      </tr>`
    ).join("") +

    "</tbody></table>";
}

async function st(id, status) {
  await fetch("/api/admin/requests/" + id, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ status })
  });

  load();
}

async function del(id) {
  if (!confirm("حذف شود؟")) return;

  await fetch("/api/admin/requests/" + id, {
    method: "DELETE"
  });

  load();
}

function esc(v) {
  return String(v).replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}
