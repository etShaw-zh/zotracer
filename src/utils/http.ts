/**
 * Utility functions for making HTTP requests
 */

import { getPref } from "./prefs";

export class HttpClient {
  private static getFlomoWebhookUrl(): string {
    const webhookUrl = getPref("flomo.webhook.url");
    if (!webhookUrl) {
      throw new Error("Flomo webhook URL is not set. Please set it in ZoTracer preferences.");
    }
    return webhookUrl as string;
  }

  /**
   * Send a POST request to Flomo with the given content
   * @param content The content to send to Flomo
   * @returns The response from Flomo
   */
  public static async sendToFlomo(content: string): Promise<Response> {
    try {
      const response = await fetch(this.getFlomoWebhookUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
        }),
      });

      const data = await response.json();
      if (data.code === -1) {
        throw new Error("This feature requires Flomo PRO membership");
      }

      if (!response.ok) {
        throw new Error(`Failed to send to Flomo: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      ztoolkit.log("[ZoTracer] Error sending to Flomo:", error);
      throw error;
    }
  }
}
