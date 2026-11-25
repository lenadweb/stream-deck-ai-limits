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
        .tab-bar .tab-github {
            display: flex;
            align-items: center;
            gap: 5px;
            margin-left: auto;
            font-weight: 400;
            color: #8c8c8c;
        }
        .tab-bar .tab-github svg { width: 13px; height: 13px; fill: currentColor; }
        .tab-panel.tab-hidden { display: none; }
    `;

    const GITHUB_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

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
        bar.querySelectorAll('button[role="tab"]').forEach(function (button) {
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
        if (typeof window.openGitHub === "function") {
            const github = document.createElement("button");
            github.type = "button";
            github.className = "tab-github";
            github.title = "View source on GitHub";
            github.innerHTML = GITHUB_ICON + "<span>GitHub</span>";
            github.addEventListener("click", function () { window.openGitHub(); });
            bar.appendChild(github);
        }
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
