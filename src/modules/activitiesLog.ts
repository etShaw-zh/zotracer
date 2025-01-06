import { getLocaleID, getString } from "../utils/locale";

import { DatabaseManager } from "./database";

export type ActivityType = "file" | "tab" | "item" | "collection" | "library";
export type ActivityEvent = string;
export type ActivityId = string | number;

export interface ActivityLogParams {
  event: ActivityEvent;
  ids: Array<ActivityId>;
  type: ActivityType;
  [key: string]: any;
}

export class ActivityLog {
  private static formatTimestamp(date: Date): string {
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).replace(/\//g, "-").replace(",", "");
  }

  private static async getZoteroItem(activityId: string): Promise<any> {
    try {
      let item = await Zotero.Items.get(activityId);
      if (!item) {
        const reader = Zotero.Reader.getByTabID(activityId);
        if (reader?.itemID) {
          item = await Zotero.Items.get(reader.itemID);
        }
      }
      return item;
    } catch (error) {
      ztoolkit.log("[ZoTracer] Error getting Zotero item:", { activityId, error });
      return null;
    }
  }

  static async logActivity({ event, ids, type, ...extraData }: ActivityLogParams): Promise<void> {
    try {
      const activityId = ids[0]?.toString();
      if (!activityId) {
        ztoolkit.log("[ZoTracer] Warning: No activity ID provided", { type, event });
        return;
      }

      let activityType = `${event}_${type}`;
      const item = await this.getZoteroItem(activityId);
      if (activityType === 'close_file') {
        Zotero.CURRENT_ITEM = null;
      }
      if (activityId === "zotero-pane") {
        Zotero.CURRENT_ITEM = null;
      }
      if (activityType === 'select_tab' || activityType === 'open_file' || activityType === 'load_tab') {
        Zotero.CURRENT_ITEM = item;
      }

      const itemType = item.itemType;
      if (itemType) {
        switch (itemType) {
          case "annotation": 
            Zotero.CURRENT_ANNOTATION = item;
            Zotero.CURRENT_ITEM = await this.getZoteroItem(Zotero.CURRENT_ANNOTATION._parentItemID);
            // eslint-disable-next-line no-case-declarations
            const isAnnotationEvent = type === 'item' && Zotero.CURRENT_ANNOTATION;
            if (isAnnotationEvent) {
              switch (event) {
                case 'add':
                  activityType = `${Zotero.CURRENT_ANNOTATION._annotationType}_annotation`;
                  break;
                case 'modify':
                  activityType = 'modify_annotation';
                  break;
                case 'delete':
                  activityType = 'delete_annotation';
                  break;
              }
            }
            break;
          case "attachment":
          case "journalArticle":
            Zotero.CURRENT_ITEM = item;
            break;
          case "note": 
            Zotero.CURRENT_NOTE = item;
            Zotero.CURRENT_ITEM = await this.getZoteroItem(Zotero.CURRENT_NOTE._parentID);
            // eslint-disable-next-line no-case-declarations
            const isNoteEvent = type === 'item' && Zotero.CURRENT_NOTE;
            if (isNoteEvent) {
              switch (event) {
                case 'add':
                  activityType = 'add_note';
                  break;
                case 'modify':
                  activityType = 'modify_note';
                  break;
                case 'trash':
                  activityType = 'trash_note';
                  break;
                case 'delete':
                  activityType = 'delete_note';
                  break;
              }
            }
            break;
          default: 
            break;
        }
      }

      const activityData = {
        activityId,
        activityType,
        event,
        type,
        itemType,
        // articleItem: Zotero.CURRENT_ITEM,
        articleId: Zotero.CURRENT_ITEM?.id,
        articleKey: Zotero.CURRENT_ITEM?.key,
        articleAnnotations: Zotero.CURRENT_ITEM?.annotations,
        articleTags: Zotero.CURRENT_ITEM?._tags,
        collectionId: Zotero.CURRENT_ITEM?.id,
        collectionKey: Zotero.CURRENT_ITEM?.key,
        libraryId: Zotero.CURRENT_ITEM?.id,
        libraryKey: Zotero.CURRENT_ITEM?.key,
        // annotationItem: Zotero.CURRENT_ANNOTATION,
        annotationText: Zotero.CURRENT_ANNOTATION?._annotationText,
        annotationComment: Zotero.CURRENT_ANNOTATION?._annotationComment,
        annotationTags: Zotero.CURRENT_ANNOTATION?._tags,
        annotationColor: Zotero.CURRENT_ANNOTATION?._annotationColor,
        // noteItem: Zotero.CURRENT_NOTE,
        noteText: Zotero.CURRENT_NOTE?._noteText,
        timestamp: this.formatTimestamp(new Date()),
        ...extraData
      };

      ztoolkit.log("[ZoTracer] Logging activity:", activityData);

      await DatabaseManager.getInstance().logActivity(
        activityType,
        activityId,
        activityData,
        itemType
      );
      Zotero.CURRENT_ANNOTATION = null;
      Zotero.CURRENT_NOTE = null;
    } catch (error) {
      ztoolkit.log("[ZoTracer] Error logging activity:", { 
        error,
        type,
        event,
        ids,
        errorMessage: error.message,
        stack: error.stack
      });
    }
  }
}