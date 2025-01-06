import { config } from "../../package.json";

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
        action_type TEXT NOT NULL,
        item_id TEXT,
        extra_data TEXT,
        source TEXT
      )`
    ];

    for (const query of queries) {
      await this.db.queryAsync(query);
    }
  }

  public async logActivity(
    actionType: string,
    itemId?: string,
    extraData?: any,
    source?: string
  ) {
    const timestamp = new Date().toISOString();
    const query = `INSERT INTO user_activities 
      (timestamp, action_type, item_id, extra_data, source) 
      VALUES (?, ?, ?, ?, ?)`;
    
    const params = [
      timestamp,
      actionType,
      itemId || null,
      extraData ? JSON.stringify(extraData) : null,
      source || null
    ];

    // Log the activity data
    // ztoolkit.log("[ZoTracer] Logging activity:", {
    //   timestamp,
    //   actionType,
    //   itemId,
    //   extraData,
    //   source
    // });
    
    await this.db.queryAsync(query, params);
  }

  public async getActivities(
    limit: number = 100,
    offset: number = 0
  ) {
    const query = `SELECT * FROM user_activities 
      ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    return await this.db.queryAsync(query, [limit, offset]);
  }

  public async cleanup() {
    if (this.db) {
      await this.db.closeDatabase();
      this.db = null;
    }
  }
}
