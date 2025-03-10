/**
 * gmail webhook to trigger a cloudflare worker.
 * Since IFTTT webhook is not free, we can use this email to trigger a cloudflare worker.
 */
// Use PropertiesService to store the last processed Message ID
var processedEmails = PropertiesService.getScriptProperties();

function checkEmailAndTriggerWebhook() {
  // Search for unread emails with specific subjects
  var threads = GmailApp.search("has detect a pet motion -in:trash -in:sent", 0, 1); // Last 1 email
  if (threads.length > 0) {
    var message = threads[0].getMessages()[0];
    var messageId = message.getId(); // Unique ID for each email
    var lastProcessedId = processedEmails.getProperty("lastMessageId");

    // Check if this email was already processed
    if (messageId !== lastProcessedId) {
      var subject = message.getSubject();
      var webhookUrl = "https://<cloudflare-worker-url>/trigger_on";

      // Send the webhook
      UrlFetchApp.fetch(webhookUrl, {
        method: "GET",
      });

      // Store the Message ID to avoid reprocessing
      processedEmails.setProperty("lastMessageId", messageId);

      // Mark email as read
      message.markRead();
    }
  }
}

// Run this function every minute
function setUpTrigger() {
  // Delete existing triggers to avoid duplicates (run this manually once if needed)
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  
  // Create a new trigger
  ScriptApp.newTrigger("checkEmailAndTriggerWebhook")
    .timeBased()
    .everyMinutes(1)
    .create();
}