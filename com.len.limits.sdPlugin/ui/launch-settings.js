// Shared "Hold to open" section for every provider's property inspector.
// A page includes this file, puts <div id="launchSettings"></div> where the rows go,
// and calls LaunchSettings.apply(_settings) / LaunchSettings.collect(_settings)
// from its own applySettings / saveSettings.
(function () {
    const IS_MAC = navigator.userAgent.includes("Mac");

    const ROWS = `
        <sdpi-item label="Hold to open">
            <select id="launchTarget" class="sdpi-item-value">
                <option value="none">Nothing (press refreshes)</option>
                <option value="app">Application</option>
                <option value="url">Web page</option>
                <option value="command">Command</option>
            </select>
        </sdpi-item>
        <sdpi-item id="launchAppRow" label="Application">
            <input id="launchApp" class="sdpi-item-value launch-input" type="text"
                placeholder="${IS_MAC ? "Claude  or  /Applications/Claude.app" : "claude  or  C:\\path\\to\\app.exe"}" />
        </sdpi-item>
        <sdpi-item id="launchUrlRow" label="URL">
            <input id="launchUrl" class="sdpi-item-value launch-input" type="text" placeholder="https://" />
        </sdpi-item>
        <sdpi-item id="launchCommandRow" label="Command">
            <input id="launchCommand" class="sdpi-item-value launch-input" type="text"
                placeholder="${IS_MAC ? "open -a Terminal ." : "start wt -d ."}" />
        </sdpi-item>
        <sdpi-item id="launchCwdRow" label="Folder">
            <input id="launchCwd" class="sdpi-item-value launch-input" type="text" placeholder="~ (home folder)" />
        </sdpi-item>
        <div id="launchHint" class="launch-hint"></div>
    `;

    const HINTS = {
        none: "",
        app: "Tap the key to refresh, hold it to open the app.",
        url: "Tap the key to refresh, hold it to open the page in your browser.",
        command: IS_MAC
            ? "Runs in the folder above. To start a CLI in a terminal: osascript -e 'tell app \"Terminal\" to do script \"cd ~/project && claude\"'"
            : "Runs in the folder above. To start a CLI in a terminal: start wt -d . claude"
    };

    const STYLE = `
        input.launch-input {
            width: 100%;
            box-sizing: border-box;
            padding: 4px 8px;
            border-radius: 4px;
            background: #2d2d2d;
            color: #ddd;
            border: 1px solid #444;
            font-size: 12px;
        }
        .launch-hint {
            padding: 4px 16px 8px;
            font-size: 11px;
            color: #999;
            line-height: 1.4;
            word-break: break-word;
        }
    `;

    function el(id) { return document.getElementById(id); }

    function updateVisibility() {
        const target = el("launchTarget").value;
        el("launchAppRow").classList.toggle("hidden", target !== "app");
        el("launchUrlRow").classList.toggle("hidden", target !== "url");
        el("launchCommandRow").classList.toggle("hidden", target !== "command");
        el("launchCwdRow").classList.toggle("hidden", target !== "command");
        el("launchHint").textContent = HINTS[target] || "";
        el("launchHint").classList.toggle("hidden", !HINTS[target]);
    }

    window.LaunchSettings = {
        /** Insert the rows; onChange is the page's saveSettings. */
        mount: function (onChange) {
            const host = el("launchSettings");
            if (!host || el("launchTarget")) return;
            const style = document.createElement("style");
            style.textContent = STYLE;
            document.head.appendChild(style);
            host.innerHTML = ROWS;
            el("launchTarget").addEventListener("change", onChange);
            // Text fields save on blur/enter rather than per keystroke.
            ["launchApp", "launchUrl", "launchCommand", "launchCwd"].forEach(function (id) {
                el(id).addEventListener("change", onChange);
            });
            updateVisibility();
        },
        apply: function (settings) {
            if (!el("launchTarget")) return;
            el("launchTarget").value = settings.launchTarget || "none";
            el("launchApp").value = settings.launchApp || "";
            el("launchUrl").value = settings.launchUrl || "";
            el("launchCommand").value = settings.launchCommand || "";
            el("launchCwd").value = settings.launchCwd || "";
            updateVisibility();
        },
        collect: function (settings) {
            if (!el("launchTarget")) return;
            settings.launchTarget = el("launchTarget").value || "none";
            settings.launchApp = el("launchApp").value.trim();
            settings.launchUrl = el("launchUrl").value.trim();
            settings.launchCommand = el("launchCommand").value.trim();
            settings.launchCwd = el("launchCwd").value.trim();
            updateVisibility();
        }
    };
})();
