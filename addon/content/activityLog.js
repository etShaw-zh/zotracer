var ZoTracerActivityLog = {
  init: async function() {
    try {
      // Wait for Zotero to be ready
      await Zotero.initializationPromise;
      
      // Initialize UI elements
      this.filterType = document.getElementById('filter-type');
      this.tree = document.getElementById('activity-log');
      
      if (!this.filterType || !this.tree) {
        Zotero.debug("[ZoTracer] Failed to initialize UI elements");
        return;
      }
      
      // Add event listeners
      this.filterType.addEventListener('command', () => this.updateActivityLog());
      
      // Initial load
      await this.updateActivityLog();
    } catch (error) {
      Zotero.debug("[ZoTracer] Error initializing activity log: " + error);
    }
  },

  updateActivityLog: async function() {
    Zotero.debug("[ZoTracer] Updating activity log");
    try {
      if (!Zotero.ZoTracer || !Zotero.ZoTracer.DatabaseManager) {
        Zotero.debug("[ZoTracer] Database manager not available");
        return;
      }

      const activities = await Zotero.ZoTracer.DatabaseManager.getInstance().getActivities(100, 0);
      const type = this.filterType.value;
      
      // Filter activities if needed
      const filteredActivities = type === 'all' 
        ? activities 
        : activities.filter(act => act.source === type);

      // Clear existing items
      const treeChildren = this.tree.getElementsByTagName('treechildren')[0];
      if (treeChildren) {
        while (treeChildren.firstChild) {
          treeChildren.removeChild(treeChildren.firstChild);
        }
      } else {
        const newTreeChildren = document.createElement('treechildren');
        this.tree.appendChild(newTreeChildren);
      }

      // Add new items
      const treeChildrenElement = this.tree.getElementsByTagName('treechildren')[0];
      for (const activity of filteredActivities) {
        const row = this.createActivityRow(activity);
        if (row) {
          treeChildrenElement.appendChild(row);
        }
      }
    } catch (error) {
      Zotero.debug("[ZoTracer] Error updating activity log: " + error);
    }
  },

  createActivityRow: function(activity) {
    try {
      const treeItem = document.createElement('treeitem');
      const treeRow = document.createElement('treerow');

      // Timestamp column
      const timestampCell = document.createElement('treecell');
      timestampCell.setAttribute('label', new Date(activity.timestamp).toLocaleString());
      treeRow.appendChild(timestampCell);

      // Action column
      const actionCell = document.createElement('treecell');
      actionCell.setAttribute('label', activity.action_type);
      treeRow.appendChild(actionCell);

      // Item column
      const itemCell = document.createElement('treecell');
      itemCell.setAttribute('label', activity.item_id || '');
      treeRow.appendChild(itemCell);

      // Source column
      const sourceCell = document.createElement('treecell');
      sourceCell.setAttribute('label', activity.source || '');
      treeRow.appendChild(sourceCell);

      treeItem.appendChild(treeRow);
      return treeItem;
    } catch (error) {
      Zotero.debug("[ZoTracer] Error creating activity row: " + error);
      return null;
    }
  }
};

// Initialize when window loads
window.addEventListener('load', () => {
  try {
    ZoTracerActivityLog.init();
  } catch (error) {
    Zotero.debug("[ZoTracer] Error in window load handler: " + error);
  }
});
