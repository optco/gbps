export async function onRequest(context) {
  const { request, params } = context;
  const url = new URL(request.url);
  const path = params.path.join('/');

  // 1. PING
  if (path === 'ping') {
    return new Response(JSON.stringify({ t: Date.now() }), {
      headers: { 
        'Content-Type': 'application/json', 
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      }
    });
 }

  // 2. DOWNLOAD
  if (path === 'download') {
    // Cap at 50MB to stay safely within Cloudflare's free tier limits
    const size = Math.min(parseInt(url.searchParams.get('size')) || 25 * 1024 * 1024, 50 * 1024 * 1024);
    
    // Pre-generate a random chunk once to save CPU time
    const chunkSize = 64 * 1024;
    const chunk = new Uint8Array(chunkSize);
    crypto.getRandomValues(chunk);

    const stream = new ReadableStream({
      async start(controller) {
        let remaining = size;
        while (remaining > 0) {
          const bytes = Math.min(chunkSize, remaining);
          controller.enqueue(chunk.subarray(0, bytes));
          remaining -= bytes;
          // Yield to the event loop to prevent Cloudflare CPU timeout
          await new Promise(r => setTimeout(r, 0)); 
        }
        controller.close();
 a     }
    });

    return new Response(stream, {
      headers: { 
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // 3. UPLOAD
  if (path === 'upload' && request.method === 'POST') {
    // Consume the body to measure upload time, then discard it
    await request.arrayBuffer(); 
    return new Response(JSON.stringify({ received: true }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  return new Response('Not Found', { status: 404 });
}