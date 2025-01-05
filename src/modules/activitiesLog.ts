import { getLocaleID, getString } from "../utils/locale";

import { DatabaseManager } from "./database";

// Common types for better type safety
export interface ActivityContext {
  timestamp: string;
  activeLibraryId: number;
  activeCollectionId?: number;
  selectedItems: Array<{
    id: number;
    key: string;
    title: string;
  }>;
}

export interface EnrichedData {
  context: ActivityContext;
  [key: string]: any;
}

// Activity logging types
export type ActivityType = 'file' | 'tab' | 'item';
export type ActivityEvent = string;
export type ActivityId = string | number;

export interface ActivityLogParams {
  event: ActivityEvent;
  ids: Array<ActivityId>;
  enrichedData: EnrichedData;
  type: ActivityType;
}

export class ActivityLog {
  /**
   * Generic activity logger that handles all types of activities
   */
  static async logActivity({ event, ids, enrichedData, type }: ActivityLogParams): Promise<void> {
    const activityId = ids[0]?.toString();
    if (!activityId) {
      ztoolkit.log("[ZoTracer] Warning: No activity ID provided", { type, event });
      return;
    }

    try {
      const eventType = type === 'item' ? 
        this.determineItemActionType(event, enrichedData) : 
        `${type}_${event}`;

      // testing
      const item = await Zotero.Items.get(activityId);
      ztoolkit.log("[ZoTracer] Logging activity:", {
        type,
        event: eventType,
        activityId,
        item,
        annotationText: item._annotationText,
        annotationComment: item._annotationComment,
        tags: item._tags,
        annotations: item._annotations,
        annotationColor: item._annotationColor,
        timestamp: new Date().toISOString()
      });

      await DatabaseManager.getInstance().logActivity(
        eventType,
        activityId,
        enrichedData,
        type
      );
    } catch (error) {
      ztoolkit.log("[ZoTracer] Error logging activity:", { 
        error,
        type,
        event,
        activityId,
        errorMessage: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Specialized activity loggers for different types
   */
  static logFileActivity(event: ActivityEvent, ids: Array<ActivityId>, enrichedData: EnrichedData) {
    return this.logActivity({ event, ids, enrichedData, type: 'file' });
  }

  static logTabActivity(event: ActivityEvent, ids: Array<ActivityId>, enrichedData: EnrichedData) {
    return this.logActivity({ event, ids, enrichedData, type: 'tab' });
  }

  static logItemActivity(event: ActivityEvent, ids: Array<ActivityId>, enrichedData: EnrichedData) {
    return this.logActivity({ event, ids, enrichedData, type: 'item' });
  }

  static determineItemActionType(event: string, extraData: any): string {
    // Handle item creation events
    if (event === 'add') {
      if (extraData.method === 'file') return 'item_import_file';
      if (extraData.method === 'url') return 'item_import_url';
      return 'item_create';
    }

    // Handle item modification events
    if (event === 'modify') {
      if (extraData.collections) return 'item_move';
      if (extraData.tags) return 'item_tag';
      return 'item_edit';
    }

    // Handle item deletion events
    if (event === 'delete') {
      return extraData.trash ? 'item_trash' : 'item_delete';
    }

    // Handle item trash events
    if (event === 'trash') {
      return extraData.trashed ? 'item_trash' : 'item_restore';
    }

    return `item_${event}`;
  }

  static async enrichActivityData(event: string, type: string, ids: Array<string | number>, extraData: any = {}): Promise<EnrichedData> {
    const timestamp = new Date().toISOString();
    const activePane = Zotero.getActiveZoteroPane();
    const activeLibraryId = activePane.getSelectedLibraryID();
    const activeCollectionId = activePane.getSelectedCollection()?.id;

    // Get selected items information
    const selectedItems = activePane.getSelectedItems().map(item => ({
      id: item.id,
      key: item.key,
      libraryId: item.libraryID,
      title: item.getField('title'),
    }));

    ztoolkit.log("[ZoTracer] Enriching activity data:", selectedItems);

    const context: ActivityContext = {
      timestamp,
      activeLibraryId,
      activeCollectionId,
      selectedItems
    };

    let enrichedData: EnrichedData = {
      context,
      ...extraData
    };

    // Enrich tab-specific information
    if (type === 'tab') {
      enrichedData = {
        ...enrichedData,
        ...this.enrichTabInfo(extraData)
      };
    }

    return enrichedData;
  }

  static async enrichTabInfo(tabInfo: any) {
    const enriched: any = {
        id: tabInfo.id,
        type: tabInfo.type,
        title: tabInfo.title,
        data: tabInfo.data
      };
      if (tabInfo.type === "reader" && tabInfo.data?.itemID) {
        const item = await Zotero.Items.getAsync(tabInfo.data.itemID);
        if (item) {
          enriched.item = {
            id: item.id,
            key: item.key,
            title: item.getField('title'),
            creators: item.getCreators(),
            year: item.getField('year'),
            publicationTitle: item.getField('publicationTitle'),
            dateModified: item.dateModified
          };
    
          if (tabInfo.data?.annotations) {
            enriched.annotations = (await Promise.all(
              tabInfo.data.annotations.map(async (annotationId: number) => {
                try {
                  const annotation = await Zotero.Items.getAsync(annotationId);
                  return annotation && annotation.isAnnotation() ? {
                    id: annotation.id,
                    key: annotation.key,
                    type: annotation.annotationType,
                    text: annotation.annotationText,
                    comment: annotation.annotationComment,
                    color: annotation.annotationColor,
                    pageLabel: annotation.annotationPageLabel,
                    position: annotation.annotationPosition,
                    dateModified: annotation.dateModified
                  } : null;
                } catch (error) {
                  ztoolkit.log("[ZoTracer] Error getting annotation:", { error, annotationId });
                  return null;
                }
              })
            )).filter(a => a !== null);
          }
        }
      }
      return enriched;
  }
}