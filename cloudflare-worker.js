/**
 * cloudflare worker code to use as intermediate between Pico W and IFTTT webhook
 */

addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event.request));
  });
  
  async function handleRequest(request) {
    if (request.method === "GET" && request.url.endsWith("/trigger")) {
      // Store the event state in KV
      await GPIO_STATE.put("gpio_trigger", "on", { expirationTtl: 60 }); // Expires in 60s
      return new Response("Event received", { status: 200 });
    } else if (request.method === "GET" && request.url.endsWith("/poll")) {
      // Serve the state to Pico W
      const state = await GPIO_STATE.get("gpio_trigger");
      return new Response(state || "off", { status: 200 });
    }
  
    return new Response("Not found", { status: 404 });
  }