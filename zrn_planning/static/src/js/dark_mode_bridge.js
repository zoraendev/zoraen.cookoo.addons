/** @odoo-module **/

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
    const root = document.documentElement;
    const body = document.body;
    if (!body) {
        return;
    }
    const explicitDark =
        root.classList.contains("dark") ||
        root.dataset.theme === "dark" ||
        body.dataset.theme === "dark";
    const bodyLuminance = zrnColorLuminance(getComputedStyle(body).backgroundColor);
    root.classList.toggle("zrn_backend_dark", explicitDark || bodyLuminance < 90);
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
