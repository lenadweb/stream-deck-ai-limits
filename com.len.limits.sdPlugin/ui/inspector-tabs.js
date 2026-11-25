(function () {
    const STORAGE_KEY = "limits.inspectorTab";

    const STYLE = `
        .tab-bar {
            display: flex;
            gap: 18px;
            margin: 4px 16px 14px;
            border-bottom: 1px solid #3a3a3a;
        }
        .tab-bar button {
            position: relative;
            margin: 0 0 -1px;
            padding: 7px 0 8px;
            border: 0;
            border-bottom: 2px solid transparent;
            background: none;
            color: #8c8c8c;
            font: inherit;
            font-size: 12px;
            font-weight: 500;
            letter-spacing: 0.01em;
            cursor: pointer;
            transition: color 120ms ease, border-color 120ms ease;
        }
        .tab-bar button:hover { color: #d0d0d0; }
        .tab-bar button.active { color: #f2f2f2; border-bottom-color: #f2f2f2; }
        .tab-bar button:focus-visible { outline: 2px solid #6b8afd; outline-offset: 2px; border-radius: 2px; }
        .tab-bar button.marked::after {
            content: "";
            position: absolute;
            top: 8px;
            right: -7px;
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: #6b8afd;
        }
        .tab-panel.tab-hidden { display: none; }
    `;

    let bar = null;

    function panels() {
        return Array.prototype.slice.call(document.querySelectorAll(".tab-panel"));
    }

    function select(name, focus) {
        const all = panels();
        if (!all.some(function (panel) { return panel.dataset.tab === name; })) name = all[0].dataset.tab;
        all.forEach(function (panel) {
            panel.classList.toggle("tab-hidden", panel.dataset.tab !== name);
        });
        bar.querySelectorAll("button").forEach(function (button) {
            const active = button.dataset.tab === name;
            button.classList.toggle("active", active);
            button.setAttribute("aria-selected", active ? "true" : "false");
            button.tabIndex = active ? 0 : -1;
            if (active && focus) button.focus();
        });
        try { localStorage.setItem(STORAGE_KEY, name); } catch (e) {}
    }

    function onKeyDown(event) {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        const names = panels().map(function (panel) { return panel.dataset.tab; });
        const current = names.indexOf(event.target.dataset.tab);
        const step = event.key === "ArrowRight" ? 1 : -1;
        select(names[(current + step + names.length) % names.length], true);
        event.preventDefault();
    }

    function mount() {
        const all = panels();
        if (!all.length || bar) return;

        const style = document.createElement("style");
        style.textContent = STYLE;
        document.head.appendChild(style);

        bar = document.createElement("div");
        bar.className = "tab-bar";
        bar.setAttribute("role", "tablist");
        all.forEach(function (panel) {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.tab = panel.dataset.tab;
            button.textContent = panel.dataset.label;
            button.setAttribute("role", "tab");
            button.addEventListener("click", function () { select(panel.dataset.tab); });
            button.addEventListener("keydown", onKeyDown);
            panel.setAttribute("role", "tabpanel");
            bar.appendChild(button);
        });
        all[0].parentNode.insertBefore(bar, all[0]);

        let saved = null;
        try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
        select(saved || all[0].dataset.tab);
    }

    window.InspectorTabs = {
        mark: function (name, on) {
            const button = bar && bar.querySelector('button[data-tab="' + name + '"]');
            if (button) button.classList.toggle("marked", !!on);
        }
    };

    document.addEventListener("DOMContentLoaded", mount);
})();
