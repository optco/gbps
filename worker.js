export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. PING
    if (url.pathname === '/api/speedtest/ping') {
      return new Response(JSON.stringify({ t: Date.now() }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }

    // 2. DOWNLOAD (Stream random bytes)
    if (url.pathname === '/api/speedtest/download') {
      const size = Math.min(parseInt(url.searchParams.get('size')) || 25 * 1024 * 1024, 100 * 1024 * 1024);
      
      // Create a readable stream of random data
      const stream = new ReadableStream({
        async start(controller) {
          let remaining = size;
          const chunkSize = 64 * 1024;
          while (remaining > 0) {
            const bytes = Math.min(chunkSize, remaining);
            const randomData = crypto.getRandomValues(new Uint8Array(bytes));
            controller.enqueue(randomData);
            remaining -= bytes;
            // Yield to the event loop to prevent blocking
            await new Promise(r => setTimeout(r, 0)); 
          }
          controller.close();
        }
      });

      return new Response(stream, {
        headers: { 
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'no-store'
        }
      });
    }

    // 3. UPLOAD (Just read the body and return success)
    if (url.pathname === '/api/speedtest/upload' && request.method === 'POST') {
      // Consume the body to measure upload time, but we don't need to save it
      await request.arrayBuffer(); 
      return new Response(JSON.stringify({ received: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 4. Serve static files (if using Cloudflare Pages) or fallback
    return new Response('Not Found', { status: 404 });
  }
};