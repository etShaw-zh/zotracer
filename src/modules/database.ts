export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: any;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public async init() {
    try {
      this.db = new Zotero.DBConnection("ZoTracer");
      await this.createTables();
      ztoolkit.log("ZoTracer database initialized successfully");
    } catch (error) {
      ztoolkit.log("Error initializing ZoTracer database:", error);
      throw error;
    }
  }

  private async createTables() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS user_activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        activityId TEXT NOT NULL,
        activityType TEXT NOT NULL,
        event TEXT NOT NULL,
        type TEXT NOT NULL,
        itemType TEXT NOT NULL,
        libraryId INTEGER,
        collectionIds TEXT,
        articleId INTEGER,
        articleKey TEXT,
        articleTitle TEXT,
        articleAnnotations TEXT,
        articleTags TEXT,
        attachmentId INTEGER,
        attachmentKey TEXT,
        attachmentPath TEXT,
        annotationId INTEGER,
        annotationKey TEXT,
        annotationText TEXT,
        annotationComment TEXT,
        annotationTags TEXT,
        annotationColor TEXT,
        noteId INTEGER,
        noteKey TEXT,
        noteText TEXT,
        extraData TEXT
      )`
    ];

    for (const query of queries) {
      await this.db.queryAsync(query);
    }
  }

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

  public async logActivity(activityData: any) {
    const timestamp = DatabaseManager.formatTimestamp(new Date());
    const query = `INSERT INTO user_activities (
      timestamp, activityId, activityType, event, type, itemType,
      libraryId, collectionIds, articleId, articleKey, articleTitle,
      articleAnnotations, articleTags, attachmentId, attachmentKey,
      attachmentPath, annotationId, annotationKey, annotationText,
      annotationComment, annotationTags, annotationColor, noteId,
      noteKey, noteText, extraData
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
      timestamp,
      activityData.activityId || null,
      activityData.activityType || null,
      activityData.event || null,
      activityData.type || null,
      activityData.itemType || null,
      activityData.libraryId || null,
      activityData.collectionIds ? JSON.stringify(activityData.collectionIds) : null,
      activityData.articleId || null,
      activityData.articleKey || null,
      activityData.articleTitle || null,
      activityData.articleAnnotations ? JSON.stringify(activityData.articleAnnotations) : null,
      activityData.articleTags ? JSON.stringify(activityData.articleTags) : null,
      activityData.attachmentId || null,
      activityData.attachmentKey || null,
      activityData.attachmentPath || null,
      activityData.annotationId || null,
      activityData.annotationKey || null,
      activityData.annotationText || null,
      activityData.annotationComment || null,
      activityData.annotationTags ? JSON.stringify(activityData.annotationTags) : null,
      activityData.annotationColor || null,
      activityData.noteId || null,
      activityData.noteKey || null,
      activityData.noteText || null,
      activityData.extraData ? JSON.stringify(activityData.extraData) : null
    ];

    try {
      await this.db.queryAsync(query, params);
    } catch (error) {
      ztoolkit.log("[ZoTracer] Error logging activity:", { error, activityData });
      throw error;
    }
  }

  public async getActivities(
    limit?: number,
    offset: number = 0
  ) {
    let query = `SELECT * FROM user_activities ORDER BY timestamp DESC`;
    const params: any[] = [];
    
    if (limit) {
      query += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);
    } else if (offset > 0) {
      query += ` OFFSET ?`;
      params.push(offset);
    }
    
    return await this.db.queryAsync(query, params);
  }

  public async getActivitiesSimple() {
    const query = `SELECT * FROM user_activities WHERE articleKey IS NOT NULL ORDER BY timestamp DESC`;
    return await this.db.queryAsync(query);
  }

  public async getTags() {
    const query = `SELECT DISTINCT annotationTags FROM user_activities WHERE annotationTags IS NOT NULL`;
    return await this.db.queryAsync(query);
  }

  public async getColors() {
    const query = `SELECT DISTINCT annotationColor FROM user_activities WHERE annotationColor IS NOT NULL`;
    return await this.db.queryAsync(query);
  }

  public async cleanup() {
    if (this.db) {
      await this.db.closeDatabase();
      this.db = null;
    }
  }
}
