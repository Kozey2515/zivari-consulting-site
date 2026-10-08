const loginBox = document.getElementById("login");
const panel = document.getElementById("panel");
const table = document.getElementById("table");

const loginForm = document.getElementById("lf");
const passwordInput = document.getElementById("pw");
const loginStatus = document.getElementById("ls");

const logoutButton = document.getElementById("out");
const refreshButton = document.getElementById("ref");


function showPanel() {
    loginBox.hidden = true;
    panel.hidden = false;
}


function showLogin() {
    loginBox.hidden = false;
    panel.hidden = true;
}


async function checkAuthentication() {

    try {

        const response = await fetch(
            "/api/admin/me",
            {
                method: "GET",
                credentials: "include",
                cache: "no-store"
            }
        );

        const data = await response.json();

        console.log("ADMIN AUTH:", data);

        if (data.authenticated === true) {

            showPanel();

            await loadRequests();

        } else {

            showLogin();

        }

    } catch (error) {

        console.error(
            "AUTH CHECK ERROR:",
            error
        );

        showLogin();

    }
}


loginForm.addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();

        const password =
            passwordInput.value.trim();

        if (!password) {

            loginStatus.textContent =
                "رمز عبور را وارد کنید.";

            return;
        }


        loginStatus.textContent =
            "در حال ورود...";


        try {

            const response =
                await fetch(
                    "/api/admin/login",
                    {
                        method: "POST",
                        credentials: "include",
                        headers: {
                            "Content-Type":
                                "application/json"
                        },
                        body: JSON.stringify({
                            password: password
                        })
                    }
                );


            const data =
                await response.json();


            console.log(
                "LOGIN RESPONSE:",
                data
            );


            if (!response.ok) {

                loginStatus.textContent =
                    data.error ||
                    "ورود ناموفق بود.";

                return;
            }


            if (data.ok !== true) {

                loginStatus.textContent =
                    "ورود تأیید نشد.";

                return;
            }


            loginStatus.textContent =
                "ورود موفق بود. در حال باز کردن پنل...";


            /*
             * دوباره Session را از سرور
             * بررسی می‌کنیم.
             */

            const authResponse =
                await fetch(
                    "/api/admin/me",
                    {
                        method: "GET",
                        credentials: "include",
                        cache: "no-store"
                    }
                );


            const authData =
                await authResponse.json();


            console.log(
                "AUTH AFTER LOGIN:",
                authData
            );


            if (
                authData.authenticated === true
            ) {

                showPanel();

                await loadRequests();

            } else {

                loginStatus.textContent =
                    "Session ایجاد نشد.";

            }

        } catch (error) {

            console.error(
                "LOGIN ERROR:",
                error
            );

            loginStatus.textContent =
                "ارتباط با سرور برقرار نشد.";

        }

    }
);


logoutButton.addEventListener(
    "click",
    async function () {

        try {

            await fetch(
                "/api/admin/logout",
                {
                    method: "POST",
                    credentials: "include"
                }
            );

        } catch (error) {

            console.error(
                "LOGOUT ERROR:",
                error
            );

        }


        showLogin();

        table.innerHTML = "";

        loginStatus.textContent = "";

    }
);


refreshButton.addEventListener(
    "click",
    loadRequests
);


