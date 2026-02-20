import { createClient } from 'npm:@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SUPABASE_PROJECT_URL = process.env.SUPABASE_URL!.replace('.co', '.in');

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const eventId = url.searchParams.get('id');

    if (!eventId) {
      return new Response('Missing event ID', { status: 400 });
    }

    const { data: event, error } = await supabase
      .from('events')
      .select('name, description')
      .eq('id', eventId)
      .single();

    if (error || !event) {
      return new Response('Event not found', { status: 404 });
    }

    const imageUrl = `${SUPABASE_PROJECT_URL}/functions/v1/generate-event-image?id=${eventId}`;
    const eventUrl = `gatherapp://event/${eventId}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${event.name}</title>
          <meta property="og:title" content="${event.name}" />
          <meta property="og:description" content="${event.description}" />
          <meta property="og:image" content="${imageUrl}" />
          <meta property="og:url" content="${eventUrl}" />
          <meta name="twitter:card" content="summary_large_image" />
        </head>
        <body>
          <h1>${event.name}</h1>
          <p>${event.description}</p>
          <a href="${eventUrl}">Open in GatherApp</a>
        </body>
      </html>
    `;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (e) {
    console.error(e);
    return new Response('Failed to generate OG tags', { status: 500 });
  }
});
