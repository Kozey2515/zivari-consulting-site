const L = document.getElementById("login");
const P = document.getElementById("panel");
const T = document.getElementById("table");

const form = document.getElementById("lf");
const passwordInput = document.getElementById("pw");
const statusText = document.getElementById("ls");
const logoutButton = document.getElementById("out");
const refreshButton = document.getElementById("ref");


async function checkLogin() {
  try {
    const response = await fetch("/api/admin/me", {
      method: "GET",
      credentials: "same-origin"
    });

    const result = await response.json();

    if (result.authenticated === true) {
      showPanel();
      await loadRequests();
    }
  } catch (error) {
    console.error("CHECK LOGIN ERROR:", error);
  }
}


function showPanel() {
  L.hidden = true;
  P.hidden = false;
}


function showLogin() {
  L.hidden = false;
  P.hidden = true;
}


form.addEventListener("submit", async function (event) {
  event.preventDefault();

  const password = passwordInput.value.trim();

  if (!password) {
    statusText.textContent = "رمز عبور را وارد کنید.";
    return;
  }

  statusText.textContent = "در حال ورود...";
  
  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        password: password
      })
    });

    const result = await response.json();

    if (!response.ok) {
      statusText.textContent =
        result.error || "ورود ناموفق بود.";
      return;
    }

    if (result.authenticated !== true) {
      statusText.textContent =
        "ورود تأیید نشد.";
      return;
    }

    statusText.textContent = "ورود موفق بود.";

    showPanel();

    passwordInput.value = "";

    await loadRequests();

  } catch (error) {
    console.error("LOGIN ERROR:", error);

    statusText.textContent =
      "ارتباط با سرور برقرار نشد.";
  }
});


logoutButton.addEventListener("click", async function () {
  try {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "same-origin"
    });
  } catch (error) {
    console.error("LOGOUT ERROR:", error);
  }

  showLogin();
  statusText.textContent = "";
  T.innerHTML = "";
});


refreshButton.addEventListener("click", loadRequests);


async function loadRequests() {
  try {
    const response = await fetch("/api/admin/requests", {
      method: "GET",
      credentials: "same-origin"
    });

    if (response.status === 401) {
      showLogin();
      return;
    }

    if (!response.ok) {
      T.innerHTML =
        "<p>خطا در دریافت درخواست‌ها.</p>";
      return;
    }

    const requests = await response.json();

    if (!Array.isArray(requests) || requests.length === 0) {
      T.innerHTML =
        "<p>هنوز درخواستی ثبت نشده است.</p>";
      return;
    }

    T.innerHTML =
      "<table>" +
      "<thead>" +
      "<tr>" +
      "<th>کد</th>" +
      "<th>نام</th>" +
      "<th>تماس</th>" +
      "<th>پایه</th>" +
      "<th>خدمت</th>" +
      "<th>توضیحات</th>" +
      "<th>وضعیت</th>" +
      "<th>تاریخ</th>" +
      "<th></th>" +
      "</tr>" +
      "</thead>" +
      "<tbody>" +

      requests.map(function (item) {

        return `
          <tr>
            <td>${esc(item.id)}</td>

            <td>${esc(item.name)}</td>

            <td>${esc(item.phone)}</td>

            <td>${esc(item.grade || "-")}</td>

            <td>${esc(item.service || "-")}</td>

            <td>${esc(item.message || "-")}</td>

            <td>
              <select
                class="status"
                onchange="updateStatus(${Number(item.id)}, this.value)"
              >
                <option value="new"
                  ${item.status === "new" ? "selected" : ""}>
                  جدید
                </option>

                <option value="contacted"
                  ${item.status === "contacted" ? "selected" : ""}>
                  تماس گرفته شد
                </option>

                <option value="done"
                  ${item.status === "done" ? "selected" : ""}>
                  انجام شد
                </option>

                <option value="cancelled"
                  ${item.status === "cancelled" ? "selected" : ""}>
                  لغو شد
                </option>
              </select>
            </td>

            <td>${esc(item.created_at)}</td>

            <td>
              <button
                class="danger"
                onclick="deleteRequest(${Number(item.id)})"
              >
                حذف
              </button>
            </td>
          </tr>
        `;

      }).join("") +

      "</tbody>" +
      "</table>";

  } catch (error) {
    console.error("LOAD REQUESTS ERROR:", error);

    T.innerHTML =
      "<p>ارتباط با سرور برقرار نشد.</p>";
  }
}


async function updateStatus(id, status) {
  try {
    const response = await fetch(
      "/api/admin/requests/" + id,
      {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          status: status
        })
      }
    );

    if (response.status === 401) {
      showLogin();
      return;
    }

    if (!response.ok) {
      alert("تغییر وضعیت انجام نشد.");
      return;
    }

    await loadRequests();

  } catch (error) {
    console.error("UPDATE STATUS ERROR:", error);
    alert("ارتباط با سرور برقرار نشد.");
  }
}


async function deleteRequest(id) {
  if (!confirm("این درخواست حذف شود؟")) {
    return;
  }

  try {
    const response = await fetch(
      "/api/admin/requests/" + id,
      {
        method: "DELETE",
        credentials: "same-origin"
      }
    );

    if (response.status === 401) {
      showLogin();
      return;
    }

    if (!response.ok) {
      alert("حذف درخواست انجام نشد.");
      return;
    }

    await loadRequests();

  } catch (error) {
    console.error("DELETE ERROR:", error);
    alert("ارتباط با سرور برقرار نشد.");
  }
}


function esc(value) {
  return String(value).replace(
    /[&<>"']/g,
    function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[character];
    }
  );
}


window.updateStatus = updateStatus;
window.deleteRequest = deleteRequest;


checkLogin();
