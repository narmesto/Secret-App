
import { createClient } from 'npm:@supabase/supabase-js';
import satori from 'npm:satori';
import { Resvg } from 'npm:@resvg/resvg-js';
import { jsx } from 'npm:satori/jsx-runtime';

// Create a single Supabase client instance
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Load the font data once when the function is initialized
const fontPromise = fetch(
  new URL('../../../assets/fonts/Inter-Bold.ttf', import.meta.url)
).then((res) => res.arrayBuffer());

async function getEvent(eventId: string) {
  const { data, error } = await supabase
    .from('events')
    .select('name, cover_image')
    .eq('id', eventId)
    .single();

  if (error) {
    console.error('Error fetching event:', error);
    throw new Error('Event not found');
  }
  return data;
}

async function generateImage(event: { name: string; cover_image: string }, fontData: ArrayBuffer) {
  const svg = await satori(
    jsx(
      'div',
      {
        style: {
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fff',
          backgroundImage: `url(${event.cover_image})`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          textAlign: 'center',
          padding: '20px',
        },
        children: jsx('div', {
          style: {
            color: 'white',
            fontSize: '60px',
            fontFamily: 'Inter',
            fontWeight: 700,
            textShadow: '0 2px 4px rgba(0,0,0,0.5)',
          },
          children: event.name,
        }),
      }
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Inter',
          data: fontData,
          weight: 700,
          style: 'normal',
        },
      ],
    }
  );

  const resvg = new Resvg(svg);
  const pngData = resvg.render();
  return pngData.asPng();
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const eventId = url.searchParams.get('id');

    if (!eventId) {
      return new Response('Missing event ID', { status: 400 });
    }

    const [event, fontData] = await Promise.all([
      getEvent(eventId),
      fontPromise,
    ]);

    const pngBuffer = await generateImage(event, fontData);

    return new Response(pngBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (e) {
    console.error(e);
    const status = e.message === 'Event not found' ? 404 : 500;
    return new Response(`Failed to generate image: ${e.message}`, { status });
  }
});
