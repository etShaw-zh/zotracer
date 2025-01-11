import { DatabaseManager } from "./database";
import { HttpClient } from "../utils/http";

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
  private static async cleanupCurrentItemWhenClose() {

    Zotero.CURRENT_ARTICLE = null;
    Zotero.CURRENT_ATTACHMENT = null;
    Zotero.CURRENT_ANNOTATION = null;
    Zotero.CURRENT_NOTE = null;
  }

  private static async cleanupCurrentItemWhenSave() {
    Zotero.CURRENT_ANNOTATION = null;
    Zotero.CURRENT_NOTE = null;
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
      if (activityType === 'close_file') this.cleanupCurrentItemWhenClose();
      if (activityId === "zotero-pane") this.cleanupCurrentItemWhenClose();
      if (activityType === 'select_tab' || activityType === 'open_file' || activityType === 'load_tab') {
        Zotero.CURRENT_ATTACHMENT = item;
        Zotero.CURRENT_ARTICLE = await this.getZoteroItem(Zotero.CURRENT_ATTACHMENT._parentID);
      }

      let itemType = item.itemType;
      if (itemType) {
        switch (itemType) {
          case "annotation": 
            Zotero.CURRENT_ANNOTATION = item;
            Zotero.CURRENT_ATTACHMENT = await this.getZoteroItem(Zotero.CURRENT_ANNOTATION._parentID);
            Zotero.CURRENT_ARTICLE = await this.getZoteroItem(Zotero.CURRENT_ATTACHMENT._parentID);
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
            Zotero.CURRENT_ATTACHMENT = item;
            Zotero.CURRENT_ARTICLE = await this.getZoteroItem(Zotero.CURRENT_ATTACHMENT._parentID);
            break;
          case "journalArticle":
            Zotero.CURRENT_ARTICLE = item;
            break;
          case "note": 
            Zotero.CURRENT_NOTE = item;
            Zotero.CURRENT_ARTICLE = await this.getZoteroItem(Zotero.CURRENT_NOTE._parentID);
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

      if (!itemType) itemType = type;
      const activityData = {
        activityId,
        activityType,
        event,
        type,
        itemType,
        libraryId: Zotero.CURRENT_ARTICLE?._libraryID,
        collectionIds: Zotero.CURRENT_ARTICLE?._collections,
        articleId: Zotero.CURRENT_ARTICLE?.id,
        articleKey: Zotero.CURRENT_ARTICLE?.key,
        articleTitle: Zotero.CURRENT_ARTICLE?._displayTitle,
        articleAnnotations: Zotero.CURRENT_ARTICLE?.annotations,
        articleTags: Zotero.CURRENT_ARTICLE?._tags,
        attachmentId: Zotero.CURRENT_ATTACHMENT?.id,
        attachmentKey: Zotero.CURRENT_ATTACHMENT?.key,
        attachmentPath: Zotero.CURRENT_ATTACHMENT?._attachmentPath,
        annotationId: Zotero.CURRENT_ANNOTATION?.id,
        annotationKey: Zotero.CURRENT_ANNOTATION?.key,
        annotationText: Zotero.CURRENT_ANNOTATION?._annotationText,
        annotationComment: Zotero.CURRENT_ANNOTATION?._annotationComment,
        annotationTags: Zotero.CURRENT_ANNOTATION?._tags,
        annotationColor: Zotero.CURRENT_ANNOTATION?._annotationColor,
        noteId: Zotero.CURRENT_NOTE?.id,
        noteKey: Zotero.CURRENT_NOTE?.key,
        noteText: Zotero.CURRENT_NOTE?._noteText,
        extraData: {
          articleItem: Zotero.CURRENT_ARTICLE,
          attachmentItem: Zotero.CURRENT_ATTACHMENT,
          annotationItem: Zotero.CURRENT_ANNOTATION,
          noteItem: Zotero.CURRENT_NOTE,
        }
      };

      ztoolkit.log("[ZoTracer] Logging zotero item:", Zotero.CURRENT_ARTICLE);
      ztoolkit.log("[ZoTracer] Logging zotero attachment:", Zotero.CURRENT_ATTACHMENT);
      ztoolkit.log("[ZoTracer] Logging zotero annotation:", Zotero.CURRENT_ANNOTATION);
      ztoolkit.log("[ZoTracer] Logging zotero note:", Zotero.CURRENT_NOTE);
      ztoolkit.log("[ZoTracer] Logging activity:", activityData);

      await DatabaseManager.getInstance().logActivity(
        activityData
      );
      this.cleanupCurrentItemWhenSave();

    } catch (error) {
      const err = error as Error;
      ztoolkit.log("[ZoTracer] Error logging activity:", { 
        error: err,
        type,
        event,
        ids,
        errorMessage: err.message,
        stack: err.stack
      });
    }
  }
}