async function loadRequests() {

    try {

        const response =
            await fetch(
                "/api/admin/requests",
                {
                    method: "GET",
                    credentials: "include",
                    cache: "no-store"
                }
            );


        if (response.status === 401) {

            showLogin();

            return;
        }


        if (!response.ok) {

            table.innerHTML =
                "<p>خطا در دریافت درخواست‌ها.</p>";

            return;
        }


        const requests =
            await response.json();


        if (
            !Array.isArray(requests) ||
            requests.length === 0
        ) {

            table.innerHTML =
                "<p>هنوز درخواستی ثبت نشده است.</p>";

            return;
        }


        table.innerHTML = `

            <table>

                <thead>

                    <tr>

                        <th>کد</th>
                        <th>نام</th>
                        <th>تماس</th>
                        <th>پایه</th>
                        <th>خدمت</th>
                        <th>توضیحات</th>
                        <th>وضعیت</th>
                        <th>تاریخ</th>
                        <th></th>

                    </tr>

                </thead>

                <tbody>

                    ${requests.map(function (item) {

                        return `

                            <tr>

                                <td>
                                    ${esc(item.id)}
                                </td>

                                <td>
                                    ${esc(item.name)}
                                </td>

                                <td>
                                    ${esc(item.phone)}
                                </td>

                                <td>
                                    ${esc(
                                        item.grade || "-"
                                    )}
                                </td>

                                <td>
                                    ${esc(
                                        item.service || "-"
                                    )}
                                </td>

                                <td>
                                    ${esc(
                                        item.message || "-"
                                    )}
                                </td>

                                <td>

                                    <select
                                        class="status"
                                        onchange="
                                            updateStatus(
                                                ${Number(item.id)},
                                                this.value
                                            )
                                        "
                                    >

                                        <option
                                            value="new"
                                            ${
                                                item.status === "new"
                                                    ? "selected"
                                                    : ""
                                            }
                                        >
                                            جدید
                                        </option>


                                        <option
                                            value="contacted"
                                            ${
                                                item.status === "contacted"
                                                    ? "selected"
                                                    : ""
                                            }
                                        >
                                            تماس گرفته شد
                                        </option>


                                        <option
                                            value="done"
                                            ${
                                                item.status === "done"
                                                    ? "selected"
                                                    : ""
                                            }
                                        >
                                            انجام شد
                                        </option>


                                        <option
                                            value="cancelled"
                                            ${
                                                item.status === "cancelled"
                                                    ? "selected"
                                                    : ""
                                            }
                                        >
                                            لغو شد
                                        </option>

                                    </select>

                                </td>


                                <td>
                                    ${esc(
                                        item.created_at
                                    )}
                                </td>


                                <td>

                                    <button
                                        class="danger"
                                        onclick="
                                            deleteRequest(
                                                ${Number(item.id)}
                                            )
                                        "
                                    >
                                        حذف
                                    </button>

                                </td>

                            </tr>

                        `;

                    }).join("")}

                </tbody>

            </table>

        `;

    } catch (error) {

        console.error(
            "LOAD ERROR:",
            error
        );

        table.innerHTML =
            "<p>ارتباط با سرور برقرار نشد.</p>";

    }
}


async function updateStatus(
    id,
    status
) {

    try {

        const response =
            await fetch(
                "/api/admin/requests/" + id,
                {
                    method: "PATCH",
                    credentials: "include",
                    headers: {
                        "Content-Type":
                            "application/json"
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

            alert(
                "تغییر وضعیت انجام نشد."
            );

            return;
        }


        await loadRequests();

    } catch (error) {

        console.error(
            "STATUS ERROR:",
            error
        );

        alert(
            "ارتباط با سرور برقرار نشد."
        );

    }
}


async function deleteRequest(id) {

    if (
        !confirm(
            "این درخواست حذف شود؟"
        )
    ) {

        return;
    }


    try {

        const response =
            await fetch(
                "/api/admin/requests/" + id,
                {
                    method: "DELETE",
                    credentials: "include"
                }
            );


        if (response.status === 401) {

            showLogin();

            return;
        }


        if (!response.ok) {

            alert(
                "حذف درخواست انجام نشد."
            );

            return;
        }


        await loadRequests();

    } catch (error) {

        console.error(
            "DELETE ERROR:",
            error
        );

        alert(
            "ارتباط با سرور برقرار نشد."
        );

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


/*
 * برای onchange و onclick داخل HTML
 */

window.updateStatus =
    updateStatus;

window.deleteRequest =
    deleteRequest;


/*
 * شروع برنامه
 */

checkAuthentication();
