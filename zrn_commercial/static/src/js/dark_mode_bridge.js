/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { browser } from "@web/core/browser/browser";
import { cookie } from "@web/core/browser/cookie";
import { registry } from "@web/core/registry";

if (!window.__zrnDarkModeBridgeInitialized) {
    window.__zrnDarkModeBridgeInitialized = true;

    let isUpdating = false;
    let lastIsDark = null;

    function zrnColorLuminance(color) {
        const match = color && color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (!match) {
            return 255;
        }
        const red = Number(match[1]);
        const green = Number(match[2]);
        const blue = Number(match[3]);
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    }

    function zrnRefreshBackendDarkClass() {
        if (isUpdating) {
            return;
        }
        isUpdating = true;
        try {
            const root = document.documentElement;
            const body = document.body;
            if (!body) {
                return;
            }
            const colorScheme = cookie.get("color_scheme");
            const explicitDark =
                colorScheme === "dark" ||
                root.classList.contains("dark") ||
                root.dataset.theme === "dark" ||
                body.dataset.theme === "dark" ||
                body.classList.contains("dark") ||
                body.classList.contains("o_dark") ||
                Boolean(document.querySelector(".o_web_client.o_dark"));
            const bodyLuminance = zrnColorLuminance(getComputedStyle(body).backgroundColor);
            const isDark = Boolean(explicitDark || bodyLuminance < 90);

            if (root.classList.contains("zrn_backend_dark") !== isDark) {
                root.classList.toggle("zrn_backend_dark", isDark);
            }
            if (root.classList.contains("dark") !== isDark) {
                root.classList.toggle("dark", isDark);
            }

            if (isDark) {
                if (root.getAttribute("data-theme") !== "dark") {
                    root.setAttribute("data-theme", "dark");
                }
                if (!body.classList.contains("o_dark")) {
                    body.classList.add("o_dark");
                }
            } else if (colorScheme === "light") {
                if (root.getAttribute("data-theme") === "dark") {
                    root.removeAttribute("data-theme");
                }
                if (body.classList.contains("o_dark")) {
                    body.classList.remove("o_dark");
                }
            }

            if (lastIsDark !== isDark) {
                lastIsDark = isDark;
                window.dispatchEvent(new CustomEvent("zrn-theme-changed", { detail: { isDark } }));
            }
        } finally {
            isUpdating = false;
        }
    }

    // Registrar el toggle de Modo Oscuro en el menú de usuario de Odoo
    const userMenuRegistry = registry.category("user_menuitems");
    if (!userMenuRegistry.contains("dark_mode")) {
        let isToggling = false;
        userMenuRegistry.add(
            "dark_mode",
            (env) => {
                const isDark =
                    cookie.get("color_scheme") === "dark" ||
                    document.documentElement.classList.contains("dark") ||
                    document.documentElement.classList.contains("zrn_backend_dark");
                return {
                    type: "switch",
                    id: "dark_mode",
                    description: _t("Modo oscuro"),
                    isChecked: isDark,
                    callback: () => {
                        if (isToggling) {
                            return;
                        }
                        isToggling = true;
                        const currentDark = cookie.get("color_scheme") === "dark";
                        const nextScheme = currentDark ? "light" : "dark";
                        cookie.set("color_scheme", nextScheme);
                        browser.location.reload();
                    },
                    sequence: 35,
                };
            },
            { sequence: 35 }
        );
    }

    zrnRefreshBackendDarkClass();
    window.addEventListener("DOMContentLoaded", zrnRefreshBackendDarkClass);
    window.addEventListener("load", zrnRefreshBackendDarkClass);

    const zrnDarkObserver = new MutationObserver(zrnRefreshBackendDarkClass);
    zrnDarkObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-theme", "style"],
    });
    if (document.body) {
        zrnDarkObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ["class", "data-theme", "style"],
        });
    }
}
