import { getString, initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";

import { registerPrefsScripts } from "./modules/preferenceScript";
import { DatabaseManager } from "./modules/database";
import { UIManager } from "./modules/ui";
import { ActivityLog, ActivityType } from "./modules/activitiesLog";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  // Initialize ZoTracer namespace
  if (!Zotero.ZoTracer) {
    Zotero.ZoTracer = {};
  }

  initLocale();
  registerPrefs();

  // Initialize and attach DatabaseManager
  const dbManager = DatabaseManager.getInstance();
  await dbManager.init();
  Zotero.ZoTracer.DatabaseManager = DatabaseManager;

  registerActivityNotifier();
  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  Zotero.CURRENT_COLLECTION = null;
  Zotero.CURRENT_ARTICLE = null;
  Zotero.CURRENT_ATTACHMENT = null;
  Zotero.CURRENT_ANNOTATION = null;
  Zotero.CURRENT_NOTE = null;
}

async function onMainWindowLoad(win: Window): Promise<void> {
  try {
    // Create ztoolkit for every window
    addon.data.ztoolkit = createZToolkit();
    
    // Set window for UI manager
    UIManager.getInstance().setWindow(win);
    
    // Register UI elements
    UIManager.getInstance().registerToolbarButton();

    // Initialize window-specific resources
    await initializeWindowResources(win);
  } catch (error) {
    ztoolkit.log("[ZoTracer] Error in onMainWindowLoad:", error);
  }
}

async function initializeWindowResources(win: Window) {
  try {
    // @ts-ignore This is a moz feature
    win.MozXULElement.insertFTLIfNeeded(`${addon.data.config.addonRef}-mainWindow.ftl`);
  } catch (error) {
    ztoolkit.log("[ZoTracer] Error initializing window resources:", error);
  }
}

function onMainWindowUnload(win: Window): Promise<void> {
  return Promise.resolve();
}

function onShutdown(): void {
  // Cleanup database
  DatabaseManager.getInstance().cleanup();

  // Cleanup UI
  UIManager.getInstance().unregisterUI();
  
  // Unregister all
  ztoolkit.unregisterAll();
  
  // Remove addon object
  addon.data.alive = false;
  delete Zotero[addon.data.config.addonInstance];
}

async function onNotify(
  event: string,
  type: ActivityType,
  ids: Array<string | number>,
  extraData?: { [key: string]: any },
) {
  try {
    await ActivityLog.logActivity({ event, ids, type, extraData });
  } catch (error) {
    ztoolkit.log("[ZoTracer] Error in activity notification:", { error });
  }
}

function registerActivityNotifier() {
  const callback = {
    notify: async (
      event: string,
      type: ActivityType,
      ids: number[] | string[],
      extraData: { [key: string]: any },
    ) => {
      if (!addon?.data.alive) {
        Zotero.Notifier.unregisterObserver(notifierID);
        return;
      }
      await onNotify(event, type, ids, extraData);
    },
  };

  const notifierID = Zotero.Notifier.registerObserver(callback, ["item", "file", "tab"]);
}

function registerPrefs() {
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.ico`,
  });
}

async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

// Export all hooks
export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onPrefsEvent
};
