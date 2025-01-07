import { config } from "../../package.json";

export class UIManager {
  private static instance: UIManager;
  private win: Window | null = null;

  private constructor() {}

  public static getInstance(): UIManager {
    if (!UIManager.instance) {
      UIManager.instance = new UIManager();
    }
    return UIManager.instance;
  }

  public setWindow(win: Window) {
    this.win = win;
  }

  public registerToolbarButton() {
    if (!this.win || !this.win.document) {
      ztoolkit.log("[ZoTracer] Window or document not available");
      return;
    }

    try {
      // Add ZoTracer button to the toolbar
      const button = ztoolkit.UI.createElement(this.win.document, "toolbarbutton", {
        id: "ZoTracer-button",
        attributes: {
          class: "zotero-tb-button",
          tooltiptext: "ZoTracer Activity Log",
          image: `chrome://${config.addonRef}/content/icons/favicon.ico`
        },
        namespace: "xul"
      });

      const toolbar = this.win.document.getElementById("zotero-items-toolbar");
      if (toolbar && button) {
        toolbar.appendChild(button);

        // Add click event listener
        button.addEventListener("click", () => {
          this.openActivityLogWindow();
        });
      } else {
        ztoolkit.log("[ZoTracer] Toolbar or button element not found");
      }
    } catch (error) {
      ztoolkit.log("[ZoTracer] Error registering toolbar button:", error);
    }
  }

  public async openActivityLogWindow() {
    if (!this.win) {
      ztoolkit.log("[ZoTracer] Window not available");
      return;
    }

    try {
      // Ensure ZoTracer is initialized
      if (!Zotero.ZoTracer) {
        ztoolkit.log("[ZoTracer] ZoTracer module not initialized");
        return;
      }

      // Wait for database manager to be available
      let attempts = 0;
      while (!Zotero.ZoTracer.DatabaseManager && attempts < 5) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!Zotero.ZoTracer.DatabaseManager) {
        ztoolkit.log("[ZoTracer] Database manager not available after waiting");
        return;
      }

      const activityWindow = this.win.open(
        `chrome://${config.addonRef}/content/activityLog.xhtml`,
        "ZoTracer-activity-log",
        "chrome,centerscreen,resizable"
      );

      if (!activityWindow) {
        ztoolkit.log("[ZoTracer] Failed to open activity log window");
      }
    } catch (error) {
      ztoolkit.log("[ZoTracer] Error opening activity log window:", error);
    }
  }

  public unregisterUI() {
    if (!this.win || !this.win.document) {
      return;
    }

    try {
      // Remove toolbar button
      const button = this.win.document.getElementById("ZoTracer-button");
      if (button) {
        button.remove();
      }
    } catch (error) {
      ztoolkit.log("[ZoTracer] Error unregistering UI:", error);
    }
  }
}
